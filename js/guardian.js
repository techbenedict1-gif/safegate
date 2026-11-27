/* SafeGate — family view. Read-only status for a parent or guardian. Never shows location. */
(function () {
  'use strict';
  var SG = window.SG, esc = SG.esc, $ = SG.$, view = $('#view'), top = $('#top'), upd = $('#upd'), lastUpd = '', pendingPhone = '';
  var token = (/[?&]t=([A-Za-z0-9]+)/.exec(location.search) || [])[1] || '', timer = null;
  function draw(r) {
    SG.setServerTime(r.serverTime); SG.tz = r.tz == null ? 60 : r.tz;
    top.innerHTML = '<div class="topbar"><div class="brand"><span>' + esc(r.school) + '</span></div><span class="pill ok"><i class="dot"></i>Live</span></div>';
    var h = '';
    if (r.alerted) h += '<div class="note bad" role="alert"><b>Security has been alerted about ' + esc(r.name) + ' and is responding.</b>' + (r.securityPhone ? '<div style="margin-top:6px"><a class="btn danger" href="tel:' + esc(r.securityPhone.replace(/[^\d+]/g, '')) + '">📞 Call school security</a></div>' : '') + '</div>';
    if (r.outside) {
      var late = r.expectedReturn && SG.now() > r.expectedReturn;
      h += '<div class="hero out"><h1>' + esc(r.name) + ' is out of school</h1><div class="sub">Going to <b>' + esc(r.destination || 'not stated') + '</b></div><div class="kv"><div><span>Left at</span><b>' + esc(SG.dt(r.since)) + '</b></div><div><span>Back by</span><b>' + (r.expectedReturn ? esc(SG.dt(r.expectedReturn)) : '—') + '</b></div></div>' +
        (late ? '<div style="margin-top:10px;font-weight:700">⚠ Later than planned. Security is following up.</div>' : '') + '</div>';
    } else {
      h += '<div class="hero"><h1>' + esc(r.name) + ' is at school</h1><div class="sub">' + (r.lastEventT ? 'Last scanned in ' + esc(SG.ago(r.lastEventT)) : 'No trips recorded yet') + '</div></div>';
    }
    h += '<p class="small muted center" style="margin-top:16px">Updated ' + esc(SG.hm(SG.now())) + '. This page refreshes by itself. It shows trip status only, never location.' + (r.securityPhone && !r.alerted ? '<br>School security: <a href="tel:' + esc(r.securityPhone.replace(/[^\d+]/g, '')) + '">' + esc(r.securityPhone) + '</a>' : '') + '</p>';
    view.innerHTML = h;
    if (r.updates) drawUpd(r.updates, r.name);
  }
  function money(u, k) { var v = k / 100; return u.currency + (v % 1 ? v.toFixed(2) : v); }
  function drawUpd(u, name) {
    if (!u.available) { upd.innerHTML = ''; return; }
    var sig = JSON.stringify(u) + pendingPhone; if (sig === lastUpd) return;
    if (upd.contains(document.activeElement) && /INPUT|SELECT/.test(document.activeElement.tagName)) return;
    lastUpd = sig;
    var h = '<div class="card"><h2 style="margin-top:0">Know when ' + esc(name) + ' is safe</h2><p class="small muted">We text you when ' + esc(name) + ' leaves school, gets back, is late, or presses the emergency button. <b>Emergency texts are always free.</b> ' +
      (u.metered ? (u.starter ? 'Your first ' + u.starter + ' texts are on us. After that each text uses a small amount of credit (' + esc(money(u, u.price)) + ').' : 'Each text uses a small amount of credit (' + esc(money(u, u.price)) + ').') : 'The school pays for these texts.') + ' Reply STOP to any text to opt out. We never send location.</p>';
    u.subs.forEach(function (x) {
      h += '<div class="row" style="flex-wrap:wrap;gap:8px;align-items:center;border-top:1px solid var(--line,#ddd);padding:10px 0"><b>' + esc(x.phone) + '</b>' +
        (x.bal != null ? '<span class="pill ' + (x.texts < 3 ? 'warn' : 'ok') + '">' + x.texts + ' text' + (x.texts === 1 ? '' : 's') + ' left</span>' : '') +
        '<span style="flex:1"></span>' + ['out:Leaves', 'in:Returns', 'overdue:Late'].map(function (k) { var a = k.split(':'); return '<label class="small"><input type="checkbox" data-sub="' + esc(x.id) + '" data-k="' + a[0] + '"' + (x.on[a[0]] ? ' checked' : '') + '> ' + a[1] + '</label>'; }).join(' ') +
        '<button class="btn small ghost" data-rm="' + esc(x.id) + '">Stop</button></div>';
      if (x.bal != null) {
        if (u.payOnline) h += '<div class="row" style="gap:6px;flex-wrap:wrap;padding-bottom:8px"><span class="small muted">Add texts:</span>' + [500, 1000, 2000].map(function (n) { return '<button class="btn small" data-top="' + esc(x.id) + '" data-n="' + n + '">+' + Math.floor(n * 100 / u.price) + ' texts <span class="muted">(' + esc(u.currency + n) + ')</span></button>'; }).join('') + '</div>';
        else if (u.instructions) h += '<p class="small muted">' + esc(u.instructions) + '</p>';
      }
    });
    if (u.subs.length < 3) h += pendingPhone ? '<div style="border-top:1px solid var(--line,#ddd);padding-top:10px"><label class="small">Code sent to ' + esc(pendingPhone) + '</label><div class="row" style="gap:8px"><input id="uCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6-digit code" style="flex:1"><button class="btn" id="uVer">Confirm</button></div></div>' :
      '<div style="border-top:1px solid var(--line,#ddd);padding-top:10px"><label class="small" for="uPhone">Your phone number</label><div class="row" style="gap:8px"><input id="uPhone" type="tel" inputmode="tel" autocomplete="tel" placeholder="0803 000 0000" style="flex:1"><button class="btn" id="uSend">Send code</button></div></div>';
    h += '<div id="uMsg" class="small" role="status" style="margin-top:8px"></div></div>';
    upd.innerHTML = h;
  }
  var enteredPhone = '';
  function msg(t, bad2) { var m = $('#uMsg'); if (m) { m.textContent = t; m.style.color = bad2 ? '#b3261e' : ''; } }
  function done(r) { lastUpd = ''; pendingPhone = ''; drawUpd(r.updates, ''); load(); }
  upd.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.id === 'uSend') { var ph = $('#uPhone').value.trim(); if (!ph) return msg('Enter your phone number', 1); b.disabled = true; SG.call('guardianSubscribe', { token: token, phone: ph }).then(function (r) { enteredPhone = ph; pendingPhone = r.phone; lastUpd = ''; load(); setTimeout(function () { var c = $('#uCode'); if (c) c.focus(); }, 300); }, function (er) { b.disabled = false; msg(er.message, 1); }); }
    else if (b.id === 'uVer') { var cd = $('#uCode').value.trim(); b.disabled = true; SG.call('guardianVerify', { token: token, phone: enteredPhone, code: cd }).then(function (r) { pendingPhone = ''; lastUpd = ''; drawUpd(r.updates, ''); load(); }, function (er) { b.disabled = false; msg(er.message, 1); }); }
    else if (b.dataset.rm) { if (confirm('Stop text updates to this phone?')) SG.call('guardianRemove', { token: token, id: b.dataset.rm }).then(function () { lastUpd = ''; load(); }, function (er) { msg(er.message, 1); }); }
    else if (b.dataset.top) {
      b.disabled = true; fetch('/api/pay/init', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gtoken: token, subId: b.dataset.top, naira: +b.dataset.n }) })
        .then(function (r) { return r.json(); }).then(function (j) { if (j.result && j.result.url) location.href = j.result.url; else { b.disabled = false; msg(j.error ? j.error.message : 'Could not start payment', 1); } }, function () { b.disabled = false; msg('Cannot reach the payment service', 1); });
    }
  });
  upd.addEventListener('change', function (e) {
    var c = e.target; if (!c.dataset.sub) return; var on = {}; on[c.dataset.k] = c.checked; SG.call('guardianSettings', { token: token, id: c.dataset.sub, on: on }).then(function () { lastUpd = ''; }, function (er) { msg(er.message, 1); });
  });
  function bad(e) {
    if (e && e.server) { clearInterval(timer); view.innerHTML = '<div class="hero"><h1>Link not valid</h1><div class="sub">' + esc(e.message) + '</div></div>'; }
    else if (!view.innerHTML) view.innerHTML = '<div class="note warn">Cannot reach the school system. Trying again…</div>';
  }
  function load() { SG.call('guardianView', { token: token }).then(draw, bad); }
  if (!token) bad({ server: true, message: 'This link is incomplete. Ask the student to send it again.' });
  else { load(); timer = setInterval(load, 20000); }
})();
