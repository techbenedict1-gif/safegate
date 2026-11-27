/* SafeGate — security desk. */
(function () {
  'use strict';
  var SG = window.SG, U = SGCore.util, esc = SG.esc, $ = SG.$, $$ = SG.$$, root = $('#root');

  var TOKEN = null, OFFICER = '', ROLE = 'officer', seenKeys = null, anDays = 14, tab = 'live', board = null, settings = null, polling = null, boardFails = 0;
  try { TOKEN = sessionStorage.getItem('sg_tok'); OFFICER = sessionStorage.getItem('sg_off') || ''; } catch (e) {}
  var sound = SG.store.get('sg_sound', true), audioCtx = null, alarmTimer = null;

  function api(method, args, ms) {
    args = args || {}; if (TOKEN) args.token = TOKEN;
    return SG.call(method, args, ms).catch(function (e) {
      if (e && e.code === 'auth') { signedOut('Please sign in again.'); }
      throw e;
    });
  }
  function isAdmin() { return ROLE === 'admin'; }
  var GUARD_TABS = ['live', 'scanid', 'gate', 'paper', 'records', 'visitors'];
  function isGuard() { return ROLE === 'guard'; }
  function waNum(p) { var d = String(p || '').replace(/[^\d]/g, ''); if (!d) return ''; if (d.indexOf('00') === 0) return d.slice(2); if (d.charAt(0) === '0') return ((settings && settings.countryCode) || '234') + d.slice(1); return d; }
  function contactBtns(phone, msg) {
    if (!phone) return '';
    var w = waNum(phone); return '<a class="btn sm" href="tel:' + esc(String(phone).replace(/[^\d+]/g, '')) + '">📞 Call</a><a class="btn sm" target="_blank" rel="noopener" href="https://wa.me/' + w + '?text=' + encodeURIComponent(msg || '') + '">💬 WhatsApp</a>';
  }
  function checkMsg(name) { return 'Hello, this is ' + ((settings && settings.schoolName) || 'school') + ' security. We are trying to reach ' + name + '. Have you heard from them? Please call us on ' + ((settings && settings.securityPhone) || 'the school security number') + '.'; }
  function printSheet(html) {
    var d = document.createElement('div'); d.id = 'printArea'; d.innerHTML = html; document.body.appendChild(d); document.body.classList.add('print-sheet');
    setTimeout(function () { window.print(); setTimeout(function () { d.remove(); document.body.classList.remove('print-sheet'); }, 300); }, 50);
  }
  function fail(e) { SG.toast((e && e.message) || 'Something went wrong', 'err'); }

  /* ---------------------------------------------------------------- auth screens */
  function boot() {
    SG.call('staffStatus').then(function (s) {
      SG.registerSW();
      if (!s.configured) return setupScreen(s);
      if (TOKEN) return api('board').then(function (b) { SG.tz = (settingsTz(b)); showApp(b); }, function () { loginScreen(); });
      loginScreen();
    }, function (e) {
      if (e && e.code === 'no-server') { root.innerHTML = '<div class="login"><div class="card"><h1>This address is not connected to SafeGate</h1><p class="muted">The page loaded, but there is no SafeGate server behind it. Ask whoever runs SafeGate for the correct desk link.</p><button class="btn primary" data-act="reload">Try again</button></div></div>'; return; }
      root.innerHTML = '<div class="login"><div class="card"><h1>Cannot reach the server</h1><p class="muted">Check the network and reload. If you opened this file directly, add <code>?demo=1</code> or start the server with <code>node server.js</code>.</p><button class="btn primary" data-act="reload">Try again</button></div></div>';
    });
  }
  function settingsTz(b) { return b && typeof b.tz === 'number' ? b.tz : (SG.tz || 60); }
  function loginHeader(sub) {
    return '<div class="brand" style="margin-bottom:14px;font-size:1.3rem">' + logo() + '<span>SafeGate Security Desk</span></div>' + (sub ? '<p class="muted">' + sub + '</p>' : '') + SG.powered();
  }
  function logo() { return '<svg viewBox="0 0 64 64" width="34" height="34" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#0b5d7a"/><path d="M32 12l18 7v13c0 11-8 18-18 21-10-3-18-10-18-21V19z" fill="none" stroke="#fff" stroke-width="4" stroke-linejoin="round"/><path d="M24 32l6 6 11-12" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'; }
  function setupScreen() {
    root.innerHTML = '<div class="login">' + loginHeader('First time here. Create the administrator account for this school.') +
      '<form class="card" data-form="setup" novalidate>' +
      '<label class="f" for="s_school">School name</label><input id="s_school" type="text" name="school" value="" placeholder="e.g. Benson University">' +
      '<label class="f" for="s_off">Your name (shown in the audit log)</label><input id="s_off" type="text" name="officer" autocomplete="name">' +
      '<label class="f" for="s_pin">Your PIN<span class="hint">At least 6 characters. This is your own sign-in. You can add the other officers later in Settings.</span></label><input id="s_pin" type="password" name="pin" autocomplete="new-password">' +
      '<label class="f" for="s_pin2">Repeat PIN</label><input id="s_pin2" type="password" name="pin2" autocomplete="new-password">' +
      '<div class="err-msg" id="lerr" role="alert"></div><button class="btn primary block big" style="margin-top:14px" type="submit">Create desk</button></form></div>';
  }
  function loginScreen(msg) {
    root.innerHTML = '<div class="login">' + loginHeader(msg || 'Officers only.') +
      '<form class="card" data-form="login" novalidate>' +
      '<label class="f" for="l_off">Your name</label><input id="l_off" type="text" name="officer" value="' + esc(OFFICER) + '" autocomplete="name">' +
      '<label class="f" for="l_pin">Desk PIN</label><input id="l_pin" type="password" name="pin" autocomplete="current-password">' +
      '<div class="err-msg" id="lerr" role="alert"></div><button class="btn primary block big" style="margin-top:14px" type="submit">Sign in</button></form><p class="small" style="text-align:center;margin-top:14px"><a href="index.html">I am a student →</a></p></div>';
    var f = $('#l_pin'); if (OFFICER && f) f.focus();
  }
  function signedOut(msg) {
    TOKEN = null; try { sessionStorage.removeItem('sg_tok'); } catch (e) {}
    if (polling) clearInterval(polling); polling = null; stopAlarm(); closeModal(); loginScreen(msg);
  }
  function authed(r) {
    TOKEN = r.token; OFFICER = r.officer; ROLE = r.role || 'officer';
    try { sessionStorage.setItem('sg_tok', TOKEN); sessionStorage.setItem('sg_off', OFFICER); } catch (e) {}
    ensureAudio();
    api('board').then(showApp, fail);
  }

  /* ---------------------------------------------------------------- shell */
  var NAV = [['live', '🛰', 'Live'], ['map', '🗺', 'Map'], ['scanid', '🪪', 'Scan ID'], ['rollcall', '🔔', 'Roll call'], ['gate', '▦', 'Gate QR'], ['paper', '✍', 'Paper log'], ['records', '📒', 'Records'], ['students', '👥', 'Students'], ['inbox', '📥', 'Inbox'], ['cases', '🧭', 'Cases'], ['visitors', '🪪', 'Visitors'], ['notices', '📢', 'Notices'], ['shift', '📝', 'Shift & reports'], ['analytics', '📊', 'Analytics'], ['wallet', '💳', 'Wallet', 1], ['health', '🩺', 'System', 1], ['places', '📍', 'Places', 1], ['settings', '⚙', 'Settings', 1], ['audit', '🛡', 'Audit', 1], ['trash', '🗑', 'Recycle bin'], ['feedback', '💬', 'Feedback']];
  function showApp(b) {
    board = b; SG.tz = (b.tz != null ? b.tz : SG.tz); if (b.role) ROLE = b.role; document.body.classList.toggle('guard', isGuard());
    api('getSettings').then(function (s) { settings = s; SG.tz = s.tzOffsetMin; if (tab === 'live') updateLive(); });
    root.innerHTML = '<div class="desk"><nav class="side" aria-label="Main">' +
      '<div class="brand">' + logo() + '<span>SafeGate</span></div>' +
      NAV.filter(function (n) { return isGuard() ? GUARD_TABS.indexOf(n[0]) >= 0 : (!n[3] || isAdmin()); }).map(function (n) { return '<button class="nav" data-tab="' + n[0] + '"><span aria-hidden="true">' + n[1] + '</span>' + n[2] + (n[0] === 'live' ? '<span class="badge hidden" id="navBadge">0</span>' : n[0] === 'inbox' ? '<span class="badge hidden" id="inboxBadge">0</span>' : '') + '</button>'; }).join('') +
      '<div class="foot">' + SG.powered() + '<div>Signed in: <b>' + esc(OFFICER) + '</b></div><div class="small muted">' + (isAdmin() ? 'Administrator' : isGuard() ? 'Gate guard' : 'Officer') + '</div><a class="small" href="index.html" target="_blank" rel="noopener" style="color:inherit;opacity:.8">Open student app ↗</a><label class="row small" style="margin:8px 0"><input type="checkbox" id="soundTgl"' + (sound ? ' checked' : '') + '> Alarm sound</label><label class="row small" style="margin:0 0 8px"><input type="checkbox" id="notifTgl"' + (('Notification' in window) && Notification.permission === 'granted' ? ' checked' : '') + '> Desktop alerts</label><button class="btn sm" data-act="myDuty" style="margin-right:6px">📞 My duty</button><button class="btn sm" data-act="logout">Sign out</button><div id="conn" class="small" style="margin-top:8px"></div></div></nav>' +
      '<main class="main" id="main"></main></div>';
    setTab(tab);
    if (polling) clearInterval(polling);
    polling = setInterval(poll, 5000);
    updateBadge();
    if (window.SGNative && SGNative.isNative) SGNative.registerPush(function (tk) { api('pushSubscribeStaffNative', { fcm: tk }); });
    SG.call('config').then(function (c) { cfgPushKey = c.pushKey || ''; if (cfgPushKey && SG.pushSupported() && Notification.permission === 'granted') SG.pushEnable(cfgPushKey, function (sub) { return api('pushSubscribeStaff', { sub: sub }); }, false); }, function () {});
  }
  var cfgPushKey = '';
  function setTab(t) {
    tab = t; closeModal();
    $$('.side .nav').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-tab') === t); });
    if (gateTimer) { clearTimeout(gateTimer); gateTimer = null; } if (t !== 'map') MAPSTATE.m = null;
    var m = $('#main'); if (!m) return;
    if ((t === 'places' || t === 'settings' || t === 'audit' || t === 'health' || t === 'wallet') && !isAdmin()) t = tab = 'live';
    if (isGuard() && GUARD_TABS.indexOf(t) < 0) t = tab = 'live';
    ({ feedback: mountFeedback, scanid: mountScanId, rollcall: mountRollCall, wallet: mountWallet, health: mountHealth, cases: mountCases, visitors: mountVisitors, inbox: mountInbox, notices: mountNotices, shift: mountShift, analytics: mountAnalytics, live: mountLive, map: mountMap, gate: mountGate, paper: mountPaper, records: mountRecords, students: mountStudents, places: mountPlaces, settings: mountSettings, audit: mountAudit, trash: mountTrash }[t] || mountLive)(m);
  }
  function poll() {
    if (!TOKEN) return;
    api('board').then(function (b) { board = b; boardFails = 0; if (tab === 'map' && (SG.now() - MAPSTATE.at) > 8000) loadMap(); $('#conn') && ($('#conn').innerHTML = '<span class="pill ok"><i class="dot"></i>Connected</span>'); updateBadge(); if (tab === 'live') updateLive(); if (tab === 'inbox') loadInbox(); },
      function (e) { if (e && e.code === 'network') { boardFails++; var c = $('#conn'); if (c) c.innerHTML = '<span class="pill bad"><i class="dot"></i>No connection</span>'; } });
  }
  function active() { return board ? board.alerts.filter(function (a) { return !a.ack; }) : []; }
  function updateBadge() {
    var n = active().length, b = $('#navBadge'); if (b) { b.textContent = n; b.classList.toggle('hidden', !n); }
    var ib = $('#inboxBadge'), ic = board ? (board.counts.transfers || 0) + (board.counts.passes || 0) + (board.counts.reports || 0) + (board.counts.escorts || 0) + (board.counts.cases || 0) : 0; if (ib) { ib.textContent = ic; ib.classList.toggle('hidden', !ic); }
    document.title = (n ? '(' + n + ') ' : '') + 'SafeGate – Security Desk';
    var loud = active().some(function (a) { return a.level === 'critical' && (a.type === 'sos' || a.type === 'walk' || a.type === 'report' || a.type === 'escort' || a.type === 'case') && !a.claim; });
    if (loud && sound) startAlarm(); else stopAlarm();
    var keys = {}; active().forEach(function (a) { keys[a.key] = a; });
    if (seenKeys) Object.keys(keys).forEach(function (k) { if (!seenKeys[k] && keys[k].level === 'critical') deskNotify((ALERT_LABEL[keys[k].type] || 'Alert') + ': ' + keys[k].name, keys[k].text); });
    seenKeys = keys;
  }
  function deskNotify(title, body) { try { if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body: body, icon: 'icon-192.png', tag: title, requireInteraction: true }); } catch (e) {} }

  /* ---------------------------------------------------------------- alarm */
  function ensureAudio() { try { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume(); } catch (e) {} }
  function beep() {
    if (!audioCtx) return;
    try {
      [880, 660].forEach(function (f, i) {
        var o = audioCtx.createOscillator(), g = audioCtx.createGain(), t = audioCtx.currentTime + i * 0.22;
        o.type = 'square'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
        o.connect(g); g.connect(audioCtx.destination); o.start(t); o.stop(t + 0.22);
      });
    } catch (e) {}
  }
  function startAlarm() { if (alarmTimer) return; ensureAudio(); beep(); alarmTimer = setInterval(beep, 1500); }
  function stopAlarm() { if (alarmTimer) clearInterval(alarmTimer); alarmTimer = null; }

  /* ---------------------------------------------------------------- common bits */
  var FLAG = { 'gate-stale': ['QR was old', 'warn'], 'gate-invalid': ['Gate code invalid', 'bad'], 'gate-missing': ['Not verified at gate', 'warn'], 'already-out': ['Already signed out', 'warn'],
    'no-exit-scan': ['No exit record', 'warn'], 'clock-ahead': ['Phone clock wrong', 'warn'], 'away-from-gate': ['Scanned away from gate', 'bad'], 'risky-destination': ['Flagged destination', 'warn'], 'vague-destination': ['Vague destination', 'warn'] };
  function flags(list) { return (list || []).map(function (f) { var d = FLAG[f] || [f, 'warn']; return '<span class="pill ' + d[1] + '">' + esc(d[0]) + '</span>'; }).join(' '); }
  function srcPill(e) {
    if (e.source === 'paper') return '<span class="pill mute">Paper</span>';
    if (e.source === 'no-scan') return '<span class="pill warn">No scan</span>';
    if (e.gate === 'verified' || e.gate === 'static') return '<span class="pill ok">QR ✓</span>';
    return '<span class="pill warn">QR ?</span>';
  }
  var TYPE = { escort_request: 'Escort request', escort_cancel: 'Escort cancelled', consent: 'Read privacy notice', pass_request: 'Pass request', report: 'Concern', out: 'OUT', in: 'IN', sos: 'SOS', sos_cancel: 'SOS cancelled', checkin: 'Check-in', extend: 'Extended', walk_start: 'Safe walk', walk_end: 'Walk ended', reply: 'Reply' };
  function tel(p) { return p ? '<a href="tel:' + esc(String(p).replace(/[^\d+]/g, '')) + '">' + esc(p) + '</a>' : '<span class="muted">—</span>'; }
  function mapLink(lat, lng) { return 'https://www.openstreetmap.org/?mlat=' + lat + '&mlon=' + lng + '#map=17/' + lat + '/' + lng; }
  function empty(m) { return '<p class="muted" style="padding:14px">' + m + '</p>'; }

  var modalEl = null;
  function modal(html, wide) {
    closeModal();
    modalEl = document.createElement('div'); modalEl.className = 'modal-bg'; modalEl.setAttribute('role', 'dialog'); modalEl.setAttribute('aria-modal', 'true');
    modalEl.innerHTML = '<div class="modal"' + (wide ? ' style="max-width:900px"' : '') + '>' + html + '</div>';
    modalEl.addEventListener('mousedown', function (e) { if (e.target === modalEl) closeModal(); });
    document.body.appendChild(modalEl); var f = modalEl.querySelector('input,select,textarea,button.primary'); if (f) f.focus();
    return modalEl;
  }
  function closeModal() { if (modalEl) { modalEl.remove(); modalEl = null; } }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

  /* ---------------------------------------------------------------- LIVE */
  var outFilter = '';
  function mountLive(m) {
    m.innerHTML = '<h1>Live board</h1><div class="stats" id="liveStats"></div><div class="card" id="livePulse" style="margin:12px 0"><p class="muted small">Loading live graph…</p></div><div id="liveAlerts"></div>' +
      '<div class="row between" style="margin:18px 0 8px"><h2 style="margin:0">Students outside now <span class="small muted">(riskiest first)</span></h2><input type="search" id="outFilter" placeholder="Filter by name or matric" style="max-width:260px" value="' + esc(outFilter) + '"></div>' +
      '<div class="tablewrap" id="liveOut"></div><h2 style="margin:22px 0 8px">Recent activity</h2><div class="tablewrap" id="liveRecent"></div>';
    updateLive();
  }
  /* ---------------------------------------------------------------- LIVE PULSE (graph that moves by itself) */
  var pulseAt = 0, pulseBusy = false;
  function loadPulse(force) {
    if (tab !== 'live' || pulseBusy || (!force && Date.now() - pulseAt < 9000)) return;
    pulseBusy = true; api('pulse').then(function (p) { pulseBusy = false; pulseAt = Date.now(); drawPulse(p); }, function () { pulseBusy = false; });
  }
  function drawPulse(p) {
    var el = $('#livePulse'); if (!el) return;
    var W = 600, H = 130, pad = 22, mx = Math.max(3, p.peak), n = p.series.length;
    var X = function (i) { return pad + i * (W - pad - 6) / (n - 1); }, Y = function (v) { return H - 18 - v * (H - 34) / mx; };
    var line = p.series.map(function (q, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(q.outside).toFixed(1); }).join(' ');
    var area = line + ' L' + X(n - 1).toFixed(1) + ',' + (H - 18) + ' L' + X(0).toFixed(1) + ',' + (H - 18) + ' Z';
    var lab = [0, 12, 24, 36, 47].map(function (i) { return '<text x="' + X(i).toFixed(1) + '" y="' + (H - 4) + '" font-size="11" text-anchor="' + (i === 47 ? 'end' : i === 0 ? 'start' : 'middle') + '" fill="currentColor" opacity=".65">' + esc(SG.hm(p.series[i].t)) + '</text>'; }).join('');
    var bm = Math.max(2, p.bars.reduce(function (m, b) { return Math.max(m, b.out, b.inn); }, 0)), bw = (W - 12) / p.bars.length;
    var bars = p.bars.map(function (b, i) { var ho = b.out * 46 / bm, hi = b.inn * 46 / bm; return '<rect x="' + (6 + i * bw + 1).toFixed(1) + '" y="' + (52 - ho).toFixed(1) + '" width="' + (bw / 2 - 1.5).toFixed(1) + '" height="' + ho.toFixed(1) + '" fill="var(--warn,#b26a00)" rx="1"><title>' + esc(SG.hm(b.t)) + ': ' + b.out + ' left</title></rect><rect x="' + (6 + i * bw + bw / 2).toFixed(1) + '" y="' + (52 - hi).toFixed(1) + '" width="' + (bw / 2 - 1.5).toFixed(1) + '" height="' + hi.toFixed(1) + '" fill="var(--ok,#0a7a3b)" rx="1"><title>' + esc(SG.hm(b.t)) + ': ' + b.inn + ' back</title></rect>'; }).join('');
    var cl = p.medianClaimSec == null ? '—' : p.medianClaimSec < 90 ? p.medianClaimSec + ' s' : Math.round(p.medianClaimSec / 6) / 10 + ' min';
    el.innerHTML = '<div class="row between" style="flex-wrap:wrap"><h3 style="margin:0"><span class="livedot" aria-hidden="true"></span> Live pulse</h3><span class="small muted">updated ' + esc(SG.hm(p.now)) + ' · refreshes by itself</span></div>' +
      '<div class="stats" style="margin:8px 0"><div class="stat"><span class="muted small">Outside now</span><b>' + p.outside + '</b></div><div class="stat"><span class="muted small">Left today</span><b>' + p.today.out + '</b></div><div class="stat"><span class="muted small">Back today</span><b>' + p.today.inn + '</b></div><div class="stat"><span class="muted small">Busiest (24h)</span><b>' + p.peak + '</b></div><div class="stat ' + (p.sosOpen ? 'bad' : '') + '"><span class="muted small">First response (24h)</span><b>' + cl + '</b></div></div>' +
      '<div class="small muted">Students outside, last 24 hours (estimated from gate activity)</div><svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;max-height:190px;color:inherit" role="img" aria-label="Students outside over the last 24 hours. Now ' + p.outside + '. Highest ' + p.peak + '."><path d="' + area + '" fill="var(--brand,#1a73e8)" opacity=".15"/><path d="' + line + '" fill="none" stroke="var(--brand,#1a73e8)" stroke-width="2"/>' + lab + '<circle cx="' + X(n - 1).toFixed(1) + '" cy="' + Y(p.outside).toFixed(1) + '" r="4" fill="var(--brand,#1a73e8)"/></svg>' +
      (p.peak || p.today.out ? '' : '<div class="note small" style="margin-top:6px">No one has left campus in the last 24 hours. This graph fills in as students scan out and back.</div>') + '<div class="small muted" style="margin-top:6px">Last 2 hours: <span style="color:var(--warn,#b26a00)">■</span> left · <span style="color:var(--ok,#0a7a3b)">■</span> back (every 5 minutes)</div><svg viewBox="0 0 ' + W + ' 56" style="width:100%;height:auto;max-height:70px" role="img" aria-label="Departures and returns every 5 minutes for the last 2 hours">' + bars + '<line x1="6" y1="52.5" x2="' + (W - 6) + '" y2="52.5" stroke="currentColor" opacity=".25"/></svg>';
  }

  function updateLive() {
    if (!board || !$('#liveStats')) return;
    loadPulse();
    var c = board.counts;
    $('#liveStats').innerHTML = '<div class="stat"><span class="muted small">Outside now</span><b>' + c.outside + '</b></div>' +
      '<div class="stat ' + (c.alerts ? 'warn' : '') + '"><span class="muted small">Alerts</span><b>' + c.alerts + '</b></div>' +
      '<div class="stat ' + (c.sos ? 'bad' : '') + '"><span class="muted small">SOS</span><b>' + c.sos + '</b></div>' +
      '<div class="stat ' + (c.walk ? 'bad' : '') + '"><span class="muted small">Walk timers expired</span><b>' + (c.walk || 0) + '</b></div>' +
      '<div class="stat"><span class="muted small">Visitors inside</span><b>' + (c.visitorsIn || 0) + '</b></div>' +
      '<div class="stat ' + (c.escalated ? 'bad' : '') + '"><span class="muted small">Escalated</span><b>' + (c.escalated || 0) + '</b></div>' +
      '<div class="stat"><span class="muted small">Registered</span><b>' + c.registered + '</b></div>';
    var act = active(), handled = board.alerts.length - act.length;
    $('#liveAlerts').innerHTML = act.length ? act.map(alertCard).join('') + (handled ? '<p class="small muted">' + handled + ' handled alert(s) hidden.</p>' : '') :
      '<div class="note ok">✓ No active alerts.' + (handled ? ' ' + handled + ' handled.' : '') + '</div>';
    var q = outFilter.toLowerCase(), list = board.outside.filter(function (s) { return !q || s.name.toLowerCase().indexOf(q) >= 0 || s.matric.toLowerCase().indexOf(q) >= 0; });
    var RL = { high: ['High', 'bad'], medium: ['Medium', 'warn'], low: ['Low', 'ok'] }, WH = { campus: ['At campus', 'mute'], destination: ['At destination ✓', 'ok'], elsewhere: ['Elsewhere', 'warn'] };
    $('#liveOut').innerHTML = list.length ? '<table class="tbl"><thead><tr><th>Student</th><th>Destination</th><th>Left</th><th>Back by</th><th>Status</th><th>Phone</th><th></th></tr></thead><tbody>' + list.map(function (r) {
      var rl = RL[r.riskLevel] || RL.low, wh = r.where ? WH[r.where] : null;
      return '<tr class="' + (r.riskLevel === 'high' ? 'hl' : '') + '"><td><b>' + esc(r.name) + '</b><br><span class="small muted">' + esc(r.matric) + '</span>' + (r.deviceChanged ? ' <span class="pill warn">New device</span>' : '') + '</td>' +
        '<td>' + esc(r.destination) + '<br>' + srcPill({ source: r.source, gate: r.gate }) + ' ' + flags(r.flags) + '</td><td>' + esc(SG.hm(r.since)) + '<br><span class="small muted">' + esc(SG.dur(SG.now() - r.since)) + ' ago</span></td>' +
        '<td>' + (r.expectedReturn ? '<span class="' + (r.overdue ? 'pill bad' : '') + '">' + esc(SG.hm(r.expectedReturn)) + '</span>' : '—') + '</td>' +
        '<td><span class="pill risk ' + rl[1] + '" title="Risk score ' + r.risk + '">' + rl[0] + ' risk</span><br>' + (wh ? '<span class="pill ' + wh[1] + '">' + wh[0] + '</span> ' : '') +
        (r.tracking ? '<span class="pill ok">Tracking</span>' : '<span class="pill mute">No tracking</span>') + (r.battery != null ? ' <span class="pill ' + (r.battery <= 10 ? 'bad' : 'mute') + '">🔋 ' + r.battery + '%</span>' : '') +
        (r.ask ? ' <span class="pill warn">Check-in sent</span>' : '') + (r.pass ? ' <span class="pill ok" title="Approved exit pass">Pass until ' + esc(SG.hm(r.pass.until)) + '</span>' : '') + '<br><span class="small muted">seen ' + esc(SG.ago(r.lastSeen)) + '</span></td>' +
        '<td>' + tel(r.phone) + '</td><td><button class="btn sm" data-act="student" data-m="' + esc(r.matric) + '">Open</button></td></tr>'; }).join('') + '</tbody></table>' : empty(q ? 'No match.' : 'Nobody is outside right now.');
    $('#liveRecent').innerHTML = board.recent.length ? '<table class="tbl"><thead><tr><th>Time</th><th>Student</th><th>Event</th><th>Where</th><th>Check</th></tr></thead><tbody>' + board.recent.slice(0, 25).map(function (e) {
      return '<tr><td>' + esc(SG.dt(e.t)) + '</td><td>' + esc(e.name) + '<br><span class="small muted">' + esc(e.matric) + '</span></td><td><b>' + esc(TYPE[e.type] || e.type) + '</b></td><td>' + esc(e.destination || e.note) + '</td><td>' + (e.type === 'out' || e.type === 'in' ? srcPill(e) + ' ' : '') + flags(e.flags) + '</td></tr>'; }).join('') + '</tbody></table>' : empty('No activity yet.');
  }
  var ALERT_LABEL = { case: '🧭 MISSING PERSON CASE', escort: '🛡 Escort requested', visitor: '🪪 Visitor has stayed too long', report: '📣 Student reported a concern', danger: '⚠ Inside a flagged area', drill: '🧪 DRILL (practice)', sos: '🆘 EMERGENCY (SOS)', walk: '🚶 SAFE-WALK TIMER EXPIRED', noreply: '📨 No reply to check-in', overdue: '⏰ Overdue', mismatch: '🧭 Not near stated destination', battery: '🔋 Low battery', curfew: '🌙 Out after curfew', silent: '📵 No signal' };
  function alertCard(a) {
    var loc = a.loc ? '<div class="small" style="margin-top:4px">📍 <a href="' + mapLink(a.loc.lat, a.loc.lng) + '" target="_blank" rel="noopener">' + a.loc.lat.toFixed(5) + ', ' + a.loc.lng.toFixed(5) + '</a>' + (a.loc.acc ? ' (±' + Math.round(a.loc.acc) + ' m)' : '') + (a.loc.t ? ' · ' + esc(SG.ago(a.loc.t)) : '') + '</div>' : ((a.type === 'sos' || a.type === 'walk') ? '<div class="small" style="margin-top:4px">📍 No location received yet</div>' : '');
    var loud = a.level === 'critical' && (a.type === 'sos' || a.type === 'drill' || a.type === 'walk' || a.type === 'report' || a.type === 'escort' || a.type === 'case') && !a.claim;
    return '<div class="alert ' + a.level + (loud ? ' pulse' : '') + '"><div class="grow"><div class="row between"><b>' + (ALERT_LABEL[a.type] || a.type) + (a.escalated ? ' <span class="pill bad">ESCALATED: nobody responding</span>' : '') + '</b><span class="small muted">' + esc(SG.ago(a.since)) + '</span></div>' +
      '<div style="margin-top:2px"><b>' + esc(a.name) + '</b>' + (a.matric ? ' · ' + esc(a.matric) + ' · ' + tel(a.phone) : '') + '</div><div class="small">' + (a.duress ? '<span class="pill bad">SILENT DURESS</span> ' : '') + esc(a.text) + '</div>' + (a.medical ? '<div class="note small" style="margin-top:6px"><b>🩺 Health card (shared by the student for emergencies)</b><br>' + [['Blood', a.medical.blood], ['Allergies', a.medical.allergies], ['Conditions', a.medical.conditions], ['Medicines', a.medical.meds]].filter(function (x) { return x[1]; }).map(function (x) { return esc(x[0]) + ': <b>' + esc(x[1]) + '</b>'; }).join(' · ') + '</div>' : '') + loc +
      (a.emergency && a.emergency.phone ? '<div class="small muted">Emergency contact: ' + esc(a.emergency.name) + ' ' + tel(a.emergency.phone) + '</div><div class="row" style="margin-top:4px">' + contactBtns(a.emergency.phone, checkMsg(a.name)) + '</div>' : '') +
      (a.battery != null ? '<div class="small muted">Battery ' + a.battery + '%</div>' : '') +
      (a.claim ? '<div class="small" style="margin-top:4px"><span class="pill ok">Responding: ' + esc(a.claim.by) + '</span> <span class="muted">since ' + esc(SG.hm(a.claim.at)) + '</span></div>' : '') +
      '<div class="row" style="margin-top:8px">' + (a.mediaN ? '<button class="btn sm primary" data-act="mediaView" data-type="sos" data-id="' + esc(a.key.slice(4)) + '">🎞 ' + a.mediaN + ' file' + (a.mediaN > 1 ? 's' : '') + ' from student</button>' : '') + (a.claim ? '' : '<button class="btn sm ok" data-act="claim" data-key="' + esc(a.key) + '">🙋 I am responding</button>') + '' + (a.matric ? '<button class="btn sm" data-act="student" data-m="' + esc(a.matric) + '">Open student</button>' : '') + '' + (a.type === 'escort' ? '<button class="btn sm ok" data-act="escortDo" data-id="' + esc(a.escortId) + '" data-a="assign">I am escorting</button><button class="btn sm primary" data-act="escortDo" data-id="' + esc(a.escortId) + '" data-a="done">Escort done</button>' : (a.type === 'case' ? '<button class="btn sm primary" data-act="openCase" data-id="' + esc(a.caseId) + '">Open case file</button>' : '<button class="btn sm primary" data-act="resolve" data-key="' + esc(a.key) + '">Mark handled</button>')) + '</div></div></div>';
  }

  /* ---------------------------------------------------------------- student modal + trail */
  var REASONS = ['Student is overdue', 'Welfare check requested by family or friend', 'Reported missing', 'Emergency or SOS', 'Safety concern', 'Other'];
  function openStudent(m) {
    api('studentDetail', { matric: m }).then(function (d) {
      var st = d.status;
      modal('<div class="row between"><h2 style="margin:0">' + esc(d.name) + '</h2><button class="btn sm ghost" data-act="close">✕ Close</button></div>' +
        '<div class="muted">' + esc(d.matric) + ' · ' + tel(d.phone) + ' · ' + esc({ campus: 'School hostel', off: 'Off campus', home: 'With family' }[d.residence] || '') + '</div>' +
        (d.unregistered ? '<div class="note warn small" style="margin-top:8px">Not registered in the app. Added from the paper register.</div>' : '') +
        (d.deviceChanged ? '<div class="note warn small" style="margin-top:8px">⚠ This matric number was registered again from a <b>different phone</b>. Confirm the student\'s identity.</div>' : '') +
        '<div class="row" style="margin:12px 0">' + (st.outside ? '<span class="pill warn">Outside since ' + esc(SG.dt(st.since)) + (st.expectedReturn ? ' · back by ' + esc(SG.hm(st.expectedReturn)) : '') + '</span>' : '<span class="pill ok">On campus</span>') +
        '<span class="pill ' + (d.consentLoc ? 'ok' : 'mute') + '">Location sharing ' + (d.consentLoc ? 'allowed' : 'off') + '</span><span class="small muted">Last seen ' + esc(SG.ago(d.lastSeen)) + '</span></div>' +
        (d.roster ? '<div class="small muted" style="margin-bottom:6px">On the school list ✓ · Level ' + esc(d.roster.level || '—') + ' · ' + esc(d.roster.hostel || 'hostel not stated') + '</div>' : (d.onRoster === false ? '<div class="small muted" style="margin-bottom:6px">Not on the school list</div>' : '')) +
        '<div class="note small">Emergency contact: <b>' + esc((d.emergency && d.emergency.name) || '—') + '</b> ' + tel(d.emergency && d.emergency.phone) + '<div class="row" style="margin-top:6px">' + contactBtns(d.emergency && d.emergency.phone, checkMsg(d.name)) + '</div></div>' +
        '<div class="row" style="margin:10px 0">' + '<button class="btn sm" data-act="traceSheet" data-m="' + esc(d.matric) + '">🖨 Print trace sheet</button> ' + (d.openCase ? '<button class="btn sm primary" data-act="openCase" data-id="' + esc(d.openCase) + '">🧭 Open case file</button>' : '<button class="btn sm" data-act="caseNew" data-m="' + esc(d.matric) + '">🧭 Open a missing-person case</button>') + '</div>' +
        '<div class="row" style="margin:12px 0"><button class="btn primary" data-act="trail" data-m="' + esc(d.matric) + '" data-grant="' + (d.grantUntil ? 1 : 0) + '">📍 View location trail</button><button class="btn" data-act="askOpen" data-m="' + esc(d.matric) + '">📨 Ask to check in</button><span class="small muted">Location needs a reason. The student can see who looked.</span></div>' +
        '<details class="card flat" style="margin:10px 0"><summary><b>Delete data</b></summary><p class="small muted">Kept 30 days in the Recycle bin so it can be restored.</p><div class="row"><button class="btn sm danger" data-act="delLoc" data-m="' + esc(d.matric) + '">🗑 Delete location history</button>' + (isAdmin() ? '<button class="btn sm danger" data-act="delStu" data-m="' + esc(d.matric) + '" data-n="' + esc(d.name) + '">🗑 Delete this student</button>' : '') + '</div></details>' +
        (d.ask ? '<div class="note small">Last check-in request by ' + esc(d.ask.by) + ' at ' + esc(SG.hm(d.ask.t)) + ': <b>' + esc(d.ask.status === 'pending' ? 'waiting for reply' : d.ask.status) + '</b></div>' : '') +
        '<h3>Recent movements</h3>' + (d.events.length ? '<div class="tablewrap"><table class="tbl"><tbody>' + d.events.map(function (e) {
          return '<tr><td>' + esc(SG.dt(e.t)) + '</td><td><b>' + esc(TYPE[e.type] || e.type) + '</b></td><td>' + esc(e.destination || e.note) + (e.meet ? '<div class="small muted">Meeting: ' + esc(e.meet) + '</div>' : '') + (e.companions ? '<div class="small muted">With: ' + esc(e.companions) + '</div>' : '') + '</td><td>' + (e.type === 'out' || e.type === 'in' ? srcPill(e) + ' ' : '') + flags(e.flags) + '</td></tr>'; }).join('') + '</tbody></table></div>' : empty('No movements yet.')), true);
    }, fail);
  }
  /* ---- Delete data (goes to the Recycle bin for 30 days; a reason is required and recorded) ---- */
  function delData(method, args, question, done) {
    var why = prompt(question + '\n\nIt will wait 30 days in the Recycle bin, where it can be restored.\nWrite a short reason (kept in the audit log):');
    if (why === null) return; if (why.trim().length < 3) { SG.toast('Please write a reason of at least 3 letters', 'err'); return; }
    args.reason = why.trim(); api(method, args).then(function () { SG.toast('Moved to the Recycle bin', 'ok'); if (done) done(); poll(); }, fail);
  }
  function mountTrash(m) {
    m.innerHTML = '<h1>Recycle bin</h1><p class="muted">Deleted reports, emergency records, location history and students wait here for 30 days. Restore anything deleted by mistake.</p><div id="trashOut"><p class="muted">Loading…</p></div>';
    api('listTrash').then(function (r) {
      var el = $('#trashOut'); if (!el) return;
      el.innerHTML = r.items.length ? r.items.map(function (x) {
        return '<div class="card" style="margin-bottom:10px"><div class="row between"><b>' + ({ report: '📝', sos: '🆘', student: '🎓', location: '📍' }[x.kind] || '🗑') + ' ' + esc(x.label) + '</b><span class="pill mute">' + x.daysLeft + ' days left</span></div><div class="small muted">Deleted by ' + esc(x.by) + ' · ' + esc(SG.dt(x.t)) + '</div><div class="small">Reason: ' + esc(x.reason) + '</div>' +
          '<div class="row" style="margin-top:8px"><button class="btn sm primary" data-act="trRestore" data-id="' + esc(x.id) + '">↩ Restore</button>' + (isAdmin() ? '<button class="btn sm danger" data-act="trPurge" data-id="' + esc(x.id) + '">Erase for good</button>' : '') + '</div></div>';
      }).join('') : empty('The Recycle bin is empty.');
    }, fail);
  }

  function askReason(m) {
    modal('<h2>Why do you need this location?</h2><p class="muted">This reason is saved in the audit log and shown to the student.</p><form data-form="reason" data-m="' + esc(m) + '"><label class="f" for="r_sel">Reason</label><select id="r_sel" name="sel">' +
      REASONS.map(function (r) { return '<option>' + esc(r) + '</option>'; }).join('') + '</select><div id="r_other" class="hidden"><label class="f" for="r_txt">Details</label><input id="r_txt" type="text" name="txt" maxlength="100"></div>' +
      '<label class="f" for="r_hrs">Show the last</label><select id="r_hrs" name="hrs"><option value="6">6 hours</option><option value="12" selected>12 hours</option><option value="24">24 hours</option><option value="72">3 days</option></select>' +
      '<div class="row" style="margin-top:16px"><button class="btn primary" type="submit">Show location</button><button class="btn" type="button" data-act="close">Cancel</button></div></form>');
    var sel = $('#r_sel'); sel.addEventListener('change', function () { $('#r_other').classList.toggle('hidden', sel.value !== 'Other'); });
  }
  function showTrail(t) {
    var pts = t.points, h = '<div class="row between"><h2 style="margin:0">Location · ' + esc(t.name) + '</h2><button class="btn sm ghost" data-act="close">✕ Close</button></div>' +
      '<p class="small muted">Access recorded. Open until ' + esc(SG.hm(t.until)) + '.</p>';
    if (!pts.length) return modal(h + '<div class="note warn">No location received in this period. The phone may be off, offline, out of battery, or the student did not allow location. Try calling them and their emergency contact.</div>', true);
    var last = t.last, cam = settings && settings.campus, dist = '';
    if (cam && cam.lat != null) dist += '<li><b>' + Math.round(U.haversine(last.lat, last.lng, cam.lat, cam.lng)) + ' m</b> from campus centre</li>';
    if (t.destination && t.destination.lat != null) dist += '<li><b>' + Math.round(U.haversine(last.lat, last.lng, t.destination.lat, t.destination.lng)) + ' m</b> from stated destination (' + esc(t.destination.name) + ')</li>';
    else if (t.destination) dist += '<li>Stated destination: <b>' + esc(t.destination.name) + '</b> (no map position saved for it. Add one under Places)</li>';
    h += '<div id="trailMap" class="mapbox">' + (window.SGMap ? '' : trailSvg(t)) + '</div><div class="row between" style="margin-top:10px"><div><b>Last point:</b> ' + esc(SG.dt(last.t)) + ' (' + esc(SG.ago(last.t)) + ')' + (last.acc != null ? ' · ±' + last.acc + ' m' : '') + (last.battery != null ? ' · battery ' + last.battery + '%' : '') + '</div>' +
      '<a class="btn sm" href="' + mapLink(last.lat, last.lng) + '" target="_blank" rel="noopener">Open in OpenStreetMap ↗</a></div>' + (dist ? '<ul class="small">' + dist + '</ul>' : '') +
      '<details style="margin-top:8px"><summary>All points (' + pts.length + ')</summary><div class="tablewrap"><table class="tbl"><thead><tr><th>Time</th><th>Lat, Lng</th><th>Accuracy</th><th>Battery</th></tr></thead><tbody>' +
      pts.slice(-60).reverse().map(function (p) { return '<tr><td>' + esc(SG.dt(p.t)) + '</td><td>' + p.lat.toFixed(5) + ', ' + p.lng.toFixed(5) + '</td><td>' + (p.acc != null ? '±' + p.acc + ' m' : '—') + '</td><td>' + (p.battery != null ? p.battery + '%' : '—') + '</td></tr>'; }).join('') + '</tbody></table></div></details>';
    modal(h, true);
    var tm = $('#trailMap');
    if (tm && window.SGMap) SG.call('config').then(function (c) {
      var m = SGMap.create(tm, { label: 'Student movement trail' });
      m.update({ tiles: c.mapTiles || '', hazards: c.hazards || [], me: { lat: last.lat, lng: last.lng, acc: last.acc }, track: pts, campus: cam && cam.lat != null ? cam : null, safe: (c.safePoints || []).concat(t.destination && t.destination.lat != null ? [{ id: 'dest', type: 'assembly', name: 'Said they were going here', lat: t.destination.lat, lng: t.destination.lng }] : []), zones: (c.riskZones || []).map(function (z) { return Object.assign({}, z, { active: zoneNow(z) }); }),
        focus: pts.slice(-40), target: t.destination && t.destination.lat != null ? { id: 'dest', lat: t.destination.lat, lng: t.destination.lng, name: t.destination.name } : null, safeLabel: true });
    });
  }
  function trailSvg(t) {
    var W = 720, H = 420, pad = 40, pts = t.points.slice(), cam = settings && settings.campus && settings.campus.lat != null ? settings.campus : null, dest = t.destination && t.destination.lat != null ? t.destination : null;
    var all = pts.map(function (p) { return [p.lat, p.lng]; }); if (cam) all.push([cam.lat, cam.lng]); if (dest) all.push([dest.lat, dest.lng]);
    var minLa = Math.min.apply(null, all.map(function (a) { return a[0]; })), maxLa = Math.max.apply(null, all.map(function (a) { return a[0]; }));
    var minLo = Math.min.apply(null, all.map(function (a) { return a[1]; })), maxLo = Math.max.apply(null, all.map(function (a) { return a[1]; }));
    var mLat = (minLa + maxLa) / 2, k = Math.cos(mLat * Math.PI / 180), spanY = Math.max(maxLa - minLa, 0.0015), spanX = Math.max((maxLo - minLo) * k, 0.0015);
    var sc = Math.min((W - 2 * pad) / spanX, (H - 2 * pad) / spanY), cx = (minLo + maxLo) / 2, cy = (minLa + maxLa) / 2;
    function X(lng) { return W / 2 + (lng - cx) * k * sc; } function Y(lat) { return H / 2 - (lat - cy) * sc; }
    var mPerDeg = 111320, s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Location trail map"><rect width="' + W + '" height="' + H + '" fill="rgba(120,150,170,.08)"/>';
    for (var i = 1; i < 6; i++) { s += '<line x1="' + (W * i / 6) + '" y1="0" x2="' + (W * i / 6) + '" y2="' + H + '" stroke="rgba(120,150,170,.18)"/><line x1="0" y1="' + (H * i / 6) + '" x2="' + W + '" y2="' + (H * i / 6) + '" stroke="rgba(120,150,170,.18)"/>'; }
    if (cam) { var r = (cam.radiusM / mPerDeg) * sc; s += '<circle cx="' + X(cam.lng) + '" cy="' + Y(cam.lat) + '" r="' + r + '" fill="rgba(27,127,75,.15)" stroke="#1b7f4b" stroke-dasharray="5 4"/><text x="' + X(cam.lng) + '" y="' + (Y(cam.lat) + 4) + '" text-anchor="middle" font-size="13" fill="#1b7f4b" font-weight="700">CAMPUS</text>'; }
    if (dest) s += '<g transform="translate(' + X(dest.lng) + ',' + Y(dest.lat) + ')"><path d="M0-14l4 9 10 1-7 7 2 10-9-5-9 5 2-10-7-7 10-1z" fill="#c27a12"/></g><text x="' + (X(dest.lng) + 14) + '" y="' + (Y(dest.lat) + 4) + '" font-size="13" fill="#a85d00" font-weight="700">' + esc(dest.name) + '</text>';
    if (pts.length > 1) s += '<polyline fill="none" stroke="#0b5d7a" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" points="' + pts.map(function (p) { return X(p.lng).toFixed(1) + ',' + Y(p.lat).toFixed(1); }).join(' ') + '"/>';
    pts.forEach(function (p, i) { var lastP = i === pts.length - 1; s += '<circle cx="' + X(p.lng).toFixed(1) + '" cy="' + Y(p.lat).toFixed(1) + '" r="' + (lastP ? 9 : 4) + '" fill="' + (lastP ? '#c62828' : '#0b5d7a') + '" stroke="#fff" stroke-width="2"><title>' + esc(SG.dt(p.t)) + '</title></circle>'; });
    var lp = pts[pts.length - 1]; s += '<text x="' + Math.min(W - 80, X(lp.lng) + 14) + '" y="' + (Y(lp.lat) - 12) + '" font-size="13" font-weight="700" fill="#c62828">Last seen ' + esc(SG.hm(lp.t)) + '</text>';
    var scaleM = 200, sw = (scaleM / mPerDeg) * sc; s += '<g transform="translate(20,' + (H - 20) + ')"><line x1="0" y1="0" x2="' + sw + '" y2="0" stroke="currentColor" stroke-width="3"/><text x="0" y="-6" font-size="12" fill="currentColor">' + scaleM + ' m</text></g></svg>';
    return s;
  }

  /* ---------------------------------------------------------------- GATE QR */
  var gateTimer = null;
  function mountGate(m) {
    m.innerHTML = '<h1>Gate QR</h1><div id="gateBox" class="card"><p class="muted">Loading…</p></div>';
    var loop = function () {
      if (tab !== 'gate') return;
      api('gateToken').then(function (g) {
        var base = (g.appUrl || (location.protocol.indexOf('http') === 0 ? location.origin : '')).replace(/\/+$/, ''), box = $('#gateBox'); gateBase = base; gateSchool = g.school || ''; if (!box || tab !== 'gate') return;
        var local = /^(https?:\/\/)?(localhost|127\.|0\.0\.0\.0)/i.test(base), url = base ? base + '/?g=' + encodeURIComponent(g.token) : g.token, t0 = Date.now();
        box.innerHTML = '<div class="gate-wrap"><h2 style="margin:0">Scan to sign out or in</h2><canvas id="qrc" aria-label="Gate QR code"></canvas>' +
          '<div class="muted">Cannot scan? Type this code in the app:</div><div class="code-big" aria-label="Gate code">' + esc(g.code.slice(0, 3) + ' ' + g.code.slice(3)) + '</div>' +
          (g.mode === 'rotating' ? '<div class="bar" aria-hidden="true"><i id="gbar" style="width:100%"></i></div><div class="small muted">The code changes every ' + g.periodSec + ' seconds, so a photo of it will not work later.</div>' : '<div class="small muted">Fixed code (printable). Switch to rotating in Settings for better security.</div>') +
          '<div class="row noprint" style="justify-content:center"><button class="btn" data-act="poster">🖨 Install poster</button><button class="btn" data-act="fs">⛶ Full screen</button>' + (g.mode === 'static' ? '<button class="btn" data-act="print">🖨 Print</button>' : '') + '</div></div>' +
          (local ? '<div class="note bad small noprint" style="margin-top:12px"><b>Students\' phones cannot open "localhost".</b> Set the public web address of this system in Settings → Public address, then this QR will work on their phones.</div>' : '') +
          (!base ? '<div class="note warn small noprint" style="margin-top:12px">Set the public web address in Settings so the QR opens the app. Until then it only holds the gate code.</div>' : '');
        try { SG.qr($('#qrc'), url, 460); } catch (e) { box.insertAdjacentHTML('beforeend', '<div class="note bad">Could not draw QR: ' + esc(e.message) + '</div>'); }
        if (g.mode === 'rotating') {
          var total = g.validForSec * 1000, bar = $('#gbar');
          var tick = function () { if (tab !== 'gate') return; var left = total - (Date.now() - t0); if (bar) bar.style.width = Math.max(0, left / (g.periodSec * 1000) * 100) + '%'; if (left <= 500) loop(); else gateTimer = setTimeout(tick, 250); };
          tick();
        }
      }, function (e) { var b = $('#gateBox'); if (b) b.innerHTML = '<div class="note bad">' + esc(e.message) + '</div>'; if (e && e.code === 'network') gateTimer = setTimeout(loop, 3000); });
    };
    loop();
  }

  /* ---------------------------------------------------------------- PAPER LOG */
  function schoolNowLocal() { return U.fmtLocal(SG.now(), SG.tz).replace(' ', 'T'); }
  function parseLocalInput(v) { var m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - SG.tz * 60000 : null; }
  function mountPaper(m) {
    m.innerHTML = '<h1>Paper register entry</h1><p class="muted">For students without a working phone. Copy what they wrote on paper so the digital record stays complete.</p>' +
      '<form class="card" data-form="paper" novalidate style="max-width:640px"><div class="chips"><label class="chip"><input type="radio" name="dir" value="out" checked><span>Going OUT</span></label><label class="chip"><input type="radio" name="dir" value="in"><span>Coming IN</span></label></div>' +
      '<label class="f" for="p_m">Matric number</label><input id="p_m" type="text" name="matric" autocapitalize="characters" autocomplete="off"><div id="p_who" class="small muted" style="margin-top:4px"></div>' +
      '<div id="p_nameBox"><label class="f" for="p_n">Full name<span class="hint">Only needed if the student is not registered in the app. Use the name written in the register.</span></label><input id="p_n" type="text" name="name"></div>' +
      '<div id="p_dest"><label class="f" for="p_d">Destination written in the register</label><input id="p_d" type="text" name="dest" list="placeList"><datalist id="placeList">' + (board && settings ? '' : '') + '</datalist>' +
      '<label class="f" for="p_r">Expected return<span class="hint">Optional</span></label><input id="p_r" type="time" name="ret"></div>' +
      '<label class="f" for="p_t">Time</label><input id="p_t" type="datetime-local" name="t" value="' + schoolNowLocal() + '"><label class="f" for="p_note">Note<span class="hint">Optional</span></label><input id="p_note" type="text" name="note" maxlength="120">' +
      '<div class="err-msg" id="perr" role="alert"></div><button class="btn primary big block" type="submit" style="margin-top:14px">Save entry</button></form>';
    SG.call('config').then(function (c) { var dl = $('#placeList'); if (dl && c.places) dl.innerHTML = c.places.map(function (p) { return '<option value="' + esc(p.name) + '">'; }).join(''); });
    var f = $('form[data-form=paper]');
    function dirChange() { var out = f.elements.dir.value === 'out'; $('#p_dest').classList.toggle('hidden', !out); } f.addEventListener('change', dirChange);
    $('#p_m').addEventListener('blur', function () {
      var v = this.value.trim(); if (v.length < 4) return;
      api('students', { q: v }).then(function (l) {
        var ex = l.filter(function (s) { return s.matric === v.toUpperCase().replace(/\s+/g, ''); })[0];
        $('#p_who').innerHTML = ex ? '✓ <b>' + esc(ex.name) + '</b> ' + (ex.outside ? '(currently outside)' : '(on campus)') : 'Not registered in the app. Enter the name below.'; $('#p_nameBox').classList.toggle('hidden', !!ex);
      }, function () {});
    });
  }
  function submitPaper(f) {
    var err = $('#perr'), el = f.elements, dir = el.dir.value, t = parseLocalInput(el.t.value), ret = null;
    if (!t) { err.textContent = 'Enter a valid time.'; return; }
    if (dir === 'out' && el.ret.value) { var hm = U.parseHM(el.ret.value); if (hm != null) ret = U.nextLocalTime(t, hm, SG.tz); }
    api('manualLog', { entry: { matric: el.matric.value, name: el.name.value, direction: dir, destination: el.dest.value, expectedReturn: ret, t: t, note: el.note.value } }).then(function () {
      SG.toast('Saved', 'ok'); mountPaper($('#main')); poll();
    }, function (e) { err.textContent = e.message; });
  }

  /* ---------------------------------------------------------------- RECORDS */
  var recQ = { q: '', type: '', from: '', to: '' };
  function dayStart(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) - SG.tz * 60000 : null; }
  function mountRecords(m) {
    var today = U.fmtLocal(SG.now(), SG.tz).slice(0, 10);
    if (!recQ.from) { recQ.from = U.fmtLocal(SG.now() - 6 * 86400000, SG.tz).slice(0, 10); recQ.to = today; }
    m.innerHTML = '<h1>Records</h1><form class="card row" data-form="rec" style="margin-bottom:14px;align-items:end"><div><label class="f" style="margin-top:0">From</label><input type="date" name="from" value="' + recQ.from + '"></div><div><label class="f" style="margin-top:0">To</label><input type="date" name="to" value="' + recQ.to + '"></div>' +
      '<div class="grow"><label class="f" style="margin-top:0">Student</label><input type="search" name="q" placeholder="Name or matric" value="' + esc(recQ.q) + '"></div><div><label class="f" style="margin-top:0">Type</label><select name="type"><option value="">All movements</option><option value="out">Out</option><option value="in">In</option><option value="sos">SOS</option></select></div>' +
      '<button class="btn primary" type="submit">Search</button>' + (isAdmin() ? '<button class="btn" type="button" data-act="csv">⬇ Export CSV</button>' : '') + '</form><div id="recOut"></div>';
    $('select[name=type]').value = recQ.type; runRecords();
  }
  function recArgs() { var from = dayStart(recQ.from), to = dayStart(recQ.to); return { from: from == null ? 0 : from, to: to == null ? undefined : to + 86400000 - 1, q: recQ.q, type: recQ.type }; }
  function runRecords() {
    api('records', recArgs()).then(function (r) {
      $('#recOut').innerHTML = '<p class="small muted">' + r.total + ' record(s)' + (r.total > r.rows.length ? ' (showing newest ' + r.rows.length + '; export for all)' : '') + '</p>' + (r.rows.length ? '<div class="tablewrap"><table class="tbl"><thead><tr><th>Time</th><th>Student</th><th>Event</th><th>Destination</th><th>Back by</th><th>Check</th></tr></thead><tbody>' + r.rows.map(function (e) {
        return '<tr><td>' + esc(SG.dt(e.t)) + '</td><td><a href="#" data-act="student" data-m="' + esc(e.matric) + '">' + esc(e.name) + '</a><br><span class="small muted">' + esc(e.matric) + '</span></td><td><b>' + esc(TYPE[e.type] || e.type) + '</b></td><td>' + esc(e.destination || e.note) + (e.purpose ? '<br><span class="small muted">' + esc(e.purpose) + '</span>' : '') + '</td><td>' + (e.expectedReturn ? esc(SG.hm(e.expectedReturn)) : '') + '</td><td>' + (e.type === 'out' || e.type === 'in' ? srcPill(e) + ' ' : '') + flags(e.flags) + '</td></tr>'; }).join('') + '</tbody></table></div>' : empty('No records for these filters.'));
    }, fail);
  }
  function downloadCsv() {
    var a = recArgs(); delete a.q; delete a.type;
    api('exportCsv', a).then(function (r) {
      var blob = new Blob(['﻿' + r.csv], { type: 'text/csv;charset=utf-8' }), url = URL.createObjectURL(blob), l = document.createElement('a');
      l.href = url; l.download = 'safegate-records-' + recQ.from + '_to_' + recQ.to + '.csv'; document.body.appendChild(l); l.click(); l.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      SG.toast(r.rows + ' rows exported', 'ok');
    }, fail);
  }

  /* ---------------------------------------------------------------- STUDENTS */
  var stuTimer = null;
  function mountFeedback(m) { m.innerHTML = '<h1>Feedback</h1><p class="muted">Tell Benedict what works, what to fix and what you wish SafeGate did. Officers see the product daily, so your view matters.</p><div id="fbRoot" style="max-width:600px"></div>'; if (window.SGFeedback) SGFeedback.mount($('#fbRoot'), { role: 'security', who: { name: OFFICER }, page: 'desk' }); }
  function mountStudents(m) {
    m.innerHTML = '<h1>Students</h1>' + (isAdmin() ? '<div class="row" style="margin-bottom:10px"><button class="btn" data-act="printCards">🖨 Print ID cards for all students</button><span class="small muted">QR cards for students who have no phone. Print on card stock and laminate.</span></div>' : '') + '<input type="search" id="stuQ" placeholder="Search by name or matric number" style="max-width:420px;margin-bottom:12px"><div id="integ"></div><div id="stuOut" class="tablewrap"></div>';
    var IL = { jump: 'Impossible location jump', shared: 'One phone, several matric numbers', far: 'Scanned the gate QR far from campus', noloc: 'Scanned with no location', quicksos: 'Emergency cancelled within 45 s', perfect: 'Suspiciously exact GPS' };
    api('integrity').then(function (r) {
      if (!r.list.length) { $('#integ').innerHTML = '<div class="note ok small">✅ Integrity watch: nothing suspicious right now.</div>'; return; }
      $('#integ').innerHTML = '<div class="card" style="margin-bottom:12px"><b>🕵 Integrity watch</b><div class="small muted">Clues that someone may be faking a scan, a location or an alert. They are not proof. A bad GPS signal or a phone shared by family can look the same. Check before you act.</div>' + r.list.slice(0, 8).map(function (x) {
        return '<div class="item"><div><b>' + esc(x.name) + '</b> <span class="small muted">' + esc(x.matric) + ' · score ' + x.score + '</span><span class="small muted">' + Object.keys(x.counts).map(function (k) { return esc(IL[k] || k) + ' ×' + x.counts[k]; }).join(' · ') + '</span>' + (x.last.length ? '<span class="small muted">Latest: ' + esc(x.last[x.last.length - 1].detail) + '</span>' : '') + '</div></div>';
      }).join('') + '</div>';
    }, function () {});
    var run = function () {
      api('students', { q: $('#stuQ').value }).then(function (l) {
        $('#stuOut').innerHTML = l.length ? '<table class="tbl"><thead><tr><th>Name</th><th>Matric</th><th>Phone</th><th>Status</th><th></th></tr></thead><tbody>' + l.map(function (s) {
          return '<tr><td><b>' + esc(s.name) + '</b>' + (s.deviceChanged ? ' <span class="pill warn">New device</span>' : '') + (s.unregistered ? ' <span class="pill mute">Paper only</span>' : '') + '</td><td>' + esc(s.matric) + '</td><td>' + tel(s.phone) + '</td><td>' + (s.outside ? '<span class="pill warn">Outside</span>' : '<span class="pill ok">On campus</span>') + '</td><td><button class="btn sm" data-act="student" data-m="' + esc(s.matric) + '">Open</button>' + (isAdmin() ? ' <button class="btn sm" data-act="cardOne" data-m="' + esc(s.matric) + '" title="Print ID card">🪪</button> <button class="btn sm" data-act="cardNew" data-m="' + esc(s.matric) + '" title="Lost card: issue a new one">↻</button>' : '') + '</td></tr>'; }).join('') + '</tbody></table>' : empty('No students found.');
      }, fail);
    };
    $('#stuQ').addEventListener('input', function () { clearTimeout(stuTimer); stuTimer = setTimeout(run, 250); }); run();
  }

  /* ---------------------------------------------------------------- PLACES */
  var placesCache = [];
  function mountPlaces(m) {
    m.innerHTML = '<h1>Places</h1><p class="muted">Destinations students pick from. The safety tip is shown to the student. Add map positions so the trail map can show whether a student is near where they said they were going.</p><div id="plOut"></div><div id="plForm"></div>';
    SG.call('config').then(function (c) { placesCache = c.places; drawPlaces(); }, fail);
  }
  function drawPlaces() {
    $('#plOut').innerHTML = '<div class="tablewrap"><table class="tbl"><thead><tr><th>Name</th><th>Safety tip</th><th>Position</th><th></th></tr></thead><tbody>' + placesCache.map(function (p) {
      return '<tr><td><b>' + esc(p.name) + '</b>' + (p.danger ? ' <span class="pill bad">Danger zone</span>' : '') + '<br><span class="small muted">' + esc(p.area) + '</span></td><td class="small">' + esc(p.tip) + '</td><td class="small">' + (p.lat != null ? p.lat.toFixed(4) + ', ' + p.lng.toFixed(4) + '<br>' + p.radiusM + ' m' : '<span class="muted">not set</span>') + '</td><td class="right"><button class="btn sm" data-act="plEdit" data-id="' + esc(p.id) + '">Edit</button> <button class="btn sm" data-act="plDel" data-id="' + esc(p.id) + '">Delete</button></td></tr>'; }).join('') + '</tbody></table></div>' +
      '<button class="btn primary" style="margin-top:12px" data-act="plEdit" data-id="">+ Add place</button>';
  }
  function placeForm(id) {
    var p = placesCache.filter(function (x) { return x.id === id; })[0] || { name: '', area: '', tip: '', lat: null, lng: null, radiusM: 400 };
    modal('<h2>' + (id ? 'Edit place' : 'Add place') + '</h2><form data-form="place" data-id="' + esc(id) + '"><label class="f" for="pl_n">Name</label><input id="pl_n" type="text" name="name" value="' + esc(p.name) + '"><label class="f" for="pl_k">Type</label><select id="pl_k" name="kind">' + Object.keys(SGMap.KIND).map(function (k) { return '<option value="' + k + '"' + ((p.kind || 'other') === k ? ' selected' : '') + '>' + SGMap.KIND[k][1] + '</option>'; }).join('') + '</select><label class="f" for="pl_a">Area / description</label><input id="pl_a" type="text" name="area" value="' + esc(p.area) + '">' +
      '<label class="f" for="pl_t">Safety tip shown to students</label><textarea id="pl_t" name="tip">' + esc(p.tip) + '</textarea><div class="row"><div class="grow"><label class="f">Latitude</label><input type="number" step="any" name="lat" value="' + (p.lat == null ? '' : p.lat) + '"></div><div class="grow"><label class="f">Longitude</label><input type="number" step="any" name="lng" value="' + (p.lng == null ? '' : p.lng) + '"></div><div style="width:110px"><label class="f">Radius (m)</label><input type="number" name="radius" value="' + p.radiusM + '"></div></div>' +
      '<label class="check" style="margin-top:10px"><input type="checkbox" name="danger"' + (p.danger ? ' checked' : '') + '><span>Flag as a danger zone (officers are alerted if a student is inside it, and trips here are marked)</span></label><button class="btn sm" type="button" data-act="useLoc" style="margin-top:8px">Use this device\'s location</button><div class="err-msg" id="plerr" role="alert"></div><div class="row" style="margin-top:14px"><button class="btn primary" type="submit">Save</button><button class="btn" type="button" data-act="close">Cancel</button></div></form>');
  }

  /* ---------------------------------------------------------------- SETTINGS */
  function mountSettings(m) {
    api('getSettings').then(function (s) {
      settings = s; SG.tz = s.tzOffsetMin;
      function inp(label, name, val, type, hint) { return '<label class="f">' + label + (hint ? '<span class="hint">' + hint + '</span>' : '') + '</label><input type="' + (type || 'text') + '" name="' + name + '" value="' + esc(val == null ? '' : val) + '"' + (type === 'number' ? ' step="any"' : '') + '>'; }
      m.innerHTML = '<h1>Settings</h1><form class="card" data-form="settings" style="max-width:680px">' +
        inp('School name', 'schoolName', s.schoolName) + inp('Security phone number', 'securityPhone', s.securityPhone, 'tel', 'Students see Call and SMS buttons for this number during an emergency.') +
        inp('Public address of this system', 'appUrl', s.appUrl, 'text', 'The web address students\' phones use, e.g. https://safegate.myschool.edu.ng . It goes into the gate QR code.') +
        '<h3 style="margin-top:22px">Map</h3>' + inp('Map picture source', 'mapTiles', s.mapTiles, 'text', 'Must contain {z}/{x}/{y} and start with https. The free OpenStreetMap server is for light use; a big school should use its own tile provider. Leave empty for a plain grid with no outside requests.') + inp('Walking-directions service', 'routeUrl', s.routeUrl, 'text', 'OSRM-compatible address. Only contacted when a student taps “Follow the road”.') + inp('Place search service', 'searchUrl', s.searchUrl, 'text', 'Nominatim-compatible address. Only contacted when a student taps “Search the wider map”. Leave empty to turn off.') +
        '<h3 style="margin-top:22px">Gate QR</h3><div class="row"><div class="grow">' + inp('Gate ID', 'gateId', s.gateId) + '</div><div class="grow"><label class="f">Type</label><select name="gateMode"><option value="rotating"' + (s.gateMode === 'rotating' ? ' selected' : '') + '>Rotating (recommended)</option><option value="static"' + (s.gateMode === 'static' ? ' selected' : '') + '>Fixed (printable)</option></select></div><div class="grow">' + inp('Change every (seconds)', 'gatePeriodSec', s.gatePeriodSec, 'number') + '</div></div>' +
        '<label class="check"><input type="checkbox" name="rotateSecret"><span>Replace the gate secret now (old printed codes stop working)</span></label>' +
        '<h3 style="margin-top:22px">Time and tracking</h3><div class="row"><div class="grow">' + inp('Tracking starts', 'trackFrom', s.trackFrom, 'time') + '</div><div class="grow">' + inp('Tracking ends', 'trackUntil', s.trackUntil, 'time') + '</div><div class="grow">' + inp('Curfew', 'curfew', s.curfew, 'time') + '</div></div>' +
        '<div class="row"><div class="grow">' + inp('Alert if late by (minutes)', 'graceMin', s.graceMin, 'number') + '</div><div class="grow">' + inp('Alert if no signal for (minutes)', 'silenceMin', s.silenceMin, 'number') + '</div><div class="grow">' + inp('Location every (seconds)', 'pingIntervalSec', s.pingIntervalSec, 'number') + '</div></div>' +
        '<h3 style="margin-top:22px">Gate and escorts</h3><div class="row"><div class="grow">' + inp('Visitor must leave within (hours)', 'visitorMaxHours', s.visitorMaxHours, 'number') + '</div><div class="grow">' + inp('Escort request becomes urgent after (minutes)', 'escortWaitMin', s.escortWaitMin, 'number') + '</div></div>' +
        '<h3 style="margin-top:22px">Text messages (SMS)</h3><label class="check"><input type="checkbox" name="smsEnabled"' + (s.smsEnabled ? ' checked' : '') + '><span><b>Send text messages</b><br><span class="small muted">Needs a text provider set on the server (see DEPLOY.md). Emergencies are texted to officers on call and your security phone straight away. Alerts nobody answers are texted again, then escalated to every administrator.</span></span></label>' +
        '<label class="check"><input type="checkbox" name="parentUpdates"' + (s.parentUpdates ? ' checked' : '') + '><span><b>Let parents get text updates</b><br><span class="small muted">A parent who has the student\'s family link can sign up to be texted when the student leaves, returns, is late, or presses emergency. Never location. Emergency texts to parents are always paid by the school.</span></span></label>' +
        '<label class="f">Who pays for routine parent texts?</label><select name="parentUpdatesPaidBy"><option value="parent"' + (s.parentUpdatesPaidBy !== 'school' ? ' selected' : '') + '>The parent (prepaid, a few naira per text)</option><option value="school"' + (s.parentUpdatesPaidBy === 'school' ? ' selected' : '') + '>The school wallet</option></select>' +
        inp('Free starter texts for each new parent (0 to 50)', 'parentStarter', s.parentStarter == null ? 10 : s.parentStarter, 'number', 'A welcome gift so no parent is asked for money before they see the value. Only applies when billing is on.') + inp('How parents can pay when online payment is off', 'payInstructions', s.payInstructions || '', 'text', 'Shown on the family page, e.g. the bursar or agent to pay to') +
        '<label class="check"><input type="checkbox" name="smsContactOnSos"' + (s.smsContactOnSos !== false ? ' checked' : '') + '><span><b>Text the student\'s emergency contact when they press the emergency button</b><br><span class="small muted">Includes the map link. Students are told this in the privacy notice (edit the notice below if yours does not say so).</span></span></label>' +
        inp('Text the emergency contact if a student is still not back after (hours, 0 = never)', 'smsContactOverdueHours', s.smsContactOverdueHours || 0, 'number', 'Sent once, no location. Use with care.') + inp('Most texts per day (emergencies are never blocked)', 'smsDailyCap', s.smsDailyCap || 150, 'number') +
        '<h3 style="margin-top:22px">Identity</h3><label class="check"><input type="checkbox" name="lockDevice"' + (s.lockDevice !== false ? ' checked' : '') + '><span><b>One phone per matric number</b><br><span class="small muted">A matric number can only be used on the phone it was first registered on. A new phone needs a code from the old phone, or approval from an officer in the Inbox.</span></span></label>' +
        '<h3 style="margin-top:22px">Student list and contacts</h3><label class="check"><input type="checkbox" name="requireRoster"' + (s.requireRoster ? ' checked' : '') + '><span><b>Only students on the school list can register</b><br><span class="small muted">Upload the list first (card further down). Names are compared loosely, so a missing middle name is fine.</span></span></label>' + inp('Phone country code', 'countryCode', s.countryCode || '234', 'text', 'Used to build WhatsApp links from numbers that start with 0. Nigeria is 234.') +
        '<h3 style="margin-top:22px">Privacy notice and important numbers</h3><label class="f" for="st_pol">Privacy notice shown to students<span class="hint">Editing it asks every student to read it again.</span></label><textarea id="st_pol" name="policyText" rows="6" maxlength="3000">' + esc(s.policyText || '') + '</textarea>' +
        '<label class="f" for="st_dir">Important numbers students can call<span class="hint">One per line: Name | Phone | Note (e.g. Campus clinic | 08031234567 | Open 24 hours)</span></label><textarea id="st_dir" name="directory" rows="4">' + esc((s.directory || []).map(function (d) { return d.name + ' | ' + d.phone + (d.note ? ' | ' + d.note : ''); }).join('\n')) + '</textarea>' +
        '<h3 style="margin-top:22px">Smart alerts</h3><div class="row"><div class="grow">' + inp('Escalate unanswered emergencies after (minutes)', 'escalateMin', s.escalateMin, 'number') + '</div></div><div class="row"><div class="grow">' + inp('Low battery at (%)', 'lowBattery', s.lowBattery, 'number') + '</div><div class="grow">' + inp('Not near destination after (metres beyond the place radius)', 'mismatchM', s.mismatchM, 'number') + '</div></div>' +
        '<div class="row"><div class="grow">' + inp('No reply to check-in after (minutes)', 'askWaitMin', s.askWaitMin, 'number') + '</div><div class="grow">' + inp('Safe-walk grace (minutes)', 'walkGraceMin', s.walkGraceMin, 'number') + '</div></div>' +
        inp('Time zone offset from UTC (minutes)', 'tzOffsetMin', s.tzOffsetMin, 'number', 'Nigeria (WAT) is 60.') +
        '<h3 style="margin-top:22px">Campus position</h3><div class="row"><div class="grow">' + inp('Latitude', 'clat', s.campus.lat, 'number') + '</div><div class="grow">' + inp('Longitude', 'clng', s.campus.lng, 'number') + '</div><div class="grow">' + inp('Radius (m)', 'crad', s.campus.radiusM, 'number') + '</div></div><button type="button" class="btn sm" data-act="useLoc" style="margin-top:8px">Use this device\'s location (stand at the gate)</button>' +
        '<h3 style="margin-top:22px">Privacy</h3><div class="row"><div class="grow">' + inp('Delete location points after (days)', 'retentionDaysPings', s.retentionDaysPings, 'number') + '</div><div class="grow">' + inp('Delete movement records after (days)', 'retentionDaysEvents', s.retentionDaysEvents, 'number') + '</div><div class="grow">' + inp('Location access lasts (minutes)', 'trailAccessMin', s.trailAccessMin, 'number') + '</div></div><div class="row"><div class="grow">' + inp('Delete student pictures, voice notes and videos after (days)', 'mediaDays', s.mediaDays || 30, 'number') + '</div><div class="grow">' + inp('Daily upload limit per student (MB)', 'mediaDayMB', s.mediaDayMB || 30, 'number') + '</div></div>' +
        '<div class="err-msg" id="serr" role="alert"></div><button class="btn primary big" type="submit" style="margin-top:16px">Save settings</button></form>' +
        '<form class="card" data-form="pin" style="max-width:680px;margin-top:16px"><h3>Change desk PIN</h3>' + inp('Current PIN', 'old', '', 'password') + inp('New PIN (6+ characters)', 'nw', '', 'password') + '<div class="err-msg" id="pinerr" role="alert"></div><button class="btn" type="submit" style="margin-top:12px">Change my PIN</button></form>' + adminCards();
      loadStaff(); loadRoster();
    }, fail);
  }
  function adminCards() {
    return '<div class="card" style="max-width:680px;margin-top:16px"><h3>School student list</h3><p class="small muted">Upload the school\'s list (CSV) so only real students can register and their details are filled in. Columns: <b>matric, name</b>, and optionally level, hostel, phone, guardian_name, guardian_phone. Export from Excel with Save As CSV.</p><div id="rosterInfo" class="small" style="margin:8px 0"></div>' +
      '<div class="row"><label class="btn" style="cursor:pointer">⬆ Upload list<input type="file" id="rosterFile" accept=".csv,text/csv,text/plain" class="hidden"></label><label class="small row"><input type="checkbox" id="rosterReplace"> Replace the existing list</label></div><div id="rosterRes" class="small" style="margin-top:8px"></div>' +
      '<div class="row" style="margin-top:10px"><button class="btn sm" data-act="rosterMissing">Who has not registered?</button><button class="btn sm" data-act="rosterClear">Delete the list</button></div></div>' +
      '<div class="card" style="max-width:680px;margin-top:16px"><div class="row between"><h3 style="margin:0">Officers</h3></div><p class="small muted">Everyone signs in with their own name and PIN, so the audit log shows who did what.</p><div id="staffOut" class="tablewrap"></div>' +
      '<form data-form="staffAdd" class="row" style="margin-top:12px;align-items:end" novalidate><div class="grow"><label class="f" style="margin-top:0">Name</label><input type="text" name="name" maxlength="40"></div><div class="grow"><label class="f" style="margin-top:0">PIN (6+)</label><input type="password" name="pin" autocomplete="new-password"></div><div><label class="f" style="margin-top:0">Role</label><select name="role"><option value="officer">Officer</option><option value="guard">Gate guard (gate, paper log, visitors only)</option><option value="admin">Administrator</option></select></div><button class="btn primary" type="submit">Add</button></form><div class="err-msg" id="staffErr" role="alert"></div></div>' +
      '<div class="card" style="max-width:680px;margin-top:16px"><h3>Backup and restore</h3><p class="small muted">The backup file holds everything, including student data and officer PIN hashes. Keep it somewhere safe. Restoring <b>replaces all current data</b>.</p>' +
      '<div class="row"><button class="btn" data-act="backup">⬇ Download backup</button><label class="btn" style="cursor:pointer">⬆ Restore from file<input type="file" id="restoreFile" accept="application/json,.json" class="hidden"></label></div></div>';
  }
  function loadRoster() {
    api('rosterStatus').then(function (r) {
      var el = $('#rosterInfo'); if (!el) return;
      el.innerHTML = r.total ? '<b>' + r.total + '</b> students on the list · <b>' + r.registered + '</b> registered in the app · <b>' + r.notRegistered + '</b> not yet' + (r.notOnList ? ' · ' + r.notOnList + ' registered but not on the list' : '') + (r.hostels.length ? '<div class="muted" style="margin-top:4px">Least registered: ' + r.hostels.slice(0, 4).map(function (h) { return esc(h.name) + ' (' + h.registered + '/' + h.total + ')'; }).join(', ') + '</div>' : '') : '<span class="muted">No list uploaded yet.</span>';
    }, function () {});
  }
  function loadStaff() {
    api('listStaff').then(function (l) {
      var el = $('#staffOut'); if (!el) return;
      el.innerHTML = '<table class="tbl"><thead><tr><th>Name</th><th>Role</th><th>Phone / duty</th><th>Last sign-in</th><th></th></tr></thead><tbody>' + l.map(function (x) {
        return '<tr><td><b>' + esc(x.name) + '</b>' + (x.active ? '' : ' <span class="pill bad">Disabled</span>') + '</td><td>' + (x.role === 'admin' ? 'Administrator' : x.role === 'guard' ? 'Gate guard' : 'Officer') + '</td><td class="small">' + (x.phone ? esc(x.phone) : '<span class="muted">no phone</span>') + (x.onCall ? ' <span class="pill ok">On call</span>' : '') + ' <button class="btn sm" data-act="staffPhone" data-n="' + esc(x.name) + '" data-p="' + esc(x.phone || '') + '">Edit</button></td><td class="small">' + (x.lastLogin ? esc(SG.dt(x.lastLogin)) : 'never') + '</td>' +
          '<td class="right"><button class="btn sm" data-act="staffReset" data-n="' + esc(x.name) + '">Reset PIN</button> <button class="btn sm" data-act="staffToggle" data-n="' + esc(x.name) + '" data-on="' + (x.active ? 0 : 1) + '">' + (x.active ? 'Disable' : 'Enable') + '</button></td></tr>'; }).join('') + '</tbody></table>';
    }, fail);
  }
  function saveSettings(f) {
    var e = f.elements, n = function (k) { var v = e[k].value; return v === '' ? null : +v; };
    var s = { schoolName: e.schoolName.value, securityPhone: e.securityPhone.value, appUrl: e.appUrl.value.trim(), mapTiles: e.mapTiles.value.trim(), routeUrl: e.routeUrl.value.trim(), searchUrl: e.searchUrl.value.trim(), gateId: e.gateId.value, gateMode: e.gateMode.value, gatePeriodSec: n('gatePeriodSec'),
      trackFrom: e.trackFrom.value, trackUntil: e.trackUntil.value, curfew: e.curfew.value, graceMin: n('graceMin'), silenceMin: n('silenceMin'), pingIntervalSec: n('pingIntervalSec'), tzOffsetMin: n('tzOffsetMin'), lowBattery: n('lowBattery'), mismatchM: n('mismatchM'), askWaitMin: n('askWaitMin'), walkGraceMin: n('walkGraceMin'), escalateMin: n('escalateMin'), visitorMaxHours: n('visitorMaxHours'), requireRoster: e.requireRoster.checked, lockDevice: e.lockDevice.checked, smsEnabled: e.smsEnabled.checked, parentUpdates: e.parentUpdates.checked, parentStarter: n('parentStarter'), parentUpdatesPaidBy: e.parentUpdatesPaidBy.value, payInstructions: e.payInstructions.value, smsContactOnSos: e.smsContactOnSos.checked, smsContactOverdueHours: n('smsContactOverdueHours'), smsDailyCap: n('smsDailyCap'), countryCode: e.countryCode.value, escortWaitMin: n('escortWaitMin'), policyText: e.policyText.value,
      directory: e.directory.value.split('\n').map(function (l) { var x = l.split('|').map(function (y) { return y.trim(); }); return { name: x[0] || '', phone: x[1] || '', note: x[2] || '' }; }).filter(function (d) { return d.name && d.phone; }),
      campus: { lat: n('clat'), lng: n('clng'), radiusM: n('crad') }, retentionDaysPings: n('retentionDaysPings'), retentionDaysEvents: n('retentionDaysEvents'), trailAccessMin: n('trailAccessMin'), mediaDays: n('mediaDays'), mediaDayMB: n('mediaDayMB'), rotateSecret: e.rotateSecret.checked };
    if (s.rotateSecret && !confirm('Replace the gate secret? Printed fixed codes will stop working.')) return;
    api('saveSettings', { settings: s }).then(function (r) { settings = r; SG.tz = r.tzOffsetMin; SG.toast('Settings saved', 'ok'); mountSettings($('#main')); }, function (er) { $('#serr').textContent = er.message; });
  }

  /* ---------------------------------------------------------------- SCAN ID (students with no working phone) */
  var idScan = null, idRecent = [], idCur = null, idPlaces = [];
  function mountScanId(m) {
    m.innerHTML = '<h1>Scan student ID</h1><p class="muted">For students with no phone or a dead phone. Scan the QR on the ID card, or use a scanner gun, or type the code. The student is signed OUT or IN for them.</p>' +
      '<div class="cols2"><div><div class="card"><div class="camera" style="max-height:300px;aspect-ratio:4/3"><video id="idCam" playsinline muted></video><div class="frame"></div></div><div id="idMsg" class="note small" style="margin-top:8px">Starting camera…</div>' +
      '<label class="f" for="idCode">Scanner gun or typed code<span class="hint">Click here first. A scanner gun types the code by itself.</span></label><input id="idCode" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="SGC1…"></div>' +
      '<h3 style="margin-top:16px">Recent scans</h3><div id="idRecent" class="small"></div></div><div id="idPanel"></div></div>';
    SG.call('config').then(function (c) { idPlaces = (c.places || []).slice(0, 10); }, function () {});
    if (idScan) idScan.stop();
    idScan = SG.scanQR($('#idCam'), idGot, function (t, c) { var e = $('#idMsg'); if (e) { e.textContent = t; e.className = 'note small ' + c; } });
    var inp = $('#idCode'); inp.focus();
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { var v = inp.value.trim(); inp.value = ''; if (v) idGot(v); } });
    idCur = null; renderIdPanel(); renderIdRecent();
  }
  function idGot(raw) {
    raw = String(raw || '').trim(); if (!tab || tab !== 'scanid') return;
    if (!/^SGC1\./i.test(raw)) { SG.toast(/[?&]g=/.test(raw) ? 'That is the gate QR, not an ID card.' : 'That is not a SafeGate ID code.', 'err'); return; }
    api('cardLookup', { card: raw }).then(function (r) { idCur = { card: raw, r: r, dest: '', placeId: '', ret: 0 }; renderIdPanel(); }, function (e) { idCur = null; renderIdPanel(); fail(e); });
  }
  function renderIdPanel() {
    var el = $('#idPanel'); if (!el) return;
    if (!idCur) { el.innerHTML = '<div class="card" style="text-align:center;padding:40px 16px"><div style="font-size:44px">🪪</div><h2>Ready for the next student</h2><p class="muted">Scan an ID card to begin.</p></div>'; return; }
    var r = idCur.r, out = r.direction === 'out';
    var h = '<div class="card"><div class="row between"><div><h2 style="margin:0">' + esc(r.name) + '</h2><div class="muted">' + esc(r.matric) + (r.phone ? ' · ' + tel(r.phone) : '') + '</div></div>' + (r.registered ? '<span class="pill ok">Has the app</span>' : '<span class="pill mute">No app</span>') + '</div>';
    if (r.justScanned) h += '<div class="note warn small" style="margin-top:10px">This student was scanned a few seconds ago. Make sure this is not a double scan.</div>';
    if (out) {
      h += '<div class="note small" style="margin-top:12px">On campus. Signing <b>OUT</b>.</div><label class="f">Where are they going?</label><div class="chips">' + idPlaces.map(function (p) { return '<label class="chip"><input type="radio" name="idd" value="' + esc(p.id) + '" data-n="' + esc(p.name) + '"' + (idCur.placeId === p.id ? ' checked' : '') + '><span>' + esc(p.name) + (p.danger ? ' ⚠' : '') + '</span></label>'; }).join('') + '</div>' +
        '<input id="idOther" type="text" placeholder="Or type the place" style="margin-top:8px" value="' + esc(idCur.placeId ? '' : idCur.dest) + '"><label class="f">Back within</label><div class="chips">' + [[60, '1 hour'], [120, '2 hours'], [240, '4 hours'], [480, '8 hours'], [0, 'No time']].map(function (x) { return '<label class="chip"><input type="radio" name="idr" value="' + x[0] + '"' + (idCur.ret === x[0] ? ' checked' : '') + '><span>' + x[1] + '</span></label>'; }).join('') + '</div>';
    } else {
      h += '<div class="note small" style="margin-top:12px">Outside since <b>' + esc(SG.hm(r.since)) + '</b>' + (r.destination ? ' (to ' + esc(r.destination) + ')' : '') + (r.expectedReturn ? ', expected back ' + esc(SG.hm(r.expectedReturn)) : '') + '. Signing <b>IN</b>.</div>';
    }
    h += '<div class="err-msg" id="idErr" role="alert"></div><div class="row" style="margin-top:14px"><button class="btn primary big grow" data-act="idConfirm">' + (out ? 'Sign OUT' : 'Sign IN') + '</button><button class="btn" data-act="idCancel">Cancel</button></div></div>';
    el.innerHTML = h;
    el.addEventListener('change', function (e) {
      if (e.target.name === 'idd') { idCur.placeId = e.target.value; idCur.dest = e.target.getAttribute('data-n'); var o = $('#idOther'); if (o) o.value = ''; }
      if (e.target.name === 'idr') idCur.ret = +e.target.value;
    });
    var o = $('#idOther'); if (o) o.addEventListener('input', function () { idCur.placeId = ''; idCur.dest = o.value; $$('input[name=idd]').forEach(function (x) { x.checked = false; }); });
  }
  function idConfirm() {
    if (!idCur) return; var r = idCur.r, a = { card: idCur.card };
    if (r.direction === 'out') { if (!idCur.dest.trim()) { $('#idErr').textContent = 'Choose or type where the student is going.'; return; } a.destination = idCur.dest.trim(); a.placeId = idCur.placeId; a.returnInMin = idCur.ret || undefined; }
    api('guardScan', a).then(function (x) {
      idRecent.unshift({ t: SG.now(), name: x.name, matric: x.matric, dir: x.direction }); idRecent = idRecent.slice(0, 12); idCur = null;
      SG.toast(x.name + ' signed ' + x.direction.toUpperCase(), 'ok'); renderIdPanel(); renderIdRecent(); var i = $('#idCode'); if (i) i.focus();
    }, function (e) { var er = $('#idErr'); if (er) er.textContent = e.message; });
  }
  function renderIdRecent() { var el = $('#idRecent'); if (el) el.innerHTML = idRecent.length ? idRecent.map(function (x) { return '<div class="row between" style="padding:4px 0;border-bottom:1px solid var(--line)"><span>' + esc(SG.hm(x.t)) + ' · <b>' + esc(x.name) + '</b></span><span class="pill ' + (x.dir === 'out' ? 'warn' : 'ok') + '">' + x.dir.toUpperCase() + '</span></div>'; }).join('') : '<span class="muted">None yet</span>'; }
  function printCards(matrics) {
    api('listCards', matrics ? { matrics: matrics } : {}).then(function (r) {
      if (!r.cards.length) return SG.toast('No students to print yet. Upload the school list first.', 'warn');
      var holder = document.createElement('div'); holder.style.cssText = 'position:absolute;left:-9999px';
      var cards = r.cards.map(function (c) { var cv = document.createElement('canvas'); try { SG.qr(cv, c.card, 220); } catch (e) {} return '<div class="idcard"><div class="idh">' + esc(r.school) + '</div><img class="idq" src="' + cv.toDataURL('image/png') + '" alt=""><div class="idn">' + esc(c.name) + '</div><div class="idm">' + esc(c.matric) + '</div><div class="ids">Gate pass · show to security</div></div>'; }).join('');
      printSheet('<div class="idsheet">' + cards + '</div>' + (r.total > r.cards.length ? '<p>Only the first ' + r.cards.length + ' of ' + r.total + ' are shown. Print the rest by searching smaller groups.</p>' : ''));
    }, fail);
  }
  /* One page for the police and the family: who, where they said they were going, who they were with, last contact and last known location. */
  function printTrace(r) {
    var s = r.student, st = r.status, tr = r.trip, row = function (k, v) { return '<tr><th>' + esc(k) + '</th><td>' + (v || '<span class="muted">not recorded</span>') + '</td></tr>'; };
    var h = '<div class="tracesheet"><h1>Missing student: trace sheet</h1><p class="small">' + esc(r.school) + ' · printed ' + esc(SG.dt(r.generatedAt)) + ' by ' + esc(r.by) + ' · Security: ' + esc(r.securityPhone || '—') + '</p>' +
      '<h2>The student</h2><table>' + row('Name', '<b>' + esc(s.name) + '</b>') + row('Matric number', esc(s.matric)) + row('Phone', esc(s.phone)) + row('Level / hostel', esc([s.level, s.hostel].filter(Boolean).join(' · '))) + row('Lives', esc({ campus: 'School hostel', off: 'Off campus', home: 'With family' }[s.residence] || '')) +
      row('Emergency contact', s.emergency ? esc(s.emergency.name) + ' · ' + esc(s.emergency.phone) : '') + (s.guardian && s.guardian.phone ? row('Guardian (school list)', esc(s.guardian.name || '') + ' · ' + esc(s.guardian.phone)) : '') + '</table>' +
      '<h2>Last known movements</h2><table>' + row('Status', st.outside ? '<b>Outside campus</b> since ' + esc(SG.dt(st.since)) + (st.expectedReturn ? ', was due back ' + esc(SG.dt(st.expectedReturn)) : '') : 'Recorded as on campus') +
      row('Last gate scan in', st.lastCampusScan ? esc(SG.dt(st.lastCampusScan)) : '') + row('Last opened the app', st.lastSeenApp ? esc(SG.dt(st.lastSeenApp)) : '') +
      (tr ? row('Said they were going to', '<b>' + esc(tr.destination) + '</b>' + (tr.vague ? ' <i>(general, no exact address)</i>' : '')) + row('Reason', esc(tr.purpose)) + row('Went with', esc(tr.companions)) + row('Visiting / meeting', esc(tr.meet)) + row('Phone battery when leaving', tr.battery != null ? tr.battery + '%' : '') : '') + '</table>' +
      '<h2>Last known location</h2>' + (r.locations === null ? '<p class="small">Not included. Open "View location trail" first and give a reason, then print again. The reason is recorded.</p>' : r.locations.length ? '<table>' + r.locations.map(function (p) { return '<tr><th>' + esc(SG.dt(p.t)) + '</th><td>' + p.lat.toFixed(5) + ', ' + p.lng.toFixed(5) + ' (±' + Math.round(p.acc || 0) + ' m)' + (p.battery != null ? ' · battery ' + p.battery + '%' : '') + '<br><span class="small">https://maps.google.com/?q=' + p.lat.toFixed(5) + ',' + p.lng.toFixed(5) + '</span></td></tr>'; }).join('') + '</table>' : '<p class="small">No location received in the last 24 hours.</p>') +
      '<h2>Recent movements</h2><table>' + r.recent.map(function (e) { return '<tr><th>' + esc(SG.dt(e.t)) + '</th><td>' + esc(TYPE[e.type] || e.type) + ' · ' + esc(e.destination || e.note) + '</td></tr>'; }).join('') + '</table>' +
      '<h2>Actions taken</h2><table><tr><th>Family called</th><td>&nbsp;</td></tr><tr><th>Police report no.</th><td>&nbsp;</td></tr><tr><th>Hospitals checked</th><td>&nbsp;</td></tr><tr><th>Officer</th><td>&nbsp;</td></tr></table>' +
      '<p class="small muted">Handle as confidential. Contains personal data shared for a safety purpose.</p></div>';
    printSheet(h);
  }
  function openDuty() {
    api('myDuty').then(function (d) {
      modal('<h2>My duty</h2><p class="small muted">When you are <b>on call</b>, security texts this number for emergencies and for alerts nobody has answered. Texts are free of location details except for emergencies.</p>' +
        '<form data-form="duty" novalidate><label class="f" for="du_p">My phone number</label><input id="du_p" type="tel" name="phone" value="' + esc(d.phone) + '" placeholder="0803 123 4567">' +
        '<label class="check" style="margin-top:10px"><input type="checkbox" name="onCall"' + (d.onCall ? ' checked' : '') + '><span><b>I am on call now</b></span></label>' + (d.smsEnabled ? '' : '<div class="note warn small" style="margin-top:8px">Text messages are switched off in Settings, so nothing will be sent yet.</div>') +
        '<div class="err-msg" id="duErr" role="alert"></div><div class="row" style="margin-top:12px"><button class="btn primary" type="submit">Save</button><button class="btn" type="button" data-act="close">Cancel</button></div></form>');
    }, fail);
  }
  /* ---------------------------------------------------------------- ROLL CALL */
  var gateBase = '', gateSchool = '';
  /* A poster for the gate, notice boards and hostels: one QR, three steps, no jargon. */
  function printInstallPoster() {
    var base = gateBase || (location.protocol.indexOf('http') === 0 ? location.origin : '');
    if (!base || /localhost|127\.0\.0\.1/.test(base)) return SG.toast('Set the public web address in Settings first, so the QR works on students\' phones.', 'err');
    var c = document.createElement('canvas'); SG.qr(c, base + '/get', 700);
    printSheet('<div class="postersheet"><h1>Get SafeGate on your phone</h1><p class="sub">' + esc(gateSchool || 'Campus') + ' · free for students</p><img src="' + c.toDataURL('image/png') + '" alt="QR code"><p class="big">Scan with your phone camera</p>' +
      '<ol><li>Scan the code</li><li>Tap <b>Install SafeGate</b></li><li>Open it from your home screen</li></ol><p class="small">No camera? Type <b>' + esc(base.replace(/^https?:\/\//, '')) + '/get</b> in your phone browser.<br>No phone? Ask the guard. The paper register always works.</p></div>');
  }
  var rcTimer = null;
  function mountRollCall(m) {
    if (rcTimer) clearInterval(rcTimer);
    m.innerHTML = '<h1>Roll call</h1><p class="muted">For a fire, flood, security threat or severe weather: ask every student to tap "I am safe". See who answered and who needs finding.</p><div id="rcOut"><p class="muted">Loading…</p></div>';
    loadRollCall(); rcTimer = setInterval(function () { if (tab !== 'rollcall') { clearInterval(rcTimer); rcTimer = null; return; } loadRollCall(true); }, 8000);
  }
  function loadRollCall(quiet) {
    api('rollCallStatus').then(function (r) {
      var el = $('#rcOut'); if (!el) return;
      if (quiet && el.contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
      var h = '';
      if (r && r.open) {
        var pct = r.total ? Math.round((r.safe + r.helpN) / r.total * 100) : 0;
        h += '<div class="card"><div class="row between"><b style="font-size:1.15rem">' + esc(r.title) + '</b><span class="small muted">started ' + esc(SG.ago(r.t)) + ' by ' + esc(r.by) + ' · ends ' + esc(SG.hm(r.exp)) + '</span></div>' +
          '<div style="height:12px;background:#0002;border-radius:6px;margin:10px 0;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:#1b873f"></div></div>' +
          '<div class="row" style="gap:18px;flex-wrap:wrap"><span>✅ <b>' + r.safe + '</b> safe</span><span style="color:#b3261e">🆘 <b>' + r.helpN + '</b> need help</span><span>❔ <b>' + r.silentN + '</b> not answered</span><span class="muted">of ' + r.total + '</span></div>' +
          '<div class="row" style="margin-top:10px"><button class="btn" data-rc-close="' + esc(r.id) + '">Close roll call</button></div></div>';
        if (r.helpN) h += '<h2 style="color:#b3261e">Need help (also on the Live board)</h2><div class="list">' + r.help.map(function (x) { return '<div class="item"><div><b>' + esc(x.name) + '</b><span class="small muted">' + tel(x.phone) + (x.note ? ' · ' + esc(x.note) : '') + (x.lat != null ? ' · <a href="' + mapLink(x.lat, x.lng) + '" target="_blank" rel="noopener">map</a>' : '') + '</span></div></div>'; }).join('') + '</div>';
        h += '<h2>Not answered yet</h2>' + (r.silentN ? '<div class="tablewrap"><table class="tbl"><thead><tr><th>Student</th><th>Phone</th><th>Outside?</th><th>Last opened app</th></tr></thead><tbody>' + r.silent.map(function (x) { return '<tr><td>' + esc(x.name) + '<div class="small muted">' + esc(x.matric) + '</div></td><td>' + tel(x.phone) + '</td><td>' + (x.outside ? '<span class="pill warn">Outside</span>' : 'On campus') + '</td><td class="small">' + (x.lastSeen ? esc(SG.ago(x.lastSeen)) : 'never') + '</td></tr>'; }).join('') + '</tbody></table></div>' + (r.silentN > r.silent.length ? '<p class="small muted">Showing the first ' + r.silent.length + '.</p>' : '') : '<p class="muted">Everyone has answered. 🎉</p>');
      } else {
        h += '<form data-form="rollcall" class="card" novalidate><label class="f" for="rc_t">What is happening?</label><select id="rc_t" name="title"><option>Fire alarm</option><option>Flood</option><option>Security threat</option><option>Severe weather</option><option>Power or gas emergency</option><option>Other emergency</option></select>' +
          '<label class="f" for="rc_x">Message to students<span class="hint">Optional</span></label><input id="rc_x" name="text" maxlength="200" placeholder="Move to the assembly ground and tap I am safe">' +
          '<label class="f" for="rc_m">Ask for how long (minutes)</label><input id="rc_m" name="minutes" type="number" value="30" min="5" max="240">' +
          '<label class="f" for="rc_s">Who</label><select id="rc_s" name="scope"><option value="all">Every registered student</option><option value="outside">Only students currently outside</option></select>' +
          '<label class="check"><input type="checkbox" name="sms" checked><span><b>Text students who have not answered after 5 minutes</b><br><span class="small muted">Needs texts switched on. They can reply SAFE.</span></span></label>' +
          '<div class="err-msg" id="rcErr" role="alert"></div><button class="btn danger" type="submit">🔔 Start roll call</button></form>';
        if (r) h += '<h2>Last roll call</h2><div class="card"><b>' + esc(r.title) + '</b> · ' + esc(SG.dt(r.t)) + '<div class="small muted">' + r.safe + ' safe, ' + r.helpN + ' needed help, ' + r.silentN + ' did not answer, of ' + r.total + '</div></div>';
      }
      el.innerHTML = h;
    }, fail);
  }
  document.addEventListener('submit', function (e) {
    var f = e.target.closest('form[data-form=rollcall]'); if (!f) return; e.preventDefault();
    var x = f.elements; if (!confirm('This sends an urgent alert to every student phone. Start the roll call?')) return;
    api('startRollCall', { title: x.title.value, text: x.text.value, minutes: +x.minutes.value, scope: x.scope.value, sms: x.sms.checked }).then(function () { SG.toast('Roll call started', 'ok'); loadRollCall(); }, function (er) { $('#rcErr').textContent = er.message; });
  });
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-rc-close]'); if (!b) return; if (!confirm('Close this roll call?')) return;
    api('closeRollCall', { id: b.getAttribute('data-rc-close') }).then(function () { loadRollCall(); }, fail);
  });
  /* ---------------------------------------------------------------- WALLET */
  function mountWallet(m) {
    m.innerHTML = '<h1>Wallet</h1><p class="muted">Prepaid credit for text messages. Emergencies are never blocked, even at zero.</p><div id="wOut"><p class="muted">Loading…</p></div>';
    api('walletSummary').then(function (w) {
      var el = $('#wOut'); if (!el) return; var c = w.currency, f = function (k) { var v = k / 100; return c + (v % 1 ? v.toFixed(2) : v.toLocaleString()); }, mx = Math.max.apply(null, w.series.concat([1]));
      el.innerHTML = (w.enabled ? '' : '<div class="note">Billing is switched off, so everything is free right now.</div>') +
        '<div class="card"><div class="small muted">Balance</div><div style="font-size:1.8rem;font-weight:800;' + (w.bal < w.lowAt ? 'color:#b3261e' : '') + '">' + f(w.bal) + '</div><div class="small muted">Texts cost ' + f(w.price) + ' each. Emergency reserve ' + f(w.reserve) + '.' + (w.daysLeft != null ? ' At the last 7 days\' pace this lasts ' + (w.daysLeft > 365 ? 'over a year' : 'about <b>' + w.daysLeft + ' days</b>') + '.' : '') + '</div></div>' +
        '<div class="card"><b>Spent</b> today ' + f(w.today) + ' · last 30 days ' + f(w.month) + '<div style="display:flex;align-items:flex-end;gap:4px;height:60px;margin-top:8px">' + w.series.map(function (v) { return '<div title="' + f(v) + '" style="flex:1;background:var(--pri,#0b5d7a);height:' + Math.max(3, Math.round(v / mx * 56)) + 'px;border-radius:3px"></div>'; }).join('') + '</div><div class="small muted">Last 7 days</div></div>' +
        '<div class="card"><b>Top up</b>' + (w.payOnline ? '<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:8px">' + [1000, 5000, 20000, 50000].map(function (n) { return '<button class="btn" data-top="' + n + '">' + c + n.toLocaleString() + '</button>'; }).join('') + '</div><div id="wErr" class="err-msg" role="alert"></div>' : '<p class="small muted">' + esc(w.instructions || 'Ask the SafeGate operator to add credit, then it appears here.') + '</p>') + '</div>' +
        '<h2>Recent</h2><div class="list">' + (w.recent.length ? w.recent.map(function (e) { return '<div class="item"><div><b>' + esc(e.type === 'debit' ? 'Text' + (e.st === 'refunded' ? ' (refunded)' : '') : e.type === 'refund' ? 'Refund, not delivered' : 'Credit') + '</b><span class="small muted">' + esc(SG.dt(e.t)) + '</span></div><b>' + (e.amt > 0 ? '+' : '') + f(e.amt) + '</b></div>'; }).join('') : '<p class="muted">Nothing yet.</p>') + '</div>';
      el.onclick = function (ev) { var b = ev.target.closest('[data-top]'); if (!b) return; b.disabled = true;
        fetch('/api/pay/init', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: TOKEN, naira: +b.getAttribute('data-top') }) }).then(function (r) { return r.json(); }).then(function (j) { if (j.result) location.href = j.result.url; else { b.disabled = false; $('#wErr').textContent = j.error ? j.error.message : 'Failed'; } }, function () { b.disabled = false; $('#wErr').textContent = 'Cannot reach payment service'; });
      };
    }, fail);
  }
  /* ---------------------------------------------------------------- SYSTEM HEALTH */
  function mountHealth(m) {
    m.innerHTML = '<h1>System health</h1><p class="muted">Is everything working? Items marked red need your attention.</p><div id="hOut"><p class="muted">Checking…</p></div>';
    loadHealth();
  }
  function loadHealth() {
    api('systemHealth').then(function (h) {
      var el = $('#hOut'); if (!el) return;
      var sv = h.server, now = h.time;
      function row(ok, label, detail, fix) { return '<tr><td style="width:28px">' + (ok === null ? '➖' : ok ? '✅' : '❌') + '</td><td><b>' + esc(label) + '</b><div class="small muted">' + esc(detail) + '</div>' + (!ok && ok !== null && fix ? '<div class="small" style="color:var(--bad)">' + esc(fix) + '</div>' : '') + '</td></tr>'; }
      var lastBk = sv && sv.backups && sv.backups[0];
      var rows = [
        row(h.campusSet, 'Campus position', h.campusSet ? 'Set' : 'Not set', 'Settings → Campus position. Without it the app cannot tell if a scan happened away from the gate.'),
        row(h.gateConfigured, 'Public address', h.gateConfigured ? 'Set (goes into the gate QR)' : 'Not set', 'Settings → Public address. The gate QR needs the https:// address students use.'),
        row(h.securityPhone, 'Security phone', h.securityPhone ? 'Students can call or text in an emergency' : 'Not set', 'Settings → Security phone.'),
        row(h.rosterSize > 0, 'School list', h.rosterSize ? h.rosterSize + ' students on the list' : 'Not uploaded', 'Upload the list in Settings so fake or mistyped matric numbers are refused.'),
        row(h.auditOk, 'Audit log', h.auditOk ? 'Intact: no entry has been altered' : 'An entry has been altered', 'Download a backup and investigate.'),
        row(h.pushEnabled && h.pushDevices.staff > 0, 'Phone alerts for officers', h.pushDevices.staff + ' officer device(s) registered; ' + h.pushDevices.students + ' student phone(s)', 'Open this desk on the officer phone, switch on "Alarm notifications" in the side panel.'),
        sv ? row(!!lastBk && now - lastBk.t < (sv.backupEveryHours * 2 + 1) * 3600e3, 'Automatic backups', lastBk ? 'Last copy ' + SG.ago(lastBk.t) + ' · every ' + sv.backupEveryHours + ' h · ' + sv.backups.length + ' kept' : 'None yet', 'Backups did not run. Check disk space on the server.') : row(null, 'Automatic backups', 'Only on the server'),
        sv ? row(sv.persistOk, 'Saving to disk', 'Data file ' + esc(sv.dataFile) + ' is ' + Math.round(sv.dataBytes / 1024) + ' KB', 'Saving is failing. Check disk space and permissions.') : ''
      ].join('');
      var stat = '<div class="cols2" style="margin-top:14px"><div class="card"><h3>Numbers</h3><table class="tbl"><tbody>' + [['Students registered', h.students], ['Movement records', h.events], ['Location points', h.pings], ['Audit entries', h.audit], ['Officer accounts', h.staff], ['Open alerts', h.alerts]].map(function (x) { return '<tr><td>' + x[0] + '</td><td><b>' + x[1] + '</b></td></tr>'; }).join('') + '</tbody></table></div>' +
        (sv ? '<div class="card"><h3>Server</h3><table class="tbl"><tbody>' + [['Running for', SG.dur(sv.uptimeSec * 1000)], ['Memory', sv.rssMB + ' MB'], ['Node', sv.node], ['Alerts sent / failed', sv.push.sent + ' / ' + sv.push.failed + (sv.push.lastError ? ' (last error ' + esc(sv.push.lastError) + ')' : '')]].map(function (x) { return '<tr><td>' + x[0] + '</td><td><b>' + x[1] + '</b></td></tr>'; }).join('') + '</tbody></table></div>' : '') + '</div>';
      var acts = '<div class="row" style="margin-top:14px"><button class="btn primary" data-act="hBackup">Back up now</button><button class="btn" data-act="hTest">Send a test alert to my phone</button><button class="btn" data-act="hRefresh">Refresh</button><button class="btn" data-act="drillGo">🧪 Run an emergency drill</button></div><div id="drillOut"></div>';
      var bl = sv && sv.backups.length ? '<h3 style="margin-top:18px">Saved copies on the server</h3><ul class="small">' + sv.backups.map(function (b) { return '<li>' + esc(b.name) + ' · ' + Math.round(b.bytes / 1024) + ' KB · ' + esc(SG.ago(b.t)) + '</li>'; }).join('') + '</ul>' : '';
      el.innerHTML = '<div class="card"><table class="tbl"><tbody>' + rows + '</tbody></table></div>' + stat + acts + bl + '<div id="smsOut"></div>';
      api('drillResults').then(function (l) { var d = $('#drillOut'); if (!d || !l.length) return; d.innerHTML = '<h3 style="margin-top:16px">Recent drills</h3><table class="tbl small"><thead><tr><th>Started</th><th>First response</th><th>Closed</th></tr></thead><tbody>' + l.slice(0, 6).map(function (x) { return '<tr><td>' + esc(SG.dt(x.t)) + ' by ' + esc(x.by) + '</td><td>' + (x.claimSec == null ? (x.open ? '<span class="pill warn">waiting</span>' : '<span class="pill bad">nobody responded</span>') : esc(x.claimedBy) + ' after <b>' + (x.claimSec < 90 ? x.claimSec + ' s' : Math.round(x.claimSec / 60) + ' min') + '</b>') + '</td><td>' + (x.closedSec == null ? '-' : Math.round(x.closedSec / 60) + ' min') + '</td></tr>'; }).join('') + '</tbody></table>'; }, function () {});
      api('smsStatus').then(function (x) {
        var so = $('#smsOut'); if (!so) return;
        so.innerHTML = '<h2 style="margin-top:20px">Text messages and phone alerts</h2><div class="card"><table class="tbl"><tbody>' +
          row(x.enabled && x.configured, 'Text messages', !x.enabled ? 'Switched off in Settings' : x.configured ? x.provider + ' connected · ' + x.sentToday + ' sent today (limit ' + x.cap + ')' : 'Switched on, but no text provider is set on the server', 'Set SMS_PROVIDER and the keys on the server (see DEPLOY.md), then restart.') +
          row(x.onCall > 0, 'Who gets emergency texts', x.onCall + ' number(s) (officers on call, plus the security phone)', 'Add phone numbers in Settings → Officers, and switch "My duty → on call".') +
          (sv ? row(sv.fcm, 'Phone-app alerts (Firebase)', sv.fcm ? 'Ready for the Android app' : 'Not set up (only needed for the native app)', 'Put fcm.json beside the data file. See native/README-NATIVE.md.') : '') +
          '</tbody></table><div class="small muted" style="margin-top:8px">Students can text <b>SAFEGATE SOS</b> to your security number when they have no internet. Point your text provider\'s incoming-message webhook to <code>https://YOUR-ADDRESS' + esc(x.inbound || '') + '</code> (keep it secret).</div>' +
          '<div class="row" style="margin-top:10px"><button class="btn" data-act="smsTest">Send a test text to my phone</button></div></div>' +
          (x.log.length ? '<h3 style="margin-top:14px">Last texts</h3><table class="tbl small"><thead><tr><th>When</th><th>To</th><th>Why</th><th>Result</th></tr></thead><tbody>' + x.log.slice(0, 15).map(function (m) { return '<tr><td>' + esc(SG.dt(m.t)) + '</td><td>' + esc(m.to) + '</td><td>' + esc(m.kind) + (m.matric ? ' · ' + esc(m.matric) : '') + '</td><td>' + (m.status === 'sent' ? '<span class="pill ok">sent</span>' : m.status === 'queued' ? '<span class="pill warn">sending</span>' : '<span class="pill bad">' + esc(m.status) + '</span> ' + esc(m.err || '')) + '</td></tr>'; }).join('') + '</tbody></table>' : '');
      }, function () {});
    }, fail);
  }
  /* ---------------------------------------------------------------- INBOX: exit passes + concern reports */
  function mountInbox(m) {
    m.innerHTML = '<h1>Inbox</h1><div id="inboxOut"><p class="muted">Loading…</p></div>'; loadInbox();
  }
  function loadInbox() {
    Promise.all([api('listPasses'), api('listReports'), api('listEscorts'), isGuard() ? Promise.resolve([]) : api('listTransfers'), isGuard() ? Promise.resolve([]) : api('listSos')]).then(function (r) {
      var el = $('#inboxOut'); if (!el) return;
      var ps = r[0], rs = r[1], es = r[2], trs = (r[3] || []).filter(function (x) { return x.status === 'pending'; });
      var trH = trs.map(function (x) {
        return '<div class="card" style="margin-bottom:10px;border-color:var(--warn)"><div class="row between"><b>New phone: ' + esc(x.name) + '</b><span class="pill warn">' + esc(SG.ago(x.t)) + '</span></div><div class="small muted">' + esc(x.matric) + ' · new number ' + tel(x.phone) + '</div>' +
          '<div class="small" style="margin-top:6px">On record: ' + esc(x.currentName || '?') + ' · ' + tel(x.currentPhone) + (x.emergency && x.emergency.phone ? ' · emergency ' + esc(x.emergency.name) + ' ' + tel(x.emergency.phone) : '') + '</div>' +
          '<div class="note warn small" style="margin-top:6px">Check the student\'s ID card, or call the number already on record, before approving. A wrong approval lets someone else sign in as this student.</div>' +
          '<div class="row" style="margin-top:8px"><button class="btn sm ok" data-act="trDo" data-m="' + esc(x.matric) + '" data-ok="1">Approve new phone</button><button class="btn sm" data-act="trDo" data-m="' + esc(x.matric) + '" data-ok="0">Refuse</button></div></div>'; }).join('');
      var escH = es.filter(function (x) { return x.status === 'open' || x.status === 'assigned'; }).map(function (x) {
        return '<div class="card" style="margin-bottom:10px"><div class="row between"><b>' + esc(x.name) + '</b><span class="pill ' + (x.status === 'open' ? 'bad' : 'ok') + '">' + (x.status === 'open' ? 'Waiting ' + esc(SG.dur(SG.now() - x.t)) : esc(x.by) + ' is escorting') + '</span></div>' +
          '<div class="small muted">' + esc(x.matric) + ' · ' + tel(x.phone) + '</div><div style="margin-top:6px">From <b>' + esc(x.from || 'their location') + '</b> to <b>' + esc(x.to) + '</b></div>' + (x.note ? '<div class="small">' + esc(x.note) + '</div>' : '') +
          (x.lat != null ? '<div class="small">📍 <a href="' + mapLink(x.lat, x.lng) + '" target="_blank" rel="noopener">Open on map</a></div>' : '') +
          '<div class="row" style="margin-top:8px">' + (x.status === 'open' ? '<button class="btn sm ok" data-act="escortDo" data-id="' + esc(x.id) + '" data-a="assign">I am escorting</button>' : '') + '<button class="btn sm primary" data-act="escortDo" data-id="' + esc(x.id) + '" data-a="done">Done</button><button class="btn sm" data-act="escortDo" data-id="' + esc(x.id) + '" data-a="cancel">Cancel</button></div></div>'; }).join('');
      var passH = ps.length ? ps.map(function (x) {
        var pill = x.status === 'pending' ? '<span class="pill warn">Waiting</span>' : x.status === 'approved' ? '<span class="pill ok">Approved by ' + esc(x.by) + '</span>' : '<span class="pill bad">Denied by ' + esc(x.by) + '</span>';
        return '<div class="card" style="margin-bottom:10px"><div class="row between"><b>' + esc(x.name) + '</b> ' + pill + '</div><div class="small muted">' + esc(x.matric) + ' · asked ' + esc(SG.ago(x.t)) + '</div>' +
          '<div style="margin-top:6px">Going to <b>' + esc(x.dest || 'not stated') + '</b>, back by <b>' + esc(SG.dt(x.until)) + '</b></div><div class="small">Reason: ' + esc(x.reason) + '</div>' + (x.decisionNote ? '<div class="small muted">Note: ' + esc(x.decisionNote) + '</div>' : '') +
          '<div class="row" style="margin-top:8px">' + (x.status !== 'approved' ? '<button class="btn sm ok" data-act="passDo" data-id="' + esc(x.id) + '" data-ok="1">Approve</button>' : '') + (x.status !== 'denied' ? '<button class="btn sm" data-act="passDo" data-id="' + esc(x.id) + '" data-ok="0">' + (x.status === 'approved' ? 'Revoke' : 'Deny') + '</button>' : '') + '<button class="btn sm" data-act="student" data-m="' + esc(x.matric) + '">Open student</button></div></div>';
      }).join('') : empty('No exit pass requests.');
      var repH = rs.length ? rs.map(function (x) {
        return '<div class="card" style="margin-bottom:10px"><div class="row between"><b>' + esc(x.label) + '</b><span>' + (x.urgency && x.urgency !== 'normal' ? '<span class="pill bad">' + esc(x.urgency) + '</span> ' : '') + '<span class="pill ' + (x.status === 'open' ? 'warn' : 'ok') + '">' + (x.status === 'open' ? (x.stage === 'dispatched' ? 'Help sent' : x.stage === 'handling' ? 'Being handled' : 'Open') : 'Closed') + '</span></span></div><div class="small muted">' + esc(x.ref || '') + (x.tags && x.tags.length ? ' · ' + esc(x.tags.join(', ')) : '') + (x.dupOf ? ' · may be the same event as an earlier report' : '') + '</div>' +
          '<div class="small muted">' + esc(x.name) + (x.matric ? ' · ' + esc(x.matric) + ' · ' + tel(x.phone) : ' (identity hidden by the student)') + ' · ' + esc(SG.ago(x.t)) + '</div><div style="margin-top:6px">' + esc(x.text) + '</div>' +
          (x.lat != null ? '<div class="small" style="margin-top:4px">📍 <a href="' + mapLink(x.lat, x.lng) + '" target="_blank" rel="noopener">Open on map</a></div>' : '') + (x.mediaN ? '<div style="margin-top:6px"><button class="btn sm primary" data-act="mediaView" data-type="report" data-id="' + esc(x.id) + '">🎞 View ' + x.mediaN + ' file' + (x.mediaN > 1 ? 's' : '') + '</button></div>' : '') + (x.hasEvidence ? '<div style="margin-top:6px"><button class="btn sm" data-act="repEvid" data-id="' + esc(x.id) + '">📷 View picture</button></div>' : '') +
          (x.notes.length ? '<ul class="small" style="margin:6px 0 0;padding-left:18px">' + x.notes.map(function (n) { return '<li>' + esc(n.text) + ' <span class="muted">(' + esc(n.by) + ', ' + esc(SG.hm(n.t)) + ')</span></li>'; }).join('') + '</ul>' : '') +
          '<div class="row" style="margin-top:8px">' + (x.status === 'open' && x.stage !== 'handling' && x.stage !== 'dispatched' ? '<button class="btn sm primary" data-act="repStage" data-id="' + esc(x.id) + '" data-stage="handling">👀 I am on it</button>' : '') + (x.status === 'open' && x.stage !== 'dispatched' ? '<button class="btn sm" data-act="repStage" data-id="' + esc(x.id) + '" data-stage="dispatched">🚑 Help is on the way</button>' : '') + '<button class="btn sm" data-act="repDo" data-id="' + esc(x.id) + '" data-close="0">Add note</button>' + (x.status === 'open' ? '<button class="btn sm primary" data-act="repDo" data-id="' + esc(x.id) + '" data-close="1">Close with note</button>' : '<button class="btn sm" data-act="repReopen" data-id="' + esc(x.id) + '">Reopen</button>') + '<button class="btn sm danger" data-act="repDel" data-id="' + esc(x.id) + '">🗑 Delete</button></div></div>';
      }).join('') : empty('No concern reports.');
      var sosH = (r[4] || []).length ? (r[4] || []).slice(0, 30).map(function (x) { return '<div class="card" style="margin-bottom:8px"><div class="row between"><b>🆘 ' + esc(x.name || x.matric) + '</b><span class="pill ' + (x.status === 'open' ? 'bad' : 'ok') + '">' + (x.status === 'open' ? 'Open' : x.status === 'resolved' ? 'Resolved' : 'Cancelled') + '</span></div><div class="small muted">' + esc(SG.dt(x.t)) + (x.closedBy ? ' · closed by ' + esc(x.closedBy) : '') + '</div>' + (x.status === 'open' ? '<div class="small muted" style="margin-top:6px">Resolve it from the Live tab before deleting.</div>' : '<div class="row" style="margin-top:8px"><button class="btn sm danger" data-act="sosDel" data-id="' + esc(x.id) + '">🗑 Delete</button></div>') + '</div>'; }).join('') : empty('No emergency alerts recorded.');
      el.innerHTML = (trH ? '<h2>Phone change requests</h2><div class="cols2"><div>' + trH + '</div></div>' : '') + (escH ? '<h2>Escort requests</h2><div class="cols2"><div>' + escH + '</div></div>' : '') + '<div class="cols2"><div><h2>Exit passes</h2>' + passH + '</div><div><h2>Concern reports</h2>' + repH + '</div></div>' + (isGuard() ? '' : '<h2>Emergency alert history</h2><p class="small muted">Deleted items wait 30 days in the Recycle bin, so a mistake can be undone.</p><div class="cols2"><div>' + sosH + '</div></div>');
    }, fail);
  }

  /* ---------------------------------------------------------------- MAP */
  var MAPSTATE = { m: null, data: null, cfg: null, at: 0, pick: null, tracked: {}, found: [] };
  var HZK = (SGCore.util.HAZARD_KINDS) || {};
  var TYPE_NAME = (window.SGMap && SGMap.TYPE_NAME) || {};
  function mountMap(m) {
    m.innerHTML = '<div class="row between"><h1 style="margin:0">Safety map</h1><span class="small muted" id="mapAt"></span></div><p class="muted small">Emergencies, open reports and escorts, safe points and risk areas. It does not show every student. To follow one student, search below and press Locate. You must give a reason, it is recorded, and the student can see it.</p>' +
      '<div class="cols2"><div><div id="deskMap"></div><div id="mapPick" class="note small hidden" style="margin-top:8px"></div></div><div id="mapSide"></div></div>';
    if (!window.SGMap) { $('#deskMap').innerHTML = empty('Map is not available.'); return; }
    MAPSTATE.m = SGMap.create($('#deskMap'), { label: 'Campus safety map' });
    MAPSTATE.m.onpick = function (kind, it) { mapDetail(kind, it); };
    MAPSTATE.m.onmap = function (pos) { MAPSTATE.pick = pos; var b = $('#mapPick'); if (!b) return; b.classList.remove('hidden'); b.innerHTML = 'Selected <b>' + pos.lat.toFixed(5) + ', ' + pos.lng.toFixed(5) + '</b> ' + (isAdmin() ? '<button class="btn sm primary" data-act="mapPoint" data-id="">+ Safe point here</button> <button class="btn sm" data-act="mapZone" data-id="">+ Risk area here</button> ' : '') + '<button class="btn sm' + (isAdmin() ? '' : ' primary') + '" data-act="hzAdd">+ Hazard here</button>'; };
    loadMap();
  }
  function loadMap() {
    if (!MAPSTATE.m) return;
    var ks = Object.keys(MAPSTATE.tracked), now = SG.now(), jobs = ks.map(function (k) {
      var x = MAPSTATE.tracked[k]; if (x.until < now) { delete MAPSTATE.tracked[k]; SG.toast('Location access for ' + x.name + ' ended', 'warn'); return Promise.resolve(); }
      return api('trail', { matric: k, hours: 4 }).then(function (t) { x.points = t.points; x.until = t.until; }, function () { delete MAPSTATE.tracked[k]; });
    });
    Promise.all([api('liveMap'), api('placeIdeas').then(function (x) { MAPSTATE.ideas = x.ideas; }, function () { MAPSTATE.ideas = []; }), MAPSTATE.cfg ? Promise.resolve(MAPSTATE.cfg) : SG.call('config'), Promise.all(jobs)]).then(function (r) {
      MAPSTATE.data = r[0]; MAPSTATE.cfg = r[2]; MAPSTATE.at = SG.now(); drawMap();
    }, fail);
  }
  function drawMap() {
    var d = MAPSTATE.data, m = MAPSTATE.m; if (!d || !m) return;
    var zones = d.riskZones.map(function (z) { return Object.assign({}, z, { active: zoneNow(z) }); });
    var trk = Object.keys(MAPSTATE.tracked).map(function (k) { return MAPSTATE.tracked[k]; }).filter(function (x) { return x.points && x.points.length; }), cols = ['#2b4a9a', '#7a2bb0', '#0a7a6a', '#b0501f'];
    m.update({ tiles: MAPSTATE.cfg && MAPSTATE.cfg.mapTiles || '', campus: d.campus && d.campus.lat != null ? d.campus : null, safe: d.safePoints, zones: zones, sos: d.sos, reports: d.reports, escorts: d.escorts, hotspots: d.hotspots, hazards: d.hazards, places: d.places,
      tracks: trk.map(function (x, i) { return { points: x.points, color: cols[i % cols.length] }; }), students: trk.map(function (x) { var l = x.points[x.points.length - 1]; return { matric: x.matric, name: x.name, lat: l.lat, lng: l.lng, t: l.t }; }),
      focus: (function () { var f = trk.length ? trk.map(function (x) { return x.points[x.points.length - 1]; }) : d.sos.length ? d.sos : d.reports.length ? d.reports : []; return f.length ? f.concat(U.nearestSafe(f[0].lat, f[0].lng, d.safePoints, 2)) : d.safePoints.slice(0, 4); })() });
    var at = $('#mapAt'); if (at) at.textContent = 'Updated ' + SG.hm(d.now);
    var h = '';
    if (d.sos.length) h += '<div class="note bad"><b>' + d.sos.length + ' emergency' + (d.sos.length > 1 ? ' alerts' : '') + ' with a location</b>' + d.sos.map(function (x) { return '<div style="margin-top:6px"><b>' + esc(x.name) + '</b> · ' + esc(SG.ago(x.t)) + ' · ' + esc(x.kind) + (x.message ? ' · ' + esc(x.message) : '') + '<br>' + tel(x.phone) + ' <button class="btn sm" data-act="openStudent" data-m="' + esc(x.matric) + '">Open student</button> <a class="btn sm" target="_blank" rel="noopener" href="' + mapLink(x.lat, x.lng) + '">Open map</a></div>'; }).join('') + '</div>';
    h += '<div id="mapSel"></div>' + locateHtml();
    var pendH = d.hazards.filter(function (x) { return !x.verified; });
    if (pendH.length) h += '<div class="note warn"><b>Hazards to confirm (' + pendH.length + ')</b>' + pendH.map(function (x) { return '<div style="margin-top:6px">' + esc(x.label) + ' · ' + esc(SG.ago(x.t)) + (x.note ? ' · ' + esc(x.note) : '') + ' <button class="btn sm ok" data-act="hzOk" data-id="' + esc(x.id) + '">Confirm</button> <button class="btn sm" data-act="hzNo" data-id="' + esc(x.id) + '">Dismiss</button></div>'; }).join('') + '<div class="small muted" style="margin-top:6px">Students only see a hazard after you confirm it or two students report it.</div></div>';
    var liveH = d.hazards.filter(function (x) { return x.verified; });
    h += '<h3>Hazards now (' + liveH.length + ')</h3>' + (liveH.length ? '<div class="list">' + liveH.map(function (x) { return '<div class="item"><div><b>' + (SGMap.HICON[x.kind] || '') + ' ' + esc(x.label) + '</b><span class="small muted">until ' + esc(SG.hm(x.until)) + (x.note ? ' · ' + esc(x.note) : '') + ' · ' + esc(x.by || 'staff') + '</span></div><button class="btn sm" data-act="hzNo" data-id="' + esc(x.id) + '">Clear</button></div>'; }).join('') + '</div>' : '<p class="small muted">None. Click the map, then "+ Hazard here" for a blocked road, flooding, no light, a trench and so on. Students can also report them.</p>');
    h += '<h3>Repeated problems (last 90 days)</h3>' + (d.hotspots.length ? '<div class="list">' + d.hotspots.map(function (x, i) { return '<div class="item"><div><b>' + x.count + ' × ' + esc(x.top) + '</b><span class="small muted">' + x.night + ' after 17:30 · last ' + esc(SG.ago(x.last)) + '</span><div class="small">' + esc(x.advice) + '</div></div>' + (isAdmin() && !x.marked ? '<button class="btn sm" data-act="mapHot" data-i="' + i + '">Mark as risk area</button>' : x.marked ? '<span class="pill ok">Marked</span>' : '') + '</div>'; }).join('') + '</div>' : '<p class="small muted">No repeated problems yet. When reports or emergencies with a location cluster in one place, they appear here.</p>');
    if (MAPSTATE.ideas && MAPSTATE.ideas.length) h += '<h3>Places students want to add (' + MAPSTATE.ideas.length + ')</h3><div class="list">' + MAPSTATE.ideas.map(function (x) { return '<div class="item"><div><b>' + esc(x.name) + '</b><span class="small muted">' + esc(x.kind) + (x.note ? ' · ' + esc(x.note) : '') + ' · ' + x.votes + ' student' + (x.votes > 1 ? 's' : '') + '</span></div><div class="row"><button class="btn sm primary" data-act="ideaOk" data-id="' + esc(x.id) + '">Approve</button><button class="btn sm" data-act="ideaNo" data-id="' + esc(x.id) + '">Reject</button></div></div>'; }).join('') + '</div>';
    h += '<h3>Safe points (' + d.safePoints.length + ')</h3>' + (d.safePoints.length ? '<div class="list">' + d.safePoints.map(function (x) { return '<div class="item"><div><b>' + (SGMap.ICON[x.type] || '') + ' ' + esc(x.name) + '</b><span class="small muted">' + esc(TYPE_NAME[x.type] || x.type) + (x.phone ? ' · ' + esc(x.phone) : '') + '</span></div>' + (isAdmin() ? '<button class="btn sm" data-act="mapPoint" data-id="' + esc(x.id) + '">Edit</button>' : '') + '</div>'; }).join('') + '</div>' : '<p class="small muted">None yet. Students see the campus gate only. ' + (isAdmin() ? 'Click the map, then "+ Safe point here". Mark the security post, clinic, police, lit shops and trusted places.' : 'Ask an administrator to add them.') + '</p>');
    h += '<h3>Risk areas (' + d.riskZones.length + ')</h3>' + (d.riskZones.length ? '<div class="list">' + d.riskZones.map(function (x) { return '<div class="item"><div><b>' + esc(x.name) + '</b><span class="small muted">' + x.radiusM + ' m' + (x.from ? ' · ' + esc(x.from) + '–' + esc(x.until) : ' · all day') + (x.reason ? ' · ' + esc(x.reason) : '') + '</span></div>' + (isAdmin() ? '<button class="btn sm" data-act="mapZone" data-id="' + esc(x.id) + '">Edit</button>' : '') + '</div>'; }).join('') + '</div>' : '<p class="small muted">None yet. Students are warned on their map when they are inside one.</p>');
    $('#mapSide').innerHTML = h;
  }
  function locateHtml() {
    var tr = Object.keys(MAPSTATE.tracked).map(function (k) { return MAPSTATE.tracked[k]; });
    return '<h3>Find a student</h3><form data-form="locq" class="row"><input type="search" name="q" placeholder="Name or matric number" aria-label="Find a student" class="grow" autocomplete="off"><button class="btn primary" type="submit">Search</button></form>' +
      (MAPSTATE.found.length ? '<div class="list" style="margin-top:6px">' + MAPSTATE.found.map(function (x) { return '<div class="item"><div><b>' + esc(x.name) + '</b><span class="small muted">' + esc(x.matric) + (x.outside ? ' · out now' : ' · on campus') + '</span></div><button class="btn sm primary" data-act="locate" data-m="' + esc(x.matric) + '">Locate</button></div>'; }).join('') + '</div>' : '') +
      (tr.length ? '<div class="note small" style="margin-top:8px"><b>Being followed on the map</b>' + tr.map(function (x) { var l = x.points && x.points.length ? x.points[x.points.length - 1] : null; return '<div style="margin-top:6px"><b>' + esc(x.name) + '</b> · ' + (l ? 'last point ' + esc(SG.ago(l.t)) + (l.acc != null ? ' (±' + l.acc + ' m)' : '') : 'no location received yet') + ' · access until ' + esc(SG.hm(x.until)) + ' ' + (l ? SGMap.glink(l.lat, l.lng, '🧭 Open in Google Maps') + ' ' + SGMap.glink(l.lat, l.lng, 'Directions to them', true, 'driving') + ' ' : '') + '<button class="btn sm" data-act="unlocate" data-m="' + esc(x.matric) + '">Stop</button></div>'; }).join('') + '<div class="small muted" style="margin-top:6px">A reason was recorded for each one and the student can see it.</div></div>' : '<p class="small muted">Searching never shows a location. Pressing Locate asks for a reason, which is recorded. Then the student appears here with their route, and updates every few seconds.</p>');
  }
  function trackStudent(t) {
    MAPSTATE.tracked[t.matric] = { matric: t.matric, name: t.name, points: t.points, until: t.until };
    if (!t.points.length) SG.toast('No location received from ' + t.name + ' yet. The phone may be off, offline, or location is not allowed. Try calling.', 'warn');
    MAPSTATE.found = []; drawMap();
  }
  function zoneNow(z) { if (!z.from || !z.until) return true; var mm = (((Math.floor(SG.now() / 60000) + (SG.tz || 0)) % 1440) + 1440) % 1440, f = z.from.split(':'), u = z.until.split(':'), a = +f[0] * 60 + +f[1], b = +u[0] * 60 + +u[1]; return a < b ? (mm >= a && mm < b) : (mm >= a || mm < b); }
  function mapDetail(kind, it) {
    var el = $('#mapSel'); if (!el) return; var h = '';
    if (kind === 'safe') h = '<div class="card"><b>' + esc(it.name) + '</b><div class="small muted">' + esc(TYPE_NAME[it.type] || '') + (it.note ? ' · ' + esc(it.note) : '') + '</div>' + (it.phone ? '<div>' + tel(it.phone) + '</div>' : '') + '' + SGMap.glink(it.lat, it.lng, '🧭 Google Maps', true, 'driving') + '</div>';
    else if (kind === 'sos') h = '<div class="card"><b>🆘 ' + esc(it.name) + '</b><div>' + tel(it.phone) + '</div><button class="btn sm primary" data-act="openStudent" data-m="' + esc(it.matric) + '">Open student</button>' + SGMap.glink(it.lat, it.lng, '🧭 Google Maps', true, 'driving') + '</div>';
    else if (kind === 'report') h = '<div class="card"><b>' + esc(it.label) + '</b> <span class="pill ' + (it.urgency === 'critical' ? 'bad' : 'warn') + '">' + esc(it.urgency) + '</span><div class="small muted">' + esc(it.ref) + ' · ' + esc(SG.ago(it.t)) + (it.anon ? ' · position blurred (anonymous)' : '') + '</div><button class="btn sm" data-act="goTab" data-tab="inbox">Open Inbox</button>' + SGMap.glink(it.lat, it.lng, '🧭 Google Maps', true, 'driving') + '</div>';
    else if (kind === 'student') h = '<div class="card"><b>👤 ' + esc(it.name) + '</b><div class="small muted">Last point ' + esc(SG.ago(it.t)) + '</div><button class="btn sm primary" data-act="openStudent" data-m="' + esc(it.matric) + '">Open student</button>' + SGMap.glink(it.lat, it.lng, '🧭 Google Maps', true, 'driving') + '</div>';
    else if (kind === 'hazard') h = '<div class="card"><b>' + esc(it.label) + '</b>' + (it.verified === false ? ' <span class="pill warn">Not confirmed</span>' : '') + '<div class="small muted">' + esc(it.note || '') + '</div>' + SGMap.glink(it.lat, it.lng, '🧭 Google Maps', true, 'driving') + '</div>';
    else if (kind === 'place') h = '<div class="card"><b>📍 ' + esc(it.name) + '</b>' + (it.danger ? ' <span class="pill bad">Danger zone</span>' : '') + '' + SGMap.glink(it.lat, it.lng, '🧭 Google Maps', true, 'driving') + '</div>';
    else if (kind === 'escort') h = '<div class="card"><b>Escort: ' + esc(it.name) + '</b><div class="small muted">to ' + esc(it.to) + '</div>' + SGMap.glink(it.lat, it.lng, '🧭 Google Maps', true, 'driving') + '</div>';
    el.innerHTML = h;
  }
  function pointForm(id) {
    var d = MAPSTATE.data, p = (d.safePoints.filter(function (x) { return x.id === id; })[0]) || { type: 'haven', name: '', phone: '', note: '', lat: MAPSTATE.pick ? MAPSTATE.pick.lat : '', lng: MAPSTATE.pick ? MAPSTATE.pick.lng : '' };
    modal('<h2>' + (id ? 'Edit safe point' : 'Add safe point') + '</h2><form data-form="safepoint" data-id="' + esc(id) + '"><label class="f">Name</label><input type="text" name="name" value="' + esc(p.name) + '" placeholder="Main gate security post" required><label class="f">Type</label><select name="type">' + Object.keys(TYPE_NAME).map(function (k) { return '<option value="' + k + '"' + (k === p.type ? ' selected' : '') + '>' + esc(TYPE_NAME[k]) + '</option>'; }).join('') + '</select>' +
      '<div class="row"><div class="grow"><label class="f">Latitude</label><input type="text" inputmode="decimal" name="lat" value="' + esc(p.lat) + '"></div><div class="grow"><label class="f">Longitude</label><input type="text" inputmode="decimal" name="lng" value="' + esc(p.lng) + '"></div></div><button type="button" class="btn sm" data-act="mapHere">📍 Use this device\'s location</button>' +
      '<label class="f">Phone (optional)</label><input type="tel" name="phone" value="' + esc(p.phone) + '"><label class="f">Note students see (optional)</label><input type="text" name="note" maxlength="160" value="' + esc(p.note) + '" placeholder="Open 24 hours"><div id="mapErr" class="err-msg" role="alert"></div><div class="row" style="margin-top:12px"><button class="btn primary grow" type="submit">Save</button>' + (id ? '<button class="btn" type="button" data-act="mapDelPoint" data-id="' + esc(id) + '">Delete</button>' : '') + '<button class="btn" type="button" data-act="close">Cancel</button></div></form>');
  }
  function hazardForm() {
    modal('<h2>Add hazard</h2><form data-form="hazard"><label class="f">What is wrong?</label><select name="kind">' + Object.keys(HZK).map(function (k) { return '<option value="' + k + '">' + esc(HZK[k]) + '</option>'; }).join('') + '</select>' +
      '<div class="row"><div class="grow"><label class="f">Latitude</label><input type="text" inputmode="decimal" name="lat" value="' + esc(MAPSTATE.pick ? MAPSTATE.pick.lat : '') + '"></div><div class="grow"><label class="f">Longitude</label><input type="text" inputmode="decimal" name="lng" value="' + esc(MAPSTATE.pick ? MAPSTATE.pick.lng : '') + '"></div></div><button type="button" class="btn sm" data-act="mapHere">📍 Use this device\'s location</button>' +
      '<div class="row"><div class="grow"><label class="f">Radius (metres)</label><input type="number" name="radius" min="15" max="1000" value="50"></div><div class="grow"><label class="f">Stays for (hours)</label><input type="number" name="hours" min="1" max="720" value="24"></div></div><label class="f">Note students see (optional)</label><input type="text" name="note" maxlength="120" placeholder="Water up to the knee. Use the main road."><div id="mapErr" class="err-msg" role="alert"></div><div class="row" style="margin-top:12px"><button class="btn primary grow" type="submit">Add hazard</button><button class="btn" type="button" data-act="close">Cancel</button></div></form>');
  }
  function zoneForm(id) {
    var d = MAPSTATE.data, z = (d.riskZones.filter(function (x) { return x.id === id; })[0]) || { name: '', reason: '', radiusM: 150, from: '', until: '', lat: MAPSTATE.pick ? MAPSTATE.pick.lat : '', lng: MAPSTATE.pick ? MAPSTATE.pick.lng : '' };
    modal('<h2>' + (id ? 'Edit risk area' : 'Add risk area') + '</h2><form data-form="riskzone" data-id="' + esc(id) + '"><label class="f">Name</label><input type="text" name="name" value="' + esc(z.name) + '" placeholder="Back road behind the market" required><label class="f">Why (students see this)</label><input type="text" name="reason" maxlength="120" value="' + esc(z.reason) + '" placeholder="Poor lighting after dark">' +
      '<div class="row"><div class="grow"><label class="f">Latitude</label><input type="text" inputmode="decimal" name="lat" value="' + esc(z.lat) + '"></div><div class="grow"><label class="f">Longitude</label><input type="text" inputmode="decimal" name="lng" value="' + esc(z.lng) + '"></div></div><button type="button" class="btn sm" data-act="mapHere">📍 Use this device\'s location</button>' +
      '<label class="f">Radius (metres)</label><input type="number" name="radius" min="30" max="3000" value="' + esc(z.radiusM) + '"><div class="row"><div class="grow"><label class="f">Active from (optional)</label><input type="time" name="from" value="' + esc(z.from) + '"></div><div class="grow"><label class="f">until</label><input type="time" name="until" value="' + esc(z.until) + '"></div></div><div class="small muted">Leave the times empty for all day.</div><div id="mapErr" class="err-msg" role="alert"></div><div class="row" style="margin-top:12px"><button class="btn primary grow" type="submit">Save</button>' + (id ? '<button class="btn" type="button" data-act="mapDelZone" data-id="' + esc(id) + '">Delete</button>' : '') + '<button class="btn" type="button" data-act="close">Cancel</button></div></form>');
  }

  /* ---------------------------------------------------------------- CASES (missing person) */
  var OUTCOME = { 'found-safe': 'Found safe', 'found-hurt': 'Found, needs medical care', 'false-alarm': 'False alarm', unresolved: 'Unresolved, handed to police / family' };
  function mountCases(m) {
    m.innerHTML = '<h1>Missing-person cases</h1><p class="muted">A student has not been heard from and people are worried. Open a case to keep every fact, call and note in one place. The last known facts are saved the moment you open it.</p>' +
      '<div class="cols2"><div><h2>Out for a long time</h2><div class="row small" style="margin-bottom:8px">Out for more than <select id="wfH" aria-label="Hours out"><option value="6">6 hours</option><option value="12" selected>12 hours</option><option value="24">24 hours</option><option value="48">48 hours</option></select></div><div id="wfOut"></div></div>' +
      '<div><form class="card" data-form="caseNew2" novalidate><h3>Open a case</h3><label class="f" for="cs_m">Matric number</label><input id="cs_m" type="text" name="matric" maxlength="24"><label class="f" for="cs_r">Why? (who is worried, since when)</label><textarea id="cs_r" name="reason" maxlength="200"></textarea><div class="err-msg" id="csErr" role="alert"></div><button class="btn primary" type="submit" style="margin-top:12px">Open case</button></form>' +
      '<h2 style="margin-top:18px">All cases</h2><div id="csOut"></div></div></div>';
    $('#wfH').addEventListener('change', loadCases); loadCases();
  }
  function loadCases() {
    var h = $('#wfH'); if (!h) return;
    Promise.all([api('welfare', { hours: +h.value }), api('listCases')]).then(function (r) {
      var w = r[0], cs = r[1], a = $('#wfOut'), b = $('#csOut'); if (!a || !b) return;
      a.innerHTML = w.length ? w.map(function (x) { return '<div class="card" style="margin-bottom:8px"><div class="row between"><b>' + esc(x.name) + '</b><span class="pill warn">Out ' + esc(SG.dur(SG.now() - x.since)) + '</span></div><div class="small muted">' + esc(x.matric) + ' · ' + esc(x.destination) + ' · last location ' + (x.lastPingT ? esc(SG.ago(x.lastPingT)) : 'never') + '</div><div class="row" style="margin-top:6px">' + (x.hasCase ? '<span class="pill ok">Case open</span>' : '<button class="btn sm primary" data-act="caseNew" data-m="' + esc(x.matric) + '">Open a case</button>') + contactBtns(x.phone, checkMsg(x.name)) + '</div></div>'; }).join('') : empty('Nobody has been out that long.');
      b.innerHTML = cs.length ? cs.map(function (c) { return '<div class="card" style="margin-bottom:8px"><div class="row between"><b>' + esc(c.name) + '</b><span class="pill ' + (c.status === 'open' ? 'bad' : 'ok') + '">' + (c.status === 'open' ? 'Open' : esc(OUTCOME[c.outcome] || 'Closed')) + '</span></div><div class="small muted">Opened ' + esc(SG.ago(c.openedAt)) + ' by ' + esc(c.openedBy) + '</div><div class="small">' + esc(c.reason) + '</div><button class="btn sm" style="margin-top:6px" data-act="openCase" data-id="' + esc(c.id) + '">Open case file</button></div>'; }).join('') : empty('No cases yet.');
    }, fail);
  }
  function openCaseFile(id) {
    api('caseDetail', { id: id }).then(function (c) {
      var sn = c.snapshot, ct = c.contacts, msg = checkMsg(c.name), open = c.status === 'open';
      modal('<div class="row between"><h2 style="margin:0">🧭 ' + esc(c.name) + '</h2><button class="btn sm ghost" data-act="close">✕ Close</button></div><div class="muted">' + esc(c.matric) + ' · case opened ' + esc(SG.dt(c.openedAt)) + ' by ' + esc(c.openedBy) + (open ? '' : ' · <b>' + esc(OUTCOME[c.outcome] || 'closed') + '</b>') + '</div>' +
        (c.now.outside === false && open && c.snapshot.outside ? '<div class="note ok" style="margin-top:8px"><b>The student has scanned back in.</b> Confirm they are safe, then close the case.</div>' : '') +
        '<h3>Last known</h3><ul style="margin:4px 0;padding-left:20px"><li>Last gate scan: ' + (sn.lastScan ? '<b>' + (sn.lastScan.type === 'out' ? 'OUT' : 'IN') + '</b> at ' + esc(SG.dt(sn.lastScan.t)) + ' (' + esc(sn.lastScan.source === 'paper' ? 'paper register' : 'QR') + ')' : 'none') + '</li>' +
        (sn.destination ? '<li>Said they were going to <b>' + esc(sn.destination) + '</b>' + (sn.expectedReturn ? ', back by ' + esc(SG.hm(sn.expectedReturn)) : '') + '</li>' : '') + (sn.companions ? '<li>Went with: ' + esc(sn.companions) + '</li>' : '') +
        '<li>Last app contact: ' + (sn.lastSeen ? esc(SG.ago(sn.lastSeen)) : 'never') + '</li><li>Last phone location: ' + (sn.lastPing ? '<a href="' + mapLink(sn.lastPing.lat, sn.lastPing.lng) + '" target="_blank" rel="noopener">' + sn.lastPing.lat.toFixed(5) + ', ' + sn.lastPing.lng.toFixed(5) + '</a> (' + esc(SG.dt(sn.lastPing.t)) + ')' + (sn.lastPing.battery != null ? ', battery ' + sn.lastPing.battery + '%' : '') : 'never received') + '</li>' +
        (sn.deviceChanged ? '<li>⚠ Registered again from a different phone</li>' : '') + '</ul>' +
        (c.live ? '<div class="note small">Newest location: <a href="' + mapLink(c.live.lat, c.live.lng) + '" target="_blank" rel="noopener">' + c.live.lat.toFixed(5) + ', ' + c.live.lng.toFixed(5) + '</a> (' + esc(SG.ago(c.live.t)) + ')</div>' : '') +
        '<h3>Who to call</h3><div class="stack"><div class="row between"><span>Student: ' + tel(ct.student) + '</span><span class="row">' + contactBtns(ct.student, msg) + '</span></div>' +
        (ct.emergency && ct.emergency.phone ? '<div class="row between"><span>Emergency contact (' + esc(ct.emergency.name) + '): ' + tel(ct.emergency.phone) + '</span><span class="row">' + contactBtns(ct.emergency.phone, msg) + '</span></div>' : '') +
        (ct.guardian ? '<div class="row between"><span>Guardian on file (' + esc(ct.guardian.name || '') + '): ' + tel(ct.guardian.phone) + '</span><span class="row">' + contactBtns(ct.guardian.phone, msg) + '</span></div>' : '') + (ct.hostel ? '<div class="small muted">Hostel: ' + esc(ct.hostel) + '. Ask roommates when they last saw them.</div>' : '') + '</div>' +
        '<h3>What has happened</h3><ul style="margin:4px 0;padding-left:20px">' + c.timeline.map(function (t) { return '<li' + (t.system ? ' class="muted"' : '') + '>' + esc(SG.dt(t.t)) + ' · ' + (t.system ? '' : '<b>' + esc(t.by) + '</b>: ') + esc(t.text) + '</li>'; }).join('') + '</ul>' +
        (open ? '<form data-form="caseNote" data-id="' + esc(c.id) + '" class="row" style="align-items:end" novalidate><div class="grow"><label class="f" style="margin-top:0">Add a note (who you called, what they said)</label><input type="text" name="text" maxlength="300"></div><button class="btn" type="submit">Add</button></form>' +
          '<details style="margin-top:10px"><summary class="small">Checklist</summary><ul class="small" style="padding-left:20px"><li>Call the student, then the emergency contact</li><li>Ask roommates, course-mates and the hostel porter</li><li>Check the last gate scan and the destination</li><li>Ask the destination or its neighbours if the student was seen</li><li>Open the location trail with a reason (already granted for 30 min)</li><li>After a few hours with no news, advise the family to inform the police and give them the information sheet</li></ul></details>' +
          '<div class="row" style="margin-top:12px"><button class="btn" data-act="casePrint" data-id="' + esc(c.id) + '">🖨 Print information sheet</button></div>' +
          '<form data-form="caseClose" data-id="' + esc(c.id) + '" class="card" style="margin-top:12px" novalidate><h3 style="margin-top:0">Close the case</h3><select name="outcome">' + Object.keys(OUTCOME).map(function (k) { return '<option value="' + k + '">' + OUTCOME[k] + '</option>'; }).join('') + '</select><input type="text" name="note" maxlength="300" placeholder="What happened?" style="margin-top:8px"><div class="err-msg" id="ccErr" role="alert"></div><button class="btn primary" type="submit" style="margin-top:10px">Close case</button></form>' : '<div class="row" style="margin-top:12px"><button class="btn" data-act="casePrint" data-id="' + esc(c.id) + '">🖨 Print case summary</button></div>'), true);
    }, fail);
  }
  function printCase(id) {
    api('caseDetail', { id: id }).then(function (c) {
      var sn = c.snapshot;
      printSheet('<h1 style="margin:0">' + esc(c.school) + '</h1><h2>Missing person information sheet</h2><p><b>Name:</b> ' + esc(c.name) + '<br><b>Matric number:</b> ' + esc(c.matric) + '<br><b>Phone:</b> ' + esc(c.contacts.student || '—') + (c.contacts.hostel ? '<br><b>Hostel:</b> ' + esc(c.contacts.hostel) : '') + '</p>' +
        '<h3>Last known</h3><ul><li>Last gate scan: ' + (sn.lastScan ? (sn.lastScan.type === 'out' ? 'went OUT' : 'came IN') + ' at ' + esc(SG.dt(sn.lastScan.t)) : 'none') + '</li>' + (sn.destination ? '<li>Said they were going to: ' + esc(sn.destination) + (sn.expectedReturn ? ', back by ' + esc(SG.hm(sn.expectedReturn)) : '') + '</li>' : '') + (sn.companions ? '<li>Went with: ' + esc(sn.companions) + '</li>' : '') +
        (sn.lastPing ? '<li>Last phone location: ' + sn.lastPing.lat.toFixed(5) + ', ' + sn.lastPing.lng.toFixed(5) + ' at ' + esc(SG.dt(sn.lastPing.t)) + '</li>' : '') + '</ul>' +
        '<h3>Case history</h3><ul>' + c.timeline.map(function (t) { return '<li>' + esc(SG.dt(t.t)) + ' ' + esc(t.text) + '</li>'; }).join('') + '</ul>' +
        '<p><b>Anyone with information, please call school security: ' + esc(c.securityPhone || '—') + '</b></p><p style="font-size:12px">Printed ' + esc(SG.dt(SG.now())) + ' by ' + esc(OFFICER) + '. Confidential. Give only to family, police and people helping to search.</p>');
    }, fail);
  }

  /* ---------------------------------------------------------------- VISITORS */
  function mountVisitors(m) {
    m.innerHTML = '<h1>Visitors</h1><div class="cols2"><form class="card" data-form="visitor" novalidate><h3>Sign a visitor in</h3><label class="f" for="vi_n">Full name</label><input id="vi_n" type="text" name="name" maxlength="80">' +
      '<div class="row"><div class="grow"><label class="f">Phone</label><input type="tel" name="phone" maxlength="24"></div><div class="grow"><label class="f">Badge number</label><input type="text" name="badge" maxlength="12"></div></div>' +
      '<div class="row"><div class="grow"><label class="f">ID shown</label><select name="idType"><option>National ID</option><option>Driver\'s licence</option><option>Voter\'s card</option><option>International passport</option><option>Student ID</option><option>None</option></select></div><div class="grow"><label class="f">ID number<span class="hint">Only the last 4 characters are kept</span></label><input type="text" name="idNo" maxlength="40" autocomplete="off"></div></div>' +
      '<label class="f">Purpose of visit</label><input type="text" name="purpose" maxlength="80"><div class="row"><div class="grow"><label class="f">Visiting (name)</label><input type="text" name="host" maxlength="80"></div><div class="grow"><label class="f">Student matric<span class="hint">If visiting a student, they are told</span></label><input type="text" name="hostMatric" maxlength="24"></div></div>' +
      '<div class="err-msg" id="viErr" role="alert"></div><button class="btn primary" type="submit" style="margin-top:12px">Sign in</button></form><div><h3 style="margin-top:0">Inside now</h3><div id="viIn"></div></div></div><h3 style="margin-top:22px">Recent visitors</h3><div id="viOut"></div>';
    loadVisitors();
  }
  function loadVisitors() {
    api('listVisitors').then(function (l) {
      var inside = l.filter(function (v) { return !v.outT; }), el = $('#viIn'); if (!el) return;
      el.innerHTML = inside.length ? inside.map(function (v) {
        var over = SG.now() - v.inT > ((settings && settings.visitorMaxHours) || 8) * 3600000;
        return '<div class="card" style="margin-bottom:8px"><div class="row between"><b>' + esc(v.name) + '</b>' + (v.badge ? '<span class="pill mute">Badge ' + esc(v.badge) + '</span>' : '') + (over ? '<span class="pill bad">Too long</span>' : '') + '</div><div class="small muted">In ' + esc(SG.hm(v.inT)) + ' (' + esc(SG.dur(SG.now() - v.inT)) + ') · ' + esc(v.purpose || 'no purpose given') + (v.host ? ' · visiting ' + esc(v.host) : '') + '</div><button class="btn sm primary" style="margin-top:8px" data-act="visitorOut" data-id="' + esc(v.id) + '">Sign out</button></div>'; }).join('') : empty('Nobody is inside.');
      $('#viOut').innerHTML = l.length ? '<div class="tablewrap"><table class="tbl"><thead><tr><th>Visitor</th><th>ID</th><th>Visiting</th><th>In</th><th>Out</th></tr></thead><tbody>' + l.slice(0, 80).map(function (v) {
        return '<tr><td><b>' + esc(v.name) + '</b><br><span class="small muted">' + esc(v.phone || '') + '</span></td><td class="small">' + esc(v.idType || '') + (v.idLast4 ? ' …' + esc(v.idLast4) : '') + '</td><td>' + esc(v.host || '—') + '<br><span class="small muted">' + esc(v.purpose || '') + '</span></td><td>' + esc(SG.dt(v.inT)) + '</td><td>' + (v.outT ? esc(SG.dt(v.outT)) : '<span class="pill warn">Inside</span>') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '';
    }, fail);
  }

  /* ---------------------------------------------------------------- NOTICES */
  function mountNotices(m) {
    m.innerHTML = '<h1>Notices to students</h1><form class="card" data-form="notice" style="max-width:680px"><label class="f" for="nt_t">Title</label><input id="nt_t" type="text" name="title" maxlength="80" placeholder="e.g. Main gate closes at 9 PM tonight">' +
      '<label class="f" for="nt_x">Message (optional)</label><textarea id="nt_x" name="text" maxlength="400"></textarea><div class="row"><div class="grow"><label class="f">Importance</label><select name="level"><option value="info">Normal</option><option value="urgent">Urgent (shown in red)</option></select></div>' +
      '<div class="grow"><label class="f">Show for</label><select name="hours"><option value="2">2 hours</option><option value="24" selected>1 day</option><option value="72">3 days</option><option value="168">1 week</option></select></div></div><div class="err-msg" id="nterr" role="alert"></div><button class="btn primary" type="submit" style="margin-top:12px">Send to all students</button></form>' +
      '<h2 style="margin-top:22px">Sent notices</h2><div id="ntOut"></div>'; loadNotices();
  }
  function loadNotices() {
    api('listNotices').then(function (l) {
      var el = $('#ntOut'); if (!el) return;
      el.innerHTML = l.length ? l.map(function (n) {
        return '<div class="card" style="margin-bottom:10px;max-width:680px"><div class="row between"><b>' + (n.level === 'urgent' ? '🔴 ' : '') + esc(n.title) + '</b>' + (n.active ? '<span class="pill ok">Showing</span>' : '<span class="pill mute">Expired</span>') + '</div>' + (n.text ? '<div class="small">' + esc(n.text) + '</div>' : '') +
          '<div class="small muted">By ' + esc(n.by) + ', ' + esc(SG.dt(n.t)) + ' · read by ' + n.acks + ' of ' + n.total + ' students</div>' + (isAdmin() ? '<button class="btn sm" style="margin-top:8px" data-act="ntDel" data-id="' + esc(n.id) + '">Delete</button>' : '') + '</div>';
      }).join('') : empty('Nothing sent yet.');
    }, fail);
  }

  /* ---------------------------------------------------------------- SHIFT LOG + DAILY REPORT */
  function mountShift(m) {
    m.innerHTML = '<h1>Shift log and reports</h1><div class="cols2"><div><form class="card" data-form="note"><h3>Handover note</h3><p class="small muted">Write what the next officer should know: broken gate lamp, a student to watch, a visitor at the gate.</p><textarea name="text" maxlength="300" aria-label="Note"></textarea><div class="row"><input type="text" name="matric" placeholder="Matric number (optional)" style="max-width:220px"><button class="btn primary" type="submit">Add note</button></div><div class="err-msg" id="noteerr" role="alert"></div></form>' +
      '<h3 style="margin-top:16px">Recent notes</h3><div id="noteOut"></div></div><div><div class="card no-print"><h3>Daily report and roll call</h3><div class="row"><input type="date" id="repDate" aria-label="Report date" style="max-width:190px"><button class="btn" data-act="repLoad">Show</button><button class="btn primary" data-act="repPrint">🖨 Print</button></div></div></div></div><div id="dailyOut" style="margin-top:14px"></div>';
    var d = $('#repDate'); if (d) d.value = U.fmtLocal(SG.now(), SG.tz).slice(0, 10);
    loadNotes(); loadDaily();
  }
  function loadNotes() {
    api('listNotes').then(function (l) {
      var el = $('#noteOut'); if (!el) return;
      el.innerHTML = l.length ? l.map(function (n) { return '<div class="card" style="margin-bottom:8px"><div class="small muted">' + esc(SG.dt(n.t)) + ' · ' + esc(n.by) + (n.matric ? ' · re ' + esc(n.matric) : '') + '</div>' + esc(n.text) + '</div>'; }).join('') : empty('No notes yet.');
    }, fail);
  }
  function loadDaily() {
    var d = $('#repDate'); api('dailyReport', { date: d ? d.value : '' }).then(function (r) {
      var el = $('#dailyOut'); if (!el) return;
      function lst(a, f, none) { return a.length ? '<ul style="margin:4px 0;padding-left:20px">' + a.map(function (x) { return '<li>' + f(x) + '</li>'; }).join('') + '</ul>' : '<p class="small muted">' + none + '</p>'; }
      el.innerHTML = '<div class="card" id="reportSheet"><h2 style="margin-top:0">' + esc(r.school) + ': daily security report</h2><p class="muted">Date ' + esc(r.date) + ' · prepared ' + esc(SG.dt(r.generatedAt)) + ' by ' + esc(OFFICER) + '</p>' +
        '<div class="stats"><div class="stat"><span class="muted small">Exits</span><b>' + r.outs + '</b></div><div class="stat"><span class="muted small">Returns</span><b>' + r.ins + '</b></div><div class="stat"><span class="muted small">Flagged exits</span><b>' + r.flagged + '</b></div><div class="stat"><span class="muted small">Safe walks</span><b>' + r.walks + '</b></div><div class="stat ' + (r.sos.length ? 'bad' : '') + '"><span class="muted small">SOS</span><b>' + r.sos.length + '</b></div></div>' +
        '<h3>Still outside (roll call)</h3>' + (r.outsideNow.length ? '<div class="tablewrap"><table class="tbl"><thead><tr><th>Student</th><th>Destination</th><th>Left</th><th>Back by</th><th>Phone</th><th>Emergency contact</th></tr></thead><tbody>' + r.outsideNow.map(function (x) { return '<tr><td><b>' + esc(x.name) + '</b><br><span class="small">' + esc(x.matric) + '</span></td><td>' + esc(x.destination) + '</td><td>' + esc(SG.dt(x.since)) + '</td><td>' + (x.expectedReturn ? esc(SG.hm(x.expectedReturn)) : '—') + '</td><td>' + esc(x.phone || '—') + '</td><td>' + esc(x.emergency && x.emergency.name ? x.emergency.name + ' ' + (x.emergency.phone || '') : '—') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="small muted">Everyone is inside.</p>') +
        '<h3>Where students went</h3>' + lst(r.destinations, function (x) { return esc(x.name) + ': ' + x.n; }, 'No trips.') +
        '<h3>Late returns</h3>' + lst(r.lateReturns, function (x) { return esc(x.name) + ' (' + esc(x.matric) + '), ' + x.minutes + ' min late'; }, 'None.') +
        '<h3>Emergencies</h3>' + lst(r.sos, function (x) { return esc(x.name) + ' at ' + esc(SG.hm(x.t)); }, 'None.') +
        '<h3>Concern reports</h3>' + lst(r.reports, function (x) { return esc(x.label) + ' by ' + esc(x.name) + ' at ' + esc(SG.hm(x.t)) + ' (' + esc(x.status) + ')'; }, 'None.') +
        '<h3>Exit passes</h3><p>' + r.passes.requested + ' asked, ' + r.passes.approved + ' approved, ' + r.passes.denied + ' denied.</p>' +
        '<h3>Officer notes</h3>' + lst(r.notes, function (x) { return esc(SG.hm(x.t)) + ' ' + esc(x.by) + ': ' + esc(x.text); }, 'None.') + '<p class="small muted" style="margin-top:24px">Signed: ____________________ &nbsp;&nbsp; Date: ____________</p></div>';
    }, fail);
  }

  /* ---------------------------------------------------------------- ANALYTICS */
  function mountAnalytics(m) {
    m.innerHTML = '<div class="row between"><h1 style="margin:0">Analytics</h1><div class="chips" id="anDays" role="radiogroup" aria-label="Period">' + [7, 14, 30, 90].map(function (d) { return '<label class="chip"><input type="radio" name="d" value="' + d + '"' + (d === anDays ? ' checked' : '') + '><span>' + d + ' days</span></label>'; }).join('') + '</div><button class="btn primary no-print" data-act="brief">📄 Safety Brief</button></div><div id="anOut" style="margin-top:14px"><p class="muted">Loading…</p></div>';
    $('#anDays').addEventListener('change', function (e) { anDays = +e.target.value; loadAnalytics(); });
    loadAnalytics();
  }
  function loadAnalytics() { api('analytics', { days: anDays }).then(drawAnalytics, fail); }
  function fmtMin(m) { return m == null ? '—' : m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60 ? (m % 60) + ' min' : ''); }
  function barSvg(vals, labels, hi, step, label) {
    var W = 720, H = 190, padB = 26, padT = 18, n = vals.length, bw = W / n, max = Math.max(1, Math.max.apply(null, vals)), o = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(label) + '">';
    o += '<line x1="0" x2="' + W + '" y1="' + (H - padB) + '" y2="' + (H - padB) + '" style="stroke:var(--line)"/>';
    vals.forEach(function (v, i) {
      var h = (H - padB - padT) * v / max, x = i * bw + bw * 0.14, y = H - padB - h;
      o += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + (bw * 0.72).toFixed(1) + '" height="' + Math.max(h, v ? 2 : 0).toFixed(1) + '" rx="3" style="fill:' + (i === hi ? 'var(--warn)' : 'var(--brand)') + '"><title>' + esc(labels[i]) + ': ' + v + '</title></rect>';
      if (v && n <= 31) o += '<text x="' + (x + bw * 0.36).toFixed(1) + '" y="' + (y - 4).toFixed(1) + '" text-anchor="middle">' + v + '</text>';
      if (i % step === 0) o += '<text x="' + (x + bw * 0.36).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" style="opacity:.7">' + esc(labels[i]) + '</text>';
    });
    return o + '</svg>';
  }
  function hbars(list, total, color) {
    if (!list.length) return '<p class="small muted">Nothing yet.</p>';
    var max = Math.max.apply(null, list.map(function (x) { return x.n; }));
    return '<div class="bars">' + list.map(function (x) { return '<div class="hbar"><span title="' + esc(x.name) + '" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(x.name) + '</span><span><i style="width:' + Math.max(3, Math.round(100 * x.n / max)) + '%;background:' + (color || 'var(--brand)') + '"></i></span><b>' + x.n + '</b></div>'; }).join('') + '</div>';
  }
  function drawAnalytics(a) {
    var el = $('#anOut'); if (!el) return;
    if (!a.outs) { el.innerHTML = '<div class="note">No trips recorded in the last ' + a.days + ' days yet. Charts appear as students start scanning.</div>'; return; }
    var resp = a.onTime + a.late, pct = resp ? Math.round(100 * a.onTime / resp) : null, typedN = 0; (a.destinations.filter(function (d) { return d.name.indexOf('Somewhere else') === 0; })).forEach(function (d) { typedN += d.n; });
    var unver = (a.sources['no-scan'] || 0) + (a.flags.filter(function (f) { return f.name === 'gate-invalid' || f.name === 'gate-stale'; }).reduce(function (t, f) { return t + f.n; }, 0));
    var sf = a.safety || { reportsByKind: [], hotspots: [] };
    var tiles = [['Trips out', a.outs], ['Students', a.students], ['Typical time out', fmtMin(a.medianDurMin)], ['Back on time', pct == null ? '—' : pct + '%'], ['SOS alerts', a.sos], ['First response to SOS', a.response && a.response.medianClaimSec != null ? (a.response.medianClaimSec < 90 ? a.response.medianClaimSec + ' s' : Math.round(a.response.medianClaimSec / 60) + ' min') : '—'], ['Safe walks', a.walks], ['Escort requests', sf.escorts || 0], ['Avg escort wait', fmtMin(sf.escortAvgWaitMin)], ['Visitors', sf.visitors || 0]];
    var ins = [];
    if (a.peakHour != null) ins.push('Busiest time to leave: <b>' + String(a.peakHour).padStart(2, '0') + ':00 – ' + String((a.peakHour + 1) % 24).padStart(2, '0') + ':00</b>. Make sure the gate desk is fully staffed then.');
    if (pct != null) ins.push('<b>' + pct + '%</b> of returns were on time' + (a.late ? '; late students were on average <b>' + fmtMin(a.avgLateMin) + '</b> late.' : '.'));
    if (a.p90DurMin != null) ins.push('9 in 10 trips last under <b>' + fmtMin(a.p90DurMin) + '</b>, so trips much longer than that deserve a closer look.');
    if (typedN) ins.push('<b>' + typedN + '</b> trip(s) (' + Math.round(100 * typedN / a.outs) + '%) went to “somewhere else”. Add the common ones below as Places so students get a safety tip and the system can check they arrived.');
    if (unver) ins.push('<b>' + unver + '</b> exit(s) were not verified at the gate (no scan or an old/invalid code).');
    var oc = a.flags.filter(function (f) { return f.name === 'away-from-gate'; })[0]; if (oc) ins.push('<b>' + oc.n + '</b> scan(s) were made far from the gate. That can mean a shared or photographed QR code.');
    el.innerHTML = '<div class="stats">' + tiles.map(function (t) { return '<div class="stat"><span class="muted small">' + t[0] + '</span><b style="font-size:1.5rem">' + esc(t[1]) + '</b></div>'; }).join('') + '</div>' +
      '<div class="card" style="margin-bottom:14px"><h3>What this tells you</h3><ul style="margin:6px 0;padding-left:20px">' + ins.map(function (i) { return '<li>' + i + '</li>'; }).join('') + '</ul></div>' +
      '<div class="cols2"><div class="card"><h3>Trips per day</h3>' + barSvg(a.perDay.map(function (d) { return d.n; }), a.perDay.map(function (d) { return d.day.slice(5); }), -1, Math.ceil(a.perDay.length / 8), 'Trips per day') + '</div>' +
      '<div class="card"><h3>When students leave (hour of day)</h3>' + barSvg(a.hours, a.hours.map(function (h, i) { return String(i).padStart(2, '0'); }), a.peakHour, 3, 'Departures by hour') + '</div></div>' +
      '<div class="cols2" style="margin-top:14px"><div class="card"><h3>Where students go</h3>' + hbars(a.destinations) + '</div>' +
      '<div class="card"><h3>Typed “somewhere else” places</h3>' + (a.typed.length ? '<div class="stack">' + a.typed.map(function (t) { return '<div class="row between"><span>' + esc(t.name) + ' <span class="muted small">× ' + t.n + '</span></span>' + (isAdmin() ? '<button class="btn sm" data-act="addPlaceFrom" data-name="' + esc(t.name) + '">Add as place</button>' : '') + '</div>'; }).join('') + '</div>' : '<p class="small muted">None. Everyone picked a listed place.</p>') + '</div></div>' +
      '<div class="cols2" style="margin-top:14px"><div class="card"><h3>How exits were recorded</h3>' + hbars([{ name: 'QR scan', n: a.sources.qr || 0 }, { name: 'Paper register', n: a.sources.paper || 0 }, { name: 'No scan', n: a.sources['no-scan'] || 0 }]) + '</div>' +
      '<div class="card"><h3>Often late back</h3>' + (a.repeatLate && a.repeatLate.length ? '<div class="stack">' + a.repeatLate.map(function (x) { return '<div class="row between"><span>' + esc(x.name) + ' <span class="muted small">' + esc(x.matric) + '</span></span><span class="pill warn">' + x.n + ' late returns</span></div>'; }).join('') + '</div>' : '<p class="small muted">Nobody was late more than once.</p>') + '</div><div class="card"><h3>Things to check</h3>' + hbars(a.flags.map(function (f) { return { name: (FLAG[f.name] || [f.name])[0], n: f.n }; }), 0, 'var(--warn)') + '</div></div>' +
      '<div class="cols2" style="margin-top:14px"><div class="card"><h3>Concern reports by kind</h3>' + hbars(sf.reportsByKind, 0, 'var(--warn)') + '</div><div class="card"><h3>Safety hotspots</h3><p class="small muted">Places where emergencies, concern reports and escort requests keep coming from. Consider lighting, patrols or a gate post there.</p>' + (sf.hotspots.length ? '<div class="stack">' + sf.hotspots.map(function (h) { return '<div class="row between"><span><a href="' + mapLink(h.lat, h.lng) + '" target="_blank" rel="noopener">' + h.lat.toFixed(3) + ', ' + h.lng.toFixed(3) + '</a> <span class="muted small">' + esc(h.kinds.join(', ')) + '</span></span><span class="pill ' + (h.n >= 3 ? 'bad' : 'warn') + '">' + h.n + ' incident' + (h.n > 1 ? 's' : '') + '</span></div>'; }).join('') + '</div>' : '<p class="small muted">No located incidents in this period.</p>') + '</div></div>';
  }

  /* ---------------------------------------------------------------- SAFETY BRIEF (one printable page, no student names) */
  function briefHtml(b) {
    var c = b.cur, p = b.prev, fd = function (t) { return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); };
    function dl(a, o, goodUp) { if (a == null || o == null) return '<span class="small">no earlier data</span>'; var d = a - o; if (!d) return '<span class="small">same as before</span>'; var good = goodUp ? d > 0 : d < 0; return '<span class="small" style="color:' + (good ? '#0a7a3b' : '#b3261e') + '">' + (d > 0 ? '▲ ' : '▼ ') + Math.abs(d) + ' vs before</span>'; }
    var tile = function (l, v, d) { return '<div style="border:1px solid #bbb;border-radius:8px;padding:8px 10px"><div class="small" style="color:#555">' + l + '</div><div style="font-size:20pt;font-weight:700">' + v + '</div>' + d + '</div>'; };
    var sec = function (n) { return n == null ? '—' : n < 90 ? n + ' sec' : Math.round(n / 6) / 10 + ' min'; }, mn = function (n) { return n == null ? '—' : n < 120 ? n + ' min' : Math.round(n / 6) / 10 + ' h'; };
    var gl = function (h) { return '<a href="https://www.google.com/maps?q=' + h.lat + ',' + h.lng + '" target="_blank" rel="noopener">' + h.lat + ', ' + h.lng + '</a> (' + h.n + ')'; };
    return '<div class="tracesheet"><h1>' + esc(b.school) + ' · Student Safety Brief</h1><p class="small">' + fd(b.from) + ' to ' + fd(b.to) + ' (' + b.days + ' days), compared with the ' + b.days + ' days before. Contains no student names.</p>' +
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0">' +
      tile('Trips out of school', c.trips, dl(c.trips, p.trips, true)) + tile('Different students', c.students, dl(c.students, p.students, true)) + tile('Back on time', c.onTimePct == null ? '—' : c.onTimePct + '%', dl(c.onTimePct, p.onTimePct, true)) +
      tile('Emergency alerts', c.sos, dl(c.sos, p.sos, false)) + tile('First response', sec(c.medianClaimSec), '<span class="small">typical time to an officer</span>') + tile('Concern reports', c.reports, dl(c.reports, p.reports, false)) +
      tile('Reports closed', c.reports ? Math.round(100 * c.reportsClosed / c.reports) + '%' : '—', '<span class="small">first reply: ' + mn(c.medianReplyMin) + '</span>') + tile('Exits not verified', c.trips ? Math.round(100 * c.unverified / c.trips) + '%' : '—', dl(c.unverified, p.unverified, false)) + tile('Escort requests', c.escorts, dl(c.escorts, p.escorts, false)) + '</div>' +
      '<h2 style="font-size:13pt;margin:12px 0 4px">Needs attention</h2>' + (b.attention.length ? '<ul>' + b.attention.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '<p>Nothing urgent. Response times and returns are within healthy ranges.</p>') +
      (c.hotspots.length ? '<h2 style="font-size:13pt;margin:12px 0 4px">Where alerts and reports cluster</h2><p class="small">' + c.hotspots.map(gl).join(' · ') + '</p>' : '') +
      '<p class="small">Evidence files received: ' + c.files + ' (deleted automatically after ' + (b.retentionDays || 30) + ' days). Prepared ' + new Date(b.generatedAt).toLocaleString() + ' by SafeGate · Powered by ResultFlow.</p></div>';
  }

  /* ---------------------------------------------------------------- AUDIT */
  var AUD = { import_roster: 'Imported school list', clear_roster: 'Deleted school list', open_case: 'Opened missing-person case', close_case: 'Closed missing-person case', visitor_in: 'Visitor signed in', escort_assign: 'Escort assigned', escort_done: 'Escort completed', escort_cancel: 'Escort cancelled', student_export: 'Student downloaded own data', student_erase_location: 'Student erased own location history', post_notice: 'Sent notice', approve_pass: 'Approved exit pass', deny_pass: 'Denied exit pass', update_report: 'Updated concern report', delete_notice: 'Deleted notice', ask_checkin: 'Asked to check in', claim_alert: 'Responding to alert', add_staff: 'Added officer', reset_pin: 'Reset officer PIN', disable_staff: 'Disabled officer', enable_staff: 'Enabled officer', backup: 'Downloaded backup', restore: 'Restored backup', login: 'Signed in', login_failed: 'Wrong PIN', lockout: 'Locked out', trail_access: 'Viewed location', view_profile: 'Opened student', manual_log: 'Paper entry', resolve_alert: 'Handled alert', export: 'Exported CSV', save_settings: 'Changed settings', save_place: 'Saved place', delete_place: 'Deleted place', change_pin: 'Changed PIN', device_change: 'Device changed', transfer_request: 'New phone asked to take over', transfer_approve: 'Approved new phone', transfer_deny: 'Refused new phone', transfer_code: 'Student made phone-transfer code', device_transfer: 'Student moved to a new phone', setup: 'Desk created' };
  function mountAudit(m) {
    m.innerHTML = '<h1>Audit log</h1><p class="muted">Everything officers do with student data. Each entry is sealed with the one before it, so any edit or deletion is detected.</p><div class="row" style="margin-bottom:12px"><button class="btn" data-act="verify">🔒 Check log integrity</button><span id="verOut"></span></div><div id="audOut" class="tablewrap"></div>';
    api('auditLog').then(function (l) {
      $('#audOut').innerHTML = '<table class="tbl"><thead><tr><th>Time</th><th>Officer</th><th>Action</th><th>Student / target</th><th>Reason</th></tr></thead><tbody>' + l.map(function (a) {
        return '<tr><td>' + esc(SG.dt(a.t)) + '</td><td>' + esc(a.officer) + '</td><td>' + esc(AUD[a.action] || a.action) + '</td><td>' + esc(a.target) + '</td><td>' + esc(a.reason || a.detail) + '</td></tr>'; }).join('') + '</tbody></table>';
    }, fail);
  }

  /* ---------------------------------------------------------------- events */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-tab],[data-act]'); if (!t) return;
    if (t.hasAttribute('data-tab')) { setTab(t.getAttribute('data-tab')); return; }
    var act = t.getAttribute('data-act');
    if (t.tagName === 'A') e.preventDefault();
    switch (act) {
      case 'close': closeModal(); break;
      case 'logout': api('logout').catch(function () {}).then(function () { signedOut('Signed out.'); }); break;
      case 'student': openStudent(t.getAttribute('data-m')); break;
      case 'trail':
        if (t.getAttribute('data-grant') === '1') api('trail', { matric: t.getAttribute('data-m'), hours: 12 }).then(showTrail, function (er) { if (er.code === 'no-grant') askReason(t.getAttribute('data-m')); else fail(er); });
        else askReason(t.getAttribute('data-m'));
        break;
      case 'resolve':
        var key = t.getAttribute('data-key');
        modal('<h2>Mark as handled</h2><form data-form="resolve" data-key="' + esc(key) + '"><label class="f" for="rv_n">What was done?</label><input id="rv_n" type="text" name="note" maxlength="150" placeholder="e.g. Student reached, safe in hostel"><div class="row" style="margin-top:14px"><button class="btn primary" type="submit">Save</button><button class="btn" type="button" data-act="close">Cancel</button></div></form>');
        break;
      case 'fs': var el = $('#gateBox'); if (el && el.requestFullscreen) el.requestFullscreen().catch(function () {}); break;
      case 'csv': downloadCsv(); break;
      case 'openCase': closeModal(); openCaseFile(t.getAttribute('data-id')); break;
      case 'casePrint': printCase(t.getAttribute('data-id')); break;
      case 'caseNew': { var cm = t.getAttribute('data-m'), cr = prompt('Why are you opening a missing-person case? (who is worried, since when)'); if (!cr) break; api('openCase', { matric: cm, reason: cr }).then(function (r) { closeModal(); SG.toast('Case opened. Location access granted for 30 minutes.', 'ok'); poll(); if (tab === 'cases') loadCases(); openCaseFile(r.id); }, fail); break; }
      case 'rosterMissing': api('rosterMissing', {}).then(function (l) {
        modal('<div class="row between"><h2 style="margin:0">Not registered yet (' + l.length + (l.length >= 300 ? '+' : '') + ')</h2><button class="btn sm ghost" data-act="close">✕ Close</button></div><p class="small muted">Send each a reminder on WhatsApp.</p>' + (l.length ? '<div class="tablewrap"><table class="tbl"><tbody>' + l.map(function (x) { return '<tr><td><b>' + esc(x.name) + '</b><br><span class="small muted">' + esc(x.matric) + (x.hostel ? ' · ' + esc(x.hostel) : '') + '</span></td><td>' + contactBtns(x.phone, 'Hello ' + x.name.split(' ')[0] + ', please register on SafeGate so the gate sign-out works for you: ' + ((settings && settings.appUrl) || location.origin)) + '</td></tr>'; }).join('') + '</tbody></table></div>' : empty('Everyone on the list has registered.')), true);
      }, fail); break;
      case 'rosterClear': if (confirm('Delete the whole school list? Students who already registered stay registered.')) api('clearRoster').then(function () { SG.toast('List deleted', 'ok'); mountSettings($('#main')); }, fail); break;
      case 'drillGo': if (confirm('Start a practice emergency? On-call officers get an alarm, a phone alert and a text marked DRILL. No student is involved.')) api('startDrill').then(function () { SG.toast('Drill started. The desk alarm will sound.', 'ok'); setTimeout(loadHealth, 1500); }, fail); break;
      case 'hBackup': api('backupNow').then(function (r) { SG.toast(r.ok ? 'Backup saved' : 'Backup failed: ' + r.error, r.ok ? 'ok' : 'err'); loadHealth(); }, fail); break;
      case 'hTest': api('pushTest').then(function (r) { SG.toast(r.devices ? 'Test sent to ' + r.devices + ' device(s)' : 'No device registered yet. Switch on Alarm notifications first.', r.devices ? 'ok' : 'warn'); }, fail); break;
      case 'hRefresh': loadHealth(); break;
      case 'trDo': api('decideTransfer', { matric: t.getAttribute('data-m'), ok: t.getAttribute('data-ok') === '1' }).then(function () { SG.toast(t.getAttribute('data-ok') === '1' ? 'New phone approved' : 'Refused', 'ok'); poll(); loadInbox(); }, fail); break;
      case 'escortDo': api('updateEscort', { id: t.getAttribute('data-id'), action: t.getAttribute('data-a'), note: t.getAttribute('data-a') === 'done' ? 'Escorted safely' : '' }).then(function () { SG.toast('Updated', 'ok'); poll(); if (tab === 'inbox') loadInbox(); }, fail); break;
      case 'visitorOut': api('visitorOut', { id: t.getAttribute('data-id') }).then(function () { SG.toast('Signed out', 'ok'); loadVisitors(); poll(); }, fail); break;
      case 'passDo': { var okp = t.getAttribute('data-ok') === '1', npn = okp ? '' : (prompt('Reason for the student (optional):') || ''); api('decidePass', { id: t.getAttribute('data-id'), approve: okp, note: npn }).then(function () { SG.toast(okp ? 'Pass approved' : 'Pass denied', 'ok'); loadInbox(); poll(); }, fail); break; }
      case 'mediaView': api('mediaList', { ref: t.getAttribute('data-id'), refType: t.getAttribute('data-type') }).then(function (r) { modal('<div class="row between"><h2 style="margin:0">Evidence from the student</h2><button class="btn sm ghost" data-act="close">✕ Close</button></div>' + (r.items.length ? SGMedia.gallery(r.items) : '<p class="muted">Nothing here (it may have been deleted after the retention period).</p>') + '<p class="small muted">Opening these files is recorded. Links expire in 10 minutes.</p>', true); }, fail); break;
      case 'brief': api('safetyBrief', { days: anDays > 30 ? 30 : (anDays < 7 ? 7 : anDays) }).then(function (b) { modal('<div class="row between no-print"><h2 style="margin:0">Safety Brief</h2><span><button class="btn sm primary" data-act="briefPrint">🖨 Print or save as PDF</button> <button class="btn sm ghost" data-act="close">✕ Close</button></span></div>' + briefHtml(b), true); window.__brief = b; }, fail); break;
      case 'briefPrint': if (window.__brief) printSheet(briefHtml(window.__brief)); break;
      case 'repEvid': api('reportEvidence', { id: t.getAttribute('data-id') }).then(function (r) { modal('<div class="row between"><h2 style="margin:0">Picture</h2><button class="btn sm ghost" data-act="close">✕ Close</button></div><img alt="Evidence picture sent with the report" src="' + esc(r.image) + '" style="max-width:100%;border-radius:12px;margin-top:10px"><p class="small muted">Opening this picture is recorded.</p>'); }, fail); break;
      case 'repDo': { var nt = prompt('Add a note about what was done:'); if (nt === null) break; var pubN = nt && confirm('Show this note to the person who reported it (they can see it with their reference number)?\n\nOK = show it, Cancel = keep it internal.'); api('updateReport', { id: t.getAttribute('data-id'), note: nt, pub: pubN, status: t.getAttribute('data-close') === '1' ? 'closed' : undefined }).then(function () { loadInbox(); poll(); }, fail); break; }
      case 'hzAdd': hazardForm(); break;
      case 'ideaOk': api('reviewPlaceIdea', { id: t.getAttribute('data-id') }).then(function () { MAPSTATE.cfg = null; loadMap(); SG.toast('Place added for everyone', 'ok'); }, fail); break;
      case 'ideaNo': api('reviewPlaceIdea', { id: t.getAttribute('data-id'), ok: false }).then(loadMap, fail); break;
      case 'hzOk': api('verifyHazard', { id: t.getAttribute('data-id') }).then(loadMap, fail); break;
      case 'hzNo': api('verifyHazard', { id: t.getAttribute('data-id'), ok: false }).then(loadMap, fail); break;
      case 'locate': { var lm = t.getAttribute('data-m'); api('trail', { matric: lm, hours: 4 }).then(function (tr) { trackStudent(tr); }, function (er) { if (er.code === 'no-grant') askReason(lm); else fail(er); }); break; }
      case 'unlocate': delete MAPSTATE.tracked[t.getAttribute('data-m')]; drawMap(); break;
      case 'mapPoint': pointForm(t.getAttribute('data-id') || ''); break;
      case 'mapZone': zoneForm(t.getAttribute('data-id') || ''); break;
      case 'mapDelPoint': if (confirm('Delete this safe point?')) api('deleteSafePoint', { id: t.getAttribute('data-id') }).then(function () { closeModal(); MAPSTATE.cfg = null; loadMap(); }, fail); break;
      case 'mapDelZone': if (confirm('Delete this risk area?')) api('deleteRiskZone', { id: t.getAttribute('data-id') }).then(function () { closeModal(); MAPSTATE.cfg = null; loadMap(); }, fail); break;
      case 'mapHot': { var hs = MAPSTATE.data.hotspots[+t.getAttribute('data-i')]; if (hs) { MAPSTATE.pick = { lat: hs.lat, lng: hs.lng }; zoneForm(''); var zf = modalEl && modalEl.querySelector('form'); if (zf) { zf.elements.name.value = hs.top + ' area'; zf.elements.reason.value = hs.count + ' reports here' + (hs.night * 2 >= hs.count ? ', mostly after dark' : ''); if (hs.night * 2 >= hs.count) { zf.elements.from.value = '17:30'; zf.elements.until.value = '06:00'; } } } break; }
      case 'mapHere': if (navigator.geolocation) navigator.geolocation.getCurrentPosition(function (p) { var ff = modalEl && modalEl.querySelector('form'); if (ff) { ff.elements.lat.value = p.coords.latitude.toFixed(6); ff.elements.lng.value = p.coords.longitude.toFixed(6); } }, function () { SG.toast('Could not read this device\'s location', 'err'); }, { enableHighAccuracy: true, timeout: 15000 }); break;
      case 'openStudent': openStudent(t.getAttribute('data-m')); break;
      case 'goTab': setTab(t.getAttribute('data-tab')); break;
      case 'repStage': { var stg = t.getAttribute('data-stage'); api('updateReport', { id: t.getAttribute('data-id'), stage: stg, note: stg === 'dispatched' ? 'Help is on the way.' : 'Security is looking into this.', pub: true }).then(function () { SG.toast(stg === 'dispatched' ? 'The student has been told help is on the way' : 'The student has been told you are on it', 'ok'); loadInbox(); poll(); }, fail); break; }
      case 'repDel': delData('deleteReport', { id: t.getAttribute('data-id') }, 'Delete this report?', loadInbox); break;
      case 'sosDel': delData('deleteSos', { id: t.getAttribute('data-id') }, 'Delete this emergency record?', loadInbox); break;
      case 'delLoc': delData('deleteLocationHistory', { matric: t.getAttribute('data-m') }, 'Delete all saved location history for this student?', function () { closeModal(); }); break;
      case 'delStu': delData('deleteStudent', { matric: t.getAttribute('data-m') }, 'Delete ' + t.getAttribute('data-n') + ' and all their records?', function () { closeModal(); setTab('students'); }); break;
      case 'trRestore': api('restoreTrash', { id: t.getAttribute('data-id') }).then(function () { SG.toast('Restored', 'ok'); mountTrash($('#main')); }, fail); break;
      case 'trPurge': if (confirm('Erase this for good? It cannot be brought back.')) api('purgeTrash', { id: t.getAttribute('data-id') }).then(function () { SG.toast('Erased', 'ok'); mountTrash($('#main')); }, fail); break;
      case 'repReopen': api('updateReport', { id: t.getAttribute('data-id'), status: 'open' }).then(function () { loadInbox(); poll(); }, fail); break;
      case 'ntDel': if (confirm('Delete this notice?')) api('deleteNotice', { id: t.getAttribute('data-id') }).then(loadNotices, fail); break;
      case 'repLoad': loadDaily(); break;
      case 'repPrint': window.print(); break;
      case 'claim': api('claimAlert', { key: t.getAttribute('data-key') }).then(function () { SG.toast('You are responding', 'ok'); poll(); }, fail); break;
      case 'askOpen':
        modal('<h2>Ask the student to check in</h2><p class="muted">Their phone shows your message with “I am OK” and “I need help” buttons. If they do not answer, an alert is raised for you.</p><form data-form="ask" data-m="' + esc(t.getAttribute('data-m')) + '"><label class="f" for="ak_t">Message</label><input id="ak_t" type="text" name="text" maxlength="120" value="Are you OK? Please confirm."><div class="row" style="margin-top:14px"><button class="btn primary" type="submit">Send</button><button class="btn" type="button" data-act="close">Cancel</button></div></form>');
        break;
      case 'verify': api('verifyAudit').then(function (r) { $('#verOut').innerHTML = r.ok ? '<span class="pill ok">✓ Intact (' + r.checked + ' sealed entries checked)</span>' : '<span class="pill bad">⚠ Entry #' + r.brokenAt + ' was changed or removed (' + esc(SG.dt(r.t)) + ')</span>'; }, fail); break;
      case 'staffReset': { var nm = t.getAttribute('data-n'), np = prompt('New PIN for ' + nm + ' (6 or more characters):'); if (np) api('resetStaffPin', { name: nm, pin: np }).then(function () { SG.toast('PIN reset for ' + nm, 'ok'); }, fail); break; }
      case 'idConfirm': idConfirm(); break;
      case 'idCancel': idCur = null; renderIdPanel(); break;
      case 'printCards': printCards(); break;
      case 'traceSheet': api('traceSheet', { matric: t.getAttribute('data-m') }).then(printTrace, fail); break;
      case 'cardOne': printCards([t.getAttribute('data-m')]); break;
      case 'cardNew': if (confirm('Replace this student\'s ID card? The old card will stop working.')) api('reissueCard', { matric: t.getAttribute('data-m') }).then(function () { printCards([t.getAttribute('data-m')]); }, fail); break;
      case 'staffPhone': { var sp = prompt('Phone number for ' + t.getAttribute('data-n') + ' (security texts this number for emergencies). Leave empty to remove:', t.getAttribute('data-p') || ''); if (sp !== null) api('setStaffPhone', { name: t.getAttribute('data-n'), phone: sp }).then(loadStaff, fail); break; }
      case 'myDuty': openDuty(); break;
      case 'smsTest': api('smsTest').then(function () { SG.toast('Test text queued. It should reach your phone in a few seconds.', 'ok'); setTimeout(loadHealth, 2500); }, fail); break;
      case 'staffToggle': api('setStaffActive', { name: t.getAttribute('data-n'), active: t.getAttribute('data-on') === '1' }).then(loadStaff, fail); break;
      case 'backup': api('backup', {}, 60000).then(function (d) {
        var blob = new Blob([JSON.stringify(d)], { type: 'application/json' }), url = URL.createObjectURL(blob), l = document.createElement('a');
        l.href = url; l.download = 'safegate-backup-' + U.fmtLocal(SG.now(), SG.tz).slice(0, 10) + '.json'; document.body.appendChild(l); l.click(); l.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
        SG.toast('Backup downloaded. Keep it private.', 'ok');
      }, fail); break;
      case 'addPlaceFrom': placesCache = placesCache || []; SG.call('config').then(function (c) { placesCache = c.places; placeForm(''); var n = $('#pl_n'); if (n) n.value = t.getAttribute('data-name').replace(/\b\w/g, function (x) { return x.toUpperCase(); }); }); break;
      case 'reload': location.reload(); break;
      case 'print': window.print(); break;
      case 'poster': printInstallPoster(); break;
      case 'plEdit': placeForm(t.getAttribute('data-id')); break;
      case 'plDel': if (confirm('Delete this place?')) api('deletePlace', { id: t.getAttribute('data-id') }).then(function (r) { placesCache = r.places; drawPlaces(); }, fail); break;
      case 'useLoc':
        if (!navigator.geolocation) return SG.toast('Location is not available here', 'err');
        navigator.geolocation.getCurrentPosition(function (p) {
          var f = t.closest('form'), a = f.elements;
          if (a.clat) { a.clat.value = p.coords.latitude.toFixed(6); a.clng.value = p.coords.longitude.toFixed(6); } else { a.lat.value = p.coords.latitude.toFixed(6); a.lng.value = p.coords.longitude.toFixed(6); }
          SG.toast('Position filled in (±' + Math.round(p.coords.accuracy) + ' m)', 'ok');
        }, function () { SG.toast('Could not get location. Allow location for this site.', 'err'); }, { enableHighAccuracy: true, timeout: 15000 });
        break;
    }
  });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'notifTgl') { if ('Notification' in window) Notification.requestPermission().then(function (p) { e.target.checked = p === 'granted'; if (p === 'granted' && cfgPushKey) SG.pushEnable(cfgPushKey, function (sub) { return api('pushSubscribeStaff', { sub: sub }); }, false).then(function (r) { SG.toast(r === 'on' ? 'Alarm alerts will reach this device even when the desk is closed.' : 'Phone alerts are not available on this browser.', r === 'on' ? 'ok' : 'warn'); }); }); return; }
    if (e.target.id === 'rosterFile' && e.target.files[0]) {
      var rf = new FileReader(), rep2 = $('#rosterReplace') && $('#rosterReplace').checked, inp2 = e.target;
      rf.onload = function () { api('importRoster', { csv: String(rf.result), replace: rep2 }, 60000).then(function (r) { inp2.value = ''; $('#rosterRes').innerHTML = '<span class="pill ok">Done</span> ' + r.added + ' added, ' + r.updated + ' updated, ' + r.skipped + ' skipped.' + (r.errors.length ? '<ul style="margin:4px 0;padding-left:18px">' + r.errors.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : ''); loadRoster(); }, function (er) { inp2.value = ''; $('#rosterRes').innerHTML = '<span class="pill bad">' + esc(er.message) + '</span>'; }); };
      rf.readAsText(e.target.files[0]); return;
    }
    if (e.target.id === 'restoreFile' && e.target.files[0]) {
      var file = e.target.files[0], fr = new FileReader();
      fr.onload = function () {
        var d; try { d = JSON.parse(fr.result); } catch (x) { return SG.toast('That file is not a valid backup.', 'err'); }
        if (!confirm('Restore this backup?\n\nThis REPLACES all current students, records, officers and settings with the file\'s contents.')) { e.target.value = ''; return; }
        api('restore', { data: d }, 120000).then(function (r) { SG.toast('Restored ' + r.students + ' students, ' + r.events + ' records.', 'ok'); setTimeout(function () { location.reload(); }, 1200); }, fail);
      };
      fr.readAsText(file); return;
    }
    if (e.target.id === 'soundTgl') { sound = e.target.checked; SG.store.set('sg_sound', sound); ensureAudio(); updateBadge(); } });
  document.addEventListener('input', function (e) { if (e.target.id === 'outFilter') { outFilter = e.target.value; updateLive(); } });
  document.addEventListener('submit', function (e) {
    var f = e.target.closest('form[data-form]'); if (!f) return; e.preventDefault();
    var k = f.getAttribute('data-form'), el = f.elements, err = $('#lerr');
    if (k === 'setup') {
      if (el.pin.value !== el.pin2.value) { err.textContent = 'The two PINs do not match.'; return; }
      SG.call('setupStaff', { schoolName: el.school.value, officer: el.officer.value, pin: el.pin.value, tzOffsetMin: -new Date().getTimezoneOffset() }).then(authed, function (er) { err.textContent = er.message; });
    } else if (k === 'login') {
      SG.call('login', { officer: el.officer.value, pin: el.pin.value }).then(authed, function (er) { err.textContent = er.message; });
    } else if (k === 'reason') {
      var reason = el.sel.value === 'Other' ? (el.txt.value.trim() || '') : el.sel.value;
      api('requestTrail', { matric: f.getAttribute('data-m'), reason: reason, hours: +el.hrs.value }).then(function (t) { closeModal(); if (tab === 'map' && MAPSTATE.m) trackStudent(t); else showTrail(t); }, fail);
    } else if (k === 'resolve') {
      api('resolveAlert', { key: f.getAttribute('data-key'), note: el.note.value }).then(function () { closeModal(); SG.toast('Marked as handled', 'ok'); poll(); }, fail);
    } else if (k === 'caseNew2') {
      api('openCase', { matric: el.matric.value, reason: el.reason.value }).then(function (r) { f.reset(); $('#csErr').textContent = ''; poll(); loadCases(); openCaseFile(r.id); }, function (er) { $('#csErr').textContent = er.message; });
    } else if (k === 'caseNote') {
      api('caseNote', { id: f.getAttribute('data-id'), text: el.text.value }).then(function () { openCaseFile(f.getAttribute('data-id')); }, fail);
    } else if (k === 'caseClose') {
      api('closeCase', { id: f.getAttribute('data-id'), outcome: el.outcome.value, note: el.note.value }).then(function () { closeModal(); SG.toast('Case closed', 'ok'); poll(); if (tab === 'cases') loadCases(); }, function (er) { $('#ccErr').textContent = er.message; });
    } else if (k === 'visitor') {
      api('visitorIn', { name: el.name.value, phone: el.phone.value, badge: el.badge.value, idType: el.idType.value, idNo: el.idNo.value, purpose: el.purpose.value, host: el.host.value, hostMatric: el.hostMatric.value }).then(function () { SG.toast('Visitor signed in', 'ok'); f.reset(); $('#viErr').textContent = ''; loadVisitors(); poll(); }, function (er) { $('#viErr').textContent = er.message; });
    } else if (k === 'notice') {
      api('postNotice', { title: el.title.value, text: el.text.value, level: el.level.value, hours: +el.hours.value }).then(function () { SG.toast('Sent to all students', 'ok'); f.reset(); $('#nterr').textContent = ''; loadNotices(); }, function (er) { $('#nterr').textContent = er.message; });
    } else if (k === 'note') {
      api('addNote', { text: el.text.value, matric: el.matric.value }).then(function () { f.reset(); $('#noteerr').textContent = ''; loadNotes(); }, function (er) { $('#noteerr').textContent = er.message; });
    } else if (k === 'ask') {
      api('ask', { matric: f.getAttribute('data-m'), text: el.text.value }).then(function () { closeModal(); SG.toast('Check-in request sent', 'ok'); poll(); }, fail);
    } else if (k === 'duty') {
      api('setMyDuty', { phone: f.elements.phone.value, onCall: f.elements.onCall.checked }).then(function (r) { closeModal(); SG.toast(r.onCall ? 'You are on call' : 'Saved', 'ok'); }, function (er) { $('#duErr').textContent = er.message; });
    } else if (k === 'staffAdd') {
      api('addStaff', { name: el.name.value, pin: el.pin.value, role: el.role.value }).then(function () { SG.toast('Officer added', 'ok'); f.reset(); $('#staffErr').textContent = ''; loadStaff(); }, function (er) { $('#staffErr').textContent = er.message; });
    } else if (k === 'paper') submitPaper(f);
    else if (k === 'rec') { recQ = { q: el.q.value, type: el.type.value, from: el.from.value, to: el.to.value }; runRecords(); }
    else if (k === 'settings') saveSettings(f);
    else if (k === 'pin') {
      api('changePin', { oldPin: el.old.value, newPin: el.nw.value }).then(function () { SG.toast('PIN changed. Sign in again.', 'ok'); signedOut('PIN changed. Sign in with the new PIN.'); }, function (er) { $('#pinerr').textContent = er.message; });
    } else if (k === 'locq') {
      api('students', { q: el.q.value }).then(function (r) { MAPSTATE.found = (r.students || r).slice(0, 6); drawMap(); }, fail);
    } else if (k === 'hazard') {
      api('saveHazard', { hazard: { kind: el.kind.value, lat: parseFloat(el.lat.value), lng: parseFloat(el.lng.value), radiusM: +el.radius.value, hours: +el.hours.value, note: el.note.value } }).then(function () { closeModal(); MAPSTATE.pick = null; loadMap(); SG.toast('Hazard added. Students see it now.', 'ok'); }, function (er) { $('#mapErr').textContent = er.message; });
    } else if (k === 'safepoint') {
      api('saveSafePoint', { point: { id: f.getAttribute('data-id'), name: el.name.value, type: el.type.value, lat: parseFloat(el.lat.value), lng: parseFloat(el.lng.value), phone: el.phone.value, note: el.note.value } }).then(function () { closeModal(); MAPSTATE.pick = null; MAPSTATE.cfg = null; loadMap(); SG.toast('Saved', 'ok'); }, function (er) { $('#mapErr').textContent = er.message; });
    } else if (k === 'riskzone') {
      api('saveRiskZone', { zone: { id: f.getAttribute('data-id'), name: el.name.value, reason: el.reason.value, lat: parseFloat(el.lat.value), lng: parseFloat(el.lng.value), radiusM: +el.radius.value, from: el.from.value, until: el.until.value } }).then(function () { closeModal(); MAPSTATE.pick = null; MAPSTATE.cfg = null; loadMap(); SG.toast('Saved', 'ok'); }, function (er) { $('#mapErr').textContent = er.message; });
    } else if (k === 'place') {
      var n = function (x) { return x === '' ? null : +x; };
      api('savePlace', { place: { id: f.getAttribute('data-id'), name: el.name.value, area: el.area.value, tip: el.tip.value, lat: n(el.lat.value), lng: n(el.lng.value), radiusM: n(el.radius.value), danger: el.danger.checked, kind: el.kind.value } })
        .then(function (r) { placesCache = r.places; closeModal(); drawPlaces(); SG.toast('Saved', 'ok'); }, function (er) { $('#plerr').textContent = er.message; });
    }
  });

  boot();
})();
