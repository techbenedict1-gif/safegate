/* "Get SafeGate" page: one big button, whatever the phone or browser. */
(function () {
  'use strict';
  var box = document.getElementById('action'), ua = navigator.userAgent || '', deferred = null, shown = '';
  var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  var ios = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var android = /android/i.test(ua), mobile = ios || android || /mobi/i.test(ua);
  var inApp = /FBAN|FBAV|FB_IAB|Instagram|TikTok|musical_ly|Snapchat|Twitter|Line\/|MicroMessenger|; wv\)/i.test(ua);
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function step(n, t) { return '<div style="display:flex;gap:12px;align-items:center;margin:12px 0"><span style="flex:none;width:32px;height:32px;border-radius:50%;background:var(--pri,#0b5d7a);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700">' + n + '</span><div>' + t + '</div></div>'; }
  var here = location.origin + location.pathname;
  function set(key, html) { if (shown === key) return; shown = key; box.innerHTML = html; wire(); }
  function wire() {
    var b = document.getElementById('inst'); if (b) b.onclick = doInstall;
    var c = document.getElementById('copy'); if (c) c.onclick = function () {
      var done = function () { c.textContent = 'Copied. Paste it in your browser.'; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(here).then(done, done); else { var t = document.createElement('textarea'); t.value = here; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch (e) {} t.remove(); done(); }
    };
    var q = document.getElementById('qr'); if (q) { try { SG.qr(q, here, 220); } catch (e) {} }
  }
  function doInstall() {
    if (!deferred) return; var d = deferred; deferred = null; d.prompt();
    d.userChoice.then(function (r) { if (r && r.outcome === 'accepted') installed(); else render(); }, render);
  }
  function installed() {
    set('done', '<div style="text-align:center"><div style="font-size:3rem">✅</div><h2 style="margin:6px 0">SafeGate is on your phone</h2><p class="muted">Find the SafeGate icon with your other apps and open it from there.</p><a class="btn primary big block" href="./" style="text-decoration:none">Open SafeGate now</a></div>');
  }
  function render() {
    if (standalone) { location.replace('./'); return; }
    if (!mobile) {
      return set('desk', '<h2 style="margin-top:0">Open this on your phone</h2><p class="muted">Scan with your phone camera:</p><div style="text-align:center"><canvas id="qr" aria-label="QR code for this page"></canvas></div><p class="small muted" style="text-align:center">Or type this address on your phone:<br><b>' + esc(here) + '</b></p>');
    }
    if (inApp) {
      var host = location.host + location.pathname, scheme = location.protocol.replace(':', ''), intent = 'intent://' + host + '#Intent;scheme=' + scheme + ';package=com.android.chrome;S.browser_fallback_url=' + encodeURIComponent(here) + ';end';
      return set('inapp', '<h2 style="margin-top:0">One quick step</h2><p>This page is open inside another app (like Facebook or Instagram), and phones do not allow installing from there.</p>' +
        (android ? '<a class="btn primary big block" href="' + esc(intent) + '" style="text-decoration:none">Open in Chrome</a>' : step(1, 'Tap the <b>⋯</b> or <b>Share</b> button at the top or bottom') + step(2, 'Choose <b>Open in Safari</b>')) +
        '<button class="btn block" id="copy" style="margin-top:10px">Copy the link instead</button>');
    }
    if (ios) {
      return set('ios', '<h2 style="margin-top:0">Add it to your Home Screen</h2>' + step(1, 'Tap the <b>Share</b> button <span style="font-size:1.2em" aria-hidden="true">⬆️</span> at the bottom of the screen') + step(2, 'Scroll and tap <b>Add to Home Screen</b> <span aria-hidden="true">➕</span>') + step(3, 'Tap <b>Add</b>. Open SafeGate from your Home Screen.') +
        '<p class="small muted">Alerts only work once it is on your Home Screen (iPhone iOS 16.4 or newer).</p>');
    }
    if (deferred) {
      return set('prompt', '<h2 style="margin-top:0">Install SafeGate</h2><p class="muted">One tap. It appears with your other apps and opens full screen.</p><button class="btn primary big block" id="inst">Install SafeGate</button>');
    }
    set('wait', '<h2 style="margin-top:0">Getting ready…</h2><p class="muted">One moment.</p>');
  }
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; render(); });
  window.addEventListener('appinstalled', installed);
  if (!mobile || ios || inApp) render(); else { render(); setTimeout(function () {
    if (!deferred && shown === 'wait') set('menu', '<h2 style="margin-top:0">Add it from the menu</h2>' + step(1, 'Tap the <b>⋮</b> menu in your browser') + step(2, 'Tap <b>Install app</b> or <b>Add to Home screen</b>') + step(3, 'Tap <b>Install</b>'));
  }, 2500); }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
})();
