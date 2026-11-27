/* Shared browser helpers: storage, transport (real server or in-browser demo), formatting. */
(function () {
  'use strict';
  var SG = window.SG = window.SG || {};
  SG.version = '13.12.1'; SG.brand = 'ResultFlow';
  SG.powered = function () { return '<div class="powered">Powered by <b>' + SG.brand + '</b> · SafeGate v' + SG.version + '</div>'; };
  var C = window.SGCore, U = C.util;

  SG.$ = function (sel, root) { return (root || document).querySelector(sel); };
  SG.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  SG.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  SG.uuid = function () {
    try { if (crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    return U.rnd(16);
  };
  SG.prefs = {
    get: function () { return SG.store.get('sg_prefs', {}) || {}; },
    apply: function () {
      var p = SG.prefs.get(), h = document.documentElement;
      ['size', 'contrast', 'calm'].forEach(function (k) { if (p[k]) h.setAttribute('data-' + k, p[k]); else h.removeAttribute('data-' + k); });
    },
    set: function (k, v) { var p = SG.prefs.get(); if (v) p[k] = v; else delete p[k]; SG.store.set('sg_prefs', p); SG.prefs.apply(); }
  };
  SG.store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  /* ---------- time (school time zone, corrected by server clock) */
  SG.tz = 60; SG.skew = SG.store.get('sg_skew', 0);
  SG.now = function () { return Date.now() + SG.skew; };
  SG.setServerTime = function (t) { if (typeof t === 'number') { SG.skew = t - Date.now(); SG.store.set('sg_skew', SG.skew); } };
  SG.hm = function (t) { return t ? U.fmtLocal(t, SG.tz).slice(11) : '—'; };
  SG.day = function (t) { return t ? U.fmtLocal(t, SG.tz).slice(0, 10) : '—'; };
  SG.dt = function (t) {
    if (!t) return '—';
    var s = U.fmtLocal(t, SG.tz), today = U.fmtLocal(SG.now(), SG.tz).slice(0, 10);
    return s.slice(0, 10) === today ? 'Today ' + s.slice(11) : s.slice(5, 10) + ' ' + s.slice(11);
  };
  SG.dur = function (ms) {
    ms = Math.max(0, ms); var m = Math.round(ms / 60000);
    if (m < 1) return 'under 1 min';
    if (m < 60) return m + ' min';
    var h = Math.floor(m / 60), r = m % 60;
    if (h < 48) return h + ' h' + (r ? ' ' + r + ' min' : '');
    return Math.floor(h / 24) + ' days';
  };
  SG.ago = function (t) { return t ? SG.dur(SG.now() - t) + ' ago' : 'never'; };

  /* ---------- transport */
  SG.demo = location.protocol === 'file:' || /[?&]demo=1/.test(location.search);
  function demoCall(method, args) {
    var db; try { db = JSON.parse(localStorage.getItem('sg_demo_db') || '{}'); } catch (e) { db = {}; }
    var srv = C.createServer(db, { save: function () { try { localStorage.setItem('sg_demo_db', JSON.stringify(db)); } catch (e) {} } });
    try { var r = srv.rpc(method, args); localStorage.setItem('sg_demo_db', JSON.stringify(db)); return Promise.resolve(r); }
    catch (e) { return Promise.reject({ code: e.code || 'error', message: e.message, server: true }); }
  }
  SG.call = function (method, args, timeoutMs) {
    if (SG.demo) return demoCall(method, args || {});
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var to = setTimeout(function () { if (ctl) ctl.abort(); }, timeoutMs || 12000);
    return fetch('api/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ method: method, args: args || {} }),
      signal: ctl ? ctl.signal : undefined, cache: 'no-store' })
      .then(function (res) {
        clearTimeout(to);
        return res.json().then(function (j) {
          if (!res.ok || j.error) throw { code: (j.error && j.error.code) || 'error', message: (j.error && j.error.message) || 'Error', server: true, status: res.status };
          return j.result;
        }, function () { throw res.status === 404 || res.status === 405 || res.status === 501 ? { code: 'no-server', message: 'This address has no SafeGate server', status: res.status } : { code: 'network', message: 'Bad response from server' }; });
      }, function () { clearTimeout(to); throw { code: 'network', message: 'No connection' }; });
  };

  /* ---------- toast */
  SG.toast = function (msg, kind) {
    var box = document.getElementById('toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    var t = document.createElement('div'); t.className = 'toast ' + (kind || ''); t.textContent = msg; box.appendChild(t);
    setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 300); }, kind === 'err' ? 5000 : 3000);
  };

  /* Web Push: ask permission, subscribe through the service worker, hand the subscription to `send(sub)` */
  function b64ToBytes(s) { var p = '='.repeat((4 - s.length % 4) % 4), b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
  SG.pushSupported = function () { return location.protocol !== 'file:' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; };
  SG.pushEnable = function (key, send, askPermission) {
    if (!key || !SG.pushSupported()) return Promise.resolve('unsupported');
    var perm = askPermission ? Notification.requestPermission() : Promise.resolve(Notification.permission);
    return perm.then(function (p) {
      if (p !== 'granted') return p;
      return navigator.serviceWorker.ready.then(function (reg) {
        return reg.pushManager.getSubscription().then(function (sub) { return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) }); });
      }).then(function (sub) { return Promise.resolve(send(JSON.parse(JSON.stringify(sub)))).then(function () { return 'on'; }); });
    }).catch(function () { return 'error'; });
  };
  SG.pushDisable = function (send) {
    if (!SG.pushSupported()) return Promise.resolve();
    return navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (sub) { if (!sub) return; var ep = sub.endpoint; return sub.unsubscribe().then(function () { return send(ep); }); }).catch(function () {});
  };
  /* camera QR reader for the desk: SG.scanQR(videoEl, onRaw(text), onMsg(text, cls)) -> { stop() } */
  SG.scanQR = function (video, onRaw, onMsg) {
    var stream = null, timer = null, stopped = false, detector = null, cv = null, cx = null, last = '', lastT = 0, api = { stop: function () { stopped = true; clearTimeout(timer); if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); } };
    function msg(m, c) { if (onMsg) onMsg(m, c || ''); }
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { msg('The camera needs https (or localhost). You can still use a scanner gun or type the code.', 'warn'); return api; }
    if ('BarcodeDetector' in window) { try { detector = new BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { detector = null; } }
    if (!detector && !(window.QRScan && window.QRCodeLib)) { msg('This browser cannot read QR codes. Use a scanner gun or type the code.', 'warn'); return api; }
    function once() {
      if (!video || video.readyState < 2 || !video.videoWidth) return Promise.resolve(null);
      if (detector) return detector.detect(video).then(function (c) { return c.length ? c[0].rawValue : null; }, function () { return null; });
      var sc = Math.min(1, 640 / Math.max(video.videoWidth, video.videoHeight)), w = Math.round(video.videoWidth * sc), h = Math.round(video.videoHeight * sc);
      if (!cv) { cv = document.createElement('canvas'); cx = cv.getContext('2d', { willReadFrequently: true }); } if (cv.width !== w) { cv.width = w; cv.height = h; }
      cx.drawImage(video, 0, 0, w, h);
      try { return Promise.resolve(window.QRScan.decode(cx.getImageData(0, 0, w, h).data, w, h)); } catch (e) { return Promise.resolve(null); }
    }
    function loop() { if (stopped || !stream) return; timer = setTimeout(function () { once().then(function (raw) { if (stopped) return; if (raw && (raw !== last || Date.now() - lastT > 4000)) { last = raw; lastT = Date.now(); onRaw(raw); } loop(); }); }, detector ? 120 : 170); }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }).then(function (s) {
      if (stopped) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
      stream = s; video.srcObject = s; return video.play().then(function () { msg('Camera ready. Hold the ID card QR in front of the camera.'); loop(); });
    }).catch(function (e) { msg(e && e.name === 'NotAllowedError' ? 'Camera is blocked. Allow it for this site, or use a scanner gun or type the code.' : 'Could not start the camera. Use a scanner gun or type the code.', 'warn'); });
    return api;
  };
  SG.registerSW = function () {
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }
  };

  /* ---------- QR drawing (canvas) */
  SG.qr = function (canvas, text, px) {
    var q = new window.QRCodeLib(-1, 0); // level M
    q.addData(text); q.make();
    var n = q.getModuleCount(), quiet = 4, size = n + quiet * 2, scale = Math.max(2, Math.floor((px || 320) / size));
    canvas.width = canvas.height = size * scale;
    var g = canvas.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, canvas.width, canvas.height); g.fillStyle = '#000';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) g.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
  };
  SG.prefs.apply();
  /* Accessibility: link every <label> to the field next to it, so screen readers announce the field and tapping the label focuses it. Runs for everything the apps draw later, too. */
  var lblN = 0, lblT = 0;
  function linkLabels() {
    lblT = 0;
    var ls = document.querySelectorAll('label:not([for])');
    for (var i = 0; i < ls.length; i++) {
      var l = ls[i]; if (l.querySelector('input,select,textarea')) continue;
      var n = l.nextElementSibling; if (n && !/^(INPUT|SELECT|TEXTAREA)$/.test(n.tagName)) n = null;
      if (!n) continue; if (!n.id) n.id = 'sgf' + (++lblN); l.setAttribute('for', n.id);
    }
    var bare = document.querySelectorAll('input:not([type=hidden]):not([aria-label]):not([id]),select:not([aria-label]):not([id])');
    for (var j = 0; j < bare.length; j++) { var b = bare[j], p = b.previousElementSibling; if (p && p.tagName === 'LABEL' && !p.getAttribute('for')) { b.id = 'sgf' + (++lblN); p.setAttribute('for', b.id); } }
  }
  if (window.MutationObserver) new MutationObserver(function () { if (!lblT) lblT = setTimeout(linkLabels, 60); }).observe(document.documentElement, { childList: true, subtree: true });
  linkLabels();
})();
