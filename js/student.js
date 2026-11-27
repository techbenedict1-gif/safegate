/* SafeGate — student app. Offline-first: every action is saved on the phone first, then synced. */
(function () {
  'use strict';
  var SG = window.SG, U = SGCore.util, esc = SG.esc, store = SG.store, $ = SG.$;
  var elTop = $('#top'), elView = $('#view'), elSos = $('#sosbar');

  /* ------------------------------------------------------------ state */
  var P = store.get('sg_profile', null);
  var DEV = store.get('sg_dev', null); if (!DEV) { DEV = SG.uuid(); store.set('sg_dev', DEV); }
  var Q = store.get('sg_queue', []);
  var CFG = store.get('sg_cfg', SGCore.defaultConfig());
  var ST = store.get('sg_state', { outside: false });
  var ACCESS = store.get('sg_access', []);
  var HIST = store.get('sg_hist', []);
  var PREF = store.get('sg_pref', { wake: false });
  var net = { online: navigator.onLine !== false, syncing: false, last: store.get('sg_last', 0), fails: 0, nextTry: 0 };
  var view = 'home', draft = {}, batt = null, locDenied = false, lastPos = null, lastPingT = store.get('sg_lastping', 0);
  SG.tz = CFG.tzOffsetMin;
  var ASK = null, walkTimer = null, PASSES = store.get('sg_passes', []), NOTICES = store.get('sg_notices', []), GLINKS = store.get('sg_glinks', 0), famLink = null, WATCHERS = [], RECENT = store.get('sg_recent', []), deferredInstall = null, vagueOk = '', CODES = store.get('sg_codes', null), MED = store.get('sg_med', null), ROLLCALL = null, trailTimer = null, ESCORT = null, NEEDCONSENT = false, MYREPORTS = [], VISFORME = [], MON = { ent: null, ad: null }, PLANS = null;

  function save() {
    store.set('sg_queue', Q); store.set('sg_state', ST); store.set('sg_cfg', CFG); store.set('sg_access', ACCESS);
    store.set('sg_passes', PASSES); store.set('sg_notices', NOTICES); store.set('sg_glinks', GLINKS); store.set('sg_hist', HIST.slice(0, 40)); store.set('sg_pref', PREF); store.set('sg_last', net.last); store.set('sg_lastping', lastPingT);
  }
  function profileForServer() {
    return { matric: P.matric, name: P.name, phone: P.phone, residence: P.residence, emergency: P.emergency, consentLoc: !!P.consentLoc, minor: !!P.minor };
  }

  /* ------------------------------------------------------------ queue + sync */
  function enqueue(item, quiet) {
    Q.push(item);
    var pings = Q.filter(function (i) { return i.type === 'ping'; });
    if (pings.length > 600) { var drop = {}; pings.slice(0, pings.length - 600).forEach(function (p) { drop[p.id] = 1; }); Q = Q.filter(function (i) { return !drop[i.id]; }); }
    save(); if (!quiet) refresh();
    sync();
  }
  function pending() { return Q.length; }

  function sync() {
    if (!P || Date.now() < net.nextTry) return Promise.resolve();
    if (net.syncing) { net.again = true; return Promise.resolve(); }
    net.syncing = true; net.again = false; updateTop();
    var batch = Q.slice(0, 100);
    return SG.call('ingest', { student: profileForServer(), deviceId: DEV, items: batch, transferCode: TCODE || undefined }).then(function (r) {
      net.registered = true; SG.setServerTime(r.serverTime); TCODE = ''; if (LOCK) { LOCK = null; if (view === 'locked') { go('home'); SG.toast('This phone is now your SafeGate phone.', 'ok'); } }
      CFG = r.config || CFG; SG.tz = CFG.tzOffsetMin; ACCESS = r.access || [];
      var done = {}; r.acked.forEach(function (i) { done[i] = 1; });
      var rej = r.rejected || []; rej.forEach(function (x) { done[x.id] = 1; });
      Q = Q.filter(function (i) { return !done[i.id]; });
      if (window.SGNative && SGNative.isNative && !net.nativePush && !PREF.pushOff) { net.nativePush = true; SGNative.registerPush(function (tok) { SG.call('pushSubscribeNative', { matric: P.matric, deviceId: DEV, fcm: tok }).catch(function () { net.nativePush = false; }); }); }
      if (CFG.pushKey && !PREF.pushOff && SG.pushSupported() && Notification.permission === 'granted' && !net.pushed) { net.pushed = true; SG.pushEnable(CFG.pushKey, pushSend, false); }
      if (rej.length) SG.toast(rej.length + ' item(s) could not be saved: ' + rej[0].reason, 'err');
      net.online = true; net.fails = 0; net.nextTry = 0; net.last = Date.now(); store.set('sg_synced', 1);
      var oldPass = {}; PASSES.forEach(function (x) { oldPass[x.id] = x.status; });
      if ('free' in r) { FREE = !!r.free; store.set('sg_free', FREE); } PASSES = r.passes || []; GLINKS = r.guardianLinks || 0; NEEDCONSENT = !!r.needConsent && !Q.some(function (i) { return i.type === 'consent'; }); MYREPORTS = r.myReports || []; var oldAd = MON && MON.ad ? MON.ad.id : ''; MON = r.monet || { ent: null, ad: null }; if (view === 'home' && (MON.ad ? MON.ad.id : '') !== oldAd) setTimeout(function () { if (view === 'home') renderView(); }, 0); ROLLCALL = r.rollcall || null; VISFORME = r.visitorsForMe || [];
      var oldEsc = ESCORT; ESCORT = r.escort || null;
      if (oldEsc && ESCORT && oldEsc.id === ESCORT.id && oldEsc.status !== ESCORT.status) { if (navigator.vibrate) navigator.vibrate(150); notify('Security escort', ESCORT.status === 'assigned' ? ESCORT.by + ' is coming to you.' : ESCORT.status === 'done' ? 'Escort completed.' : 'Request ' + ESCORT.status + '.'); }
      PASSES.forEach(function (x) { if (oldPass[x.id] === 'pending' && x.status !== 'pending') { if (navigator.vibrate) navigator.vibrate(150); notify('Exit pass ' + x.status, x.status === 'approved' ? 'Security approved your pass.' : (x.note || 'Security did not approve this pass.')); } });
      var seenN = {}; NOTICES.forEach(function (n) { seenN[n.id] = 1; });
      NOTICES = (r.notices || []).filter(function (n) { return !Q.some(function (i) { return i.type === 'notice_ack' && i.noticeId === n.id; }); });
      NOTICES.forEach(function (n) { if (!seenN[n.id] && !n.acked) { if (n.level === 'urgent' && navigator.vibrate) navigator.vibrate([200, 100, 200]); notify(n.title, n.text); } });
      var newAsk = r.ask && (!ASK || ASK.id !== r.ask.id); ASK = r.ask || null;
      if (ASK && Q.some(function (i) { return i.type === 'reply' && i.askId === ASK.id; })) ASK = null;
      if (newAsk && ASK) { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); notify('Security is checking on you', ASK.text); }
      if (Q.length === 0) adoptStatus(r.status);
      if (ST.sos && r.sos && r.sos.steps && (r.sos.id === ST.sos.id || (r.sos.ids || []).indexOf(ST.sos.id) >= 0) && r.sos.status === 'open') { var chg = ST.sos.stage !== r.sos.stage; ST.sos.stage = r.sos.stage; ST.sos.steps = r.sos.steps; if (chg && view === 'sos') renderView(); }
      if (ST.sos && r.sos && (r.sos.id === ST.sos.id || (r.sos.ids || []).indexOf(ST.sos.id) >= 0) && r.sos.status !== 'open') {
        ST.sos = null; stopSosPings(); SG.toast(r.sos.status === 'resolved' ? 'Security has handled your alert.' : 'Alert closed.', 'ok');
      }
    }).catch(function (e) {
      if (e && e.code === 'network') { net.online = false; net.fails++; net.nextTry = Date.now() + Math.min(60000, 4000 * Math.pow(2, net.fails - 1)); }
      else if (e && e.server && (e.code === 'device-locked' || e.code === 'device-denied')) { net.nextTry = Date.now() + 12000; TCODE = ''; LOCK = { code: e.code, message: e.message }; SG.call('config').then(function (c) { CFG = Object.assign({}, CFG, c); store.set('sg_cfg', CFG); if (view === 'locked') renderView(); }, function () {}); if (view !== 'locked') { view = 'locked'; render(); } else renderView(); }
      else if (e && e.server) { net.fails++; net.nextTry = Date.now() + 30000 + Math.floor(Math.random() * 20000); if (e.code === 'bad-matric' || e.code === 'bad-name') SG.toast(e.message, 'err'); if (e.code === 'not-on-roster' || e.code === 'name-mismatch') { P = null; Q = []; store.set('sg_profile', null); save(); SG.toast(e.message, 'err'); view = 'onboard'; render(); } }
    }).then(function () {
      net.syncing = false; save(); refresh();
      if ((net.again || Q.length > 100) && net.online && Q.length) { net.again = false; sync(); }
    });
  }
  function adoptStatus(s) {
    if (!s) return;
    if (s.outside) {
      var same = ST.outside && ST.eventId === s.eventId;
      ST = { outside: true, eventId: s.eventId, destination: s.destination ? (s.destination.name || s.destination.text) : '', since: s.since,
        expectedReturn: s.expectedReturn, tracking: same ? ST.tracking : false, source: s.source, sos: ST.sos, walk: ST.walk };
    } else if (ST.outside) { ST = { outside: false, sos: ST.sos, walk: ST.walk }; stopTracking(); }
  }

  /* ------------------------------------------------------------ device helpers */
  if (navigator.getBattery) navigator.getBattery().then(function (b) {
    function u() { batt = Math.round(b.level * 100); } u(); b.addEventListener('levelchange', u);
  }).catch(function () {});
  function getPos(ms) {
    return new Promise(function (res) {
      if (!navigator.geolocation) return res(null);
      navigator.geolocation.getCurrentPosition(function (p) {
        locDenied = false;
        lastPos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, t: Date.now() };
        res(lastPos);
      }, function (e) { if (e && e.code === 1) locDenied = true; res(null); }, { enableHighAccuracy: true, timeout: ms || 15000, maximumAge: 15000 });
    });
  }
  var wake = null;
  function wantWake() {
    if (!PREF.wake || !ST.outside || !ST.tracking || document.visibilityState !== 'visible' || !navigator.wakeLock) return;
    if (wake) return;
    navigator.wakeLock.request('screen').then(function (l) { wake = l; l.addEventListener('release', function () { wake = null; }); }).catch(function () {});
  }

  /* ------------------------------------------------------------ tracking */
  var trackTimer = null, sosTimer = null;
  function startTracking() {
    stopTracking();
    if (!(ST.outside && ST.tracking && navigator.geolocation)) return;
    if (window.SGNative && SGNative.isNative) { SGNative.want('track', nativeLoc); return; }
    trackTimer = setInterval(function () { trackTick(false); }, Math.max(30, CFG.pingIntervalSec || 120) * 1000);
    wantWake();
  }
  function nativeLoc(p) {                                    // a fix from the background service, thinned to the ping interval
    lastPos = { lat: p.lat, lng: p.lng, acc: p.acc, t: Date.now() }; locDenied = false;
    var gap = (ST.sos ? 15 : Math.max(30, CFG.pingIntervalSec || 120)) * 1000;
    if (Date.now() - nativeLast < gap) return;
    if (!ST.sos && !(ST.outside && ST.tracking && U.trackExpected(SG.now(), CFG))) return;
    nativeLast = Date.now(); lastPingT = SG.now();
    enqueue({ id: SG.uuid(), type: 'ping', t: SG.now(), lat: p.lat, lng: p.lng, acc: p.acc, battery: batt }, true); sync(); refresh();
  }
  var nativeLast = 0;
  function stopTracking() { if (window.SGNative && SGNative.isNative) SGNative.release('track'); if (trackTimer) clearInterval(trackTimer); trackTimer = null; if (wake) { try { wake.release(); } catch (e) {} wake = null; } }
  function trackTick(force) {
    if (!ST.outside || !ST.tracking) return Promise.resolve();
    if (!force && !U.trackExpected(SG.now(), CFG)) return Promise.resolve();
    return getPos(15000).then(function (p) {
      if (!p) { refresh(); return; }
      lastPingT = SG.now();
      enqueue({ id: SG.uuid(), type: 'ping', t: SG.now(), lat: p.lat, lng: p.lng, acc: p.acc, battery: batt }, true);
      refresh();
    });
  }
  function startSosPings() {
    stopSosPings();
    if (window.SGNative && SGNative.isNative) SGNative.want('sos', nativeLoc);
    sosTimer = setInterval(function () {
      if (!ST.sos) return stopSosPings();
      getPos(10000).then(function (p) { if (p) enqueue({ id: SG.uuid(), type: 'ping', t: SG.now(), lat: p.lat, lng: p.lng, acc: p.acc, battery: batt }, true); });
      sync();
    }, 20000);
  }
  function stopSosPings() { if (window.SGNative && SGNative.isNative) SGNative.release('sos'); if (sosTimer) clearInterval(sosTimer); sosTimer = null; }

  /* ------------------------------------------------------------ navigation + render */
  var TIMED = { escort: 0, pass: 1, home: 1, arrived: 1, sos: 1, me: 1, history: 1, privacy: 1 };
  function loadWatchers() { if (!P) return; SG.call('myWatchers', { matric: P.matric, deviceId: DEV }).then(function (r) { WATCHERS = r; if (view === 'family') renderView(); }, function () {}); }
  function go(v, d) { stopCamera(); if (v !== 'map') stopMap(); view = v; if (v === 'family') loadWatchers(); if (d !== undefined) draft = d; render(); window.scrollTo(0, 0); if (v === 'me' && P) { net.nextTry = 0; sync(); } if ((v === 'scan' || v === 'leave') && P && P.consentLoc !== false) getPos(10000); }
  function refresh() { updateTop(); dueCheck(); if (TIMED[view]) renderView(); renderSos(); renderAsk(); }
  function render() { if (view === 'scan' && P && P.consentLoc !== false && (!lastPos || Date.now() - lastPos.t > 20000)) getPos(8000); updateTop(); renderView(); renderSos(); renderAsk(); if (view === 'scan') startCamera(); }
  function renderAsk() {
    var el = $('#askbar'); if (!el) return;
    if (!ASK || !P || view === 'onboard') { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="askbar" role="alertdialog" aria-label="Security is checking on you"><div class="in"><b>📨 Security asks:</b> ' + esc(ASK.text) +
      '<div class="row" style="margin-top:8px"><button class="btn ok grow" data-act="ask-ok">✅ I am OK</button><button class="btn danger grow" data-act="ask-help">🆘 I need help</button></div></div></div>';
  }
  function notify(title, body) {
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;
      if (navigator.serviceWorker && navigator.serviceWorker.ready) navigator.serviceWorker.ready.then(function (r) { r.showNotification(title, { body: body, icon: 'icon-192.png', tag: 'sg-' + title, vibrate: [200, 100, 200] }); });
      else new Notification(title, { body: body });
    } catch (e) {}
  }
  function dueCheck() {                                   // one gentle reminder before the return time, one when it passes
    if (!ST.outside || !ST.expectedReturn) return;
    var left = ST.expectedReturn - SG.now();
    if (left > 0 && left <= 10 * 60000 && !ST.remind1) { ST.remind1 = true; save(); if (navigator.vibrate) navigator.vibrate(150); notify('Due back soon', 'You said you would be back by ' + SG.hm(ST.expectedReturn) + '. Need more time? Open the app.'); }
    if (left < 0 && !ST.remind2) { ST.remind2 = true; save(); if (navigator.vibrate) navigator.vibrate([150, 80, 150]); notify('You are past your return time', 'Come back, or tell security you need more time.'); }
  }

  function updateTop() {
    var wait = pending(), cls, txt;
    if (net.syncing) { cls = 'pill'; txt = 'Saving…'; }
    else if (!net.online || (wait && net.fails)) { cls = 'pill warn'; txt = 'Offline' + (wait ? ' · ' + wait + ' waiting' : ''); }
    else if (wait) { cls = 'pill warn'; txt = wait + ' waiting to send'; }
    else { cls = 'pill ok'; txt = 'Saved'; }
    elTop.innerHTML = '<div class="topbar"><div class="brand">' + logo() + '<span>' + esc(CFG.schoolName || 'SafeGate') + '</span></div>' +
      '<span class="' + cls + '"><i class="dot"></i>' + esc(txt) + '</span></div>';
  }
  function logo() {
    return '<svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#0b5d7a"/><path d="M32 12l18 7v13c0 11-8 18-18 21-10-3-18-10-18-21V19z" fill="none" stroke="#fff" stroke-width="4" stroke-linejoin="round"/><path d="M24 32l6 6 11-12" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  function renderSos() {
    if (!P || view === 'onboard' || view === 'sos' || view === 'locked') { elSos.innerHTML = ''; return; }
    elSos.innerHTML = '<div class="sos-fab"><div class="in"><button class="sos-btn" id="sosHold" aria-label="Emergency. Press and hold for 1.5 seconds to alert security"><div class="fill"></div><span>🆘 HOLD FOR EMERGENCY</span></button></div></div>';
  }
  function renderView() {
    var fn = VIEWS[view] || VIEWS.home;
    if (!P && view !== 'onboard') { view = 'onboard'; fn = VIEWS.onboard; }
    if (window.SGMedia && SGMedia.recording() && (view === 'sos' || view === 'report')) return;   // never wipe a recording in progress
    elView.innerHTML = fn();
    if (window.SGMedia) { elView.querySelectorAll('[data-media]').forEach(function (n) { SGMedia.mount(n, n.getAttribute('data-media')); }); if (view === 'home' || view === 'sos' || view === 'report') SGMedia.pending(function (n) { if (n && view !== 'onboard' && !elView.querySelector('.mediaWait')) elView.insertAdjacentHTML('afterbegin', '<div class="note small mediaWait" role="status">📎 ' + n + ' picture, voice or video file' + (n > 1 ? 's' : '') + ' waiting to send. They go by themselves when you have signal.</div>'); }); }
    if (view === 'me') drawId();
    if (view === 'feedback' && window.SGFeedback) SGFeedback.mount($('#fbRoot'), { role: 'student', who: P ? { name: P.name, matric: P.matric } : null, page: 'app', back: function () { go('home'); } });
    if (view === 'onboard' && !P) { drawDeskQr(); startSlides(); }
    if ((view === 'onboard' || view === 'me' || view === 'feedback') && !elView.querySelector('.powered')) elView.insertAdjacentHTML('beforeend', SG.powered());
    if (view === 'map') initMap();
  }

  /* ------------------------------------------------------------ views */
  function backBtn(to) { return '<button class="back" data-act="go" data-to="' + (to || 'home') + '">← Back</button>'; }
  function remaining() {
    if (!ST.expectedReturn) return '';
    var d = ST.expectedReturn - SG.now();
    return d >= 0 ? 'in ' + SG.dur(d) : 'overdue by ' + SG.dur(-d);
  }
  var LOCK = null, TCODE = '', XCODE = null, IDCARD = store.get('sg_idcard', null);
  function drawDeskQr() { var box = $('#deskQr'), cv = $('#deskQrCv'); if (!box || !cv) return; var wide = window.innerWidth >= 760 && !(navigator.maxTouchPoints > 0); if (!wide) return; try { SG.qr(cv, location.origin + '/', 360); box.classList.remove('hidden'); } catch (e) {} }
  function drawId() { var cv = $('#idqr'); if (cv && IDCARD) { try { SG.qr(cv, IDCARD, 400); } catch (e) {} } }
  function pushSend(sub) { return SG.call('pushSubscribe', { matric: P.matric, deviceId: DEV, sub: sub }); }
  var VIEWS = {};

  VIEWS.onboard = function () {
    var p = P || {}, em = p.emergency || {};
    return (P ? '<h1>Edit my details</h1>' + backBtn('me') :
      slidesHtml() + '<div style="text-align:center;margin:6px 0 14px"><h1 style="margin:10px 0 6px">Your campus gate, in your pocket</h1><p class="muted" style="margin:0 0 12px">Set up once, about a minute. After that, going out and coming back takes a few seconds.</p>' +
      '<div class="row" style="justify-content:center;gap:8px;flex-wrap:wrap"><span class="pill ok">⚡ Two taps at the gate</span><span class="pill ok">👨‍👩‍👧 Family knows you are safe</span><span class="pill ok">🆘 Help in one button</span></div></div>' +
      '<div id="deskQr" class="card hidden" style="text-align:center"><b>Open it on your phone</b><div class="small muted" style="margin:4px 0 10px">SafeGate is made for phones. Point your camera at this code.</div><canvas id="deskQrCv" style="width:180px;height:180px;image-rendering:pixelated"></canvas></div>' +
      '<p class="small muted" style="text-align:center">Your details stay on your phone and the school security system. <a href="desk.html">Security staff? Open the desk →</a></p>') +
      '<form data-form="onboard" class="card" autocomplete="on" novalidate>' +
      '<label class="f" for="f_name">Full name</label><input id="f_name" type="text" name="name" autocomplete="name" value="' + esc(p.name) + '" required>' +
      '<label class="f" for="f_matric">Matriculation number</label><input id="f_matric" type="text" name="matric" autocapitalize="characters" value="' + esc(p.matric) + '"' + (P ? ' readonly' : '') + ' required>' +
      (P ? '<div class="small muted">Your matric number cannot be changed. Ask security if it is wrong.</div>' : '') +
      '<label class="f" for="f_phone">Your phone number</label><input id="f_phone" type="tel" name="phone" autocomplete="tel" value="' + esc(p.phone) + '" required>' +
      '<label class="f" for="f_res">Where do you live?</label><select id="f_res" name="residence">' +
      [['campus', 'In a school hostel'], ['off', 'Off campus (rented room / lodge)'], ['home', 'With my family nearby']].map(function (o) { return '<option value="' + o[0] + '"' + (p.residence === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' +
      '<h3 style="margin-top:20px">Emergency contact</h3><p class="small muted">Someone security can call if you are in trouble.</p>' +
      '<label class="f" for="f_en">Their name</label><input id="f_en" type="text" name="en" value="' + esc(em.name) + '" required>' +
      '<label class="f" for="f_ep">Their phone number</label><input id="f_ep" type="tel" name="ep" value="' + esc(em.phone) + '" required>' +
      '<label class="check"><input type="checkbox" name="minor"' + (p.minor ? ' checked' : '') + '><span><b>I am under 18.</b><br><span class="small muted">The law asks for a parent or guardian\'s agreement before your location is used. Until the school records it, your location stays off. Everything else works.</span></span></label>' +
      '<label class="check"><input type="checkbox" name="consent"' + (p.consentLoc === true ? ' checked' : '') + '><span><b>Share my location when I am outside after ' + esc(CFG.trackFrom || '17:30') + '.</b><br><span class="small muted">Only while you are signed out. It is also used once at the gate to check you really are there when you scan. Security cannot see it unless a real safety reason is recorded, and you can see who looked. You can change this at any time.</span></span></label>' +
      '<div id="obErr" class="err-msg" role="alert"></div>' +
      '<button class="btn primary block big" type="submit">' + (P ? 'Save' : 'Continue') + '</button></form>';
  };

  function ring() {
    if (!ST.outside || !ST.expectedReturn || !ST.since) return '';
    var total = Math.max(1, ST.expectedReturn - ST.since), p = Math.max(0, Math.min(1, (SG.now() - ST.since) / total)), late = SG.now() > ST.expectedReturn, C = 2 * Math.PI * 26;
    return '<svg class="ring" viewBox="0 0 64 64" role="img" aria-label="' + Math.round(p * 100) + ' percent of planned time used"><circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="7"/><circle cx="32" cy="32" r="26" fill="none" stroke="' + (late ? '#ffd1d1' : '#fff') + '" stroke-width="7" stroke-linecap="round" stroke-dasharray="' + (p * C).toFixed(1) + ' ' + C.toFixed(1) + '" transform="rotate(-90 32 32)"/><text x="32" y="37" text-anchor="middle" font-size="15" font-weight="800" fill="#fff">' + (late ? '!' : Math.round(p * 100) + '%') + '</text></svg>';
  }
  function walkCard() {
    var w = ST.walk; if (!w) return '';
    var left = w.until - SG.now(), sent = !Q.some(function (i) { return i.id === w.id; }), over = left <= 0;
    return '<div class="card walk' + (over ? ' over' : '') + '" style="margin-top:12px"><div class="row between"><b>🚶 Safe walk' + (w.note ? ': ' + esc(w.note) : '') + '</b><span class="pill ' + (sent ? 'ok' : 'warn') + '">' + (sent ? 'Security is watching' : 'Sending…') + '</span></div>' +
      '<div style="margin:8px 0">' + (over ? '<b>Time is up.</b> Tap below if you are safe, or security will be alerted.' : 'Ends at <b>' + esc(SG.hm(w.until)) + '</b> (' + esc(SG.dur(left)) + ' left).') + '</div>' +
      (sent ? '' : '<div class="small muted" style="margin-bottom:8px">Not with security yet. Keep your signal on until this says “Security is watching”.</div>') +
      '<div class="row"><button class="btn ok grow" data-act="walk-end">✅ I have arrived safely</button><button class="btn" data-act="walk-more">+10 min</button></div></div>';
  }
  function noticesStrip() {
    var h = '';
    NOTICES.filter(function (n) { return !n.acked; }).forEach(function (n) {
      h += '<div class="note ' + (n.level === 'urgent' ? 'bad' : 'warn') + '" style="margin-bottom:10px" role="status"><b>' + (n.level === 'urgent' ? '🔴 ' : '📢 ') + esc(n.title) + '</b>' + (n.text ? '<div class="small">' + esc(n.text) + '</div>' : '') +
        '<div style="margin-top:6px"></div><button class="btn sm" data-act="notice-ok" data-id="' + esc(n.id) + '">Got it</button></div>';
    });
    return h;
  }
  function openPass() { var now = SG.now(); return PASSES.filter(function (x) { return x.status === 'approved' && x.until > now; })[0]; }

  VIEWS.home = function () {
    var out = ST.outside, h = noticesStrip(), pend = pending(), now = SG.now();
    h += '<div id="helpBanner"></div>'; setTimeout(function () { loadHelp(); }, 0);
    h += installBanner();
    h += adCard();
    if (ROLLCALL && now < ROLLCALL.exp) h += ROLLCALL.answered ? '<div class="note ok small" style="margin-bottom:10px" role="status">✅ ' + esc(ROLLCALL.title) + ': security knows you are ' + (ROLLCALL.ok ? 'safe' : 'asking for help') + '. Thank you.</div>' :
      '<div class="card" style="border:2px solid #b3261e;margin-bottom:12px" role="alert"><b style="font-size:1.1rem">🔔 ' + esc(ROLLCALL.title) + '</b><p class="small" style="margin:6px 0 10px">' + esc(ROLLCALL.text) + '</p><div class="row" style="gap:8px"><button class="btn primary grow" data-act="rc-safe">✅ I am safe</button><button class="btn danger grow" data-act="rc-help">🆘 I need help</button></div></div>';
    if (NEEDCONSENT) h += '<div class="note warn" style="margin-bottom:10px"><b>🔒 Privacy notice</b><details style="margin-top:6px"><summary class="small">Read what is recorded and who can see it</summary><p class="small" style="white-space:pre-wrap">' + esc(CFG.policyText || '') + '</p></details><div style="margin-top:8px"></div><button class="btn sm primary" data-act="consent-ok">I have read it</button></div>';
    if (ESCORT) {
      var es = ESCORT, ep = es.status === 'open' ? ['warn', '🛡 Escort requested. Waiting for an officer. Stay where people can see you.'] : es.status === 'assigned' ? ['ok', '🛡 ' + esc(es.by) + ' is coming to escort you from ' + esc(es.from || 'your location') + ' to ' + esc(es.to) + '.'] : es.status === 'done' ? ['ok', '🛡 Escort completed. Stay safe.'] : ['mute', '🛡 Escort request ' + es.status + '.'];
      h += '<div class="note ' + ep[0] + '" style="margin-bottom:10px" role="status">' + ep[1] + ((es.status === 'open' || es.status === 'assigned') ? '<div style="margin-top:8px"></div><button class="btn sm" data-act="escort-cancel" data-id="' + esc(es.id) + '">Cancel request</button>' : '') + '</div>';
    }
    VISFORME.forEach(function (v) { h += '<div class="note small" style="margin-bottom:10px">🪪 <b>' + esc(v.name) + '</b> signed in at the gate to visit you (' + esc(SG.hm(v.t)) + ').</div>'; });
    var op = openPass(); if (op) h += '<div class="note ok small" style="margin-bottom:10px">🎫 Exit pass approved until <b>' + esc(SG.dt(op.until)) + '</b>' + (op.dest ? ' (' + esc(op.dest) + ')' : '') + '. You will not get late alerts before then.</div>';
    if (!out) {
      h += '<div class="hero"><h1>You are on campus</h1><div class="sub">Scan the code at the gate when you go out.</div></div>';
      if (ST.lastArrive) h += '<p class="small muted center" style="margin-top:10px">Last back at ' + esc(SG.dt(ST.lastArrive.t)) + '</p>';
      h += walkCard();
      h += '<button class="btn primary block big" style="margin-top:14px" data-act="scan">📷 Scan to go out</button>';
    } else {
      var late = ST.expectedReturn && now > ST.expectedReturn, left = ST.expectedReturn ? ST.expectedReturn - now : null;
      h += '<div class="hero out"><div class="row between" style="flex-wrap:nowrap"><div><h1>You are out</h1><div class="sub">Going to <b>' + esc(ST.destination || '—') + '</b></div></div>' + ring() + '</div><div class="kv">' +
        '<div><span>Left at</span><b>' + esc(SG.hm(ST.since)) + '</b></div>' +
        '<div><span>Back by</span><b>' + esc(ST.expectedReturn ? SG.hm(ST.expectedReturn) : '—') + '</b></div></div>' +
        (ST.expectedReturn ? '<div style="margin-top:10px;font-weight:700">' + (late ? '⚠ ' : '') + esc(remaining()) + '</div>' : '') + '</div>';
      if (left != null && left > 0 && left <= 10 * 60000) h += '<div class="note warn small" style="margin-top:12px">⏰ Due back in ' + esc(SG.dur(left)) + '. Heading back? If not, tap “I need more time”.</div>';
      h += walkCard() + trackingCard();
      h += '<button class="btn primary block big" style="margin-top:14px" data-act="scan">📷 Scan to come back</button>';
      h += '<div class="row" style="margin-top:10px"><button class="btn grow" data-act="safe">✅ I am safe</button><button class="btn grow" data-act="extend">⏱ I need more time</button></div>';
      h += '<button class="btn block" style="margin-top:10px" data-act="share">📤 Share my trip with a friend</button>';
    }
    if (!ST.walk) h += '<button class="btn block walkbtn" style="margin-top:10px" data-act="walk"><span class="wk-i">🚶</span><span class="wk-t"><b>Start a safe walk</b><span class="small muted">Security is alerted if you do not arrive in time</span></span></button>';
    if (pend) h += '<div class="note warn small" style="margin-top:12px">' + pend + ' record' + (pend > 1 ? 's are' : ' is') + ' saved on your phone and will be sent when you have internet. You do not need to do anything.</div>';
    function tile(to, ic, label) { return '<button class="btn" data-act="go" data-to="' + to + '">' + ic + '<span>' + label + '</span></button>'; }
    h += '<div class="grid3">' + tile('pass', '🎫', 'Exit pass') + tile('report', '📣', 'Report a concern') + tile('escort', '🛡', 'Ask for an escort') + tile('family', '👪', 'Family link') + tile('numbers', '📞', 'Important numbers') + tile('map', '🗺', 'Safety map') + tile('places', '📍', 'Places guide') + tile('history', '🕘', 'My trips') + tile('check', '🩺', 'Check my phone') + tile('me', '👤', 'Me &amp; privacy') + tile('feedback', '💬', 'Feedback') + '</div>';
    h += SG.powered();
    h += '<p class="small muted center" style="margin-top:16px">Phone off or battery dead? Sign the paper register at the gate. That still counts.</p>';
    return h;
  };
  VIEWS.walk = function () {
    return backBtn('home') + '<h1>Safe walk</h1><p class="muted">Walking alone, maybe at night? Set a timer. When you arrive, tap “I have arrived”. If you do not, security is alerted with your last location, <b>even if your phone dies</b>.</p>' +
      '<form data-form="walk" novalidate><label class="f">How long will it take?</label><div class="chips" role="radiogroup">' + [10, 15, 20, 30, 45, 60, 90].map(function (m) { return '<label class="chip"><input type="radio" name="min" value="' + m + '"' + (m === 15 ? ' checked' : '') + '><span>' + m + ' min</span></label>'; }).join('') + '</div>' +
      '<label class="f" for="w_note">Where to? <span class="hint">Optional</span></label><input id="w_note" type="text" name="note" maxlength="60" placeholder="e.g. Library to Block C hostel">' +
      '<div class="note small" style="margin-top:12px">Needs signal to start. Security only looks at your location if the timer runs out.</div>' +
      '<button class="btn primary block big" style="margin-top:14px" type="submit">Start timer</button></form>';
  };
  function trackingCard() {
    if (!ST.tracking) return '<div class="note small" style="margin-top:12px">Location sharing is <b>off</b> for this trip.</div>';
    var inWin = U.trackExpected(SG.now(), CFG), msg, cls = 'note small';
    if (locDenied) { msg = '<b>Location is blocked.</b> Turn on location for this app in your phone settings so security can help you if needed.'; cls += ' bad'; }
    else if (!inWin) { msg = 'Location sharing starts at <b>' + esc(CFG.trackFrom) + '</b>. Keep this app open.'; }
    else { msg = 'Location sharing is <b>on</b>. Last sent: <b>' + (lastPingT && lastPingT > ST.since ? esc(SG.hm(lastPingT)) : 'waiting…') + '</b>. Keep this app open and your screen on for best results.'; cls += ' ok'; }
    return '<div class="' + cls + '" style="margin-top:12px">' + msg + '</div>';
  }

  VIEWS.scan = function () {
    var back = ST.outside;
    return backBtn('home') + '<h1>' + (back ? 'Scan to come back' : 'Scan to go out') + '</h1>' +
      '<p class="muted">Point your camera at the QR code displayed at the gate.</p>' +
      '<div class="camera" id="camBox"><video id="cam" playsinline muted></video><div class="frame"></div></div>' +
      '<div class="row" style="margin-top:10px"><button id="torchBtn" class="btn sm hidden" data-act="torch">🔦 Light</button></div>' +
      '<div id="scanmsg" class="note small" style="margin-top:12px" role="status">Starting camera…</div>' +
      '<div class="card flat" style="margin-top:14px"><h3>Camera not working?</h3>' +
      '<p class="small muted">Hold the phone steady, 20 to 40 cm from the code, with good light. Or open your phone\'s normal <b>Camera</b> app, point it at the code and tap the link. Or type the 6-digit code.</p>' +
      '<form data-form="code" class="row" novalidate><input class="grow" type="text" inputmode="numeric" name="code" maxlength="7" placeholder="Or type the 6-digit code" aria-label="6-digit gate code" autocomplete="off"><button class="btn primary" type="submit">Use code</button></form>' +
      '<div id="codeErr" class="err-msg" role="alert"></div>' +
      '<button class="btn ghost block" style="margin-top:10px" data-act="noscan">I cannot scan at all</button></div>';
  };

  VIEWS.noscan = function () {
    return backBtn('scan') + '<h1>Continue without scanning?</h1>' +
      '<div class="note warn">Your trip will be recorded as <b>not verified at the gate</b>. Security will see this. Use this only if the camera and the code both fail. Better still: sign the paper register at the gate.</div>' +
      '<button class="btn primary block big" style="margin-top:14px" data-act="gate-none">Continue, not verified</button>';
  };

  VIEWS.leave = function () {
    var places = CFG.places || [], d = draft;
    var h = backBtn('scan') + '<h1>Where are you going?</h1>';
    h += d.gate ? '<div class="note ok small">✓ Gate code received</div>' : '<div class="note warn small">Not verified at the gate. Security will see this.</div>';
    h += '<form data-form="leave" novalidate><label class="f">Destination</label><div class="chips" role="radiogroup" aria-label="Destination">';
    places.forEach(function (p) { h += '<label class="chip"><input type="radio" name="place" value="' + esc(p.id) + '"><span>' + esc(p.name) + '</span></label>'; });
    h += '<label class="chip"><input type="radio" name="place" value="_other"><span>Somewhere else</span></label></div>';
    if (RECENT.length) h += '<label class="f" style="margin-top:12px">Same as before<span class="hint">One tap to fill it in</span></label><div class="chips">' + RECENT.map(function (x, i) { return '<button type="button" class="chip" data-act="recent" data-i="' + i + '"><span>↺ ' + esc(x.text.length > 28 ? x.text.slice(0, 27) + '…' : x.text) + '</span></button>'; }).join('') + '</div>';
    h += '<div id="placeTip" class="note small hidden" style="margin-top:10px"></div>';
    h += '<div id="otherBox" class="hidden"><label class="f" for="f_other">Write the exact place and area<span class="hint">Example: "Ade Pharmacy, Ugbowo road". If you do not know the area yet, ask a senior student or security first.</span></label><input id="f_other" type="text" name="other" maxlength="120"></div><div id="vagueBox" class="note warn small hidden" role="alert" style="margin-top:8px"></div>';
    h += '<label class="f">Why are you going?</label><div class="chips">' + ['Shopping', 'Food', 'Health', 'Worship', 'Bank', 'Visiting', 'Going home', 'Other'].map(function (x) { return '<label class="chip"><input type="radio" name="purpose" value="' + x + '"><span>' + x + '</span></label>'; }).join('') + '</div>';
    h += '<label class="f" for="f_meet">Who are you visiting or meeting? <span class="hint">Optional but it can save hours if you are ever missing. Name and phone number.</span></label><input id="f_meet" type="text" name="meet" maxlength="100" placeholder="e.g. Tunde, 0803 123 4567">';
    h += '<label class="f" for="f_comp">Going with someone? <span class="hint">Optional. Names or how many people.</span></label><input id="f_comp" type="text" name="comp" maxlength="100">';
    h += '<label class="f">I will be back by</label><div class="chips">' + [[60, '1 hour'], [120, '2 hours'], [180, '3 hours'], [240, '4 hours'], [-1, 'A time…']].map(function (x, i) {
      return '<label class="chip"><input type="radio" name="ret" value="' + x[0] + '"' + (x[0] === 120 ? ' checked' : '') + '><span>' + x[1] + '</span></label>'; }).join('') + '</div>';
    h += '<div id="retTime" class="hidden"><input type="time" name="rettime" aria-label="Return time" value="18:00" style="margin-top:8px"></div><div id="retInfo" class="small muted" style="margin-top:6px"></div>';
    h += '<label class="check"><input type="checkbox" name="share"' + (P.consentLoc !== false ? ' checked' : '') + '><span><b>Share my location on this trip</b><br><span class="small muted">From ' + esc(CFG.trackFrom) + ' until you scan back in. It helps security find you if something goes wrong.</span></span></label>';
    h += '<div id="leaveErr" class="err-msg" role="alert"></div><button class="btn primary block big" type="submit">Confirm and go out</button></form>';
    return h;
  };

  VIEWS.outdone = function () {
    var pl = (CFG.places || []).filter(function (p) { return p.id === draft.placeId; })[0];
    return '<div class="center" style="padding-top:20px"><div class="bigcheck">✓</div><h1>You are signed out</h1>' +
      '<p class="muted">Going to <b>' + esc(ST.destination) + '</b> · back by <b>' + esc(SG.hm(ST.expectedReturn)) + '</b></p></div>' +
      (pl && pl.tip ? '<div class="note"><b>Stay safe at ' + esc(pl.name) + '</b><br>' + esc(pl.tip) + '</div>' : '') +
      '<div class="card" style="margin-top:12px"><ol class="steps"><li>Keep this app open while you are out.</li><li>If anything feels wrong, hold the red button.</li><li>When you return, scan the gate code again.</li></ol></div>' +
      (ST.tracking && locDenied ? '<div class="note bad small" style="margin-top:12px">Location is blocked. Allow location for this app in your phone settings.</div>' : '') +
      '<button class="btn primary block big" style="margin-top:14px" data-act="go" data-to="home">Done</button>';
  };

  VIEWS.arrived = function () {
    var a = ST.lastArrive || {};
    return '<div class="center" style="padding-top:20px"><div class="bigcheck">🏠</div><h1>Welcome back</h1>' +
      '<p class="muted">You came back at <b>' + esc(SG.hm(a.t)) + '</b>' + (a.dur ? ' after ' + esc(SG.dur(a.dur)) : '') + '.</p></div>' +
      (a.late ? '<div class="note warn small">You were back later than you planned. Next time, tap “I need more time” so security does not worry.</div>' : '') +
      '<button class="btn primary block big" style="margin-top:14px" data-act="go" data-to="home">Done</button>';
  };

  var SOSKIND = '';
  VIEWS.sos = function () {
    var s = ST.sos || {}, queued = Q.some(function (i) { return i.id === s.id; });
    var loc = lastPos ? 'https://maps.google.com/?q=' + lastPos.lat + ',' + lastPos.lng : '';
    var body = encodeURIComponent('SAFEGATE SOS ' + (P ? P.matric : '') + (lastPos ? ' geo:' + lastPos.lat.toFixed(5) + ',' + lastPos.lng.toFixed(5) : '') + '\nEMERGENCY. ' + (P ? P.name : '') + ' needs help.' + (loc ? ' Map: ' + loc : ''));
    var ph = (CFG.securityPhone || '').replace(/[^\d+]/g, '');
    var h = '<div class="hero sos" style="margin-top:6px"><h1>' + (queued ? 'Alert saved' : 'Alert sent') + '</h1><div class="sub">' +
      (queued ? 'No internet yet. Your alert will go to security <b>automatically</b> the moment you are online.' : 'Security has your alert' + (lastPos ? ' and your location' : '') + '. Stay where you are if it is safe.') + '</div></div>';
    if (!queued && ST.sos && ST.sos.steps) h += '<div class="card" style="margin-top:12px"><b>Where your alert is</b>' + stepsHtml(ST.sos.steps, ST.sos.stage) + '</div>';
    h += '<div class="card" style="margin-top:12px"><b>What do you need?</b><div class="chips" style="margin-top:8px">' + [['danger', '⚠ Danger'], ['medical', '🚑 Medical'], ['followed', '🚶 Followed'], ['accident', '🚗 Accident']].map(function (k) { return '<button type="button" class="chip' + (SOSKIND === k[0] ? ' on' : '') + '" data-act="sos-kind" data-kind="' + k[0] + '"><span>' + k[1] + '</span></button>'; }).join('') + '</div><div class="small muted">Optional. It tells security what to bring.</div></div>';
    if (CFG.mediaOn !== false && window.SGMedia) h += '<div class="card" style="margin-top:12px"><b>Show security what is happening</b><div class="small muted">Pictures, a voice note or a short video. Only security can open them.</div><div data-media="sos" style="margin-top:8px"></div><button class="btn primary block" data-act="sos-media" style="margin-top:8px">Send these to security</button></div>';
    h += '<div class="stack" style="margin-top:14px">';
    if (ph) h += (queued ? '<a class="btn primary block big" href="sms:' + esc(ph) + '?&body=' + body + '">💬 No internet: send this text to security</a><a class="btn block" href="tel:' + esc(ph) + '">📞 Call security</a>' : '<a class="btn primary block big" href="tel:' + esc(ph) + '">📞 Call security</a><a class="btn block" href="sms:' + esc(ph) + '?&body=' + body + '">💬 Send SMS to security</a>');
    else h += '<div class="note warn small">Security phone number is not set yet. Call someone you trust.</div>';
    if (P && P.emergency && P.emergency.phone) h += '<a class="btn block" href="tel:' + esc(P.emergency.phone.replace(/[^\d+]/g, '')) + '">📞 Call ' + esc(P.emergency.name || 'emergency contact') + '</a>';
    h += '<button class="btn block" data-act="go" data-to="map" data-escape="1">🗺 Show me the nearest safe place</button><button class="btn block" data-act="sos-cancel">I am OK. Cancel the alert</button></div>';
    h += '<p class="small muted center" style="margin-top:14px">While the alert is on, your location is sent to security every 20 seconds.</p>';
    return h;
  };

  /* ---- Safety map: street map, safe places, risky areas, hazards. GPS needs no internet, and what the phone has seen or saved still shows offline. */
  var MAP = { m: null, watch: null, pos: null, heading: null, sel: null, escape: false, err: '', show: { safe: true, risk: true, hazards: true, places: true }, route: null, routeBusy: false, hz: false, dest: null, q: '', pin: null, night: store.get('sg_mapnight', false), arrived: false, saved: store.get('sg_mapsaved', 0), saving: 0 };
  function safeList() {
    var l = (CFG.safePoints || []).slice(), c = CFG.campus || {};
    if (c.lat != null && !l.some(function (x) { return x.type === 'gate' || x.type === 'security'; })) l.push({ id: 'campus', type: 'gate', name: 'Campus gate', note: 'The main entrance', lat: c.lat, lng: c.lng });
    return l;
  }
  function zoneOn(z) { if (!z.from || !z.until) return true; var m = (((Math.floor(SG.now() / 60000) + (CFG.tzOffsetMin || 0)) % 1440) + 1440) % 1440, f = z.from.split(':'), u = z.until.split(':'), a = +f[0] * 60 + +f[1], b = +u[0] * 60 + +u[1]; return a < b ? (m >= a && m < b) : (m >= a || m < b); }
  function hazardsNow() { var n = SG.now(); return (CFG.hazards || []).filter(function (h) { return h.until > n; }); }
  var CARD = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  function cardinal(b) { return CARD[Math.round(b / 45) % 8]; }
  var HZ = [['blocked', '⛔ Road blocked'], ['flood', '🌊 Flooding'], ['construction', '🚧 Construction'], ['dark', '🌑 No light'], ['dogs', '🐕 Dogs'], ['crowd', '👥 Crowd'], ['accident', '⚠️ Accident'], ['other', '⚠️ Other']];
  VIEWS.map = function () {
    var n = safeList().length;
    return backBtn(MAP.escape ? 'sos' : 'home') + '<h1>' + (MAP.escape ? 'Get to safety' : 'Safety map') + '</h1>' +
      (MAP.escape ? '<div class="note bad small">Move toward the green line. If you are in danger, keep the alert on and call security.</div>' : '<p class="muted small">Streets, safe places, risky areas and blocked roads, with the safest way to a safe place.</p>') +
      '<div id="mapBox" style="margin:10px 0"></div><div class="chips" id="mapLayers" style="margin-bottom:8px">' + [['safe', '🛡 Safe places'], ['risk', '🔴 Risky areas'], ['hazards', '🚧 Hazards'], ['places', '📍 Places']].map(function (k) { return '<button type="button" class="chip' + (MAP.show[k[0]] ? ' on' : '') + '" data-act="map-layer" data-k="' + k[0] + '" aria-pressed="' + !!MAP.show[k[0]] + '"><span>' + k[1] + '</span></button>'; }).join('') + '</div>' +
      '<form data-form="map-find" class="row" style="margin-bottom:8px" novalidate><input type="search" name="q" aria-label="Where do you want to go?" placeholder="Where to? e.g. library, hostel, gate" maxlength="40" style="flex:1" value="' + esc(MAP.q) + '"><button class="btn" type="submit">Find</button></form><div id="mapFind" class="stack"></div><div id="mapInfo" class="stack"></div>' + (n ? '' : '<div class="note warn small">Your school has not marked safe places yet. The gate and the security phone number still work.</div>');
  };
  function stopMap() {
    stopWatchOnly();
    if (MAP.orient) { window.removeEventListener('deviceorientationabsolute', MAP.orient, true); window.removeEventListener('deviceorientation', MAP.orient, true); MAP.orient = null; }
  }
  function startCompass() {
    if (MAP.orient) return;
    MAP.orient = function (e) { var h = typeof e.webkitCompassHeading === 'number' ? e.webkitCompassHeading : (e.absolute || e.type === 'deviceorientationabsolute') && typeof e.alpha === 'number' ? (360 - e.alpha) % 360 : null; if (h != null && (MAP.heading == null || Math.abs(h - MAP.heading) > 4)) { MAP.heading = h; mapUpdate(); } };
    var go2 = function () { window.addEventListener('deviceorientationabsolute', MAP.orient, true); window.addEventListener('deviceorientation', MAP.orient, true); };
    if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') DeviceOrientationEvent.requestPermission().then(function (r) { if (r === 'granted') go2(); }, function () {}); else go2();
  }
  function startLocate() {
    MAP.err = '';
    if (!navigator.geolocation) { MAP.err = 'This phone cannot give a location.'; return mapUpdate(); }
    startCompass(); stopWatchOnly();
    MAP.watch = navigator.geolocation.watchPosition(function (p) { MAP.pos = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, t: SG.now() }; lastPos = MAP.pos; mapUpdate(); },
      function (e) { MAP.err = e && e.code === 1 ? 'Location is turned off for SafeGate. Turn it on in your phone settings, then tap Find me.' : 'Cannot get a location yet. Move to open sky and tap Find me.'; mapUpdate(); }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
  }
  function stopWatchOnly() { if (MAP.watch != null) { try { navigator.geolocation.clearWatch(MAP.watch); } catch (e) {} MAP.watch = null; } }
  function initMap() {
    var box = $('#mapBox'); if (!box || !window.SGMap) return;
    MAP.m = SGMap.create(box, { label: 'Safety map' });
    MAP.m.onpick = function (kind, it) { if (kind === 'safe') { MAP.sel = it.id; MAP.route = null; mapUpdate(); } else if (kind === 'place' && it.lat != null) setDest(it); };
    MAP.m.onmap = function (pt) { MAP.pin = pt; mapUpdate(); };
    if (!MAP.pos && lastPos && SG.now() - (lastPos.t || SG.now()) < 600000) MAP.pos = lastPos;
    mapUpdate(); if (MAP.escape || (P && P.consentLoc !== false)) startLocate();
  }
  function setDest(pl) { if (pl.id !== 'pin' && pl.name) rememberDest(pl); MAP.ext = null; MAP.dest = { id: 'dest:' + pl.id, name: pl.name, lat: pl.lat, lng: pl.lng, type: 'place', kind: pl.kind, note: pl.tip || '' }; MAP.sel = MAP.dest.id; MAP.route = null; MAP.arrived = false; MAP.q = ''; var f = $('form[data-form=map-find] input'); if (f) f.value = ''; mapUpdate(); }
  function lev1(a, b) { if (a === b) return true; if (Math.abs(a.length - b.length) > 1) return false; var i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1); return a.length > b.length ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i); }
  function fuzzyScore(q, text) {
    q = q.toLowerCase().trim(); text = String(text).toLowerCase(); if (!q) return 0;
    if (text.indexOf(q) === 0) return 100; var words = text.split(/[^a-z0-9]+/).filter(Boolean), qw = q.split(/\s+/), sc = 0;
    for (var k = 0; k < qw.length; k++) { var w = qw[k], best = 0; for (var m = 0; m < words.length; m++) { if (words[m].indexOf(w) === 0) best = Math.max(best, 70); else if (words[m].indexOf(w) > 0) best = Math.max(best, 40); else if (w.length >= 4 && lev1(w, words[m])) best = Math.max(best, 30); } if (!best) return 0; sc += best; }
    return sc / qw.length;
  }
  function placePool() {
    var pool = (CFG.places || []).filter(function (x) { return x.lat != null; }).map(function (x) { return { id: x.id, name: x.name, lat: x.lat, lng: x.lng, kind: x.kind, tip: x.tip, sub: x.area || (x.community ? 'Added by students' : ''), icon: (SGMap.KIND[x.kind] || SGMap.KIND.other)[0], hay: x.name + ' ' + (x.area || '') + ' ' + (SGMap.KIND[x.kind] ? SGMap.KIND[x.kind][1] : '') }; });
    safeList().forEach(function (x) { pool.push({ id: x.id, name: x.name, lat: x.lat, lng: x.lng, kind: 'safe', tip: x.note, sub: SGMap.TYPE_NAME[x.type] || 'Safe place', icon: SGMap.ICON[x.type] || '🛡', hay: x.name + ' ' + (SGMap.TYPE_NAME[x.type] || '') }); });
    return pool;
  }
  function dist(a) { var p = MAP.pos; return p ? SGCore.util.haversine(p.lat, p.lng, a.lat, a.lng) : null; }
  function resBtn(act, key, icon, name, sub, d) { return '<button class="item" data-act="' + act + '" data-id="' + esc(key) + '" style="text-align:left"><div><b>' + icon + ' ' + esc(name) + '</b><span class="small muted">' + esc(sub || '') + (d != null ? (sub ? ' · ' : '') + fmtDist(d) : '') + '</span></div><span>Go</span></button>'; }
  function findHtml() {
    var q = (MAP.q || '').trim(), h = '';
    if (!q) {
      var chips = '', home = store.get('sg_home', null), org = store.get('sg_origin', null), rec = store.get('sg_recent', []);
      if (home) chips += '<button type="button" class="chip" data-act="map-saved" data-k="home"><span>🏠 Home</span></button>';
      if (org) chips += '<button type="button" class="chip" data-act="map-saved" data-k="origin"><span>↩ Back to where I started</span></button>';
      rec.slice(0, 4).forEach(function (r, i) { chips += '<button type="button" class="chip" data-act="map-recent" data-id="' + i + '"><span>🕘 ' + esc(r.name) + '</span></button>'; });
      return chips ? '<div class="chips">' + chips + '</div>' : '';
    }
    var hits = placePool().map(function (x) { return { x: x, sc: fuzzyScore(q, x.hay) }; }).filter(function (r) { return r.sc > 0; }).sort(function (a, b) { return b.sc - a.sc || (dist(a.x) || 0) - (dist(b.x) || 0); }).slice(0, 6);
    h += hits.length ? '<div class="list">' + hits.map(function (r) { return resBtn('map-dest', r.x.id, r.x.icon, r.x.name, r.x.sub, dist(r.x)); }).join('') + '</div>' : '<div class="note small">Nothing on the school map is called “' + esc(q) + '”.</div>';
    if (MAP.ext && MAP.ext.q === q) {
      if (MAP.ext.err) h += '<div class="note warn small">' + esc(MAP.ext.err) + '</div>';
      else if (MAP.ext.items.length) h += '<div class="small muted" style="margin-top:6px">From the wider map</div><div class="list">' + MAP.ext.items.map(function (r, i) { return resBtn('map-ext-go', i, '📍', r.name, r.sub, dist(r)); }).join('') + '</div>';
      else h += '<div class="note small">The wider map found nothing for that.</div>';
    } else if (CFG.searchUrl) h += '<button class="btn block" data-act="map-ext-search"' + (MAP.extBusy ? ' disabled' : '') + '>' + (MAP.extBusy ? 'Searching…' : '🔎 Search the wider map for “' + esc(q) + '”') + '</button><div class="small muted">Uses the internet and sends what you typed to the search service, only when you tap.</div>';
    h += '<button class="btn block" data-act="map-idea-open" style="margin-top:6px">➕ It is not here. Add this place</button>';
    return h;
  }
  function extSearch() {
    var q = (MAP.q || '').trim(); if (!q || !CFG.searchUrl || MAP.extBusy) return; MAP.extBusy = true; var fd = $('#mapFind'); if (fd) fd.innerHTML = findHtml();
    var c = CFG.campus, vb = c && c.lat != null ? '&viewbox=' + (c.lng - 0.2) + ',' + (c.lat + 0.2) + ',' + (c.lng + 0.2) + ',' + (c.lat - 0.2) : '';
    var ctl = window.AbortController ? new AbortController() : null, to = setTimeout(function () { if (ctl) ctl.abort(); }, 9000);
    fetch(CFG.searchUrl + '/search?format=jsonv2&limit=6&q=' + encodeURIComponent(q) + vb, ctl ? { signal: ctl.signal } : {}).then(function (r) { return r.json(); }).then(function (j) {
      clearTimeout(to); MAP.extBusy = false;
      MAP.ext = { q: q, items: (Array.isArray(j) ? j : []).map(function (r) { return { name: String(r.name || (r.display_name || '').split(',')[0] || 'Place').slice(0, 60), sub: String(r.display_name || '').split(',').slice(1, 3).join(',').trim().slice(0, 70), lat: parseFloat(r.lat), lng: parseFloat(r.lon) }; }).filter(function (r) { return isFinite(r.lat) && isFinite(r.lng); }).slice(0, 6) };
      var f2 = $('#mapFind'); if (f2) f2.innerHTML = findHtml();
    }).catch(function () { clearTimeout(to); MAP.extBusy = false; MAP.ext = { q: q, items: [], err: 'Could not reach the search service. You need internet for this. The school places above still work.' }; var f3 = $('#mapFind'); if (f3) f3.innerHTML = findHtml(); });
  }
  function rememberDest(d) { var rec = store.get('sg_recent', []).filter(function (r) { return r.name !== d.name; }); rec.unshift({ name: d.name, lat: d.lat, lng: d.lng }); store.set('sg_recent', rec.slice(0, 6)); }
  function startTrip(tgt, eta) {
    if (!P) return toast('Register first to start a trip.', 'warn'); if (ST.walk) return toast('A safe walk is already running. Finish it first.', 'warn');
    var mins = Math.max(5, Math.min(170, eta + 10)), t = SG.now(), id = SG.uuid(), until = t + mins * 60000, note = 'To ' + tgt.name;
    enqueue({ id: id, type: 'walk_start', t: t, until: until, note: note, dest: { name: tgt.name, lat: tgt.lat, lng: tgt.lng } }, true);
    ST.walk = { id: id, until: until, note: note }; save(); startWalkTicker(); if (MAP.pos) store.set('sg_origin', { name: 'Where I started', lat: MAP.pos.lat, lng: MAP.pos.lng });
    toast('Trip started. Security is watching for your arrival.', 'ok'); mapUpdate();
  }
  function tripHtml(tgt, eta) {
    var h = '', late = false;
    try { var f = SGCore.util.parseHM ? SGCore.util.parseHM(CFG.trackFrom) : null, d = new Date(SG.now() + (CFG.tzOffsetMin || 0) * 60000), mm = d.getUTCHours() * 60 + d.getUTCMinutes() + eta; if (f != null) late = (mm % 1440) >= f || (mm % 1440) < 6 * 60; } catch (e) {}
    if (late) h += '<div class="note warn small"><b>You would arrive after dark.</b> Go with a friend, use lit roads, and start a trip so security knows.</div>';
    if (ST.walk) h += '<div class="note ok small"><b>Trip running.</b> ' + esc(ST.walk.note || '') + '. Security is watching for your arrival.</div><button class="btn block" data-act="walk-end">✅ I have arrived safely</button>';
    else if (P) h += '<button class="btn block" data-act="map-trip" data-eta="' + eta + '">🚶 Start trip: security watches for me (about ' + eta + ' min)</button><div class="small muted">If you do not arrive in time, security is alerted. Your location is only shared with your consent.</div>';
    return h;
  }
  function extrasHtml() {
    var h = '', home = store.get('sg_home', null), org = store.get('sg_origin', null);
    if (MAP.pos) h += '<div class="row">' + '<button class="btn sm grow" data-act="map-home-set">🏠 Save here as Home</button>' + (P ? '<button class="btn sm grow" data-act="map-idea-open">➕ Add a place</button>' : '') + '</div>';
    if (home) h += '<button class="btn block" data-act="map-saved" data-k="home">🏠 Take me home</button>';
    if (org && !MAP.dest) h += '<button class="btn block" data-act="map-saved" data-k="origin">↩ Take me back to where I started</button>';
    if (MAP.idea) h += '<form data-form="map-idea" class="card" novalidate><b>Add a place so others can find it</b><div class="small muted">' + (MAP.pin ? 'At the pin you dropped.' : MAP.pos ? 'At your position now.' : 'Drop a pin or tap Find me first.') + ' Security checks it, or two students adding it makes it show.</div><input type="text" name="name" maxlength="60" placeholder="Name, e.g. Mama Put by the gate" value="' + esc(MAP.q || '') + '" required style="margin-top:8px"><select name="kind" style="margin-top:6px">' + Object.keys(SGMap.KIND).map(function (k) { return '<option value="' + k + '">' + esc(SGMap.KIND[k][1]) + '</option>'; }).join('') + '</select><input type="text" name="note" maxlength="160" placeholder="Tip for others (optional)" style="margin-top:6px"><div class="row" style="margin-top:8px"><button class="btn primary grow" type="submit">Send</button><button class="btn" type="button" data-act="map-idea-cancel">Cancel</button></div></form>';
    return h;
  }
  function stepText(st) {
    var t = { turn: 'Turn', 'new name': 'Continue', depart: 'Start', arrive: 'Arrive', merge: 'Merge', fork: 'Keep', roundabout: 'At the roundabout', rotary: 'At the roundabout', continue: 'Continue', 'end of road': 'At the end of the road' }[st.type] || 'Go';
    var m = st.modifier ? st.modifier.replace('sharp ', 'sharp ').replace('straight', 'straight ahead') : '';
    if (st.type === 'arrive') return 'You arrive' + (st.name ? ' on ' + st.name : '');
    if (st.type === 'depart') return 'Start' + (m ? ' heading ' + m : '') + (st.name ? ' on ' + st.name : '');
    return t + (m ? ' ' + m : '') + (st.name ? ' onto ' + st.name : '');
  }
  function fmtDist(m) { return m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m) + ' m'; }
  function mapUpdate() {
    var m = MAP.m, info = $('#mapInfo'); if (!m || !info) return;
    var safe = safeList(), pos = MAP.pos, zones = (CFG.riskZones || []).map(function (z) { return Object.assign({}, z, { active: zoneOn(z) }); }), hz = hazardsNow(), U = SGCore.util;
    var cands = MAP.dest ? safe.concat([MAP.dest]) : safe, all = pos ? U.rankSafe(pos.lat, pos.lng, cands, zones, hz, 99) : [], ranked = all.filter(function (x) { return !MAP.dest || x.id !== MAP.dest.id; }).slice(0, 4), tgt = all.filter(function (x) { return x.id === MAP.sel; })[0] || ranked[0] || null;
    if (MAP.dest) { var dl = all.filter(function (x) { return x.id === MAP.dest.id; })[0]; if (dl) ranked = [dl].concat(ranked); }
    if (tgt && pos && tgt.distM <= 25 && !MAP.arrived) { MAP.arrived = true; toast('You have arrived at ' + tgt.name, 'ok'); try { navigator.vibrate && navigator.vibrate([120, 60, 120]); } catch (e) {} } else if (tgt && tgt.distM > 60) MAP.arrived = false;
    if (MAP.route && (!tgt || MAP.route.to !== tgt.id || !pos || U.haversine(pos.lat, pos.lng, MAP.route.from.lat, MAP.route.from.lng) > 80)) MAP.route = null;
    var inZone = pos ? zones.filter(function (z) { return z.active && U.haversine(pos.lat, pos.lng, z.lat, z.lng) <= z.radiusM; })[0] : null;
    var nearHz = pos ? hz.filter(function (h) { return U.haversine(pos.lat, pos.lng, h.lat, h.lng) <= (h.radiusM || 50) + 60; }) : [];
    var places = (CFG.places || []).filter(function (p) { return p.lat != null; });
    var fd = $('#mapFind'); if (fd) fd.innerHTML = findHtml();
    m.update({ tiles: CFG.mapTiles || '', night: MAP.night, pin: MAP.pin, show: MAP.show, me: pos ? { lat: pos.lat, lng: pos.lng, acc: pos.acc } : null, heading: MAP.heading, campus: CFG.campus, safe: MAP.dest ? safe.concat([MAP.dest]) : safe, zones: zones, hazards: hz, places: places, target: tgt, route: MAP.route ? MAP.route.pts : null, focus: pos ? ranked.slice(0, 2) : safe.slice(0, 3) });
    var h = '';
    if (MAP.err) h += '<div class="note warn small">' + esc(MAP.err) + '</div>';
    if (inZone) h += '<div class="note bad"><b>You are in a risky area: ' + esc(inZone.name) + '.</b>' + (inZone.reason ? '<br><span class="small">' + esc(inZone.reason) + '</span>' : '') + (tgt ? '<br>Move toward ' + esc(tgt.name) + '.' : '') + '</div>';
    if (nearHz.length) h += '<div class="note warn"><b>' + nearHz.map(function (x) { return esc(x.label); }).join(', ') + ' right here.</b>' + (nearHz[0].note ? '<br><span class="small">' + esc(nearHz[0].note) + '</span>' : '') + '<br><span class="small">Take care and use another way if you can.</span></div>';
    if (!pos) h += '<button class="btn primary block big" data-act="map-locate">📍 Find me</button><p class="small muted center">Your location stays on your phone here. It is not sent to anyone.</p>';
    else if (tgt) {
      var rot = MAP.heading != null ? (tgt.bearing - MAP.heading + 360) % 360 : tgt.bearing, tel = (tgt.phone || CFG.securityPhone || '').replace(/[^\d+]/g, ''), rd = MAP.route;
      h += '<div class="card" style="display:flex;gap:14px;align-items:center"><div class="compass" aria-hidden="true" style="transform:rotate(' + rot + 'deg)">➤</div><div><div class="small muted">' + (MAP.sel && tgt.id === MAP.sel ? 'Going to' : 'Safest safe place') + '</div><b style="font-size:1.1rem">' + esc(tgt.name) + '</b><div>' + fmtDist(rd ? rd.distM : tgt.distM) + ' · about ' + Math.max(1, Math.round((rd ? rd.distM : tgt.distM) / 75)) + ' min walk' + (rd ? ' by road' : ' in a straight line') + '</div><div class="small muted">' + (MAP.heading != null ? 'Follow the arrow' : 'Head ' + cardinal(tgt.bearing)) + (tgt.note ? ' · ' + esc(tgt.note) : '') + '</div></div></div>';
      if (MAP.arrived) h += '<div class="note ok"><b>You have arrived.</b></div>';
      if (rd && rd.steps && rd.steps.length) h += '<details class="card" open><summary><b>Step by step</b></summary><ol class="small" style="padding-left:18px;margin:8px 0 0">' + rd.steps.map(function (st2) { return '<li>' + esc(stepText(st2)) + (st2.dist > 0 ? ' <span class="muted">(' + fmtDist(st2.dist) + ')</span>' : '') + '</li>'; }).join('') + '</ol></details>';
      if (tgt.crossesRisk.length) h += '<div class="note warn small">This way passes a risky area (' + esc(tgt.crossesRisk.join(', ')) + '). ' + (ranked.length > 1 ? 'Another safe place may be better.' : 'Stay on lit roads and call security if you feel unsafe.') + '</div>';
      if (tgt.crossesHazard.length) h += '<div class="note warn small">A hazard is on the straight line: ' + esc(tgt.crossesHazard.join(', ')) + '. Follow roads, not the line.</div>';
      h += '<div class="row"><a class="btn primary grow" target="_blank" rel="noopener" href="' + SGMap.gdir(tgt.lat, tgt.lng, 'walking') + '">🧭 Open in Google Maps</a>' + (tel ? '<a class="btn grow" href="tel:' + esc(tel) + '">📞 Call</a>' : '') + '</div>';
      if (MAP.dest && tgt.id === MAP.dest.id) h += tripHtml(tgt, rd ? Math.max(1, Math.round(rd.distM / 80)) : tgt.walkMin);
      if (CFG.routeUrl && !rd) h += '<button class="btn block" data-act="map-route"' + (MAP.routeBusy ? ' disabled' : '') + '>' + (MAP.routeBusy ? 'Finding the road…' : '🛣 Show the walking road') + '</button><div class="small muted">Uses the internet and sends your position to the route service, only when you tap.</div>';
      if (pos.acc > 100) h += '<div class="note warn small">GPS is weak (about ' + Math.round(pos.acc) + ' m). Move to open sky for a better position.</div>';
      if (ranked.length > 1) h += '<div class="list">' + ranked.map(function (x) { return '<button class="item" data-act="map-pick" data-id="' + esc(x.id) + '" style="text-align:left"><div><b>' + (SGMap.ICON[x.type] || '🏠') + ' ' + esc(x.name) + '</b><span class="small muted">' + (SGMap.TYPE_NAME[x.type] || '') + ' · ' + fmtDist(x.distM) + ' · ' + x.walkMin + ' min' + (x.crossesRisk.length || x.crossesHazard.length ? ' · ⚠ on the way' : '') + '</span></div></button>'; }).join('') + '</div>';
    } else h += '<div class="note warn small">No safe places are marked yet. Call security' + (CFG.securityPhone ? ': <a href="tel:' + esc(CFG.securityPhone.replace(/[^\d+]/g, '')) + '">' + esc(CFG.securityPhone) + '</a>' : '') + '.</div>';
    if (MAP.pin) h += '<div class="card"><b>📌 Pin dropped</b><div class="small muted">' + MAP.pin.lat.toFixed(5) + ', ' + MAP.pin.lng.toFixed(5) + '</div><div class="row" style="margin-top:8px">' + (P ? '<button class="btn sm grow" data-act="map-hz-open">⚠ Report a problem here</button>' : '') + '' + SGMap.glink(MAP.pin.lat, MAP.pin.lng, '🧭 Google Maps', true) + '<button class="btn sm grow" data-act="map-pin-go">Go here</button><button class="btn sm" data-act="map-pin-clear">Clear</button></div></div>';
    h += extrasHtml();
    if (CFG.campus && CFG.campus.lat != null) h += '<a class="btn block" target="_blank" rel="noopener" href="' + SGMap.gview(CFG.campus.lat, CFG.campus.lng) + '">🏫 See the campus in Google Maps</a>';
    h += '<button class="btn block" data-act="map-night">' + (MAP.night ? '☀ Day map' : '🌙 Night map') + '</button>';
    if ((pos || MAP.pin) && P) {
      h += MAP.hz ? '<div class="card"><b>What is wrong here?</b><div class="chips" style="margin:8px 0">' + HZ.map(function (k) { return '<button type="button" class="chip" data-act="map-hz" data-kind="' + k[0] + '"><span>' + k[1] + '</span></button>'; }).join('') + '</div><button class="btn sm" data-act="map-hz-cancel">Cancel</button></div>' : '<button class="btn block" data-act="map-hz-open">🚧 Report a hazard here</button>';
    }
    if (CFG.mapTiles && CFG.campus && CFG.campus.lat != null) h += '<button class="btn block" data-act="map-save"' + (MAP.saving ? ' disabled' : '') + '>' + (MAP.saving ? 'Saving the map… ' + MAP.saving + '%' : MAP.saved ? '✓ Map saved on this phone. Update it' : '⬇ Save the campus map for offline use') + '</button>';
    info.innerHTML = h;
  }
  function saveMapOffline() {
    var c = CFG.campus; if (!c || c.lat == null || !CFG.mapTiles || MAP.saving) return;
    var urls = SGMap.tilesAround(c.lat, c.lng, (c.radiusM || 300) + 350, 14, 18, CFG.mapTiles, 320), done = 0, i = 0; MAP.saving = 1; mapUpdate();
    function next() {
      if (i >= urls.length) { MAP.saving = 0; MAP.saved = urls.length; store.set('sg_mapsaved', urls.length); toast('Campus map saved on this phone', 'ok'); return mapUpdate(); }
      var batch = urls.slice(i, i + 6); i += 6; var left = batch.length;
      batch.forEach(function (u) { var im = new Image(); var fin = function () { done++; if (--left === 0) { MAP.saving = Math.max(1, Math.round(done * 100 / urls.length)); mapUpdate(); next(); } }; im.onload = fin; im.onerror = fin; im.src = u; });
    }
    next();
  }
  function findRoad() {
    var pos = MAP.pos, safe = safeList(), zones = (CFG.riskZones || []).map(function (z) { return Object.assign({}, z, { active: zoneOn(z) }); }), r = pos && SGCore.util.rankSafe(pos.lat, pos.lng, MAP.dest ? safe.concat([MAP.dest]) : safe, zones, hazardsNow(), 99), tgt = r && (r.filter(function (x) { return x.id === MAP.sel; })[0] || r.filter(function (x) { return !MAP.dest || x.id !== MAP.dest.id; })[0]);
    if (!tgt || !CFG.routeUrl || MAP.routeBusy) return; MAP.routeBusy = true; mapUpdate();
    var ctl = window.AbortController ? new AbortController() : null, to = setTimeout(function () { if (ctl) ctl.abort(); }, 9000);
    fetch(CFG.routeUrl + '/route/v1/foot/' + pos.lng.toFixed(6) + ',' + pos.lat.toFixed(6) + ';' + tgt.lng.toFixed(6) + ',' + tgt.lat.toFixed(6) + '?overview=full&geometries=geojson&steps=true', ctl ? { signal: ctl.signal } : {}).then(function (r2) { return r2.json(); }).then(function (j) {
      clearTimeout(to); MAP.routeBusy = false; var rt = j && j.routes && j.routes[0];
      if (!rt || !rt.geometry || !rt.geometry.coordinates || rt.geometry.coordinates.length < 2) { MAP.err = 'No walking road found. Follow the straight line carefully.'; return mapUpdate(); }
      MAP.err = ''; MAP.route = { to: tgt.id, from: { lat: pos.lat, lng: pos.lng }, distM: rt.distance, steps: ((rt.legs && rt.legs[0] && rt.legs[0].steps) || []).slice(0, 40).map(function (x) { return { type: x.maneuver && x.maneuver.type, modifier: x.maneuver && x.maneuver.modifier, name: x.name || '', dist: x.distance || 0 }; }), pts: rt.geometry.coordinates.map(function (c) { return { lat: c[1], lng: c[0] }; }) }; mapUpdate();
    }).catch(function () { clearTimeout(to); MAP.routeBusy = false; MAP.err = 'Could not reach the route service. You need internet for this. The arrow still works.'; mapUpdate(); });
  }
  VIEWS.places = function () {
    var h = backBtn('home') + '<h1>Know before you go</h1><p class="muted">Tips for places students go to. This works without internet.</p><div class="stack">';
    (CFG.places || []).forEach(function (p) { h += '<div class="card flat"><h3>' + esc(p.name) + '</h3>' + (p.area ? '<div class="small muted">' + esc(p.area) + '</div>' : '') + (p.tip ? '<p>' + esc(p.tip) + '</p>' : '') + '</div>'; });
    h += '</div>'; return h;
  };

  VIEWS.history = function () {
    var h = backBtn('home') + '<h1>My trips</h1>';
    if (!HIST.length) return h + '<p class="muted">Nothing yet.</p>';
    h += '<div class="list">'; HIST.slice(0, 30).forEach(function (x) {
      h += '<div class="item"><div><b>' + (x.type === 'out' ? 'Went out' : 'Came back') + '</b><span class="small muted">' + esc(x.dest || '') + '</span></div><div class="small muted right">' + esc(SG.dt(x.t)) + '</div></div>'; });
    return h + '</div>';
  };


  /* ---- exit pass, concern report, family link */
  function localToEpoch(v) {                          // "2026-11-05T21:30" typed in school time -> UTC ms
    var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v || ''); if (!m) return null;
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - (CFG.tzOffsetMin || 0) * 60000;
  }
  VIEWS.pass = function () {
    var def = U.fmtLocal(SG.now() + 4 * 3600000, CFG.tzOffsetMin).replace(' ', 'T');
    var h = backBtn('home') + '<h1>Exit pass</h1><p class="muted">Going home, to a clinic or away for the weekend? Ask first. If security approves, you will not get late or curfew alerts until the time you give.</p>' +
      '<form data-form="pass" class="card" novalidate><label class="f" for="ps_d">Where are you going?</label><input id="ps_d" type="text" name="dest" maxlength="80">' +
      '<label class="f" for="ps_u">I will be back by</label><input id="ps_u" type="datetime-local" name="until" value="' + esc(def) + '">' +
      '<label class="f" for="ps_r">Reason</label><textarea id="ps_r" name="reason" maxlength="160" placeholder="e.g. Sister\'s wedding"></textarea><div id="psErr" class="err-msg" role="alert"></div><button class="btn primary block" type="submit">Send request</button></form>';
    h += '<h2 style="margin-top:18px">My requests</h2>';
    h += PASSES.length ? '<div class="list">' + PASSES.map(function (x) {
      var pill = x.status === 'pending' ? '<span class="pill warn">Waiting</span>' : x.status === 'approved' ? '<span class="pill ok">Approved</span>' : '<span class="pill bad">Not approved</span>';
      return '<div class="item"><div><b>' + esc(x.dest || 'Pass') + '</b><span class="small muted">Back by ' + esc(SG.dt(x.until)) + (x.note ? ' · ' + esc(x.note) : '') + '</span></div><div>' + pill + '</div></div>'; }).join('') + '</div>' : '<p class="small muted">None yet.</p>';
    Q.filter(function (i) { return i.type === 'pass_request'; }).length && (h += '<div class="note warn small" style="margin-top:10px">A request is saved on your phone and will be sent when you have internet.</div>');
    return h;
  };
  VIEWS.report = function () {
    var cats = [['followed', 'Someone is following me'], ['suspicious', 'Suspicious person or activity'], ['unsafe', 'Unsafe place or situation'], ['theft', 'Theft or robbery'], ['medical', 'Medical help needed'], ['bullying', 'Bullying'], ['harassment', 'Harassment'], ['threat', 'Someone threatened me'], ['violence', 'Violence or a fight'], ['sexual', 'Sexual harassment or assault'], ['abuse', 'Abuse'], ['drugs', 'Drugs'], ['discrimination', 'Discrimination'], ['misconduct', 'A staff member behaved badly'], ['other', 'Something else']];
    return backBtn('home') + '<h1>Report a concern</h1><div class="note bad small">In danger right now? Do not fill this in. <b>Hold the red emergency button</b> instead.</div>' +
      '<form data-form="report" class="card" style="margin-top:12px" novalidate><label class="f">What is it about?</label><div class="chips" role="radiogroup">' + cats.map(function (c, i) { return '<label class="chip"><input type="radio" name="cat" value="' + c[0] + '"' + (i === 0 ? ' checked' : '') + '><span>' + c[1] + '</span></label>'; }).join('') + '</div>' +
      '<label class="f" for="rp_t">What happened?</label><textarea id="rp_t" name="text" maxlength="500"></textarea>' +
      (CFG.mediaOn !== false && window.SGMedia ? '<label class="f">Add pictures, a voice note or a video <span class="muted small">(optional)</span></label><div data-media="report"></div>' : '<label class="f" for="rp_p">Add a picture <span class="muted small">(optional)</span></label><input id="rp_p" type="file" name="photo" accept="image/*">') +
      '<label class="check"><input type="checkbox" name="loc" checked><span><b>Include my location</b><br><span class="small muted">So security can find the place.</span></span></label>' +
      '<label class="check"><input type="checkbox" name="anon"><span><b>Hide my name</b><br><span class="small muted">Security will not know who sent it, so they cannot call you back. You get a reference number to check on it.</span></span></label>' +
      '<div id="rpErr" class="err-msg" role="alert"></div><button class="btn primary block" type="submit">Send to security</button></form>' + (MYREPORTS.length ? '<h2 style="margin-top:18px">My reports</h2><div class="list">' + MYREPORTS.map(function (x) { return '<div class="item"><div><b>' + esc(x.label) + '</b><span class="small muted">' + esc(SG.ago(x.t)) + (x.outcome ? ' · ' + esc(x.outcome) : '') + '</span>' + stepsHtml(x.steps, x.stage) + '</div><span class="pill ' + (x.status === 'open' ? 'warn' : 'ok') + '">' + (x.status === 'open' ? 'Open' : 'Handled') + '</span></div>'; }).join('') + '</div>' : '') + refsHtml();
  };
  function stepsHtml(steps, cur) {
    if (!steps || !steps.length) return '';
    return '<ol class="prog" aria-label="Progress">' + steps.map(function (x) { return '<li class="' + (x.t ? 'done' : '') + (x.key === cur ? ' now' : '') + '"><i aria-hidden="true">' + (x.t ? '✓' : '') + '</i><span>' + esc(x.label) + (x.t ? '<small>' + esc(SG.hm(x.t)) + '</small>' : '') + '</span></li>'; }).join('') + '</ol>';
  }
  var FREE = store.get('sg_free', true);
  var REFS = store.get('sg_refs', []), REFSTAT = {};
  function refsHtml() {
    if (!REFS.length) return '';
    return '<h2 style="margin-top:18px">Check on a report</h2><div class="list">' + REFS.slice(0, 8).map(function (r) {
      var st = REFSTAT[r.ref]; return '<div class="item"><div><b>' + esc(r.ref) + '</b> <span class="small muted">' + esc(r.label) + ' · ' + esc(SG.ago(r.t)) + '</span>' + (st ? '<div class="small">' + (st.err ? esc(st.err) : 'Status: <b>' + esc(st.status === 'closed' ? 'Closed' : 'Open') + '</b>' + stepsHtml(st.steps, st.stage) + (st.updates.length ? '<br>' + st.updates.map(function (u) { return esc(u.text); }).join('<br>') : '<br>No message from security yet.')) + '</div>' : '') + '</div><button class="btn sm" data-act="ref-check" data-ref="' + esc(r.ref) + '">Check</button></div>';
    }).join('') + '</div><p class="small muted">Keep your reference number. It is the only way to follow an anonymous report.</p>';
  }
  function photoData(file, done) {
    if (!file) return done(null);
    var rd = new FileReader(); rd.onerror = function () { done(null); };
    rd.onload = function () { var im = new Image(); im.onerror = function () { done(null); }; im.onload = function () {
      var sc = Math.min(1, 1280 / Math.max(im.width, im.height)), cv = document.createElement('canvas'); cv.width = Math.round(im.width * sc); cv.height = Math.round(im.height * sc);
      cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);   // drawing to a canvas drops EXIF: no GPS tag, no camera model, no time
      var q = 0.72, out = cv.toDataURL('image/jpeg', q); while (out.length > 280000 && q > 0.3) { q -= 0.1; out = cv.toDataURL('image/jpeg', q); }
      done(out.length <= 290000 ? out : null);
    }; im.src = rd.result; };
    rd.readAsDataURL(file);
  }
  VIEWS.family = function () {
    var h = backBtn('home') + '<h1>Family link</h1><p class="muted">Let a parent or guardian see whether you are on campus or out, where you said you were going and when you plan to be back. They <b>never</b> see your location. The link works for 30 days and you can stop it any time.</p>';
    if (famLink) {
      var msg = 'Hello, this link shows whether I am on campus or out, and when I plan to be back: ' + famLink;
      h += '<div class="card"><b>Your link is ready</b><div class="small" style="word-break:break-all;margin:8px 0">' + esc(famLink) + '</div><div class="row"><button class="btn primary grow" data-act="fam-share">📤 Send it</button><button class="btn grow" data-act="fam-copy">Copy</button></div><div class="small muted" style="margin-top:8px">Anyone with this link can see the status. Send it only to people you trust.</div></div>';
    }
    h += '<form data-form="family" class="card" style="margin-top:12px" novalidate><label class="f" for="fm_l">Who is it for?<span class="hint">Optional, e.g. Mum</span></label><input id="fm_l" type="text" name="label" maxlength="40"><div id="fmErr" class="err-msg" role="alert"></div><button class="btn primary block" type="submit">Create a new link</button></form>';
    if (WATCHERS.length) h += '<h2 style="margin-top:18px">Phones getting text updates about me</h2><p class="small muted">They are told when you leave, come back or are late, or press the emergency button. Never your location.</p><div class="list">' + WATCHERS.map(function (w) { return '<div class="item"><div><b>' + esc(w.phone) + '</b><span class="small muted">Added ' + esc(SG.ago(w.t)) + '</span></div><button class="btn small" data-act="watch-rm" data-id="' + esc(w.id) + '">Remove</button></div>'; }).join('') + '</div>';
    h += '<p class="small muted" style="margin-top:12px">Active links: <b>' + GLINKS + '</b></p>' + (GLINKS ? '<button class="btn block" data-act="fam-stop">Stop all links</button>' : '');
    return h;
  };

  VIEWS.escort = function () {
    var busy = ESCORT && (ESCORT.status === 'open' || ESCORT.status === 'assigned');
    return backBtn('home') + '<h1>Ask for a security escort</h1><p class="muted">Afraid to walk alone, for example from the gate to your hostel at night? Ask security to walk with you. Your location is sent with the request so they can find you.</p>' +
      (busy ? '<div class="note warn">You already have a request open. Cancel it on the home screen to make a new one.</div>' :
      '<form data-form="escort" class="card" novalidate><label class="f" for="es_f">Where are you now?</label><input id="es_f" type="text" name="from" maxlength="80" placeholder="e.g. Main gate">' +
      '<label class="f" for="es_t">Where do you need to go?</label><input id="es_t" type="text" name="to" maxlength="80" placeholder="e.g. Hostel B"><label class="f" for="es_n">Anything else?<span class="hint">Optional</span></label><input id="es_n" type="text" name="note" maxlength="120">' +
      '<div id="esErr" class="err-msg" role="alert"></div><button class="btn primary block" type="submit">Send request</button></form>') +
      '<div class="note small" style="margin-top:12px">In danger right now? Hold the red emergency button instead.</div>';
  };
  VIEWS.numbers = function () {
    var l = (CFG.directory || []).slice(); if (CFG.securityPhone) l.unshift({ name: 'School security', phone: CFG.securityPhone, note: 'Emergency desk' });
    return backBtn('home') + '<h1>Important numbers</h1>' + (l.length ? '<div class="list">' + l.map(function (d) {
      return '<div class="item"><div><b>' + esc(d.name) + '</b>' + (d.note ? '<span class="small muted">' + esc(d.note) + '</span>' : '') + '</div><a class="btn sm primary" href="tel:' + esc(String(d.phone).replace(/[^\d+]/g, '')) + '">📞 ' + esc(d.phone) + '</a></div>'; }).join('') + '</div>' : '<p class="muted">The school has not added any numbers yet.</p>');
  };
  /* phone self-check: finds the usual reasons a phone fails when it matters, and says how to fix each */
  VIEWS.check = function () { setTimeout(runCheck, 0); return backBtn('me') + '<h1>Check my phone</h1><p class="muted">Takes 3 seconds. Fix anything marked red or amber now, not when you are outside.</p><div id="chkOut"><div class="card muted">Checking…</div></div>'; };
  function permState(name) { return (navigator.permissions && navigator.permissions.query ? navigator.permissions.query({ name: name }).then(function (r) { return r.state; }, function () { return 'unknown'; }) : Promise.resolve('unknown')); }
  function runCheck() {
    var native = window.SGNative && SGNative.isNative;
    Promise.all([permState('geolocation'), permState('camera'), navigator.storage && navigator.storage.persisted ? navigator.storage.persisted().catch(function () { return null; }) : Promise.resolve(null), navigator.storage && navigator.storage.estimate ? navigator.storage.estimate().catch(function () { return null; }) : Promise.resolve(null), navigator.getBattery ? navigator.getBattery().catch(function () { return null; }) : Promise.resolve(null)]).then(function (r) {
      var el = $('#chkOut'); if (!el || view !== 'check') return;
      var rows = [], skew = Math.abs(SG.skew || 0), pend = Q.length, oldest = pend ? Math.min.apply(null, Q.map(function (i) { return i.t || Date.now(); })) : 0, bat = r[4];
      function row(st, title, detail, fix, act, label) { rows.push('<div class="card" style="margin-bottom:8px"><div class="row between"><b>' + (st === 'ok' ? '✅ ' : st === 'warn' ? '⚠️ ' : '❌ ') + esc(title) + '</b></div><div class="small muted" style="margin-top:4px">' + esc(detail) + '</div>' + (st !== 'ok' && fix ? '<div class="small" style="margin-top:6px">' + esc(fix) + '</div>' : '') + (st !== 'ok' && act ? '<button class="btn sm" style="margin-top:8px" data-act="' + act + '">' + esc(label) + '</button>' : '') + '</div>'); }
      row(navigator.onLine !== false ? 'ok' : 'warn', 'Internet', navigator.onLine !== false ? 'Connected. Last sync ' + (net.last ? SG.dur(Date.now() - net.last) + ' ago' : 'not yet') + '.' : 'No internet right now. The app still works and sends everything later.', 'You can keep going. Use the text-message button in an emergency.');
      row(SG.now && window.isSecureContext !== false ? 'ok' : 'bad', 'Secure connection', window.isSecureContext !== false ? 'Yes' : 'This page is not on https, so camera, location and offline will not work.', 'Open the https address security gave you.');
      var loc = native ? 'granted' : r[0], locOk = loc === 'granted' || (loc === 'unknown' && !locDenied);
      row(locDenied || loc === 'denied' ? 'bad' : locOk ? 'ok' : 'warn', 'Location', loc === 'granted' ? 'Allowed' : loc === 'denied' || locDenied ? 'Blocked' : 'Not asked yet', loc === 'denied' || locDenied ? 'Open the phone or browser settings for this site and set Location to Allow.' : 'Tap the button and choose Allow.', 'chk-loc', 'Allow location');
      row(r[1] === 'denied' ? 'bad' : window.isSecureContext !== false && navigator.mediaDevices ? 'ok' : 'warn', 'Camera for scanning', r[1] === 'denied' ? 'Blocked' : navigator.mediaDevices ? 'Available' : 'Not available in this browser', 'You can still scan with the normal Camera app, or type the 6-digit code under the gate QR.');
      var notif = native ? 'granted' : ('Notification' in window ? Notification.permission : 'unsupported');
      row(notif === 'granted' ? 'ok' : notif === 'denied' ? 'bad' : 'warn', 'Alerts from security', notif === 'granted' ? 'On' : notif === 'denied' ? 'Blocked' : notif === 'unsupported' ? 'Not supported on this browser (on iPhone, add the app to your Home Screen first)' : 'Off', notif === 'denied' ? 'Allow notifications for this site in settings.' : 'Switch on so security can reach you even when the app is closed.', notif === 'default' ? 'chk-notif' : '', 'Turn on alerts');
      row(navigator.serviceWorker && navigator.serviceWorker.controller ? 'ok' : 'warn', 'Works offline', navigator.serviceWorker && navigator.serviceWorker.controller ? 'Ready' : 'Not ready yet', 'Open this app once with internet and wait a few seconds, then reload.');
      var q = r[3] && r[3].quota ? r[3] : null;
      row(r[2] === false ? 'warn' : 'ok', 'Saved data is protected', r[2] === true ? 'Your phone will not clear this app\'s data' : r[2] === false ? 'The phone may clear data when storage is low' : 'Cannot tell on this browser', 'Tap to ask the phone to keep it.', 'chk-persist', 'Keep my data');
      row(pend === 0 ? 'ok' : (Date.now() - oldest > 3600e3 ? 'warn' : 'ok'), 'Waiting to send', pend === 0 ? 'Nothing waiting' : pend + ' item(s) waiting for signal' + (oldest ? ' (oldest ' + SG.dur(Date.now() - oldest) + ' ago)' : ''), 'Move to a place with signal and keep the app open for a minute.', 'chk-sync', 'Send now');
      row(skew < 120000 ? 'ok' : 'warn', 'Phone clock', skew < 120000 ? 'Correct' : 'Your phone clock is off by about ' + SG.dur(skew), 'Switch on "Set time automatically" in phone settings. Your records are still timed correctly on the server.');
      if (bat) row(bat.level > 0.2 || bat.charging ? 'ok' : 'warn', 'Battery', Math.round(bat.level * 100) + '%' + (bat.charging ? ' (charging)' : ''), 'Charge before you go out. A dead phone cannot call for help.');
      row(window.matchMedia && matchMedia('(display-mode: standalone)').matches || native ? 'ok' : 'warn', 'Installed on Home Screen', native ? 'Using the SafeGate app' : matchMedia('(display-mode: standalone)').matches ? 'Yes' : 'Not yet', 'In your browser menu choose "Add to Home Screen". It opens faster and is less likely to be closed by the phone.');
      rows.push('<div class="small muted" style="margin-top:8px">Phone settings that save you most often: turn <b>battery saver off</b> for this app, allow it to <b>run in the background</b>, and keep Location on while you are outside.</div>');
      LASTDIAG = { ver: SG.version, ua: (navigator.userAgent || '').replace(/^Mozilla\/5\.0 /, '').slice(0, 140), online: navigator.onLine !== false, loc: native ? 'granted' : (locDenied ? 'denied' : r[0]), camera: r[1], notif: notif, offline: !!(navigator.serviceWorker && navigator.serviceWorker.controller), persist: r[2], pending: pend, oldestMin: oldest ? Math.round((Date.now() - oldest) / 60000) : 0, skewSec: Math.round((SG.skew || 0) / 1000), battery: bat ? Math.round(bat.level * 100) : undefined, charging: bat ? !!bat.charging : undefined, standalone: !!(window.matchMedia && matchMedia('(display-mode: standalone)').matches || native), native: !!native, lastSyncMin: net.last ? Math.round((Date.now() - net.last) / 60000) : undefined, secure: window.isSecureContext !== false, lang: (navigator.language || '').slice(0, 12) };
      rows.push(askCard('Still not working?', 'Send this to ICT. They get the results above, so you do not need to explain the technical part.'));
      el.innerHTML = rows.join('');
    });
  }
  var LASTDIAG = null, HELPS = { items: [], t: 0 };
  function askCard(title, sub) {
    return '<div class="card" style="margin-top:14px"><h3 style="margin-top:0">🛟 ' + esc(title) + '</h3><p class="small muted">' + esc(sub) + '</p><label class="f" for="hlpMsg">What is going wrong?</label><textarea id="hlpMsg" rows="3" maxlength="600" style="width:100%" placeholder="Example: The gate scan says my code is wrong."></textarea>' +
      '<label class="f" for="hlpContact">Phone number ICT can call <span class="muted">(optional)</span></label><input id="hlpContact" type="tel" maxlength="30" autocomplete="tel"><div id="hlpErr" class="note warn small" role="alert" style="display:none;margin-top:8px"></div><button class="btn primary block" style="margin-top:10px" data-act="helpSend">Send to ICT</button></div>';
  }
  function basicDiag() { return LASTDIAG || { ver: SG.version, ua: (navigator.userAgent || '').slice(0, 140), online: navigator.onLine !== false, secure: window.isSecureContext !== false, standalone: !!(window.matchMedia && matchMedia('(display-mode: standalone)').matches), pending: pending(), skewSec: Math.round((SG.skew || 0) / 1000), lock: LOCK ? String(LOCK.code || '') : '' }; }
  function helpUnread() { return HELPS.items.filter(function (x) { return x.unread; }).length; }
  function paintHelp() { var b = $('#helpBanner'); if (b) b.innerHTML = helpUnread() ? '<div class="note ok" style="margin-bottom:10px" role="status">💬 <b>ICT answered your question.</b> <button class="btn sm primary" data-act="go" data-to="helpbox" style="margin-left:6px">Read it</button></div>' : (HELPS.items.some(function (x) { return x.status === 'open'; }) ? '<div class="note small" style="margin-bottom:10px">🛟 Your question is with ICT. The answer will show here.</div>' : ''); }
  function loadHelp(force) { if (!DEV || navigator.onLine === false || (!force && Date.now() - HELPS.t < 90000)) { paintHelp(); return; } HELPS.t = Date.now(); SG.call('helpMine', { deviceId: DEV }).then(function (r) { HELPS = { items: r.items || [], t: Date.now() }; paintHelp(); if (view === 'helpbox') renderView(); }, function () {}); }
  VIEWS.helpbox = function () {
    HELPS.items.filter(function (x) { return x.unread; }).forEach(function (x) { SG.call('helpSeen', { deviceId: DEV, id: x.id }).then(function () { x.unread = false; paintHelp(); }, function () {}); });
    return backBtn('home') + '<h1>My questions to ICT</h1>' + (HELPS.items.length ? HELPS.items.map(function (x) {
      return '<div class="card" style="margin-bottom:10px"><div class="row between"><b>' + esc(SG.ago(x.t)) + '</b><span class="pill ' + (x.status === 'open' ? 'warn' : 'ok') + '">' + (x.status === 'open' ? 'Waiting for ICT' : x.status === 'answered' ? 'Answered' : 'Closed') + '</span></div><p style="margin:8px 0">' + esc(x.message) + '</p>' +
        x.replies.map(function (r) { return '<div class="note ok small" style="margin-top:6px"><b>' + esc(r.by || 'ICT') + ':</b> ' + esc(r.text) + '</div>'; }).join('') + '</div>';
    }).join('') : '<div class="card muted">You have not asked ICT anything yet. Open <b>Check my phone</b> if something is not working.</div>');
  };
  VIEWS.locked = function () {
    var den = LOCK && LOCK.code === 'device-denied';
    return '<h1>🔒 Phone not recognised</h1><div class="card"><p>' + esc(LOCK ? LOCK.message : '') + '</p>' +
      (den ? '' : '<div class="note small">Your request was sent to security. This page updates by itself when they approve it.</div>') +
      '</div><form class="card" data-form="usecode" style="margin-top:12px" novalidate><h3>I have a transfer code</h3><p class="small muted">On your old phone open <b>Me &amp; privacy → Move to a new phone</b>. Type the 6 digits here within 10 minutes.</p>' +
      '<label class="f" for="tc">6-digit code</label><input id="tc" name="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code"><div class="err-msg" id="tcErr" role="alert"></div><button class="btn primary" type="submit" style="margin-top:10px">Move to this phone</button></form>' +
      (CFG.securityPhone ? '<a class="btn" style="margin-top:12px" href="tel:' + esc(CFG.securityPhone) + '">📞 Call security</a>' : '') +
      '<button class="btn" style="margin-top:12px" data-act="lock-retry">Check again now</button>' + askCard('Need ICT to help?', 'Tell them what happened. They can see this phone is not recognised and can fix it.');
  };
  VIEWS.feedback = function () { return backBtn('home') + '<div id="fbRoot"></div>' + (window.SGFeedback ? '' : '<p class="muted">Feedback is not available right now.</p>'); };

  /* Sponsored card: only on Home, never while an emergency, an exit, a roll-call or a notice needs attention. Labelled, hideable, no tracking of the student. */
  var adHidden = store.get('sg_adhide', {}), adSeenNow = {};
  function adCard() {
    var a = MON && MON.ad; if (!a || ST.sos || ST.outside || (ROLLCALL && SG.now() < ROLLCALL.exp) || NEEDCONSENT || adHidden[a.id] > Date.now()) return '';
    if (!adSeenNow[a.id]) { adSeenNow[a.id] = 1; SG.call('adEvent', { deviceId: DEV, matric: P.matric, id: a.id, kind: 'view' }).catch(function () { }); }
    return '<div class="card" style="margin-bottom:10px;border:1px dashed var(--line,#bcd)"><div class="row between" style="align-items:center"><span class="small muted">Sponsored · ' + esc(a.sponsor) + '</span><button class="btn sm ghost" data-act="ad-hide" data-id="' + esc(a.id) + '" aria-label="Hide this for today">✕</button></div>' +
      '<b>' + esc(a.title) + '</b>' + (a.text ? '<div class="small muted">' + esc(a.text) + '</div>' : '') + '<a class="btn sm" style="margin-top:8px" data-act="ad-click" data-id="' + esc(a.id) + '" href="' + esc(a.url) + '" target="_blank" rel="noopener sponsored">' + esc(a.cta || 'Open') + '</a>' +
      '<div class="small muted" style="margin-top:6px">Ads help keep SafeGate free. Safety features never have ads. <button class="btn sm ghost" data-act="go" data-to="plus">Remove ads</button></div></div>';
  }
  function money(k) { var v = k / 100; return ((PLANS && PLANS.currency) || '₦') + (v % 1 ? v.toFixed(2) : v.toLocaleString()); }
  VIEWS.plus = function () {
    if (!PLANS) { SG.call('plansInfo', { deviceId: DEV, matric: P ? P.matric : '' }).then(function (r) { PLANS = r; if (view === 'plus') renderView(); }, function () { PLANS = { plus: { on: false }, family: { on: false }, pay: '', promise: '', mine: null }; if (view === 'plus') renderView(); }); return backBtn('me') + '<h1>SafeGate Plus</h1><p class="muted">Loading…</p>'; }
    var p = PLANS, h = backBtn('me') + '<h1>SafeGate Plus</h1><div class="note ok" style="margin-bottom:12px">🛡 ' + esc(p.promise || 'Safety is always free.') + '</div>';
    if (p.mine) h += '<div class="card"><b>' + (p.mine.plan === 'campus' ? 'Your campus covers you' : 'Plus is on') + '</b><div class="small muted">No ads · active until ' + esc(U.fmtLocal(p.mine.until, SG.tz).slice(0, 10)) + '</div></div>';
    else if (p.plus && p.plus.on) h += '<div class="card"><b>' + esc(p.plus.name) + '</b><ul class="small" style="margin:8px 0;padding-left:18px;line-height:1.6"><li>No ads, ever</li><li>Three times the evidence storage for your reports</li><li>A Plus badge for your support</li><li>You help keep SafeGate free for everyone</li></ul><div><b>' + money(p.plus.month) + '</b> a month · <b>' + money(p.plus.term) + '</b> a term</div>' +
      (p.pay ? '<div class="small" style="margin-top:8px;white-space:pre-wrap"><b>How to pay</b>\n' + esc(p.pay) + '</div><div class="small muted" style="margin-top:6px">After you pay, send your matric number to the SafeGate admin and Plus turns on, usually within a few hours.</div>' : '<div class="small muted" style="margin-top:8px">Ask the SafeGate admin how to pay.</div>') + '</div>';
    else h += '<div class="card"><p class="muted">Plus is not on at your school yet.</p></div>';
    if (p.family && p.family.on) h += '<div class="card" style="margin-top:12px"><b>' + esc(p.family.name) + ' (for your parent or guardian)</b><p class="small muted">Up to ' + esc(p.family.texts) + ' texts a month when you leave, get back, are late or press emergency: ' + money(p.family.month) + ' a month or ' + money(p.family.term) + ' a term. They can also pay as they go. Ask them to open the family link in <b>Me &amp; privacy</b>.</p></div>';
    return h;
  };
  VIEWS.me = function () {
    var h = backBtn('home') + '<h1>Me &amp; privacy</h1><div class="card"><b>' + esc(P.name) + '</b><div class="muted">' + esc(P.matric) + ' · ' + esc(P.phone) + '</div>' +
      '<div class="small muted" style="margin-top:6px">Emergency: ' + esc(P.emergency.name) + ' · ' + esc(P.emergency.phone) + '</div><button class="btn sm" style="margin-top:10px" data-act="go" data-to="onboard">Edit my details</button></div>' +
      (window.SGNative && SGNative.isNative ? '<div class="card" style="margin-top:12px"><h3>Location with the screen off</h3><p class="small muted">While you are outside with sharing on, this app keeps sending your location even when the screen is off. You will see a small "SafeGate is on" notification. It stops the moment you scan back in.</p><div class="small">Status: <b>' + esc(SGNative.status()) + '</b></div><button class="btn sm" style="margin-top:8px" data-act="native-settings">Open location settings</button></div>' : '') +
      '<button class="btn block" style="margin-top:12px" data-act="go" data-to="check">🩺 Check my phone is ready</button>' + (FREE ? '' : '<button class="btn block" style="margin-top:8px" data-act="go" data-to="plus">⭐ SafeGate Plus</button>') +
      '<div class="card" style="margin-top:12px"><h3>My ID code</h3><p class="small muted">If your phone cannot scan the gate code, show this to the security officer. Do not share a photo of it.</p>' + (IDCARD ? '<canvas id="idqr" style="width:200px;height:200px;display:block;margin:6px auto"></canvas>' : '<button class="btn sm" data-act="show-id">Show my ID code</button>') + '</div>' +
      '<div class="card" style="margin-top:12px"><h3>Move to a new phone</h3><p class="small muted">Your matric number works on one phone only, so nobody else can sign in as you. Changing phones? Make a code here, then type it on the new phone.</p>' + (XCODE && XCODE.exp > Date.now() ? '<div class="big" style="font-size:34px;letter-spacing:6px;text-align:center;margin:10px 0">' + esc(XCODE.code) + '</div><div class="small muted" style="text-align:center">Valid for 10 minutes. Do not share it.</div>' : '<button class="btn sm" data-act="xfer-code">Make a transfer code</button>') + '</div>';
    h += '<div class="card" style="margin-top:12px"><h3>📣 Invite friends</h3><p class="small muted">The more students use it, the safer the gate is for everyone.</p><div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn primary" data-act="share-link">Share link</button><button class="btn" data-act="share-copy">Copy link</button></div>' + storyPicker() + '</div>';
    h += '<div class="card" style="margin-top:12px"><h3>🔐 Safety codes</h3><p class="small muted">Optional. When you end a safe-walk or cancel an alert, the app asks for your <b>safe code</b>. If someone is forcing you, enter your <b>duress code</b> instead: it looks exactly the same, but security is quietly told you are in danger and follows your location. We never text your family about a duress alert, so nobody can be warned by a call. Three wrong tries count as duress too, so pick codes you will remember.</p>' +
      (CODES ? '<div class="note ok small">Codes are set.</div><button class="btn sm" data-act="codes-rm" style="margin-top:8px">Remove codes</button>' :
      '<form data-form="codes" novalidate><label class="f" for="cd_s">Safe code<span class="hint">4 to 6 digits</span></label><input id="cd_s" name="safe" type="password" inputmode="numeric" maxlength="6" autocomplete="off"><label class="f" for="cd_d">Duress code<span class="hint">Different from the safe code</span></label><input id="cd_d" name="duress" type="password" inputmode="numeric" maxlength="6" autocomplete="off"><div id="cdErr" class="err-msg" role="alert"></div><button class="btn primary" type="submit" style="margin-top:8px">Save codes</button></form>') + '</div>' +
      '<div class="card" style="margin-top:12px"><h3>🩺 Emergency health card</h3><p class="small muted">Optional. If you press the emergency button, responders see this so they can help safely (for example an allergy or asthma). It is shown <b>only on an active emergency</b>, never in normal records. You can remove it any time.</p><form data-form="medical" novalidate>' +
      '<label class="f" for="md_b">Blood group</label><input id="md_b" name="blood" maxlength="10" value="' + esc(MED ? MED.blood : '') + '"><label class="f" for="md_a">Allergies</label><input id="md_a" name="allergies" maxlength="160" value="' + esc(MED ? MED.allergies : '') + '"><label class="f" for="md_c">Conditions (asthma, diabetes, epilepsy…)</label><input id="md_c" name="conditions" maxlength="160" value="' + esc(MED ? MED.conditions : '') + '"><label class="f" for="md_m">Medicines</label><input id="md_m" name="meds" maxlength="160" value="' + esc(MED ? MED.meds : '') + '">' +
      '<label class="check"><input type="checkbox" name="share" checked><span>Show this to responders during my emergency</span></label><div id="mdErr" class="err-msg" role="status"></div><div class="row" style="gap:8px"><button class="btn primary" type="submit">Save</button>' + (MED ? '<button class="btn" type="button" data-act="med-rm">Remove</button>' : '') + '</div></form></div>';
    (function () {
      var pr = SG.prefs.get();
      function seg(k, opts) { return '<div class="row" style="gap:6px;flex-wrap:wrap">' + opts.map(function (o) { return '<button type="button" class="btn sm' + ((pr[k] || '') === o[0] ? ' primary' : '') + '" aria-pressed="' + ((pr[k] || '') === o[0]) + '" data-act="pref" data-k="' + k + '" data-v="' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</div>'; }
      h += '<div class="card" style="margin-top:12px"><h3>🔎 Make it easier to read</h3><p class="small muted">Saved on this phone only.</p><label class="f">Text size</label>' + seg('size', [['', 'Normal'], ['lg', 'Large'], ['xl', 'Extra large']]) +
        '<label class="f">Contrast</label>' + seg('contrast', [['', 'Normal'], ['high', 'High']]) + '<label class="f">Movement</label>' + seg('calm', [['', 'Normal'], ['1', 'Calm (no animation)']]) + '</div>';
    })();
    h += '<div class="card" style="margin-top:12px"><h3>Who can see what</h3><ul class="small" style="padding-left:18px;margin:6px 0">' +
      '<li>Security sees when you go out and come back, and where you said you were going.</li>' +
      '<li>Your <b>location</b> is hidden. An officer must pick a reason (for example you are overdue) before opening it. Every look is recorded below.</li>' +
      '<li>If you press the red button, security sees your live location at once.</li>' +
      '<li>Location data is deleted after ' + 30 + ' days.</li></ul>' +
      '<label class="check"><input type="checkbox" data-act="consent"' + (P.consentLoc !== false ? ' checked' : '') + '><span><b>Share location by default on trips</b></span></label>' +
      (navigator.wakeLock ? '<label class="check"><input type="checkbox" data-act="wake"' + (PREF.wake ? ' checked' : '') + '><span><b>Keep screen awake while I am out</b><br><span class="small muted">More accurate tracking, uses more battery.</span></span></label>' : '') +
      ('Notification' in window ? '<label class="check"><input type="checkbox" data-act="notif"' + (Notification.permission === 'granted' ? ' checked' : '') + '><span><b>Alert me on this phone</b><br><span class="small muted">When security checks on you or your return time is near. Works even when the app is closed (on phones that support it).</span></span></label>' : '') + '</div>';
    h += '<div class="card" style="margin-top:12px"><h3>Who looked at my location</h3>';
    if (!ACCESS.length) h += '<p class="small muted">Nobody has looked. 👍</p>';
    else h += '<div class="list">' + ACCESS.map(function (a) { return '<div class="item"><div><b>' + esc(a.officer) + '</b><span class="small muted">' + esc(a.reason || 'Viewed profile') + '</span></div><div class="small muted right">' + esc(SG.dt(a.t)) + '</div></div>'; }).join('') + '</div>';
    h += '</div><div class="card" style="margin-top:12px"><h3>My choices</h3><p class="small muted">SafeGate is free for you. We never sell or share your data, and we show no ads. You can change your mind about anything below at any time.</p>' + (P.minor ? '<div class="note warn small">You said you are under 18. Your location stays off until the school records your parent or guardian\'s agreement.</div>' : '') + '<a class="btn block" style="margin-top:8px" href="/privacy" target="_blank" rel="noopener">📜 Read the privacy notice</a></div>';
    h += '<div class="card" style="margin-top:12px"><h3>What I agreed to, and when</h3><div id="consentHist" class="small muted"><button class="btn sm" data-act="consent-hist">Show my history</button></div></div><div>';
    return h + '</div><div class="card" style="margin-top:12px"><h3>My data</h3><p class="small muted">You can download everything the school system holds about you, or erase your location history. Trip records stay, because they are the school register.</p><div class="row"><button class="btn grow" data-act="my-data">⬇ Download my data</button><button class="btn grow" data-act="my-erase">🗑 Erase my location history</button></div><button class="btn block danger" style="margin-top:8px" data-act="my-erase-all">⚠ Delete my whole account</button><p class="small muted" style="margin-top:6px">This removes you from SafeGate. Safety records such as past emergencies stay for the school, but nothing in them points to you any more.</p></div><div class="card" style="margin-top:12px"><h3>Privacy notice</h3><p class="small" style="white-space:pre-wrap">' + esc(CFG.policyText || '') + '</p></div>';
  };

  VIEWS.extend = function () {
    return backBtn('home') + '<h1>I need more time</h1><p class="muted">Tell security so they do not worry.</p><div class="stack">' +
      [30, 60, 120].map(function (m) { return '<button class="btn block big" data-act="extend-do" data-min="' + m + '">+ ' + (m < 60 ? m + ' minutes' : (m / 60) + (m === 60 ? ' hour' : ' hours')) + '</button>'; }).join('') + '</div>';
  };

  /* ------------------------------------------------------------ actions */
  function toast(m, k) { SG.toast(m, k); }

  function doOnboard(form) {
    var f = form.elements, err = $('#obErr');
    var name = f.name.value.trim().replace(/\s+/g, ' '), matric = (f.matric.value || '').toUpperCase().replace(/\s+/g, '');
    var phone = f.phone.value.trim(), en = f.en.value.trim(), ep = f.ep.value.trim();
    function bad(m, el) { err.textContent = m; if (el) el.focus(); }
    if (name.length < 3 || name.split(' ').length < 2) return bad('Enter your full name (first and last name).', f.name);
    if (!/^[A-Z0-9][A-Z0-9\/\-._]{3,23}$/.test(matric)) return bad('Check your matric number. Use letters, numbers and / only.', f.matric);
    if (phone.replace(/\D/g, '').length < 7) return bad('Enter a valid phone number.', f.phone);
    if (en.length < 2) return bad('Enter your emergency contact\'s name.', f.en);
    if (ep.replace(/\D/g, '').length < 7) return bad('Enter your emergency contact\'s phone number.', f.ep);
    var fin = function () {
    var first = !P;
    P = { name: name, matric: matric, phone: phone, residence: f.residence.value, emergency: { name: en, phone: ep }, consentLoc: !!f.consent.checked, minor: !!f.minor.checked };
    store.set('sg_profile', P); save();
    if (P.consentLoc && navigator.geolocation) getPos(8000);
    var pg = sessionStorage.getItem('sg_pendingGate');
    go('home'); sync();
    if (first && pg) { sessionStorage.removeItem('sg_pendingGate'); gotGate(pg); }
    };
    err.textContent = '';
    SG.call('rosterCheck', { matric: matric, name: name }).then(function (r) { if (r && r.ok === false) bad(r.message, r.code === 'name-mismatch' ? f.name : f.matric); else fin(); }, function () { fin(); });
  }

  function gotGate(token) {
    if (!P) { try { sessionStorage.setItem('sg_pendingGate', token); } catch (e) {} return; }
    if (navigator.vibrate) navigator.vibrate(60);
    if (ST.outside) return doReturn(token);
    go('leave', { gate: token });
    bindLeave();
  }
  function withGatePos(item) {                            // where was the phone when the QR was scanned? lets the server catch relayed codes
    if (P && P.consentLoc !== false && lastPos && Date.now() - lastPos.t < 3 * 60000) { item.lat = lastPos.lat; item.lng = lastPos.lng; item.acc = lastPos.acc; item.locAt = SG.now() - (Date.now() - lastPos.t); }
    return item;
  }
  function doReturn(token) {
    var t = SG.now(), dur = ST.since ? t - ST.since : 0, late = ST.expectedReturn && t > ST.expectedReturn + 15 * 60000;
    enqueue(withGatePos({ id: SG.uuid(), type: 'in', t: t, gate: token || '', source: token ? 'qr' : 'no-scan' }), true);
    HIST.unshift({ type: 'in', t: t, dest: ST.destination });
    var sos = ST.sos;
    ST = { outside: false, lastArrive: { t: t, dur: dur, late: !!late }, sos: sos, walk: ST.walk };
    stopTracking(); save(); go('arrived');
  }

  function bindLeave() {
    var f = $('form[data-form=leave]'); if (!f) return;
    function upd() {
      var pv = (f.elements.place.value || ''), tip = $('#placeTip'), other = $('#otherBox');
      other.classList.toggle('hidden', pv !== '_other');
      var pl = (CFG.places || []).filter(function (p) { return p.id === pv; })[0];
      if (pl) { tip.classList.remove('hidden'); tip.innerHTML = '<b>' + esc(pl.name) + '</b>' + (pl.area ? ' · ' + esc(pl.area) : '') + (pl.tip ? '<br>' + esc(pl.tip) : ''); }
      else if (pv === '_other') { tip.classList.remove('hidden'); tip.innerHTML = 'Going somewhere new? Tell a friend where you are going and share your location with them.'; }
      else tip.classList.add('hidden');
      var rv = +f.elements.ret.value; $('#retTime').classList.toggle('hidden', rv !== -1);
      var t = computeReturn(f), info = $('#retInfo');
      var cf = U.parseHM(CFG.curfew), msg = t ? 'Back by ' + SG.hm(t) : '';
      if (t && cf != null) { var lm = U.localMinutes(t, SG.tz); if (U.inWindow(lm, cf, U.parseHM(CFG.trackUntil) || 360)) msg += ' · this is after the curfew (' + CFG.curfew + ')'; }
      info.textContent = msg;
    }
    f.addEventListener('change', upd); f.addEventListener('input', upd); upd();
  }
  function computeReturn(f) {
    var rv = +f.elements.ret.value, now = SG.now();
    if (rv > 0) return now + rv * 60000;
    var m = U.parseHM(f.elements.rettime.value); if (m == null) return null;
    return U.nextLocalTime(now, m, SG.tz);
  }
  function doLeave(f) {
    var err = $('#leaveErr'), pv = f.elements.place.value, dest = { placeId: '', name: '', text: '' };
    if (!pv) { err.textContent = 'Choose where you are going.'; return; }
    if (pv === '_other') { var tx = f.elements.other.value.trim(); if (tx.length < 4) { err.textContent = 'Write the exact place and the area.'; f.elements.other.focus(); return; }
      if (U.vagueDest(tx) && vagueOk !== tx) {
        var vb = $('#vagueBox'); vb.classList.remove('hidden');
        vb.innerHTML = '<b>If you did not come back, could security tell where to look?</b><br>"' + esc(tx) + '" is too general. Add the shop, street or landmark, for example <i>"Ade Pharmacy, Ugbowo road"</i>. Ask a senior student if you are not sure of the area.<div class="row" style="margin-top:8px"><button type="button" class="btn sm" data-act="vague-ok">That is all I know</button></div>';
        f.elements.other.focus(); err.textContent = ''; vagueOk = ''; return;
      }
      dest.text = tx; dest.name = tx; }
    else { var pl = (CFG.places || []).filter(function (p) { return p.id === pv; })[0]; if (!pl) { err.textContent = 'Choose where you are going.'; return; } dest.placeId = pl.id; dest.name = pl.name; }
    var purpose = f.elements.purpose.value || '', ret = computeReturn(f);
    if (!ret || ret <= SG.now() + 5 * 60000) { err.textContent = 'Choose a return time at least 5 minutes from now.'; return; }
    var share = !!f.elements.share.checked, t = SG.now(), id = SG.uuid();
    enqueue(withGatePos({ id: id, type: 'out', t: t, gate: draft.gate || '', source: draft.gate ? 'qr' : 'no-scan', destination: dest, purpose: purpose,
      companions: f.elements.comp.value.trim(), meet: f.elements.meet.value.trim(), expectedReturn: ret, consentLoc: share, battery: batt }), true);
    HIST.unshift({ type: 'out', t: t, dest: dest.name });
    if (!dest.placeId && dest.text) { RECENT = RECENT.filter(function (x) { return x.text !== dest.text; }); RECENT.unshift({ text: dest.text, comp: f.elements.comp.value.trim(), meet: f.elements.meet.value.trim() }); RECENT = RECENT.slice(0, 4); store.set('sg_recent', RECENT); }
    vagueOk = '';
    ST = { outside: true, eventId: id, destination: dest.name, since: t, expectedReturn: ret, tracking: share, source: draft.gate ? 'qr' : 'no-scan', sos: ST.sos, walk: ST.walk };
    var pid = dest.placeId; save();
    if (share) { startTracking(); getPos(12000).then(function (p) { if (p) enqueue({ id: SG.uuid(), type: 'ping', t: SG.now(), lat: p.lat, lng: p.lng, acc: p.acc, battery: batt }, true); refresh(); }); }
    go('outdone', { placeId: pid });
  }

  /* camera: native BarcodeDetector when present, otherwise our own decoder (js/qrscan.js), so every phone can scan */
  var stream = null, scanTimer = null, detector = null, scanCv = null, scanCtx = null, torchOn = false, lastBad = 0;
  function stopCamera() {
    if (scanTimer) clearTimeout(scanTimer); scanTimer = null;
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
    torchOn = false;
  }
  function startCamera() {
    var msg = $('#scanmsg'), box = $('#camBox');
    function say(m, cls) { if (msg) { msg.textContent = m; msg.className = 'note small ' + (cls || ''); } }
    function nocam(m) { if (box) box.classList.add('hidden'); say(m, 'warn'); }
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return nocam('The camera is not available here. Use your phone\'s Camera app, or type the code below.');
    if ('BarcodeDetector' in window) { try { detector = new BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { detector = null; } }
    if (!detector && !(window.QRScan && window.QRCodeLib)) return nocam('This browser cannot read QR codes in the app. Use your phone\'s Camera app, or type the code below.');
    function scanOnce() {
      var v = $('#cam'); if (!v || v.readyState < 2 || !v.videoWidth) return Promise.resolve(null);
      if (detector) return detector.detect(v).then(function (c) { return c.length ? c[0].rawValue : null; }, function () { return null; });
      var sc = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight)), w = Math.round(v.videoWidth * sc), h = Math.round(v.videoHeight * sc);
      if (!scanCv) { scanCv = document.createElement('canvas'); scanCtx = scanCv.getContext('2d', { willReadFrequently: true }); }
      if (scanCv.width !== w) { scanCv.width = w; scanCv.height = h; }
      scanCtx.drawImage(v, 0, 0, w, h);
      var img = scanCtx.getImageData(0, 0, w, h);
      try { return Promise.resolve(window.QRScan.decode(img.data, w, h)); } catch (e) { return Promise.resolve(null); }
    }
    function loop() {
      if (view !== 'scan' || !stream) return;
      scanTimer = setTimeout(function () {
        scanOnce().then(function (raw) {
          if (view !== 'scan' || !stream) return;
          if (raw) {
            var tok = U.parseGatePayload(raw);
            if (tok) { stopCamera(); gotGate(tok); return; }
            if (Date.now() - lastBad > 2500) { lastBad = Date.now(); say('That is not a school gate code.', 'bad'); }
          }
          loop();
        });
      }, detector ? 120 : 170);
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }).then(function (s) {
      if (view !== 'scan') { s.getTracks().forEach(function (t) { t.stop(); }); return; }
      stream = s; var v = $('#cam'); v.srcObject = s;
      return v.play().then(function () {
        say('Looking for the QR code…');
        try { var tr = s.getVideoTracks()[0], cp = tr.getCapabilities && tr.getCapabilities(); if (cp && cp.torch) $('#torchBtn').classList.remove('hidden'); } catch (e) {}
        loop();
      });
    }).catch(function (e) {
      nocam(e && e.name === 'NotAllowedError' ? 'Camera is blocked. Allow the camera for this site in your browser settings, or use your Camera app or the code below.' : 'Could not start the camera. Use your Camera app or type the code below.');
    });
  }
  function toggleTorch() {
    var tr = stream && stream.getVideoTracks()[0]; if (!tr) return;
    torchOn = !torchOn; tr.applyConstraints({ advanced: [{ torch: torchOn }] }).catch(function () { torchOn = false; });
  }

  /* safe walk: a dead-man timer that lives on the server, so it still fires if the phone dies */
  function startWalkTicker() {
    if (walkTimer) clearInterval(walkTimer);
    walkTimer = setInterval(function () {
      if (!ST.walk) { clearInterval(walkTimer); walkTimer = null; return; }
      if (P.consentLoc !== false) getPos(12000).then(function (p) { if (p) enqueue({ id: SG.uuid(), type: 'ping', t: SG.now(), lat: p.lat, lng: p.lng, acc: p.acc, battery: batt }, true); });
    }, 60000);
  }
  function startWalk(f) {
    var min = +f.elements.min.value || 15, note = f.elements.note.value.trim(), t = SG.now(), id = SG.uuid(), until = t + min * 60000;
    enqueue({ id: id, type: 'walk_start', t: t, until: until, note: note }, true);
    ST.walk = { id: id, until: until, note: note }; save(); startWalkTicker();
    if (P.consentLoc !== false) getPos(10000).then(function (p) { if (p) enqueue({ id: SG.uuid(), type: 'ping', t: SG.now(), lat: p.lat, lng: p.lng, acc: p.acc, battery: batt }, true); });
    toast('Safe walk started', 'ok'); go('home');
  }
  function endWalk() {
    if (!ST.walk) return; withCode('Confirm you are safe', doEndWalk);
  }
  function doEndWalk(duress) {
    var wi = { id: SG.uuid(), type: 'walk_end', t: SG.now() }; if (duress) { wi.duress = true; quietTrail(); } enqueue(wi, true);
    ST.walk = null; if (walkTimer) clearInterval(walkTimer); walkTimer = null; save(); toast('Glad you arrived safely', 'ok'); refresh();
  }
  function moreWalk() {
    if (!ST.walk) return; var t = SG.now(), id = SG.uuid(), until = Math.max(ST.walk.until, t) + 10 * 60000;
    enqueue({ id: id, type: 'walk_start', t: t, until: until, note: ST.walk.note }, true);
    ST.walk = { id: id, until: until, note: ST.walk.note }; save(); toast('10 more minutes', 'ok'); refresh();
  }
  function shareTrip() {
    var txt = 'I left campus at ' + SG.hm(ST.since) + ' going to ' + ST.destination + '. I plan to be back by ' + (ST.expectedReturn ? SG.hm(ST.expectedReturn) : 'later') + '.' +
      (P.consentLoc !== false && lastPos ? ' My location: https://maps.google.com/?q=' + lastPos.lat + ',' + lastPos.lng : '') + ' - ' + P.name;
    if (navigator.share) navigator.share({ title: 'My trip', text: txt }).catch(function () {});
    else window.location.href = 'sms:?&body=' + encodeURIComponent(txt);
  }

  /* SOS */
  function triggerSOS() {
    if (!P || ST.sos) { if (ST.sos) go('sos'); return; }
    var id = SG.uuid(), t = SG.now(), fresh = lastPos && Date.now() - lastPos.t < 10 * 60000 ? lastPos : null;
    if (navigator.vibrate) navigator.vibrate([250, 120, 250]);
    ST.sos = { id: id, t: t };
    var item = { id: id, type: 'sos', t: t, battery: batt }; if (fresh) { item.lat = fresh.lat; item.lng = fresh.lng; item.acc = fresh.acc; }
    enqueue(item, true); go('sos'); startSosPings();
    getPos(10000).then(function (p) { if (p) { enqueue({ id: SG.uuid(), type: 'ping', t: SG.now(), lat: p.lat, lng: p.lng, acc: p.acc, battery: batt }, true); refresh(); } });
  }
  /* Sharing: one link that shows a picture card in WhatsApp, Facebook, X and Telegram. TikTok and Instagram show no link cards, so there is also a story picture with a QR code to post. */
  var SHARE_TEXT = 'I use SafeGate to sign out and in at the school gate with one tap. Free, works without internet, and my family knows I am safe. Get it here:';
  function shareUrl() { return location.origin + '/'; }
  function shareLink() {
    var u = shareUrl();
    if (navigator.share) { navigator.share({ title: 'SafeGate', text: SHARE_TEXT, url: u }).catch(function () {}); return; }
    window.open('https://wa.me/?text=' + encodeURIComponent(SHARE_TEXT + ' ' + u), '_blank', 'noopener');
  }
  function copyLink() {
    var u = shareUrl(), ok = function () { toast('Link copied. Paste it anywhere.', 'ok'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(u).then(ok, function () { prompt('Copy this link', u); }); else prompt('Copy this link', u);
  }
  function storyPicker() {
    if (!window.SGSlides) return '<button class="btn" style="margin-top:8px" data-act="share-story">Save story picture</button>';
    var h = '<p class="small muted" style="margin:12px 0 6px">Tap a picture to post it as your Status or story. It has a code that opens your link.</p><div class="pickrow">';
    SGSlides.forEach(function (sl, i) { h += '<button type="button" class="pick" data-act="share-story" data-i="' + i + '" aria-label="Share picture: ' + sl.alt + '">' + sl.svg + '</button>'; });
    return h + '</div>';
  }
  function slidesHtml() {
    if (!window.SGSlides) return '<div style="text-align:center"><img src="icon-192.png" width="72" height="72" alt="" style="border-radius:18px"></div>';
    var h = '<div class="slides" aria-roledescription="carousel" aria-label="What SafeGate does"><div class="strip" id="slideStrip">';
    SGSlides.forEach(function (sl, i) { h += '<div class="slide" role="group" aria-label="' + (i + 1) + ' of ' + SGSlides.length + '">' + sl.svg + '</div>'; });
    h += '</div><div class="dots" id="slideDots">'; SGSlides.forEach(function (sl, i) { h += '<button type="button" class="dot' + (i ? '' : ' on') + '" data-act="slide-go" data-i="' + i + '" aria-label="Picture ' + (i + 1) + '"></button>'; });
    return h + '</div></div>';
  }
  var slideTimer = null;
  function slideTo(i) { var st = $('#slideStrip'); if (st) st.scrollTo({ left: st.clientWidth * i, behavior: 'smooth' }); }
  function startSlides() {
    clearInterval(slideTimer); var st = $('#slideStrip'); if (!st) return; var paused = false, n = SGSlides.length;
    function cur() { return Math.round(st.scrollLeft / Math.max(1, st.clientWidth)); }
    st.addEventListener('scroll', function () { var i = cur(); [].forEach.call(document.querySelectorAll('#slideDots .dot'), function (d, k) { d.classList.toggle('on', k === i); }); }, { passive: true });
    ['touchstart', 'pointerdown', 'focusin'].forEach(function (ev) { st.addEventListener(ev, function () { paused = true; }, { passive: true }); });
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    slideTimer = setInterval(function () { if (!document.getElementById('slideStrip')) { clearInterval(slideTimer); return; } if (!paused) slideTo((cur() + 1) % n); }, 4200);
  }
  function storyImage(done, idx) {
    if (window.SGSlides && SGSlides[idx || 0]) return slideStory(SGSlides[idx || 0], done);
    var W = 1080, H = 1920, cv = document.createElement('canvas'); cv.width = W; cv.height = H; var g = cv.getContext('2d');
    var bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#0d7aa0'); bg.addColorStop(0.5, '#0b5d7a'); bg.addColorStop(1, '#06384c'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    var rg = g.createRadialGradient(W, 0, 0, W, 0, 900); rg.addColorStop(0, 'rgba(255,255,255,.22)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, H);
    g.fillStyle = '#fff'; g.textAlign = 'center'; var F = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    function draw(img) {
      if (img) { g.save(); g.beginPath(); g.roundRect ? g.roundRect(W / 2 - 90, 190, 180, 180, 44) : g.rect(W / 2 - 90, 190, 180, 180); g.clip(); g.drawImage(img, W / 2 - 90, 190, 180, 180); g.restore(); }
      g.font = '800 64px ' + F; g.fillText('SafeGate', W / 2, 450);
      g.font = '800 112px ' + F; g.fillText('Sign out at', W / 2, 640); g.fillText('the gate.', W / 2, 770); g.fillStyle = '#7fe3b0'; g.fillText('One tap.', W / 2, 910);
      g.fillStyle = '#d6eef6'; g.font = '500 44px ' + F; g.fillText('No paper register.', W / 2, 1010); g.fillText('Your family knows you are safe.', W / 2, 1070); g.fillText('Help is one button away.', W / 2, 1130);
      var qc = document.createElement('canvas'); SG.qr(qc, shareUrl(), 540);
      g.fillStyle = '#fff'; g.beginPath(); g.roundRect ? g.roundRect(W / 2 - 320, 1190, 640, 640, 40) : g.rect(W / 2 - 320, 1190, 640, 640); g.fill(); g.drawImage(qc, W / 2 - 270, 1240, 540, 540);
      g.fillStyle = '#fff'; g.font = '700 40px ' + F; g.fillText('Scan to get it free', W / 2, 1885);
      cv.toBlob(function (b) { done(b); }, 'image/png');
    }
    var im = new Image(); im.onload = function () { draw(im); }; im.onerror = function () { draw(null); }; im.src = 'icon-512.png';
  }
  function slideStory(sl, done) {
    var W = 1080, H = 1920, cv = document.createElement('canvas'); cv.width = W; cv.height = H; var g = cv.getContext('2d'), F = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
    g.fillStyle = '#06384c'; g.fillRect(0, 0, W, H);
    var im = new Image();
    function fin() {
      var qc = document.createElement('canvas'); SG.qr(qc, shareUrl(), 440);
      g.fillStyle = '#fff'; g.fillRect(0, 1100, W, 820); g.translate(0, -60); g.fillStyle = '#0e2433'; g.textAlign = 'left'; g.font = '800 64px ' + F; g.fillText('SafeGate', 90, 1370);
      g.font = '500 38px ' + F; g.fillStyle = '#4a5d6a'; g.fillText('Free for students.', 90, 1430); g.fillText('Scan to get it,', 90, 1500); g.fillText('opens like an app.', 90, 1550);
      g.drawImage(qc, 560, 1290, 400, 400); g.textAlign = 'center'; g.fillStyle = '#0b5d7a'; g.font = '700 36px ' + F; g.fillText(shareUrl().replace(/^https?:\/\//, '').replace(/\/$/, ''), W / 2, 1810);
      cv.toBlob(function (b) { done(b); }, 'image/png');
    }
    im.onload = function () { g.drawImage(im, 0, 0, W, 1100); fin(); }; im.onerror = fin;
    im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(sl.svg);
  }
  function shareStory(idx) {
    storyImage(function (blob) {
      if (!blob) return toast('Could not make the picture', 'err');
      var file = null; try { file = new File([blob], 'safegate-story.png', { type: 'image/png' }); } catch (e) {}
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: 'SafeGate', text: SHARE_TEXT + ' ' + shareUrl() }).catch(function () {}); return; }
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'safegate-story.png'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
      toast('Picture saved. Post it to your Status, TikTok or Instagram story.', 'ok');
    }, idx);
  }
  /* Install like an app: Android/Chrome offers a real install button; iPhone needs Share, then Add to Home Screen. */
  function isStandalone() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true || !!(window.SGNative && SGNative.isNative); }
  function isIOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredInstall = e; if (view === 'home') renderView(); });
  window.addEventListener('appinstalled', function () { deferredInstall = null; store.set('sg_inst_dismiss', Date.now() + 3650 * 864e5); if (view === 'home') renderView(); toast('SafeGate is installed. Open it from your home screen.', 'ok'); });
  function installBanner() {
    if (isStandalone()) return ''; var dis = store.get('sg_inst_dismiss', 0); if (dis && Date.now() < dis) return '';
    var body = deferredInstall ? '<button class="btn primary" data-act="install">Install SafeGate</button>' : isIOS() ? '<div class="small">Tap <b>Share</b> <span aria-hidden="true">⬆</span> at the bottom of Safari, then <b>Add to Home Screen</b>.</div>' : '<div class="small">Open your browser menu (⋮) and tap <b>Install app</b> or <b>Add to Home screen</b>.</div>';
    return '<div class="card" style="margin-bottom:12px;border:2px solid var(--pri,#0b5d7a)"><b>📲 Put SafeGate on your home screen</b><p class="small muted" style="margin:6px 0 10px">It then opens like any app, works without data, and can warn you when it is time to head back.</p>' + body + ' <button class="btn sm" data-act="install-later" style="margin-left:6px">Not now</button></div>';
  }
  /* Safety codes: a normal code ends an alert. The duress code looks identical to the person watching, but quietly tells security you are not free. */
  function codeHash(c) { return U.sha256Hex('sgcode|' + P.matric + '|' + String(c).trim()); }
  function withCode(title, done) {
    if (!CODES) return done(false);
    var ov = document.createElement('div'), tries = 0;
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:99;display:flex;align-items:center;justify-content:center;padding:20px';
    ov.innerHTML = '<form class="card" style="max-width:340px;width:100%" novalidate><h3>' + esc(title) + '</h3><p class="small muted">Enter your safety code.</p><input name="c" type="password" inputmode="numeric" autocomplete="off" maxlength="8" style="width:100%;font-size:1.4rem;text-align:center"><div class="err-msg" role="alert"></div><div class="row" style="margin-top:10px;gap:8px"><button class="btn primary grow" type="submit">Confirm</button><button class="btn" type="button" data-x="1">Back</button></div></form>';
    document.body.appendChild(ov); var inp = ov.querySelector('input'); inp.focus();
    ov.querySelector('[data-x]').onclick = function () { ov.remove(); };
    ov.querySelector('form').onsubmit = function (e) {
      e.preventDefault(); var h = codeHash(inp.value);
      if (h === CODES.safe) { ov.remove(); return done(false); }
      if (h === CODES.duress) { ov.remove(); return done(true); }
      if (++tries >= 3) { ov.remove(); return done(true); }
      ov.querySelector('.err-msg').textContent = 'That is not right. ' + (3 - tries) + ' left.'; inp.value = ''; inp.focus();
    };
  }
  function quietTrail() {
    if (trailTimer) clearInterval(trailTimer); var n = 0;
    trailTimer = setInterval(function () {
      if (++n > 40) { clearInterval(trailTimer); trailTimer = null; return; }
      getPos(10000).then(function (p) { if (p) enqueue({ id: SG.uuid(), type: 'ping', t: SG.now(), lat: p.lat, lng: p.lng, acc: p.acc, battery: batt }, true); }); sync();
    }, 30000);
  }
  function cancelSOS() {
    if (!ST.sos) return go('home');
    withCode('Cancel the alert?', function (duress) { doCancelSOS(duress); });
  }
  function doCancelSOS(duress) {
    var ci = { id: SG.uuid(), type: 'sos_cancel', t: SG.now(), sosId: ST.sos.id }; if (duress) { ci.duress = true; quietTrail(); }
    enqueue(ci, true);
    ST.sos = null; stopSosPings(); save(); toast('Alert cancelled', 'ok'); go('home');
  }
  var hold = { t0: 0, raf: 0 };
  function holdStart(e) {
    var b = e.target.closest('#sosHold'); if (!b || hold.t0) return;
    if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault(); hold.t0 = performance.now(); var fill = $('.fill', b);
    (function tick() {
      var p = Math.min(1, (performance.now() - hold.t0) / 1500); fill.style.width = (p * 100) + '%';
      if (p >= 1) { hold.t0 = 0; fill.style.width = '0'; triggerSOS(); return; }
      hold.raf = requestAnimationFrame(tick);
    })();
  }
  function holdEnd() { if (!hold.t0) return; hold.t0 = 0; cancelAnimationFrame(hold.raf); var f = $('#sosHold .fill'); if (f) f.style.width = '0'; }
  document.addEventListener('pointerdown', holdStart); document.addEventListener('keydown', holdStart);
  ['pointerup', 'pointercancel', 'pointerleave', 'keyup', 'blur'].forEach(function (ev) { document.addEventListener(ev, holdEnd, true); });
  document.addEventListener('contextmenu', function (e) { if (e.target.closest && e.target.closest('#sosHold')) e.preventDefault(); });

  /* ------------------------------------------------------------ events */
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-act]'); if (!a) return;
    var act = a.getAttribute('data-act');
    if (a.tagName === 'INPUT') return;
    switch (act) {
      case 'ad-hide': { var aid = a.getAttribute('data-id'); adHidden[aid] = Date.now() + 864e5; store.set('sg_adhide', adHidden); SG.call('adEvent', { deviceId: DEV, matric: P.matric, id: aid, kind: 'hide' }).catch(function () { }); renderView(); break; }
      case 'ad-click': SG.call('adEvent', { deviceId: DEV, matric: P.matric, id: a.getAttribute('data-id'), kind: 'click' }).catch(function () { }); break;
      case 'go': MAP.escape = a.getAttribute('data-escape') === '1'; if (a.getAttribute('data-to') === 'map' && !MAP.escape) MAP.sel = null; go(a.getAttribute('data-to')); if (a.getAttribute('data-to') === 'onboard') render(); break;
      case 'scan': go('scan'); break;
      case 'noscan': go('noscan'); break;
      case 'gate-none':
        if (ST.outside) doReturn(''); else { go('leave', { gate: '' }); bindLeave(); }
        break;
      case 'safe': enqueue({ id: SG.uuid(), type: 'checkin', t: SG.now(), note: 'Safe' }); toast('Security knows you are safe', 'ok'); break;
      case 'extend': go('extend'); break;
      case 'extend-do':
        var to = Math.max(ST.expectedReturn || 0, SG.now()) + (+a.getAttribute('data-min')) * 60000;
        ST.expectedReturn = to; enqueue({ id: SG.uuid(), type: 'extend', t: SG.now(), expectedReturn: to }, true);
        toast('New return time: ' + SG.hm(to), 'ok'); go('home'); break;
      case 'sos-media': if (window.SGMedia && ST.sos && SGMedia.drafts('sos').length) { SGMedia.attach('sos', { ref: ST.sos.id, refType: 'sos', matric: P.matric, deviceId: DEV }); SGMedia.flush(); toast('Sending to security. It continues even if the signal drops.', 'ok'); renderView(); } else toast('Add a picture, voice note or video first.', 'warn'); break;
      case 'sos-cancel': SOSKIND = ''; cancelSOS(); break;
      case 'install': if (deferredInstall) { var di = deferredInstall; deferredInstall = null; di.prompt(); di.userChoice.then(function (c) { if (c && c.outcome === 'dismissed') store.set('sg_inst_dismiss', Date.now() + 3 * 864e5); renderView(); }, function () { renderView(); }); } break;
      case 'share-link': shareLink(); break;
      case 'share-copy': copyLink(); break;
      case 'share-story': shareStory(+a.getAttribute('data-i') || 0); break;
      case 'ref-check': var rr = REFS.filter(function (x) { return x.ref === a.getAttribute('data-ref'); })[0]; if (rr) SG.call('trackReport', { ref: rr.ref, anonKey: rr.anonKey }).then(function (r) { REFSTAT[rr.ref] = r; renderView(); }, function (e) { REFSTAT[rr.ref] = { err: e && e.code === 'network' ? 'You need internet to check.' : 'Not received yet. It will arrive when you are online.' }; renderView(); }); break;
      case 'sos-kind': var sid = ST.sos && ST.sos.id; if (sid) { enqueue({ id: SG.uuid(), type: 'sos_update', t: SG.now(), sosId: sid, kind: a.getAttribute('data-kind') }, true); SOSKIND = a.getAttribute('data-kind'); renderView(); } break;
      case 'map-locate': startLocate(); break;
      case 'map-layer': var lk = a.getAttribute('data-k'); MAP.show[lk] = !MAP.show[lk]; a.classList.toggle('on', MAP.show[lk]); a.setAttribute('aria-pressed', MAP.show[lk]); mapUpdate(); break;
      case 'map-route': findRoad(); break;
      case 'map-ext-search': extSearch(); break;
      case 'map-ext-go': if (MAP.ext && MAP.ext.items[+a.getAttribute('data-id')]) { var xe = MAP.ext.items[+a.getAttribute('data-id')]; setDest({ id: 'ext' + a.getAttribute('data-id'), name: xe.name, lat: xe.lat, lng: xe.lng }); } break;
      case 'map-recent': var rr = store.get('sg_recent', [])[+a.getAttribute('data-id')]; if (rr) setDest({ id: 'rec', name: rr.name, lat: rr.lat, lng: rr.lng }); break;
      case 'map-saved': var sv = store.get(a.getAttribute('data-k') === 'home' ? 'sg_home' : 'sg_origin', null); if (sv) setDest({ id: a.getAttribute('data-k'), name: sv.name, lat: sv.lat, lng: sv.lng }); break;
      case 'map-home-set': if (MAP.pos) { store.set('sg_home', { name: 'Home', lat: MAP.pos.lat, lng: MAP.pos.lng }); toast('Saved on this phone only. Not sent to anyone.', 'ok'); mapUpdate(); } break;
      case 'map-trip': var tg2 = MAP.dest && MAP.dest.id === MAP.sel ? MAP.dest : null; if (tg2) startTrip(tg2, +a.getAttribute('data-eta') || 10); break;
      case 'map-idea-open': MAP.idea = true; mapUpdate(); break;
      case 'map-idea-cancel': MAP.idea = false; mapUpdate(); break;
      case 'map-save': saveMapOffline(); break;
      case 'map-hz-open': MAP.hz = true; mapUpdate(); break;
      case 'map-hz-cancel': MAP.hz = false; mapUpdate(); break;
      case 'map-hz': if (MAP.pos || MAP.pin) { var hp = MAP.pin || MAP.pos; enqueue({ id: SG.uuid(), type: 'hazard', t: SG.now(), kind: a.getAttribute('data-kind'), lat: hp.lat, lng: hp.lng }, true); MAP.hz = false; MAP.pin = null; toast('Thank you. Others see it once security or a second student confirms it.', 'ok'); mapUpdate(); } break;
      case 'map-dest': var dp = (CFG.places || []).filter(function (x) { return x.id === a.getAttribute('data-id'); })[0]; if (dp) setDest(dp); break;
      case 'map-night': MAP.night = !MAP.night; store.set('sg_mapnight', MAP.night); mapUpdate(); break;
      case 'map-pin-clear': MAP.pin = null; mapUpdate(); break;
      case 'map-pin-go': if (MAP.pin) setDest({ id: 'pin', name: 'Dropped pin', lat: MAP.pin.lat, lng: MAP.pin.lng }); MAP.pin = null; mapUpdate(); break;
      case 'map-pick': MAP.sel = a.getAttribute('data-id'); mapUpdate(); break;
      case 'slide-go': slideTo(+a.getAttribute('data-i') || 0); break;
      case 'install-later': store.set('sg_inst_dismiss', Date.now() + 7 * 864e5); renderView(); break;
      case 'recent': var rr = RECENT[+a.getAttribute('data-i')]; if (!rr) break; var lf = $('form[data-form=leave]'); if (!lf) break;
        var ro = lf.querySelector('input[name=place][value=_other]'); ro.checked = true; ro.dispatchEvent(new Event('change', { bubbles: true }));
        lf.elements.other.value = rr.text; lf.elements.comp.value = rr.comp || ''; lf.elements.meet.value = rr.meet || ''; vagueOk = rr.text; break;
      case 'vague-ok': var lf2 = $('form[data-form=leave]'); vagueOk = lf2.elements.other.value.trim(); lf2.requestSubmit ? lf2.requestSubmit() : lf2.dispatchEvent(new Event('submit', { cancelable: true })); break;
      case 'rc-safe': case 'rc-help': if (!ROLLCALL) break; var rk = act === 'rc-safe', rid = ROLLCALL.id;
        if (!rk && !confirm('Tell security you need help now?')) break;
        var ri2 = { id: SG.uuid(), type: 'rollcall_reply', t: SG.now(), rid: rid, ok: rk }; ROLLCALL.answered = true; ROLLCALL.ok = rk;
        var fin2 = function () { enqueue(ri2, true); toast(rk ? 'Thank you. Security knows you are safe.' : 'Help request sent. Stay where you are if you can.', rk ? 'ok' : 'err'); renderView(); };
        getPos(3500).then(function (p) { var q = p || lastPos; if (q && P.consentLoc !== false) { ri2.lat = q.lat; ri2.lng = q.lng; } fin2(); }, fin2); break;
      case 'pref': SG.prefs.set(a.getAttribute('data-k'), a.getAttribute('data-v')); refresh(); break;
      case 'codes-rm': withCode('Remove safety codes', function (d) { CODES = null; store.set('sg_codes', null); renderView(); toast('Codes removed', 'ok'); }); break;
      case 'med-rm': enqueue({ id: SG.uuid(), type: 'medical', t: SG.now(), medical: {} }, true); MED = null; store.set('sg_med', null); renderView(); toast('Health card removed', 'ok'); break;
      case 'walk': go('walk'); break;
      case 'walk-end': endWalk(); break;
      case 'walk-more': moreWalk(); break;
      case 'share': shareTrip(); break;
      case 'torch': toggleTorch(); break;
      case 'consent-ok': enqueue({ id: SG.uuid(), type: 'consent', t: SG.now(), version: CFG.policyVersion || 1 }, true); NEEDCONSENT = false; refresh(); break;
      case 'escort-cancel': enqueue({ id: SG.uuid(), type: 'escort_cancel', t: SG.now(), escortId: a.getAttribute('data-id') }, true); if (ESCORT) ESCORT.status = 'cancelled'; refresh(); break;
      case 'xfer-code': SG.call('makeTransferCode', { matric: P.matric, deviceId: DEV }).then(function (r) { XCODE = r; renderView(); }, function (e) { toast(e.code === 'network' ? 'You need internet for this.' : e.message, 'err'); }); break;
      case 'show-id': SG.call('myCard', { matric: P.matric, deviceId: DEV }).then(function (r) { IDCARD = r.card; store.set('sg_idcard', r.card); renderView(); }, function () { toast('Connect to the internet once to get your ID code.', 'err'); }); break;
      case 'chk-loc': getPos(15000).then(function () { runCheck(); }); break;
      case 'chk-notif': if ('Notification' in window) Notification.requestPermission().then(function () { PREF.pushOff = false; save(); runCheck(); if (CFG.pushKey && SG.pushSupported()) SG.pushEnable(CFG.pushKey, pushSend, false); }); break;
      case 'chk-persist': if (navigator.storage && navigator.storage.persist) navigator.storage.persist().then(function (g) { toast(g ? 'Done. Your data is protected.' : 'The phone did not allow it. Installing the app to your Home Screen usually helps.', g ? 'ok' : 'warn'); runCheck(); }); break;
      case 'helpSend': {
        var hm = $('#hlpMsg'), he = $('#hlpErr'), tx = hm ? hm.value.trim() : ''; function herr(t) { if (he) { he.textContent = t; he.style.display = 'block'; } }
        if (tx.length < 8) return herr('Please say a little more about the problem (at least 8 letters).');
        a.disabled = true; a.textContent = 'Sending…';
        SG.call('helpAsk', { deviceId: DEV, matric: P ? P.matric : '', name: P ? P.name : '', message: tx, contact: ($('#hlpContact') || {}).value || '', diag: basicDiag() }).then(function () { toast('Sent to ICT', 'ok'); HELPS.t = 0; loadHelp(true); go('helpbox'); }, function (e) { a.disabled = false; a.textContent = 'Send to ICT'; herr(e && e.message ? e.message : 'Could not send. Check your internet and try again.'); });
        break; }
      case 'chk-sync': net.nextTry = 0; sync(); toast('Sending…'); setTimeout(runCheck, 2500); break;
      case 'native-settings': if (window.SGNative) SGNative.openSettings(); break;
      case 'lock-retry': net.nextTry = 0; sync(); toast('Checking…'); break;
      case 'my-data': SG.call('myData', { matric: P.matric, deviceId: DEV }).then(function (d) {
        var url = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' })), l = document.createElement('a');
        l.href = url; l.download = 'my-safegate-data.json'; document.body.appendChild(l); l.click(); l.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 3000); toast('Downloaded', 'ok');
      }, function (e) { toast(e.code === 'network' ? 'You need internet for this.' : e.message, 'err'); }); break;
      case 'consent-hist': SG.call('myData', { matric: P.matric, deviceId: DEV }).then(function (d) { var l = (d.consentHistory || []).slice().reverse(), el = document.getElementById('consentHist'); if (el) el.innerHTML = l.length ? l.map(function (x) { return '<div>' + esc(SG.dt(x.t)) + ' · ' + esc(x.what) + ': <b>' + (x.on ? 'agreed' : 'turned off') + '</b></div>'; }).join('') : 'Nothing recorded yet.'; }, function (e) { toast(e.code === 'network' ? 'You need internet for this.' : e.message, 'err'); }); break;
      case 'my-erase-all': { var typed = prompt('This deletes your SafeGate account and your data from the school system. It cannot be undone.\n\nType your matric number to confirm:'); if (!typed) break; SG.call('eraseMyAccount', { matric: P.matric, deviceId: DEV, confirm: typed }).then(function () { try { localStorage.clear(); } catch (_) { } toast('Your account is deleted.', 'ok'); setTimeout(function () { location.reload(); }, 900); }, function (e) { toast(e.code === 'network' ? 'You need internet for this.' : e.message, 'err'); }); break; }
      case 'my-erase': if (confirm('Erase all your saved location points from the school system? This cannot be undone.')) SG.call('eraseMyLocation', { matric: P.matric, deviceId: DEV }).then(function (r) { toast('Erased ' + r.removed + ' location points', 'ok'); }, function (e) { toast(e.code === 'network' ? 'You need internet for this.' : e.message, 'err'); }); break;
      case 'notice-ok': { var nid = a.getAttribute('data-id'); NOTICES = NOTICES.filter(function (n) { return n.id !== nid; }); enqueue({ id: SG.uuid(), type: 'notice_ack', t: SG.now(), noticeId: nid }, true); refresh(); break; }
      case 'fam-share': { var ms = 'Hello, this link shows whether I am on campus or out, and when I plan to be back: ' + famLink; if (navigator.share) navigator.share({ title: 'My safety link', text: ms }).catch(function () {}); else window.location.href = 'https://wa.me/?text=' + encodeURIComponent(ms); break; }
      case 'fam-copy': if (navigator.clipboard) navigator.clipboard.writeText(famLink).then(function () { toast('Copied', 'ok'); }, function () { toast('Press and hold the link to copy it', 'err'); }); break;
      case 'watch-rm': SG.call('removeWatcher', { matric: P.matric, deviceId: DEV, id: a.getAttribute('data-id') }).then(function () { loadWatchers(); toast('Removed', 'ok'); }, function (e) { toast(e.message, 'err'); }); break;
      case 'fam-stop': SG.call('revokeGuardianLinks', { matric: P.matric, deviceId: DEV }).then(function () { famLink = null; GLINKS = 0; WATCHERS = []; save(); renderView(); toast('All links stopped', 'ok'); }, function (e) { toast(e.message, 'err'); }); break;
      case 'ask-ok': if (ASK) { enqueue({ id: SG.uuid(), type: 'reply', t: SG.now(), askId: ASK.id, ok: true }, true); ASK = null; toast('Thanks, security knows you are OK', 'ok'); refresh(); } break;
      case 'ask-help': if (ASK) { enqueue({ id: SG.uuid(), type: 'reply', t: SG.now(), askId: ASK.id, ok: false }, true); ASK = null; triggerSOS(); } break;
    }
  });
  document.addEventListener('change', function (e) {
    var a = e.target.closest && e.target.closest('input[data-act]'); if (!a) return;
    if (a.getAttribute('data-act') === 'consent') { P.consentLoc = a.checked; store.set('sg_profile', P); if (a.checked) getPos(8000); sync(); }
    if (a.getAttribute('data-act') === 'wake') { PREF.wake = a.checked; save(); if (a.checked) wantWake(); }
    if (a.getAttribute('data-act') === 'notif') {
      if (!a.checked) { SG.pushDisable(function (ep) { return SG.call('pushUnsubscribe', { matric: P.matric, deviceId: DEV, endpoint: ep }); }); PREF.pushOff = true; save(); return; }
      PREF.pushOff = false; save();
      if (CFG.pushKey && SG.pushSupported()) SG.pushEnable(CFG.pushKey, pushSend, true).then(function (r) { if (r === 'on') SG.toast('Alerts will reach you even when the app is closed.', 'ok'); refresh(); });
      else if ('Notification' in window) Notification.requestPermission().then(function () { refresh(); });
    }
  });
  document.addEventListener('submit', function (e) {
    var f = e.target.closest('form[data-form]'); if (!f) return; e.preventDefault();
    var k = f.getAttribute('data-form');
    if (k === 'map-idea') {
      var at = MAP.pin || MAP.pos; if (!at || !P) { toast('Drop a pin on the map or tap Find me first.', 'warn'); return; }
      var nm = f.elements.name.value.trim(); if (nm.length < 3) { toast('Give the place a name.', 'warn'); return; }
      enqueue({ id: SG.uuid(), type: 'place_idea', t: SG.now(), name: nm, kind: f.elements.kind.value, note: f.elements.note.value.trim(), lat: at.lat, lng: at.lng }, true); MAP.idea = false; toast('Thank you. Others will be able to find it once it is checked.', 'ok'); mapUpdate(); return;
    }
    if (k === 'map-find') { MAP.q = f.elements.q.value; var fd2 = $('#mapFind'); if (fd2) fd2.innerHTML = findHtml(); return; }
    if (k === 'usecode') { var cv = f.elements.code.value.replace(/\D/g, ''); if (cv.length !== 6) { $('#tcErr').textContent = 'Enter all 6 digits.'; return; } TCODE = cv; net.nextTry = 0; sync(); return; }
    if (k === 'codes') {
      var cs = f.elements.safe.value.trim(), cd = f.elements.duress.value.trim(), ce = $('#cdErr');
      if (!/^\d{4,6}$/.test(cs) || !/^\d{4,6}$/.test(cd)) { ce.textContent = 'Use 4 to 6 digits for both.'; return; } if (cs === cd) { ce.textContent = 'The two codes must be different.'; return; }
      CODES = { safe: codeHash(cs), duress: codeHash(cd) }; store.set('sg_codes', CODES); toast('Codes saved. Remember both.', 'ok'); renderView(); return;
    }
    if (k === 'medical') {
      var me = f.elements; MED = { blood: me.blood.value.trim(), allergies: me.allergies.value.trim(), conditions: me.conditions.value.trim(), meds: me.meds.value.trim() };
      var any = MED.blood || MED.allergies || MED.conditions || MED.meds; if (!any) MED = null; store.set('sg_med', MED);
      enqueue({ id: SG.uuid(), type: 'medical', t: SG.now(), share: me.share.checked, medical: MED || {} }, true); toast(any ? 'Health card saved' : 'Nothing to save', any ? 'ok' : 'err'); renderView(); return;
    }
    if (k === 'onboard') doOnboard(f);
    else if (k === 'leave') doLeave(f);
    else if (k === 'walk') startWalk(f);
    else if (k === 'escort') {
      var ee = f.elements; if (ee.to.value.trim().length < 2) { $('#esErr').textContent = 'Say where you need to go.'; return; }
      var ei = { id: SG.uuid(), type: 'escort_request', t: SG.now(), from: ee.from.value.trim(), to: ee.to.value.trim(), note: ee.note.value.trim() };
      var efin = function () { enqueue(ei, true); toast('Request sent. Stay where people can see you.', 'ok'); go('home'); };
      getPos(4000).then(function (p) { var q = p || lastPos; if (q) { ei.lat = q.lat; ei.lng = q.lng; } efin(); }, efin);
    } else if (k === 'pass') {
      var el = f.elements, until = localToEpoch(el.until.value), er = $('#psErr');
      if (!until || until <= SG.now()) { er.textContent = 'Choose a return time in the future.'; return; }
      if (el.reason.value.trim().length < 3) { er.textContent = 'Write a short reason.'; return; }
      enqueue({ id: SG.uuid(), type: 'pass_request', t: SG.now(), from: SG.now(), until: until, destination: el.dest.value.trim(), reason: el.reason.value.trim() }, true);
      toast('Request sent', 'ok'); PASSES.unshift({ id: 'local', status: 'pending', until: until, dest: el.dest.value.trim() }); renderView();
    } else if (k === 'report') {
      var re = f.elements, rt = re.text.value.trim(); if (rt.length < 3) { $('#rpErr').textContent = 'Say what happened.'; return; }
      var ri = { id: SG.uuid(), type: 'report', t: SG.now(), cat: re.cat.value, text: rt, anonymous: re.anon.checked };
      if (ri.anonymous) ri.anonKey = SG.uuid();
      var catLabel = (f.querySelector('input[name=cat]:checked + span') || {}).textContent || 'Report';
      var fin = function () {
        enqueue(ri, true); if (window.SGMedia && SGMedia.drafts('report').length) { SGMedia.attach('report', { ref: ri.id, refType: 'report', anonKey: ri.anonKey || '', matric: ri.anonymous ? '' : P.matric, deviceId: DEV }); setTimeout(SGMedia.flush, 1500); } var ref = SGCore.util.refOf(ri.id); REFS.unshift({ ref: ref, id: ri.id, anonKey: ri.anonKey || '', label: catLabel, t: ri.t }); REFS = REFS.slice(0, 20); store.set('sg_refs', REFS);
        toast('Sent. Your reference: ' + ref, 'ok'); go('report');
      };
      var withLoc = function () { if (re.loc.checked) getPos(4000).then(function (p) { if (p) { ri.lat = p.lat; ri.lng = p.lng; } else if (lastPos) { ri.lat = lastPos.lat; ri.lng = lastPos.lng; } fin(); }, fin); else fin(); };
      var pf = re.photo && re.photo.files && re.photo.files[0];
      if (pf) photoData(pf, function (d) { if (d) ri.evidence = d; else toast('Picture could not be added. Sending without it.', 'warn'); withLoc(); }); else withLoc();
    } else if (k === 'family') {
      SG.call('makeGuardianLink', { matric: P.matric, deviceId: DEV, label: f.elements.label.value }).then(function (r) {
        famLink = new URL('guardian.html', location.href).href.split('?')[0] + '?t=' + r.token; GLINKS++; save(); renderView();
      }, function (e) { $('#fmErr').textContent = e && e.code === 'network' ? 'You need internet to create a link.' : (e.message || 'Could not create the link'); });
    } else if (k === 'code') {
      var tok = U.parseGatePayload(f.elements.code.value);
      if (!tok || tok.charAt(0) !== '#') { $('#codeErr').textContent = 'Type the 6 digits shown under the QR code.'; return; }
      gotGate(tok);
    }
  });
  if (window.SGMedia) { setInterval(function () { SGMedia.flush(); }, 20000); SGMedia.onChange(function () { var w = elView.querySelector('.mediaWait'); if (w && SGMedia.recording()) return; SGMedia.pending(function (n) { var x = elView.querySelector('.mediaWait'); if (x && !n) x.remove(); else if (x) x.textContent = '📎 ' + n + ' file' + (n > 1 ? 's' : '') + ' waiting to send. They go by themselves when you have signal.'; }); }); }
  window.addEventListener('online', function () { if (window.SGMedia) SGMedia.flush(); net.online = true; net.nextTry = 0; sync(); refresh(); });
  window.addEventListener('offline', function () { net.online = false; refresh(); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') { net.nextTry = 0; sync(); wantWake(); trackTick(false); refresh(); }
  });
  setInterval(function () { if (P && (pending() || Date.now() - net.last > (ST.outside || ST.walk || PASSES.some(function (x) { return x.status === 'pending'; }) || (ESCORT && (ESCORT.status === 'open' || ESCORT.status === 'assigned')) ? 15000 : 60000) || ST.sos)) sync(); }, ST.sos ? 8000 : 10000);
  setInterval(function () { if (document.visibilityState === 'visible') refresh(); }, 30000);

  /* ------------------------------------------------------------ boot */
  var m = /[?&#]g=([^&#]+)/.exec(location.search + location.hash), bootGate = m ? U.parseGatePayload('?g=' + m[1]) : null;
  if (m) { try { history.replaceState(null, '', location.pathname); } catch (e) {} }
  var goQ = /[?&]go=([a-z]+)/.exec(location.search), goView = goQ && { scan: 1, sos: 1, walk: 1, history: 1, map: 1 }[goQ[1]] ? goQ[1] : '';
  if (goQ) { try { history.replaceState(null, '', location.pathname); } catch (e) {} }
  view = P ? (ST.sos ? 'sos' : 'home') : 'onboard';
  render();
  if (ST.outside && ST.tracking) { startTracking(); trackTick(false); }
  if (ST.sos) startSosPings();
  if (ST.walk) startWalkTicker();
  if (P) sync();
  if (P && goView && !ST.sos && !bootGate) go(goView);
  if (bootGate) gotGate(bootGate);
  SG.registerSW();
  /* First open on an address with no SafeGate server (for example a plain static website): say so. Never let a student believe a scan was recorded when it can only sit on their phone. */
  function showNoServer() {
    if ($('#noserver')) return; var d = document.createElement('div'); d.id = 'noserver';
    d.style.cssText = 'position:fixed;inset:0;z-index:9999;background:var(--bg,#fff);color:var(--ink,#111);display:flex;align-items:center;justify-content:center;padding:24px;text-align:center';
    d.innerHTML = '<div style="max-width:380px"><div style="font-size:48px">🔌</div><h2>This link is not connected to SafeGate</h2><p>The page opened, but there is no school server behind it, so nothing you do here would reach security. Please ask your school for the correct SafeGate link.</p><button class="btn primary block" id="nsRetry">Try again</button></div>';
    document.body.appendChild(d); $('#nsRetry').onclick = function () { location.reload(); };
  }
  if (!SG.demo && !store.get('sg_synced', false)) SG.call('config', {}, 9000).then(function () { store.set('sg_synced', 1); }, function (e) { if (e && e.code === 'no-server') showNoServer(); });
})();
