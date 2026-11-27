/* SafeGate ICT console. The address itself is the key: /ict/<20 characters>. No password screen. */
(function () {
  'use strict';
  var m = /^\/ict\/([a-z0-9]{20})\/?$/.exec(location.pathname), TOKEN = m ? m[1] : '', app = document.getElementById('app'), tab = 'home', data = {}, busy = false;
  var NAV = [['home', '🏠', 'Home'], ['voices', '📣', 'Voices'], ['insights', '📈', 'Insights'], ['people', '👥', 'People'], ['msgs', '💬', 'Feedback'], ['data', '🗂️', 'Data'], ['system', '⚙️', 'System'], ['links', '🔑', 'Access'], ['help', '❓', 'Help']];
  var SUBS = { voices: [['reports', 'Reports'], ['sos', 'Emergency alerts']], people: [['students', 'Students'], ['asks', 'Help requests'], ['staff', 'Staff']], msgs: [['feedback', 'Messages'], ['notices', 'Notices']], data: [['roster', 'Student list'], ['exports', 'Exports'], ['trash', 'Recycle bin'], ['backups', 'Backups'], ['audit', 'Activity log']], system: [['check', 'Check-up'], ['poster', 'Gate poster'], ['settings', 'Settings'], ['diag', 'Diagnostics']] };
  var SUB = {}, FILT = 'open';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(sel, r) { return (r || app).querySelector(sel); }
  function when(t) { return t ? new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : 'never'; }
  function ago(t) { if (!t) return 'never'; var s = Math.max(0, (Date.now() - t) / 1000); return s < 90 ? 'just now' : s < 5400 ? Math.round(s / 60) + ' min ago' : s < 129600 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' days ago'; }
  function mb(b) { return b > 1e9 ? (b / 1e9).toFixed(1) + ' GB' : (b / 1e6).toFixed(1) + ' MB'; }
  function toast(msg, kind) { var box = document.getElementById('toasts'); if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('role', 'status'); document.body.appendChild(box); } var t = document.createElement('div'); t.className = 'toast ' + (kind || ''); t.textContent = msg; box.appendChild(t); setTimeout(function () { t.classList.add('out'); }, 3200); setTimeout(function () { t.remove(); }, 3700); }

  function call(method, args) {
    return fetch('/api/ict', { method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store', referrerPolicy: 'no-referrer',
      body: JSON.stringify({ token: TOKEN, method: method, args: Object.assign({ clientTime: Date.now() }, args || {}) }) })
      .then(function (r) { return r.json().catch(function () { return { error: { message: 'Bad reply' } }; }).then(function (j) { if (j.error) { var e = new Error(j.error.message || 'Failed'); e.code = j.error.code; throw e; } return j.result; }); });
  }
  function act(method, args, okMsg, after) { return call(method, args).then(function (r) { if (okMsg) toast(okMsg, 'ok'); return after ? after(r) : r; }).catch(function (e) { toast(e.message, 'err'); throw e; }); }
  function sure(msg) { return window.confirm(msg); }
  function copy(text) { if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(function () { toast('Copied', 'ok'); }, function () { toast('Press and hold to copy', 'warn'); }); toast('Press and hold to copy', 'warn'); }
  function download(name, text, type) { var b = new Blob([text], { type: type || 'text/csv' }), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800); }
  function qrCanvas(text) { var c = document.createElement('canvas'); try { var q = new window.QRCodeLib(-1, 0); q.addData(text); q.make(); var n = q.getModuleCount(), quiet = 4, size = n + quiet * 2, sc = Math.max(2, Math.floor(260 / size)); c.width = c.height = size * sc; var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#000'; for (var r = 0; r < n; r++) for (var k = 0; k < n; k++) if (q.isDark(r, k)) g.fillRect((k + quiet) * sc, (r + quiet) * sc, sc, sc); } catch (e) { } c.style.maxWidth = '100%'; return c; }


  function shell(body) {
    var o = data.overview || {}, sub = SUBS[tab], nb = o.open ? (o.open.reports + o.open.sos) : 0;
    var side = '<nav class="side" aria-label="Main"><div class="brand"><svg viewBox="0 0 64 64" width="34" height="34" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#0b5d7a"/><path d="M32 12l18 7v13c0 11-8 18-18 21-10-3-18-10-18-21V19z" fill="none" stroke="#fff" stroke-width="4"/><path d="M24 32l6 6 11-12" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/></svg><span>SafeGate ICT</span></div>' +
      NAV.map(function (n) { return '<button class="nav' + (n[0] === tab ? ' on' : '') + '" data-t="' + n[0] + '"><span aria-hidden="true">' + n[1] + '</span>' + n[2] + (n[0] === 'voices' && nb ? '<span class="badge">' + nb + '</span>' : '') + '</button>'; }).join('') +
      '<div class="foot"><div>Link: <b>' + esc(o.link ? o.link.name : '') + '</b></div><div class="small">Every action is recorded under this name.</div></div></nav>';
    var segs = sub ? '<div class="seg" role="tablist">' + sub.map(function (x) { return '<button role="tab" data-s="' + x[0] + '"' + (x[0] === curSub() ? ' aria-selected="true"' : '') + '>' + x[1] + '</button>'; }).join('') + '</div>' : '';
    app.innerHTML = '<div class="desk">' + side + '<main class="main"><div class="rowx" style="justify-content:space-between;margin:0 0 4px"><h1 style="margin:0">' + esc((NAV.filter(function (n) { return n[0] === tab; })[0] || [0, 0, ''])[2]) + '</h1><button class="btn ghost sm" id="rf" aria-label="Refresh">↻ Refresh</button></div>' + segs + '<section id="pane">' + body + '</section></main></div>';
    $('#rf').onclick = function () { show(tab, true); };
    Array.prototype.forEach.call(app.querySelectorAll('.side .nav'), function (b) { b.onclick = function () { show(b.dataset.t); }; });
    Array.prototype.forEach.call(app.querySelectorAll('.seg button'), function (b) { b.onclick = function () { SUB[tab] = b.dataset.s; show(tab); }; });
  }
  function curSub() { return SUBS[tab] ? (SUB[tab] || SUBS[tab][0][0]) : tab; }
  function fatal(e) {
    app.innerHTML = '<div class="login" style="max-width:460px;margin:12vh auto;padding:0 16px"><div class="card"><h2>This link is not working</h2><p>' + esc(e && e.message || 'Could not reach the server.') + '</p><p class="note">If the server was just restarted, wait a few seconds and refresh. If the link was cancelled, ask the person who manages ICT access for a new one.</p><button class="btn primary" onclick="location.reload()">Try again</button></div></div>';
  }
  var V = {};
  function show(t, force) {
    tab = t; if (busy) return; busy = true;
    var key = curSub(), f = V[key] || V.home;
    Promise.resolve(f(force)).then(function (html) { busy = false; shell(html || ''); if (V[key + '_bind']) V[key + '_bind'](); window.scrollTo(0, 0); }).catch(function (e) { busy = false; if (!data.overview) fatal(e); else shell('<p class="note bad">' + esc(e.message) + '</p>'); });
  }
  function ov() { return call('overview').then(function (o) { data.overview = o; return o; }); }
  function reload() { busy = false; show(tab, true); }
  function bind(sel, fn) { Array.prototype.forEach.call(app.querySelectorAll(sel), function (el) { el.onclick = function () { fn(el); }; }); }
  function checkRows(list) { return list.map(function (c) { return '<div class="alert' + (c.level === 'bad' ? ' critical' : '') + '"><div><b>' + (c.level === 'ok' ? '✅ ' : c.level === 'bad' ? '⛔ ' : '⚠️ ') + esc(c.title) + '</b>' + (c.detail ? '<div class="small muted">' + esc(c.detail) + '</div>' : '') + (c.fix ? '<div class="small">👉 ' + esc(c.fix) + '</div>' : '') + '</div></div>'; }).join(''); }
  function empty(ic, t, d) { return '<div class="empty"><div class="ei">' + ic + '</div><b>' + esc(t) + '</b><div class="small muted">' + esc(d || '') + '</div></div>'; }
  function hbars(items, max) { max = max || Math.max.apply(null, items.map(function (x) { return x.n; }).concat([1])); return items.map(function (x) { return '<div class="hb"><span class="hl">' + esc(x.label) + '</span><span class="ht"><i style="width:' + Math.max(4, Math.round(x.n / max * 100)) + '%"></i></span><b>' + x.n + '</b></div>'; }).join(''); }
  function weekly(arr, label) { var mx = Math.max.apply(null, arr.concat([1])); return '<div class="wk" role="img" aria-label="' + esc(label) + '">' + arr.map(function (n, i) { return '<div><i style="height:' + Math.max(3, Math.round(n / mx * 100)) + '%" title="' + n + '"></i><small>' + (i === 7 ? 'Now' : '-' + (7 - i) + 'w') + '</small></div>'; }).join('') + '</div>'; }
  var KIND = { danger: '🚨 In danger', medical: '🩺 Medical', followed: '👣 Followed', accident: '🚧 Accident', other: '❓ Other' };

  V.home = function () {
    return Promise.all([ov(), call('insights')]).then(function (a) {
      var o = a[0], ins = a[1], c = o.counts, hr = new Date().getHours(), gr = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
      return '<div class="hero" style="margin-bottom:14px"><h1>' + gr + ' 👋</h1><div class="sub">' + (o.status === 'ok' ? 'Everything is healthy at ' : 'A few things need you at ') + esc(o.school || 'your school') + '.</div><div class="kv"><div><b>' + c.students + '</b><span>Students</span></div><div><b>' + (o.open.reports + o.open.sos) + '</b><span>Open reports and alerts</span></div><div><b>' + c.staffActive + '</b><span>Security staff</span></div><div><b>' + (o.bad + o.warn) + '</b><span>System items to look at</span></div></div></div>' +
        '<div class="stats">' + [['📱', c.phonesActive, 'Phones active'], ['⏳', o.open.transfers, 'New-phone requests'], ['🛟', o.open.help, 'Help requests waiting'], ['📋', c.roster, 'On student list'], ['🔊', ins.reports.total, 'Reports (30 days)'], ['🆘', ins.sos.total, 'Emergency alerts (30 days)'], ['⭐', ins.feedback.avg == null ? '–' : ins.feedback.avg, 'Feedback rating']].map(function (k) { return '<div class="stat"><span>' + k[0] + ' ' + k[2] + '</span><b>' + k[1] + '</b></div>'; }).join('') + '</div>' +
        (o.checks.length ? '<h3>Needs attention</h3>' + checkRows(o.checks) : '<div class="note ok">✅ <b>System is healthy.</b> Nothing needs fixing right now.</div>') +
        '<h3 style="margin-top:18px">What your students are telling you</h3>' + (ins.tips.length ? ins.tips.map(function (t) { return '<div class="card flat tip">💡 ' + esc(t) + '</div>'; }).join('') : empty('🌱', 'Nothing unusual', 'As reports and feedback come in, ideas appear here.')) +
        '<div class="rowx"><button class="btn primary sm" data-go="voices">Read reports</button><button class="btn ghost sm" data-go="insights">See insights</button><button class="btn ghost sm" data-go="msgs">Read feedback</button></div>';
    });
  };
  V.home_bind = function () { bind('[data-go]', function (b) { show(b.dataset.go); }); };

  function privacyNote() { return '<div class="note" style="margin-bottom:12px">👀 <b>Read only.</b> You can see what students report so ICT can improve the product. Opening this page is written to the activity log. Live locations, map positions and photo, voice and video evidence stay with the security desk.</div>'; }
  var VOICE = null;
  function loadVoices(force) { var q = (force === true || !VOICE) ? call('voices', { quiet: !!VOICE }) : Promise.resolve(VOICE); return q.then(function (v) { VOICE = v; return v; }); }
  function chipsFilter() { return '<div class="seg small"><button data-f="open"' + (FILT === 'open' ? ' aria-selected="true"' : '') + '>Needs action</button><button data-f="all"' + (FILT === 'all' ? ' aria-selected="true"' : '') + '>Everything</button></div>'; }
  V.reports = function (force) {
    return loadVoices(force).then(function (v) {
      var list = v.reports.filter(function (r) { return FILT === 'all' || r.status === 'open'; });
      return privacyNote() + chipsFilter() + (list.map(function (r) {
        return '<div class="card flat msg ' + (r.urgency === 'critical' ? 'crit' : '') + '"><div class="rowx" style="margin:0"><b>' + esc(r.label) + '</b>' + (r.urgency === 'critical' ? '<span class="pill bad">Urgent</span>' : r.urgency === 'high' ? '<span class="pill warn">High</span>' : '') + '<span class="pill ' + (r.status === 'open' ? 'warn' : 'ok') + '">' + (r.status === 'open' ? 'Open' : 'Closed') + '</span><span class="small muted" style="margin-left:auto">' + ago(r.t) + '</span></div><p style="margin:8px 0">' + esc(r.text) + '</p><div class="small muted">' + (r.anon ? '🕶 Anonymous' : '👤 ' + esc(r.name) + ' · ' + esc(r.matric)) + ' · ' + esc(r.ref || '') + (r.notes ? ' · ' + r.notes + ' note(s) by security' : ' · no response yet') + (r.files ? ' · ' + r.files + ' file(s) with security' : '') + (r.closedAt ? ' · closed ' + ago(r.closedAt) : '') + '</div></div>';
      }).join('') || empty('✨', FILT === 'open' ? 'No open reports' : 'No reports yet', 'When a student reports a concern, it appears here.'));
    });
  };
  V.reports_bind = function () { bind('.seg [data-f]', function (b) { FILT = b.dataset.f; show('voices'); }); };
  V.sos = function (force) {
    return loadVoices(force).then(function (v) {
      var list = v.sos.filter(function (x) { return FILT === 'all' || x.status === 'open'; });
      return privacyNote() + chipsFilter() + (list.map(function (x) {
        var min = x.closedAt ? Math.max(1, Math.round((x.closedAt - x.t) / 60000)) : null;
        return '<div class="card flat msg ' + (x.status === 'open' ? 'crit' : '') + '"><div class="rowx" style="margin:0"><b>🆘 ' + esc(KIND[x.kind] || x.kind) + '</b><span class="pill ' + (x.status === 'open' ? 'bad' : x.status === 'resolved' ? 'ok' : '') + '">' + (x.status === 'open' ? 'Open now' : x.status === 'resolved' ? 'Resolved' : 'Cancelled') + '</span><span class="small muted" style="margin-left:auto">' + when(x.t) + '</span></div>' + (x.message ? '<p style="margin:8px 0">' + esc(x.message) + '</p>' : '') + '<div class="small muted">👤 ' + esc(x.name || 'Student') + ' · ' + esc(x.matric) + (min ? ' · closed in ' + min + ' min' + (x.closedBy ? ' by ' + esc(x.closedBy) : '') : '') + (x.repeats ? ' · pressed ' + (x.repeats + 1) + ' times' : '') + '</div></div>';
      }).join('') || empty('🕊️', FILT === 'open' ? 'No emergency is open' : 'No emergency alerts yet', 'Emergency button presses appear here the moment they happen.'));
    });
  };
  V.sos_bind = V.reports_bind;

  V.insights = function () {
    return call('insights').then(function (i) {
      var f = i.feedback, ks = { love: '❤️ Love', fix: '🔧 Fix', idea: '💡 Idea', broke: '🐞 Broken', other: '💬 Other' };
      return '<p class="muted">What students need and how they feel, from the last ' + i.days + ' days.</p><div class="stats"><div class="stat"><span>Reports</span><b>' + i.reports.total + '</b></div><div class="stat"><span>Emergency alerts</span><b>' + i.sos.total + '</b></div><div class="stat"><span>Avg. time to close a report</span><b>' + (i.reports.avgCloseHrs == null ? '–' : i.reports.avgCloseHrs + ' h') + '</b></div><div class="stat"><span>Avg. time to resolve an alert</span><b>' + (i.sos.avgCloseMin == null ? '–' : i.sos.avgCloseMin + ' min') + '</b></div><div class="stat"><span>Feedback rating</span><b>' + (f.avg == null ? '–' : f.avg + ' ⭐') + '</b></div></div>' +
        (i.tips.length ? '<h3>Ideas for you</h3>' + i.tips.map(function (t) { return '<div class="card flat tip">💡 ' + esc(t) + '</div>'; }).join('') : '') +
        '<div class="two"><div class="card"><h3>📣 What people report</h3>' + (i.reports.cats.length ? hbars(i.reports.cats) : empty('🌱', 'No reports yet')) + '<div class="small muted" style="margin-top:8px">' + i.reports.anon + ' anonymous · ' + i.reports.urgent + ' urgent</div></div>' +
        '<div class="card"><h3>📆 Reports per week</h3>' + weekly(i.reports.weekly, 'Reports per week') + '<h3 style="margin-top:14px">🆘 Alerts per week</h3>' + weekly(i.sos.weekly, 'Alerts per week') + '</div></div>' +
        '<div class="two"><div class="card"><h3>🆘 Kinds of emergency</h3>' + (Object.keys(i.sos.byKind).length ? hbars(Object.keys(i.sos.byKind).map(function (k) { return { label: KIND[k] || k, n: i.sos.byKind[k] }; })) : empty('🕊️', 'No alerts')) + '<div class="small muted" style="margin-top:8px">' + i.sos.cancelled + ' cancelled by the student</div></div>' +
        '<div class="card"><h3>⭐ How people feel</h3>' + (f.rated ? hbars([5, 4, 3, 2, 1].map(function (r) { return { label: r + ' ⭐', n: f.dist[r - 1] }; })) : empty('💬', 'No ratings yet', 'Ratings come from the feedback button.')) + (Object.keys(f.kinds).length ? '<div class="chips">' + Object.keys(f.kinds).map(function (k) { return '<span class="pill">' + (ks[k] || k) + ' ' + f.kinds[k] + '</span>'; }).join('') + '</div>' : '') + '</div></div>' +
        '<div class="card"><h3>🔎 Words that keep coming up</h3>' + (i.themes.length ? '<div class="chips">' + i.themes.map(function (t) { return '<span class="pill" style="font-size:' + (0.8 + Math.min(0.5, t.n / 20)) + 'rem">' + esc(t.w) + ' · ' + t.n + '</span>'; }).join('') + '</div>' : empty('🌱', 'Not enough text yet')) + '</div>' +
        '<h3 style="margin-top:18px">💡 What users ask for or say is broken</h3>' + (i.ideas.map(function (x) { return '<div class="card flat msg"><div class="rowx" style="margin:0"><span class="pill">' + (ks[x.kind] || x.kind) + '</span>' + (x.rating ? '<span class="small">' + '⭐'.repeat(x.rating) + '</span>' : '') + '<span class="small muted" style="margin-left:auto">' + ago(x.t) + '</span></div><p style="margin:8px 0 0">' + esc(x.message) + '</p></div>'; }).join('') || empty('💡', 'No suggestions yet')) +
        (i.loves.length ? '<h3 style="margin-top:18px">❤️ Kind words</h3>' + i.loves.map(function (x) { return '<div class="card flat msg"><p style="margin:0">' + esc(x.message) + '</p><div class="small muted">' + ago(x.t) + '</div></div>'; }).join('') : '');
    });
  };

  V.check = function () {
    return call('checkup').then(function (r) { return '<h3>System check-up</h3><p style="color:var(--muted)">Run at ' + when(r.time) + '</p>' + checkRows(r.checks) + '<button class="btn primary" id="cu">Run again</button>'; });
  };
  V.check_bind = function () { $('#cu').onclick = reload; };

  V.students = function () {
    var q = data.sq || '', f = data.sf || '';
    return Promise.all([call('students', { q: q, filter: f }), call('transfers')]).then(function (a) {
      var pend = a[1].items.filter(function (x) { return x.status === 'pending'; });
      return '<h3>Students</h3><div class="rowx"><input type="search" id="sq" placeholder="Search name or matric" value="' + esc(q) + '" style="flex:1 1 180px"><select id="sf"><option value="">All</option><option value="released"' + (f === 'released' ? ' selected' : '') + '>Phone released</option><option value="changed"' + (f === 'changed' ? ' selected' : '') + '>Tried another phone</option><option value="noroster"' + (f === 'noroster' ? ' selected' : '') + '>Not on student list</option></select><button class="btn primary" id="sgo">Search</button></div>' +
        (pend.length ? '<div class="card flat"><h3>Waiting for a new phone (' + pend.length + ')</h3>' + pend.map(function (x) { return '<div class="it"><div class="g"><b>' + esc(x.name) + '</b> <span class="mono">' + esc(x.matric) + '</span><small>' + esc(x.phone) + ' · asked ' + ago(x.t) + '</small></div><button class="btn ok sm" data-ok="' + esc(x.matric) + '">Approve</button><button class="btn ghost sm" data-no="' + esc(x.matric) + '">Decline</button></div>'; }).join('') + '</div>' : '') +
        '<details class="card flat"><summary><b>➕ Add a student</b></summary><p class="small muted">Puts the student on the school list so they can register in the app.</p><div class="rowx"><input id="cm" placeholder="Matric number" style="flex:1 1 140px"><input id="cn" placeholder="Full name" style="flex:2 1 180px"></div><div class="rowx"><input id="ch" placeholder="Hostel" style="flex:1 1 120px"><input id="cp" placeholder="Phone" style="flex:1 1 120px"><input id="cg" placeholder="Parent / guardian phone" style="flex:1 1 140px"></div><button class="btn primary" id="cgo">Add student</button></details>' +
        '<p style="color:var(--muted)">Showing ' + a[0].items.length + ' of ' + a[0].total + '. Phone numbers are partly hidden.</p><div class="card flat">' + (a[0].items.map(function (s) { return '<div class="it"><div class="g"><b>' + esc(s.name || '(no name)') + '</b> <span class="mono">' + esc(s.matric) + '</span><small>' + esc(s.residence || 'residence not set') + ' · ' + esc(s.phone || 'no phone') + ' · seen ' + ago(s.lastSeen) + '</small><small>Phone: ' + (s.device === 'locked' ? 'registered' : s.device === 'released' ? 'released, can sign in on a new phone' : 'none yet') + (s.deviceChanged ? ' · ⚠ tried another phone' : '') + (s.onRoster ? '' : ' · not on student list') + '</small></div><button class="btn primary sm" data-pf="' + esc(s.matric) + '">Open</button><button class="btn ghost sm" data-rel="' + esc(s.matric) + '">Release phone</button></div>'; }).join('') || '<p>No students match.</p>') + '</div>';
    });
  };
  V.students_bind = function () {
    function go() { data.sq = $('#sq').value; data.sf = $('#sf').value; reload(); }
    $('#sgo').onclick = go; $('#sq').onkeydown = function (e) { if (e.key === 'Enter') go(); }; $('#sf').onchange = go;
    bind('[data-ok]', function (b) { act('transferDecide', { matric: b.dataset.ok, ok: true }, 'Approved', reload); });
    bind('[data-no]', function (b) { act('transferDecide', { matric: b.dataset.no, ok: false }, 'Declined', reload); });
    bind('[data-rel]', function (b) { if (sure('Release the phone for ' + b.dataset.rel + '?\nThe student can then sign in on a new phone.')) act('studentRelease', { matric: b.dataset.rel }, 'Phone released', reload); });
    bind('[data-pf]', function (b) { openProfile(b.dataset.pf); });
    $('#cgo').onclick = function () { act('studentCreate', { matric: $('#cm').value, name: $('#cn').value, hostel: $('#ch').value, phone: $('#cp').value, guardianPhone: $('#cg').value }, 'Student added').then(function (r) { openProfile(r.matric); }).catch(function () { }); };
  };


  /* ---- Student profile: everything ICT needs to help one person ---- */
  function field(id, label, val, ph) { return '<label class="f">' + esc(label) + '<input type="text" id="' + id + '" value="' + esc(val || '') + '" placeholder="' + esc(ph || '') + '"></label>'; }
  function closeProfile() { var o = document.getElementById('ovl'); if (o) o.remove(); document.body.style.overflow = ''; }
  function openProfile(matric) {
    call('studentProfile', { matric: matric }).then(function (p) {
      closeProfile(); var o = document.createElement('div'); o.id = 'ovl'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-label', 'Student profile');
      var dev = p.device === 'locked' ? 'Registered on one phone' : p.device === 'released' ? 'Phone released: can sign in on a new phone' : 'No phone registered yet';
      o.innerHTML = '<div class="sheet"><div class="rowx" style="justify-content:space-between;margin:0"><h2 style="margin:0">' + esc(p.name) + '</h2><button class="btn ghost sm" id="pclose" aria-label="Close">✕</button></div>' +
        '<div class="small muted mono">' + esc(p.matric) + '</div>' +
        '<div class="chips"><span class="pill ' + (p.registered ? 'ok' : '') + '">' + (p.registered ? 'Registered' : 'Not registered yet') + '</span><span class="pill">' + esc(dev) + '</span>' + (p.deviceChanged ? '<span class="pill warn">Tried another phone</span>' : '') + (p.roster ? '' : '<span class="pill warn">Not on student list</span>') + (p.transfer ? '<span class="pill warn">Waiting for new-phone approval</span>' : '') + '</div>' +
        '<div class="grid" style="margin:10px 0"><div class="kpi"><b>' + p.counts.events + '</b><span>Gate records</span></div><div class="kpi"><b>' + p.counts.reports + '</b><span>Reports</span></div><div class="kpi"><b>' + p.counts.sos + '</b><span>Emergency alerts</span></div><div class="kpi"><b>' + p.guardians + '</b><span>Family links</span></div></div>' +
        '<div class="small muted">Last seen ' + ago(p.lastSeen) + (p.registeredAt ? ' · registered ' + when(p.registeredAt) : '') + (p.outside ? ' · currently outside campus' : '') + '</div>' +
        '<h3>Details</h3>' + field('pn', 'Full name', p.name) + field('pr', 'Hostel / residence', p.residence) + field('pp', 'Phone', p.phone) + field('pl', 'Level', p.level) + field('pg', 'Parent / guardian name', p.emergency && p.emergency.name) + field('pgp', 'Parent / guardian phone', p.emergency && p.emergency.phone) +
        '<button class="btn primary" id="psave">Save changes</button>' +
        '<h3>Fix a problem</h3><div class="actions">' +
        (p.minor ? '<div class="note warn small" style="margin:8px 0"><b>Under 18.</b> Location is ' + (p.guardianOk ? 'ON because a parent or guardian has agreed.' : 'kept OFF until a parent or guardian agrees.') + ' Only record agreement after you have it from the parent or guardian.<br><button class="btn sm" id="pgc" style="margin-top:6px">' + (p.guardianOk ? 'Remove their agreement' : '✔ Parent or guardian has agreed') + '</button></div>' : '') + '<button class="btn ghost" id="prel">📱 Release phone</button><button class="btn ghost" id="pgr">👪 Remove family links</button><button class="btn ghost" id="pst">🚪 Mark as back on campus</button><button class="btn ghost" id="pmx">✏️ Fix matric number</button></div>' +
        '<p class="small muted">Mark as back on campus clears a stuck "outside" status after a sync mistake. Fix matric number moves every record to the corrected number.</p>' +
        (p.recent.length ? '<h3>Latest gate records</h3>' + p.recent.map(function (e) { return '<div class="it"><div class="g"><b>' + esc(e.type === 'out' ? 'Left campus' : e.type === 'in' ? 'Came back' : e.type) + '</b><small>' + when(e.t) + (e.source ? ' · ' + esc(e.source) : '') + (e.note ? ' · ' + esc(e.note) : '') + '</small></div></div>'; }).join('') : '') +
        '<p class="small muted">Everything you change here is written to the activity log under your link name. Exact locations are never shown here. Reports and emergencies are in Voices.</p></div>';
      document.body.appendChild(o); document.body.style.overflow = 'hidden';
      o.onclick = function (e) { if (e.target === o) closeProfile(); }; $('#pclose', o).onclick = closeProfile;
      var m = p.matric;
      $('#psave', o).onclick = function () { act('studentUpdate', { matric: m, name: $('#pn', o).value, residence: $('#pr', o).value, phone: $('#pp', o).value, level: $('#pl', o).value, guardianName: $('#pg', o).value, guardianPhone: $('#pgp', o).value }, 'Saved').then(function () { closeProfile(); reload(); }).catch(function () { }); };
      if ($('#pgc', o)) $('#pgc', o).onclick = function () { act('guardianConsent', { matric: m, ok: !p.guardianOk }, 'Saved').then(function () { openProfile(m); }).catch(function () { }); };
      $('#prel', o).onclick = function () { if (sure('Release the phone for ' + m + '?\nThe student can then sign in on a new phone.')) act('studentRelease', { matric: m }, 'Phone released').then(function () { openProfile(m); }).catch(function () { }); };
      $('#pgr', o).onclick = function () { if (sure('Remove all family (parent) links for ' + m + '?\nThey will need new invitations.')) act('guardianReset', { matric: m }, 'Family links removed').then(function () { openProfile(m); }).catch(function () { }); };
      $('#pst', o).onclick = function () { var n = prompt('Why? (kept in the log)', 'stuck after sync'); if (n != null && n.length > 2) act('fixStatus', { matric: m, note: n }, 'Marked as back on campus').then(function () { openProfile(m); }).catch(function () { }); };
      $('#pmx', o).onclick = function () { var to = prompt('Correct matric number for ' + p.name + ':', m); if (to && to !== m && sure('Change ' + m + ' to ' + to + '?\nEvery record moves to the new number.')) act('matricFix', { from: m, to: to }, 'Matric number corrected').then(function (r) { closeProfile(); openProfile(r.matric); reload(); }).catch(function () { }); };
    }).catch(function (e) { toast(e.message, 'err'); });
  }

  /* ---- Help requests: students whose phone will not work, with the phone's own check results ---- */
  function diagChips(d) {
    var c = []; function chip(ok, t) { c.push('<span class="pill ' + (ok === true ? 'ok' : ok === false ? 'bad' : '') + '">' + esc(t) + '</span>'); }
    if ('online' in d) chip(d.online, d.online ? 'Online' : 'No internet'); if (d.loc) chip(d.loc === 'granted', 'Location ' + d.loc); if (d.notif) chip(d.notif === 'granted', 'Alerts ' + d.notif);
    if ('skewSec' in d) chip(Math.abs(d.skewSec) < 120, Math.abs(d.skewSec) < 120 ? 'Clock OK' : 'Clock off ' + Math.round(Math.abs(d.skewSec) / 60) + ' min'); if (d.pending != null) chip(d.pending === 0, d.pending + ' waiting to send');
    if (d.battery != null) chip(d.battery > 15 || d.charging, 'Battery ' + d.battery + '%'); if ('standalone' in d) chip(d.standalone ? true : null, d.standalone ? 'Installed' : 'Not installed'); if (d.ver) chip(null, 'v' + d.ver);
    return c.join('');
  }
  V.asks = function (force) {
    return call('helpList', { status: FILT === 'all' ? 'all' : 'open' }).then(function (r) {
      var list = r.items;
      return '<div class="note" style="margin-bottom:12px">🛟 <b>When a student cannot use the app, it comes here</b> with what their phone found. Answer them: they see your reply inside the app. Most problems are the phone clock, blocked location, or a changed phone.</div>' +
        '<div class="seg small"><button data-f="open"' + (FILT !== 'all' ? ' aria-selected="true"' : '') + '>Waiting (' + r.openCount + ')</button><button data-f="all"' + (FILT === 'all' ? ' aria-selected="true"' : '') + '>Everything</button></div>' +
        (list.map(function (t) {
          var wait = t.waitingMin < 90 ? t.waitingMin + ' min' : t.waitingMin < 2880 ? Math.round(t.waitingMin / 60) + ' h' : Math.round(t.waitingMin / 1440) + ' days';
          return '<div class="card flat msg"><div class="rowx" style="margin:0"><b>' + esc(t.name) + '</b>' + (t.matric ? '<span class="mono small">' + esc(t.matric) + '</span>' : '') + (t.verified ? '<span class="pill ok">Registered phone</span>' : '<span class="pill warn">Unverified phone</span>') + '<span class="pill ' + (t.status === 'open' ? 'bad' : t.status === 'answered' ? 'ok' : '') + '">' + (t.status === 'open' ? 'Waiting ' + wait : t.status === 'answered' ? 'Answered' : 'Closed') + '</span></div>' +
            '<p style="margin:8px 0">' + esc(t.message) + '</p>' + (t.contact ? '<div class="small muted">Reach them: ' + esc(t.contact) + '</div>' : '') +
            '<div class="chips" style="margin:6px 0">' + diagChips(t.diag) + '</div>' +
            (t.hints.length ? '<div class="small"><b>Likely causes</b></div>' + t.hints.map(function (h) { return '<div class="note ' + (h.tone === 'bad' ? 'bad' : h.tone === 'warn' ? 'warn' : 'ok') + ' small" style="margin:4px 0">' + esc(h.text) + '</div>'; }).join('') : '') +
            t.replies.map(function (x) { return '<div class="small" style="margin-top:6px;padding:8px 10px;background:var(--brand-soft);border-radius:10px"><b>' + esc(x.by) + ':</b> ' + esc(x.text) + ' <span class="muted">· ' + ago(x.t) + '</span></div>'; }).join('') +
            (t.status !== 'closed' ? '<textarea data-rt="' + esc(t.id) + '" rows="2" maxlength="600" placeholder="Write the answer. Keep it short and clear." style="width:100%;margin-top:8px"></textarea><div class="rowx"><button class="btn primary sm" data-ra="' + esc(t.id) + '" data-close="0">Send answer</button><button class="btn ghost sm" data-ra="' + esc(t.id) + '" data-close="1">Send and close</button>' + (t.matric ? '<button class="btn ghost sm" data-pf="' + esc(t.matric) + '">Open student</button>' : '') + '</div>' : '') + '</div>';
        }).join('') || empty('🎉', 'No one is waiting', 'When a student asks for help, it appears here with what their phone found.'));
    });
  };
  V.asks_bind = function () {
    bind('.seg [data-f]', function (b) { FILT = b.dataset.f; show('people'); });
    bind('[data-pf]', function (b) { openProfile(b.dataset.pf); });
    bind('[data-ra]', function (b) { var id = b.dataset.ra, box = app.querySelector('[data-rt="' + id + '"]'), tx = box ? box.value.trim() : ''; if (tx.length < 2 && b.dataset.close !== '1') return toast('Write your answer first', 'warn'); act('helpReply', { id: id, text: tx, close: b.dataset.close === '1' }, 'Answer sent', reload).catch(function () { }); });
  };

  V.trash = function () {
    return call('listTrash').then(function (r) {
      return '<p class="muted">When security deletes something it waits here for ' + r.days + ' days, so a mistake can be undone. After that it is gone for good.</p>' +
        (r.items.length ? r.items.map(function (x) { return '<div class="card flat msg"><div class="rowx" style="margin:0"><b>' + ({ report: '📝', sos: '🆘', student: '🎓', location: '📍' }[x.kind] || '🗑️') + ' ' + esc(x.label) + '</b><span class="pill">' + x.daysLeft + ' days left</span></div><div class="small muted">Deleted by ' + esc(x.by) + ' · ' + when(x.t) + '</div><div class="small">Reason: ' + esc(x.reason) + '</div><div class="rowx"><button class="btn primary sm" data-rt="' + esc(x.id) + '">↩ Restore</button><button class="btn danger sm" data-pg="' + esc(x.id) + '">Erase for good</button></div></div>'; }).join('') : empty('🧺', 'The recycle bin is empty', 'Deleted reports, alerts, location history and students will wait here.'));
    });
  };
  V.trash_bind = function () {
    bind('[data-rt]', function (b) { act('restoreTrash', { id: b.dataset.rt }, 'Restored', reload).catch(function () { }); });
    bind('[data-pg]', function (b) { if (sure('Erase this for good? It cannot be brought back.')) act('purgeTrash', { id: b.dataset.pg }, 'Erased', reload).catch(function () { }); });
  };

  V.staff = function () {
    return ov().then(function (o0) { return Promise.all([o0.setup ? call('listStaff') : null, call('sessions')]); }).then(function (a) {
      var list = a[0], o = data.overview || {};
      if (!list || !list.length) return '<h3>Security desk setup</h3><div class="note warn">No administrator exists yet. Create the first one so the security desk can be used.</div><label class="f">Administrator name<input type="text" id="sn" placeholder="e.g. Chief Security Officer"></label><button class="btn primary" id="ssetup">Create administrator</button><div id="pinbox"></div>';
      return '<h3>Security staff</h3><p style="color:var(--muted)">ICT creates accounts and resets sign-in codes. You never choose or see a code in advance: a new random 8-digit code is shown once.</p><div class="card flat"><div class="rowx"><input type="text" id="sn" placeholder="Full name" style="flex:1 1 160px"><select id="sr"><option value="officer">Officer</option><option value="guard">Gate guard</option><option value="admin">Administrator</option></select><button class="btn primary" id="sadd">Add staff</button></div></div><div id="pinbox"></div><div class="card flat">' +
        list.map(function (s) { return '<div class="it"><div class="g"><b>' + esc(s.name) + '</b> <span class="pill ' + (s.active ? 'ok' : 'bad') + '">' + (s.active ? esc(s.role) : 'switched off') + '</span><small>Created ' + when(s.created) + ' · last sign-in ' + ago(s.lastLogin) + '</small></div><button class="btn ghost sm" data-rs="' + esc(s.name) + '">New sign-in code</button><button class="btn ghost sm" data-role="' + esc(s.name) + '" data-cur="' + esc(s.role) + '">Change role</button><button class="btn ghost sm" data-tg="' + esc(s.name) + '" data-on="' + (s.active ? 0 : 1) + '">' + (s.active ? 'Switch off' : 'Switch on') + '</button></div>'; }).join('') + '</div>' +
        '<h3>Signed-in sessions (' + a[1].items.length + ')</h3><div class="card flat">' + (a[1].items.map(function (s) { return '<div class="it"><div class="g"><b>' + esc(s.officer) + '</b><small>active ' + ago(s.seen) + '</small></div></div>'; }).join('') || '<p>Nobody is signed in.</p>') + '</div><button class="btn danger sm" id="soall">Sign everyone out</button>';
    });
  };
  function showPin(r, label) {
    var b = $('#pinbox'); if (!b) return;
    b.innerHTML = '<div class="card"><h3>' + esc(label) + '</h3><p>Give this to <b>' + esc(r.name) + '</b> now. It is shown <b>once</b> and cannot be read again.</p><div class="secret mono">' + esc(r.pin) + '</div><button class="btn primary" id="cpin">Copy</button></div>';
    $('#cpin').onclick = function () { copy('SafeGate sign-in. Name: ' + r.name + '  Code: ' + r.pin); };
  }
  V.staff_bind = function () {
    var a = $('#sadd'), s = $('#ssetup');
    if (s) s.onclick = function () { act('staffSetup', { name: $('#sn').value }, 'Administrator created').then(function (r) { showPin(r, 'Administrator created'); }).catch(function () { }); };
    if (a) a.onclick = function () { act('staffAdd', { name: $('#sn').value, role: $('#sr').value }, 'Staff added').then(function (r) { showPin(r, 'New staff member'); $('#sn').value = ''; }).catch(function () { }); };
    bind('[data-rs]', function (b) { if (sure('Make a new sign-in code for ' + b.dataset.rs + '?\nThe old code stops working and they are signed out.')) act('staffReset', { name: b.dataset.rs }, 'New code made').then(function (r) { showPin(r, 'New sign-in code'); }).catch(function () { }); });
    bind('[data-role]', function (b) { var r = prompt('New role for ' + b.dataset.role + ': officer, guard or admin', b.dataset.cur); if (r && /^(officer|guard|admin)$/.test(r.trim().toLowerCase()) && r.trim().toLowerCase() !== b.dataset.cur) act('staffUpdate', { name: b.dataset.role, role: r.trim().toLowerCase(), unlock: true }, 'Role changed', reload).catch(function () { }); else if (r) toast('Type officer, guard or admin', 'warn'); });
    bind('[data-tg]', function (b) { var on = b.dataset.on === '1'; if (on || sure('Switch off ' + b.dataset.tg + '? They are signed out at once.')) act('setStaffActive', { name: b.dataset.tg, active: on }, on ? 'Switched on' : 'Switched off', reload); });
    var so = $('#soall'); if (so) so.onclick = function () { if (sure('Sign everyone out of the security desk?')) act('signOutAll', {}, 'Everyone signed out', reload); };
  };

  V.roster = function () {
    return call('rosterStatus').then(function (r) {
      return '<h3>Student list</h3><div class="stats"><div class="stat"><b>' + r.total + '</b><span>On the list</span></div><div class="stat"><b>' + r.registered + '</b><span>Registered</span></div><div class="stat"><b>' + r.notRegistered + '</b><span>Not yet registered</span></div><div class="stat"><b>' + r.notOnList + '</b><span>Registered, not on list</span></div></div>' +
        '<div class="card flat"><h3>Import a list</h3><p>Use a CSV file whose first row has columns <b>matric</b> and <b>name</b>. Optional: level, hostel, phone, guardianname, guardianphone.</p><input type="file" id="rf1" accept=".csv,text/csv,text/plain"><label class="f">…or paste the rows here<textarea id="rt" placeholder="matric,name,hostel\nABC/2026/001,Ada Obi,Hall A"></textarea></label><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="rrep"> Replace the whole list (otherwise rows are added or updated)</label><div class="rowx"><button class="btn primary" id="rgo">Import</button><button class="btn ghost sm" id="rtpl">Download a sample file</button></div><div id="rout"></div></div>' +
        (r.hostels.length ? '<h3>Registration by hostel</h3><div class="card flat">' + r.hostels.map(function (h) { return '<div class="it"><div class="g"><b>' + esc(h.name) + '</b></div><span>' + h.registered + ' / ' + h.total + '</span></div>'; }).join('') + '</div>' : '') +
        '<div class="card flat"><h3>Remove the list</h3><p>Students already registered stay registered. Only the list is emptied.</p><button class="btn danger sm" id="rclr">Clear the student list</button></div>';
    });
  };
  V.roster_bind = function () {
    var f = $('#rf1'); f.onchange = function () { var file = f.files[0]; if (!file) return; if (file.size > 3.5e6) return toast('File is too large (limit 3.5 MB)', 'err'); var rd = new FileReader(); rd.onload = function () { $('#rt').value = rd.result; }; rd.readAsText(file); };
    $('#rtpl').onclick = function () { download('student-list-sample.csv', 'matric,name,level,hostel,phone,guardianname,guardianphone\nABC/2026/001,Ada Obi,100,Hall A,08000000000,Mr Obi,08000000001\n'); };
    $('#rgo').onclick = function () {
      var csv = $('#rt').value.trim(); if (!csv) return toast('Choose a file or paste rows first', 'warn');
      if ($('#rrep').checked && !sure('Replace the entire student list with this one?')) return;
      act('importRoster', { csv: csv, replace: $('#rrep').checked }).then(function (r) { toast('Imported', 'ok'); $('#rout').innerHTML = '<div class="note ok"><b>' + r.added + ' added, ' + r.updated + ' updated, ' + r.skipped + ' skipped.</b> ' + r.total + ' on the list.</div>' + (r.errors.length ? '<div class="note warn">' + r.errors.map(esc).join('<br>') + '</div>' : ''); }).catch(function () { });
    };
    $('#rclr').onclick = function () { if (sure('Clear the whole student list?')) act('clearRoster', {}, 'List cleared', reload); };
  };

  V.backups = function () {
    return call('backups').then(function (r) {
      return '<h3>Backups</h3><p style="color:var(--muted)">Automatic every ' + (r.everyHours || '?') + ' hours on the server. Backups hold the student, staff and activity records but not evidence files.</p><button class="btn primary" id="bnow">Back up now</button><div class="card flat" style="margin-top:12px">' +
        (r.items.map(function (b) { return '<div class="it"><div class="g"><b>' + esc(b.name) + '</b><small>' + when(b.t) + (b.bytes ? ' · ' + mb(b.bytes) : '') + '</small></div><button class="btn ghost sm" data-rb="' + esc(b.name) + '">Restore</button></div>'; }).join('') || '<p>No backups yet.</p>') + '</div><div class="note warn"><b>Restoring</b> replaces everything with that backup. A safety copy of the present state is made first, so a restore can be undone. Everyone is signed out afterwards.</div>';
    });
  };
  V.backups_bind = function () {
    $('#bnow').onclick = function () { act('backupNow', {}, 'Backup made', reload); };
    bind('[data-rb]', function (b) { if (sure('Restore ' + b.dataset.rb + '?\nAnything recorded after that backup will be lost (a safety copy is made first).') && sure('Really restore? This replaces the live data.')) act('backupRestore', { name: b.dataset.rb }, 'Restored', reload); });
  };

  V.exports = function () {
    return '<h3>Exports</h3><p style="color:var(--muted)">Spreadsheet files (CSV). Phone numbers are partly hidden. Location history, SOS, reports and evidence are not available to ICT.</p>' +
      [['students', 'Students', 'Names, matric, residence, phone state, consent'], ['staff', 'Staff', 'Accounts, roles, last sign-in'], ['audit', 'Activity log', 'Every action with who and when']].map(function (k) { return '<div class="card flat it"><div class="g"><b>' + k[1] + '</b><small>' + k[2] + '</small></div><button class="btn primary" data-ex="' + k[0] + '">Download</button></div>'; }).join('');
  };
  V.exports_bind = function () { bind('[data-ex]', function (b) { act('exportCsv', { kind: b.dataset.ex }).then(function (r) { download(r.name, r.csv); toast('Downloaded', 'ok'); }).catch(function () { }); }); };

  V.audit = function () {
    return Promise.all([call('auditLog'), call('verifyAudit')]).then(function (a) {
      var v = a[1];
      return '<h3>Activity log</h3>' + (v.ok ? '<div class="note ok"><b>✔ Log is intact.</b> Every entry matches its seal.</div>' : '<div class="note bad"><b>✖ The log was changed or damaged.</b> Restore the last good backup and find who had file access.</div>') +
        '<div class="card flat">' + (a[0].map(function (e) { return '<div class="it"><div class="g"><b>' + esc(e.action) + '</b> ' + (e.target ? '→ ' + esc(e.target) : '') + '<small>' + esc(e.officer) + ' · ' + when(e.t) + (e.detail ? ' · ' + esc(e.detail) : '') + '</small></div></div>'; }).join('') || '<p>Nothing yet.</p>') + '</div><p style="color:var(--muted)">Latest 200 shown. Download the whole log from Exports.</p>';
    });
  };

  V.notices = function () {
    return call('listNotices').then(function (list) {
      return '<h3>Notices</h3><p style="color:var(--muted)">Shown to every student in their app. Urgent notices also send a push alert. Use for outages and maintenance.</p><div class="card flat"><label class="f">Title<input type="text" id="nt" maxlength="80" placeholder="e.g. Gate scanner offline until 3 PM"></label><label class="f">Message<textarea id="nx" maxlength="400" style="min-height:70px"></textarea></label><div class="rowx"><select id="nl"><option value="info">Information</option><option value="urgent">Urgent (push alert)</option></select><select id="nh"><option value="2">Show for 2 hours</option><option value="24" selected>1 day</option><option value="72">3 days</option><option value="168">1 week</option></select><button class="btn primary" id="npost">Post</button></div></div><div class="card flat">' +
        (list.map(function (n) { return '<div class="it"><div class="g"><b>' + esc(n.title) + '</b> <span class="pill ' + (n.active ? (n.level === 'urgent' ? 'bad' : 'ok') : '') + '">' + (n.active ? n.level : 'expired') + '</span><small>' + esc(n.text) + '<br>' + esc(n.by) + ' · ' + when(n.t) + '</small></div><button class="btn ghost sm" data-dn="' + esc(n.id) + '">Delete</button></div>'; }).join('') || '<p>No notices.</p>') + '</div>';
    });
  };
  V.notices_bind = function () {
    $('#npost').onclick = function () { act('postNotice', { title: $('#nt').value, text: $('#nx').value, level: $('#nl').value, hours: +$('#nh').value }, 'Notice posted', reload).catch(function () { }); };
    bind('[data-dn]', function (b) { if (sure('Delete this notice?')) act('deleteNotice', { id: b.dataset.dn }, 'Deleted', reload); });
  };

  V.feedback = function () {
    return call('feedback').then(function (r) {
      return '<h3>Messages from users</h3><div class="note ' + (r.mail && r.mail.configured ? 'ok' : 'warn') + '">Email delivery is ' + (r.mail && r.mail.configured ? 'on' : 'off') + '. ' + r.unsent + ' not emailed yet.</div>' + (r.unsent ? '<button class="btn primary" id="fbr">Retry sending email</button>' : '') +
        '<div class="card flat">' + (r.items.map(function (f) { return '<div class="it"><div class="g"><b>' + esc(f.kind || f.type || 'Message') + '</b> ' + (f.emailed ? '<span class="pill ok">emailed</span>' : '<span class="pill warn">not emailed</span>') + '<small>' + when(f.t) + (f.page ? ' · ' + esc(f.page) : '') + '</small><div>' + esc(f.message || '') + (f.who ? '<small>From ' + esc(f.who.name || '') + ' ' + esc(f.who.matric || '') + (f.contact ? ' · ' + esc(f.contact) : '') + '</small>' : '') + '</div></div></div>'; }).join('') || '<p>No messages.</p>') + '</div><p style="color:var(--muted)">' + r.total + ' in total.</p>';
    });
  };
  V.feedback_bind = function () { var b = $('#fbr'); if (b) b.onclick = function () { act('feedbackRetry', {}, 'Retried', reload); }; };

  var SET = [
    ['schoolName', 'School name', 'text'], ['securityPhone', 'Security desk phone', 'text', 'Used by the SOS call button'], ['appUrl', 'Public address (https://…)', 'text', 'Used in share links and QR codes'], ['tzOffsetMin', 'Time zone offset in minutes', 'number', 'Nigeria is 60'],
    ['graceMin', 'Grace minutes after curfew', 'number'], ['silenceMin', 'Phone silent warning after (minutes)', 'number'], ['gatePeriodSec', 'Gate code changes every (seconds)', 'number'], ['gateMode', 'Gate mode', 'text'],
    ['freeForStudents', 'Free for every student (no ads, nothing to buy)', 'bool'], ['controllerName', 'Who is responsible for student data (shown in the privacy notice)', 'text', 'Usually the school name'], ['privacyContact', 'Privacy contact for students (email or phone)', 'text', 'Shown in the privacy notice. A real person, for questions and deletion requests'], ['lockDevice', 'Lock each student to one phone', 'bool'], ['requireRoster', 'Only students on the list may register', 'bool'], ['smsEnabled', 'Text messages on', 'bool'],
    ['mediaOn', 'Evidence uploads on', 'bool'], ['mediaDays', 'Keep evidence for (days)', 'number'], ['mediaDayMB', 'Evidence per student per day (MB)', 'number'], ['mediaTotalMB', 'Total evidence storage (MB)', 'number'],
    ['mapTiles', 'Map tiles address', 'text'], ['searchUrl', 'Place search address', 'text'], ['routeUrl', 'Route service address', 'text'], ['rotateSecret', 'Rotate gate secret daily', 'bool']
  ];
  V.settings = function () {
    return call('settingsGet').then(function (s) {
      data.set = s;
      return '<h3>Settings</h3><p style="color:var(--muted)">Technical settings only. Curfew times, tracking hours, campus location and policy wording are set by the security desk.</p><div class="card flat">' +
        SET.filter(function (d) { return d[0] in s; }).map(function (d) {
          if (d[2] === 'bool') return '<label style="display:flex;gap:10px;align-items:center;margin:10px 0"><input type="checkbox" data-k="' + d[0] + '"' + (s[d[0]] ? ' checked' : '') + '> ' + esc(d[1]) + '</label>';
          return '<label class="f">' + esc(d[1]) + (d[3] ? '<span class="hint">' + esc(d[3]) + '</span>' : '') + '<input type="' + (d[2] === 'number' ? 'number' : 'text') + '" data-k="' + d[0] + '" value="' + esc(s[d[0]]) + '"></label>';
        }).join('') + '<button class="btn primary" id="sset">Save settings</button></div>';
    });
  };
  V.settings_bind = function () {
    $('#sset').onclick = function () {
      var out = {}; Array.prototype.forEach.call(app.querySelectorAll('[data-k]'), function (el) { var k = el.dataset.k; out[k] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value; });
      act('settingsSave', { settings: out }, 'Settings saved', reload).catch(function () { });
    };
  };


  /* ---- Gate poster: one printed code at the gate, made hard to cheat without making it hard to use ---- */
  V.poster = function () {
    return Promise.all([call('gatePoster'), call('settingsGet')]).then(function (rs) {
      var g = rs[0], gp = g.gatePoint || {}, set = gp.lat != null, st = g.mode === 'static';
      data.poster = g;
      return '<h3>Gate poster</h3><p style="color:var(--muted)">One poster, printed once, stuck at the gate. Students scan it with the SafeGate app. It is made to be quick for honest students and awkward for cheats.</p>' +
        '<div class="card"><div style="text-align:center"><canvas id="pcv" style="max-width:340px;width:100%;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.18)"></canvas></div><div class="rowx" style="justify-content:center;margin-top:12px"><button class="btn primary" id="pdl">⬇ Download picture (A4, print quality)</button><button class="btn" id="ppr">🖨 Print</button></div><p class="small muted" style="text-align:center">Print on A4 or A3, in colour, and laminate or put it behind glass so rain and sun do not ruin it.</p></div>' +
        '<h3>1 · Set the exact gate spot ' + (set ? '<span class="pill ok">set</span>' : '<span class="pill bad">not set</span>') + '</h3><div class="card flat"><p class="small">Stand at the gate with your phone and tap the button. A scan from further away than the distance below is marked <b>not at the gate</b> and security sees it. Nobody is blocked.</p><div class="rowx"><button class="btn primary" id="pgps">📍 I am at the gate now</button><label class="f" style="margin:0">Allowed distance (metres)<input type="number" id="prad" min="30" max="1000" value="' + esc(gp.radiusM || 120) + '"></label><button class="btn" id="prs">Save</button></div><div class="small muted" id="pgmsg">' + (set ? 'Gate spot saved.' : 'Not set yet. Until it is set, only the wider campus circle is used.') + '</div></div>' +
        '<h3>2 · Use the printed (constant) code ' + (st ? '<span class="pill ok">on</span>' : '<span class="pill warn">off</span>') + '</h3><div class="card flat"><p class="small">' + (st ? 'The poster code never changes, so the same print keeps working.' : 'Right now the code rotates, which only works on a screen. Turn this on to use a printed poster.') + '</p>' + (st ? '' : '<button class="btn primary" id="pst">Switch to the printed poster</button>') + '</div>' +
        '<h3>Gate policy: how strict should this campus be?</h3><div class="card flat"><p class="small">Every school is different. This only changes what SafeGate <b>marks for a person to review</b>. In every setting nobody is stopped, and an emergency exit is never questioned.</p>' + [['open', 'Relaxed', 'Scans are recorded. Nothing is marked. Best for open campuses and a first month while students get used to it.'], ['standard', 'Balanced (recommended)', 'Scans far from the gate are marked for review. Mild, kind, low noise.'], ['strict', 'Strict', 'Tighter distance and fresher location needed. For campuses with a real problem of outsiders or fake scans.']].map(function (x) { return '<label style="display:flex;gap:10px;margin:10px 0;align-items:flex-start"><input type="radio" name="pol" value="' + x[0] + '"' + ((g.policy || 'standard') === x[0] ? ' checked' : '') + '><span><b>' + x[1] + '</b><br><span class="small muted">' + x[2] + '</span></span></label>'; }).join('') + '</div>' +
        '<h3>ID card rule</h3><div class="card flat"><p class="small">Follow your institution\'s policy. SafeGate never blocks a student for a missing ID: people forget it or rush out in an emergency. This only changes the poster wording.</p><select id="pid"><option value="none"' + (g.idPolicy === 'none' ? ' selected' : '') + '>No ID needed (recommended)</option><option value="ask"' + (g.idPolicy === 'ask' ? ' selected' : '') + '>Guard may ask for ID only if something looks wrong</option><option value="required"' + (g.idPolicy === 'required' ? ' selected' : '') + '>School rule: carry ID (forgetting is still never a block)</option></select> <button class="btn" id="pids">Save</button></div>' +
        '<h3>3 · If a photo of the poster is going around</h3><div class="card flat"><p class="small">Make a new poster code. Print the new poster, and the old one keeps working for 14 days so nobody is locked out while you change it. Scans from the old one are flagged. Do this whenever you hear that someone is sharing a photo.</p><button class="btn" id="prot">♻ Make a new poster code</button>' + (g.prevUntil > Date.now() ? '<div class="small muted">The old poster stops working ' + when(g.prevUntil) + '.</div>' : '') + '</div>' +
        '<h3>How this stops cheating</h3><div class="card flat"><ul class="small" style="margin:0;padding-left:18px;line-height:1.7"><li><b>Scanner only:</b> the code is not a web link. Opening it in the phone\'s Camera app does nothing, so a photo is useless unless the student also opens the SafeGate scanner.</li><li><b>Must be at the gate:</b> the phone\'s location at the moment of scanning is compared with the gate spot. A scan from the hostel, a lecture hall or home is marked.</li><li><b>Fresh location:</b> a location taken minutes earlier, or a very rough one, is marked.</li><li><b>Clues, not punishments:</b> repeat patterns show on a student\'s record for a person to look at. A weak GPS signal can look suspicious too, so nothing is ever blocked automatically.</li><li><b>Quick reset:</b> a leaked photo is fixed in one tap above.</li></ul><div class="note warn small" style="margin-top:10px"><b>Honest limit:</b> a printed code is the same for everyone, so no poster can be 100% photo-proof. A student who fakes their phone\'s GPS can still fool it. These layers make cheating hard and visible, while a normal student just scans and goes.</div></div>';
    });
  };
  V.poster_bind = function () {
    var g = data.poster || {}, cv = $('#pcv'), d = new Date(), stamp = d.toISOString().slice(0, 10);
    function paint() { try { window.SGPoster.draw(cv, { idPolicy: g.idPolicy, token: g.token, school: g.school, gateId: g.gateId, printed: stamp }); } catch (e) { toast('Could not draw the poster: ' + e.message, 'err'); } }
    paint();
    $('#pdl').onclick = function () { cv.toBlob(function (b) { var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'safegate-gate-poster.png'; document.body.appendChild(a); a.click(); a.remove(); }, 'image/png'); };
    $('#ppr').onclick = function () { var w = window.open('', '_blank'); if (!w) return toast('Allow pop-ups, or download the picture and print it.', 'warn'); w.document.write('<title>SafeGate poster</title><style>@page{size:A4;margin:0}body{margin:0}img{width:100%;display:block}</style><img src="' + cv.toDataURL('image/png') + '" onload="setTimeout(function(){print()},300)">'); w.document.close(); };
    $('#pids').onclick = function () { act('settingsSave', { settings: { idPolicy: $('#pid').value } }, 'Saved. The poster follows this rule.', reload).catch(function () { }); };
    var gps = $('#pgps'); if (gps) gps.onclick = function () {
      if (!navigator.geolocation) return toast('This device cannot give its location.', 'err');
      $('#pgmsg').textContent = 'Finding your position… stay still for a few seconds.'; var best = null, tries = 0;
      var id = navigator.geolocation.watchPosition(function (p) { tries++; if (!best || p.coords.accuracy < best.acc) best = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }; $('#pgmsg').textContent = 'Accuracy ' + Math.round(best.acc) + ' m…'; if (best.acc <= 15 || tries >= 8) done(); }, function (e) { navigator.geolocation.clearWatch(id); $('#pgmsg').textContent = 'Could not get the location: ' + (e.code === 1 ? 'allow location for this page.' : 'try outside with a clear sky.'); }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
      var to = setTimeout(done, 12000), fin = false;
      function done() { if (fin) return; fin = true; clearTimeout(to); navigator.geolocation.clearWatch(id); if (!best) return; if (best.acc > 60 && !confirm('The position is only accurate to about ' + Math.round(best.acc) + ' m. Save it anyway? Better to go outside and try again.')) { $('#pgmsg').textContent = 'Not saved.'; return; } act('settingsSave', { settings: { gatePoint: { lat: best.lat, lng: best.lng, radiusM: Number($('#prad').value) || 120 } } }, 'Gate spot saved', reload).catch(function () { }); }
    };
    Array.prototype.forEach.call(app.querySelectorAll('input[name=pol]'), function (r) { r.onchange = function () { act('settingsSave', { settings: { gatePolicy: r.value } }, 'Gate policy saved', reload).catch(function () { }); }; });
    $('#prs').onclick = function () { act('settingsSave', { settings: { gatePoint: { radiusM: Number($('#prad').value) || 120 } } }, 'Saved', reload).catch(function () { }); };
    var pst = $('#pst'); if (pst) pst.onclick = function () { act('settingsSave', { settings: { gateMode: 'static' } }, 'The printed poster is now in use', reload).catch(function () { }); };
    $('#prot').onclick = function () { if (confirm('Make a new poster code? You must print and put up the new poster. The old one keeps working for 14 days.')) act('settingsSave', { settings: { posterRotate: true } }, 'New poster code made. Print the new poster.', reload).catch(function () { }); };
  };

  /* ---- Share the student app: the address changes when the tunnel restarts, so ICT needs one place to re-share it ---- */
  function shareCard() {
    var url = location.origin + '/', msg = 'Install SafeGate on your phone (your campus safety app): ' + url + '\nOpen it, then add it to your Home Screen.';
    return '<div class="card" id="sharecard"><h3 style="margin-top:0">📲 Share the student app</h3><p class="small muted">This is the address students open. If it ever changes, send the new one from here. Put the QR on a poster at the gate.</p><div class="mono small" style="margin:8px 0">' + esc(url) + '</div>' +
      '<div class="rowx"><button class="btn primary sm" id="shcopy">Copy message</button><a class="btn ghost sm" id="shwa" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(msg) + '">Share on WhatsApp</a></div><div id="shqr" style="text-align:center;margin-top:8px"></div>' +
      '<div class="note small" style="margin-top:8px">⚠ On a free temporary tunnel the address changes each restart and the old app stops opening. A fixed address (Cloudflare named tunnel or a VPS) ends that for good. See the deployment guide.</div></div>';
  }
  function shareBind() { var q = $('#shqr'); if (q) q.appendChild(qrCanvas(location.origin + '/')); var c = $('#shcopy'); if (c) c.onclick = function () { copy('Install SafeGate on your phone (your campus safety app): ' + location.origin + '/\nOpen it, then add it to your Home Screen.'); }; }

  V.links = function () {
    return call('links').then(function (r) {
      return shareCard() + '<h3>Access links</h3><div class="note warn"><b>A link is a master key.</b> Anyone who has it can open this console. Send it only to named ICT people, never post it in groups. Give each person their own link so one can be cancelled without disturbing the rest.</div><div id="newlink"></div><div class="card flat"><div class="rowx"><input type="text" id="ln" placeholder="Who is this link for? e.g. Tunde (ICT)" style="flex:1 1 200px"><button class="btn primary" id="lgo">Create link</button></div></div><div class="card flat">' +
        r.items.map(function (l) { return '<div class="it"><div class="g"><b>' + esc(l.name) + '</b> ' + (l.revoked ? '<span class="pill bad">cancelled</span>' : '<span class="pill ok">working</span>') + (l.current ? ' <span class="pill">this link</span>' : '') + '<small>Created ' + when(l.created) + ' by ' + esc(l.by) + ' · used ' + l.uses + ' times · last ' + ago(l.lastUsed) + '</small></div>' + (l.revoked ? '' : '<button class="btn ghost sm" data-lrot="' + esc(l.id) + '">Replace link</button><button class="btn ghost sm" data-lrev="' + esc(l.id) + '">Cancel</button>') + '</div>'; }).join('') + '</div>';
    });
  };
  function showLink(r, why) {
    var url = location.origin + '/ict/' + r.token, b = $('#newlink'); if (!b) return;
    b.innerHTML = '<div class="card"><h3>' + esc(why) + ' for ' + esc(r.name) + '</h3><p>This is shown <b>once</b>. Copy it now.</p><p class="mono" id="lurl">' + esc(url) + '</p><div class="rowx"><button class="btn primary" id="lcp">Copy link</button></div><div id="lqr" style="text-align:center"></div></div>';
    $('#lqr').appendChild(qrCanvas(url)); $('#lcp').onclick = function () { copy(url); };
  }
  V.links_bind = function () {
    shareBind();
    $('#lgo').onclick = function () { act('linkCreate', { name: $('#ln').value }, 'Link created').then(function (r) { showLink(r, 'New link'); $('#ln').value = ''; }).catch(function () { }); };
    bind('[data-lrev]', function (b) { if (sure('Cancel this link? Anyone using it is locked out immediately.')) act('linkRevoke', { id: b.dataset.lrev }, 'Link cancelled').then(function (r) { if (r.self) { app.innerHTML = '<div class="card"><h2>You cancelled the link you were using</h2><p>Open another working link to continue.</p></div>'; } else reload(); }).catch(function () { }); });
    bind('[data-lrot]', function (b) { if (sure('Replace this link with a new one? The old one stops working at once.')) act('linkRotate', { id: b.dataset.lrot }, 'New link made').then(function (r) { showLink(r, 'Replacement link'); }).catch(function () { }); });
  };

  V.diag = function () {
    return Promise.all([call('overview'), call('logs'), call('pushStats'), call('smsStatus')]).then(function (a) {
      var s = a[0].server || {}, p = a[2], sm = a[3];
      return '<h3>Diagnostics</h3><div class="card flat"><div class="it"><div class="g"><b>Server</b><small>version ' + esc(s.version || '–') + ' · node ' + esc(s.node || '–') + (s.uptimeSec != null ? ' · up ' + Math.round(s.uptimeSec / 60) + ' min' : '') + '</small></div></div><div class="it"><div class="g"><b>Records</b><small>' + a[0].counts.events + ' gate events · ' + a[0].counts.pings + ' location points · ' + a[0].counts.audit + ' log entries</small></div></div><div class="it"><div class="g"><b>Push alerts</b><small>' + (p.enabled ? 'on' : 'off') + ' · ' + p.students + ' student devices · ' + p.staff + ' staff devices</small></div></div><div class="it"><div class="g"><b>Text messages</b><small>' + (sm.enabled ? 'on' : 'off') + ' · provider ' + esc(sm.provider || 'none') + ' · ' + (sm.configured ? 'configured' : 'not configured') + ' · ' + sm.sentToday + ' sent today</small></div></div></div>' +
        '<h3>Recent server errors</h3>' + (a[1].items.length ? '<pre>' + esc(a[1].items.slice(-60).map(function (l) { return typeof l === 'string' ? l : (l.t ? new Date(l.t).toISOString() + ' ' : '') + (l.msg || l.m || JSON.stringify(l)); }).join('\n')) + '</pre>' : '<div class="note ok">No errors recorded.</div>') + '<button class="btn primary" id="dcp">Copy report for support</button>';
    });
  };
  V.diag_bind = function () { $('#dcp').onclick = function () { var pre = $('pre'); copy('SafeGate ICT report ' + new Date().toISOString() + '\n' + JSON.stringify((data.overview || {}).counts || {}) + '\n' + (pre ? pre.textContent : 'no errors')); }; };

  V.help = function () {
    return '<h3>Help and runbook</h3>' + [
      ['A student changed phone or lost it', 'Students → search the matric → Release phone. They can then sign in on the new phone. If they asked from the app, approve it under Waiting for a new phone.'],
      ['A guard or officer forgot their code', 'Staff → New sign-in code. Give the new 8-digit code to them in person or by a trusted call.'],
      ['Nobody can sign in at the security desk', 'Check-up shows if there is no active administrator. Staff → add one, or switch one on.'],
      ['Something looks wrong with the data', 'Backups → Back up now first, then Restore the last good backup. A safety copy is always made.'],
      ['The link was shared by mistake', 'Access links → Replace link (or Cancel). Create a link for the next person before cancelling the last one.'],
      ['New semester student list', 'Student list → paste or upload the CSV. Use Replace only when you want the old list gone.'],
      ['Server is slow or down', 'Diagnostics shows memory, disk and recent errors. Restart the server (Termux: run the update command again; VPS: systemctl restart safegate).'],
      ['What ICT can and cannot see', 'ICT can read reports, emergency alerts and feedback (Voices, Insights) to understand what students need, and every time you open them it is logged. ICT cannot see live locations, map positions or the photos, voice notes and videos sent as evidence. Those stay with the security desk so nobody can be tracked or exposed.'],
      ['A student says the app does not work', 'People → Help requests. The student already sent what their phone found (clock, location, internet, stuck records) with plain likely causes. Answer in one or two lines. They see your reply inside the app.'],
      ['Security deleted something by mistake', 'Data → Recycle bin. Deleted reports, emergency records, location history and students wait there for 30 days. Press Restore.'],
      ['A student typed the wrong matric number', 'People → Students → Open → Fix matric number. Every record moves to the corrected number. It cannot be used if the new number belongs to someone else.'],
      ['A student shows as outside but is on campus', 'People → Students → Open → Mark as back on campus. Add the reason, for example a sync mistake.'],
      ['A parent has the wrong person linked', 'People → Students → Open → Remove family links. The parent needs a new invitation.']
    ].map(function (h) { return '<details class="card flat"><summary>' + esc(h[0]) + '</summary><p>' + esc(h[1]) + '</p></details>'; }).join('');
  };

  if (!TOKEN) return fatal({ message: 'The address is not complete. It must end with 20 letters and numbers.' });
  document.title = 'SafeGate – ICT console';
  ov().then(function () { show('home', true); }).catch(fatal);
})();
