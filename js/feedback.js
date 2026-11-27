/* SafeGate feedback form. Shared by the student app and the security desk.
 * SGFeedback.mount(el, { role, who:{name,matric}|null, page, back }) draws the form into el and runs it on its own.
 * A message is sent to the server, which saves it first and then emails the developer. With no connection it waits on the phone and is sent later. */
(function () {
  'use strict';
  var VER = '13.12.1', QK = 'sg_fb_queue', DK = 'sg_fb_dev';
  var KINDS = [['love', '❤', 'I love this', 'Tell us what you enjoy and what we must never change.'], ['fix', '🔧', 'Please fix', 'What is not working well? What should be better?'], ['idea', '💡', 'I have an idea', 'What would make SafeGate more useful to you?'], ['broke', '🐞', 'Something broke', 'What happened? What were you doing when it went wrong?'], ['other', '💬', 'Something else', 'Anything you want us to know.']];
  var AREAS = ['Everything', 'Gate pass and scanning', 'Safety map', 'Emergency button', 'Walk with me / trips', 'Reports', 'Family link', 'Security desk', 'Speed and battery', 'Looks and design', 'Other'];
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function get(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function dev() { var d = get(DK, ''); if (!d) { d = 'fb' + Math.random().toString(36).slice(2) + Date.now().toString(36); set(DK, d); } return d; }
  function rid() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function post(p) {
    var ctl = window.AbortController ? new AbortController() : null, to = setTimeout(function () { if (ctl) ctl.abort(); }, 15000);
    return fetch('api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p), signal: ctl ? ctl.signal : undefined }).then(function (r) {
      clearTimeout(to);
      return r.json().catch(function () { throw { net: true }; }).then(function (j) {
        if (r.status === 404 || r.status === 405 || r.status === 501) throw { net: true, nosrv: true };
        if (r.ok && j.ok) return j; if (r.status >= 500) throw { net: true };
        throw { msg: (j.error && j.error.message) || 'Could not send. Please try again.' };
      });
    }, function () { clearTimeout(to); throw { net: true }; });
  }
  function queue() { return get(QK, []); }
  function flush() {
    var q = queue(); if (!q.length || (navigator.onLine === false)) return Promise.resolve(0);
    var p = q[0]; return post(p).then(function () { set(QK, queue().filter(function (x) { return x.cid !== p.cid; })); return flush(); }, function (e) { if (!e.net) set(QK, queue().filter(function (x) { return x.cid !== p.cid; })); return 0; });
  }
  function mount(el, ctx) {
    ctx = ctx || {}; var S = { kind: '', rating: 0, sending: false, done: null, queued: false };
    function draw() {
      if (S.done) { el.innerHTML = '<div class="card center" role="status" style="padding:24px"><div style="font-size:52px">🙏</div><h2 style="margin:8px 0">' + (S.queued ? 'Saved. Will send soon.' : 'Thank you!') + '</h2><p>' + (S.queued ? 'You have no internet right now. Your message is saved on this phone and will be sent by itself when you are online.' : 'Your message reached Benedict, who builds SafeGate and reads every one.') + '</p>' + (S.done.ref ? '<p class="small muted">Reference: <b>' + esc(S.done.ref) + '</b></p>' : '') + '<button class="btn primary block" data-fb="again">Send another message</button>' + (ctx.back ? '<button class="btn block" data-fb="back" style="margin-top:8px">Back</button>' : '') + '</div>'; return; }
      var K = KINDS.filter(function (k) { return k[0] === S.kind; })[0], h = '<div class="card"><h2 style="margin-top:0">Tell us what you think</h2><p class="muted" style="margin-top:4px">Your message goes straight to Benedict, who builds SafeGate and reads every one. Say what you love, what to fix, or what you wish it did.</p>';
      h += '<div class="small" style="margin:10px 0 6px"><b>What is it about?</b></div><div class="chips" role="radiogroup" aria-label="Type of message">' + KINDS.map(function (k) { return '<button type="button" role="radio" aria-checked="' + (S.kind === k[0]) + '" class="chip' + (S.kind === k[0] ? ' on' : '') + '" data-fb="kind" data-k="' + k[0] + '"><span>' + k[1] + ' ' + k[2] + '</span></button>'; }).join('') + '</div>';
      h += '<div class="small" style="margin:14px 0 6px"><b>How is SafeGate for you?</b> <span class="muted">(optional)</span></div><div class="row" role="radiogroup" aria-label="Rating" style="gap:4px;flex-wrap:nowrap">' + [1, 2, 3, 4, 5].map(function (n) { return '<button type="button" role="radio" aria-checked="' + (S.rating === n) + '" aria-label="' + n + ' out of 5" data-fb="star" data-n="' + n + '" style="font-size:2rem;line-height:1;background:none;border:0;padding:4px 6px;cursor:pointer;color:' + (n <= S.rating ? '#e0a100' : '#b8c0c8') + '">' + (n <= S.rating ? '★' : '☆') + '</button>'; }).join('') + '</div>';
      h += '<label class="f" for="fbArea">Which part?</label><select id="fbArea">' + AREAS.map(function (a) { return '<option>' + esc(a) + '</option>'; }).join('') + '</select>';
      h += '<label class="f" for="fbMsg">Your message</label><textarea id="fbMsg" rows="6" maxlength="2000" placeholder="' + esc(K ? K[3] : 'Write here. Be as honest as you like.') + '" style="width:100%"></textarea><div class="small muted" style="text-align:right"><span id="fbCount">0</span>/2000</div>';
      h += '<label class="f" for="fbContact">How can we reach you? <span class="muted">(optional, email or phone)</span></label><input id="fbContact" type="text" maxlength="80" autocomplete="off" inputmode="email" placeholder="So we can reply or ask a question">';
      if (ctx.who && (ctx.who.name || ctx.who.matric)) h += '<label class="check" style="margin-top:10px"><input type="checkbox" id="fbWho"><span>Include my name' + (ctx.who.matric ? ' and matric number' : '') + ' <span class="small muted">(otherwise your message is anonymous)</span></span></label>';
      h += '<input type="text" id="fbWeb" aria-label="Leave this empty" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;height:0;width:0;opacity:0">';
      h += '<div class="note small" style="margin-top:12px">🔒 We never send your location. Your school’s security office cannot read this message.</div><div id="fbErr" class="note warn small" role="alert" style="display:none;margin-top:10px"></div>';
      h += '<button class="btn primary block big" style="margin-top:12px" data-fb="send"' + (S.sending ? ' disabled' : '') + '>' + (S.sending ? 'Sending…' : 'Send to Benedict') + '</button></div>';
      var keep = { m: (el.querySelector('#fbMsg') || {}).value, c: (el.querySelector('#fbContact') || {}).value, a: (el.querySelector('#fbArea') || {}).value, w: (el.querySelector('#fbWho') || {}).checked };
      el.innerHTML = h; var m = el.querySelector('#fbMsg'); if (keep.m) m.value = keep.m; if (keep.c) el.querySelector('#fbContact').value = keep.c; if (keep.a) el.querySelector('#fbArea').value = keep.a; if (keep.w && el.querySelector('#fbWho')) el.querySelector('#fbWho').checked = true;
      el.querySelector('#fbCount').textContent = m.value.length;
    }
    function err(t) { var e = el.querySelector('#fbErr'); if (!e) return; e.textContent = t; e.style.display = 'block'; }
    function send() {
      if (S.sending) return; var msg = (el.querySelector('#fbMsg').value || '').trim();
      if (!S.kind) return err('Pick what your message is about first.'); if (msg.length < 10) return err('Please write a little more, at least 10 letters.');
      var who = el.querySelector('#fbWho'), p = { cid: rid(), deviceId: dev(), kind: S.kind, rating: S.rating, area: el.querySelector('#fbArea').value, message: msg, contact: el.querySelector('#fbContact').value.trim(), role: ctx.role || 'student', page: ctx.page || '', ver: VER, website: el.querySelector('#fbWeb').value, who: who && who.checked ? ctx.who : null };
      S.sending = true; var keep = { m: msg }; draw(); el.querySelector('#fbMsg').value = keep.m; el.querySelector('#fbCount').textContent = keep.m.length;
      post(p).then(function (j) { S.sending = false; S.done = j; S.queued = false; draw(); }, function (e) {
        S.sending = false;
        if (e.net && !e.nosrv) { var q = queue(); q.push(p); set(QK, q.slice(-10)); S.done = {}; S.queued = true; draw(); }
        else { draw(); el.querySelector('#fbMsg').value = msg; err(e.nosrv ? 'This link is not connected to a SafeGate server, so the message could not be sent.' : (e.msg || 'Could not send. Please try again.')); }
      });
    }
    el.addEventListener('click', function (ev) {
      var b = ev.target.closest && ev.target.closest('[data-fb]'); if (!b || !el.contains(b)) return; var a = b.getAttribute('data-fb');
      if (a === 'kind') { S.kind = b.getAttribute('data-k'); draw(); } else if (a === 'star') { var n = +b.getAttribute('data-n'); S.rating = S.rating === n ? 0 : n; draw(); }
      else if (a === 'send') send(); else if (a === 'again') { S.done = null; S.kind = ''; S.rating = 0; draw(); } else if (a === 'back' && ctx.back) ctx.back();
    });
    el.addEventListener('input', function (ev) { if (ev.target.id === 'fbMsg') el.querySelector('#fbCount').textContent = ev.target.value.length; });
    draw();
  }
  window.addEventListener('online', function () { flush(); });
  setTimeout(flush, 4000);
  window.SGFeedback = { mount: mount, flush: flush, version: VER };
})();
