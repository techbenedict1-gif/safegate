/* SafeGate evidence media: pictures, voice notes and short videos for reports and SOS.
   Cost rules: everything is shrunk ON THE PHONE before upload (pictures to about 1280px JPEG, voice at 24 kbps,
   video at 640px and 450 kbps, 20 seconds), kept in a small offline queue, and sent one at a time as raw bytes.
   Powered by ResultFlow. */
(function (g) {
  'use strict';
  var LIM = { image: { n: 6, max: 450000 }, audio: { n: 2, max: 700000, sec: 90 }, video: { n: 1, max: 6000000, sec: 20 } };
  var RECING = false, DRAFT = {}, DB = null, memQ = [], busy = false, listeners = [];
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function uid() { return (g.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }
  function kb(n) { return n >= 1e6 ? (n / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1000)) + ' KB'; }

  /* ---- offline queue (IndexedDB, with an in-memory fallback so nothing breaks in private windows) */
  function open(cb) {
    if (DB) return cb(DB);
    try {
      var rq = indexedDB.open('sg-media', 1);
      rq.onupgradeneeded = function () { rq.result.createObjectStore('q', { keyPath: 'mid' }); };
      rq.onsuccess = function () { DB = rq.result; cb(DB); };
      rq.onerror = function () { cb(null); };
    } catch (e) { cb(null); }
  }
  function all(cb) { open(function (db) { if (!db) return cb(memQ.slice()); var out = []; var c = db.transaction('q').objectStore('q').openCursor(); c.onsuccess = function () { var x = c.result; if (x) { out.push(x.value); x.continue(); } else cb(out); }; c.onerror = function () { cb(memQ.slice()); }; }); }
  function put(it, cb) { open(function (db) { if (!db) { memQ.push(it); return cb && cb(true); } try { var tx = db.transaction('q', 'readwrite'); tx.objectStore('q').put(it); tx.oncomplete = function () { cb && cb(true); }; tx.onerror = function () { memQ.push(it); cb && cb(true); }; } catch (e) { memQ.push(it); cb && cb(true); } }); }
  function del(mid, cb) { memQ = memQ.filter(function (x) { return x.mid !== mid; }); open(function (db) { if (!db) return cb && cb(); try { var tx = db.transaction('q', 'readwrite'); tx.objectStore('q').delete(mid); tx.oncomplete = function () { cb && cb(); }; tx.onerror = function () { cb && cb(); }; } catch (e) { cb && cb(); } }); }
  function changed() { listeners.forEach(function (f) { try { f(); } catch (e) {} }); }

  /* ---- shrinking */
  function shrinkImage(file, done) {
    var url = URL.createObjectURL(file), im = new Image();
    im.onerror = function () { URL.revokeObjectURL(url); done(null); };
    im.onload = function () {
      URL.revokeObjectURL(url);
      var w = im.naturalWidth, h = im.naturalHeight, k = Math.min(1, 1280 / Math.max(w, h)), c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);          // redrawing also strips GPS and camera details
      var q = 0.66;
      (function tryQ() { c.toBlob(function (b) { if (!b) return done(null); if (b.size > 340000 && q > 0.3) { q -= 0.12; return tryQ(); } done(b.size <= LIM.image.max ? b : null); }, 'image/jpeg', q); })();
    };
    im.src = url;
  }
  function pickMime(list) { if (!g.MediaRecorder) return ''; for (var i = 0; i < list.length; i++) { try { if (MediaRecorder.isTypeSupported(list[i])) return list[i]; } catch (e) {} } return ''; }

  /* ---- recording (audio or video) with a live timer and a hard stop */
  function record(kind, ui, done) {
    if (!g.MediaRecorder || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return done(null, 'This phone cannot record here. Use "Add pictures" or call security.');
    var video = kind === 'video', sec = LIM[kind].sec;
    navigator.mediaDevices.getUserMedia(video ? { audio: true, video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15, max: 20 } } } : { audio: { echoCancellation: true, noiseSuppression: true } }).then(function (stream) {
      var mime = pickMime(video ? ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'] : ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/mp4']);
      var opts = video ? { videoBitsPerSecond: 450000, audioBitsPerSecond: 24000 } : { audioBitsPerSecond: 24000 }; if (mime) opts.mimeType = mime;
      var rec, chunks = [], t0 = Date.now(), tick, stopped = false;
      try { rec = new MediaRecorder(stream, opts); } catch (e) { stream.getTracks().forEach(function (t) { t.stop(); }); return done(null, 'Recording did not start on this phone.'); }
      if (video && ui.preview) { ui.preview.srcObject = stream; ui.preview.muted = true; ui.preview.play && ui.preview.play().catch(function () {}); }
      function stop(cancel) { if (stopped) return; stopped = true; clearInterval(tick); try { if (rec.state !== 'inactive') rec.stop(); } catch (e) {} stream.getTracks().forEach(function (t) { t.stop(); }); if (cancel) { rec.onstop = null; done(null, ''); } }
      rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = function () { stream.getTracks().forEach(function (t) { t.stop(); }); var b = new Blob(chunks, { type: (rec.mimeType || mime || (video ? 'video/webm' : 'audio/webm')).split(';')[0] }), d = Math.round((Date.now() - t0) / 1000); if (ui.preview) ui.preview.srcObject = null; if (b.size > LIM[kind].max) return done(null, 'That recording is too big. Make it shorter.'); if (b.size < 300) return done(null, 'Nothing was recorded.'); done(b, '', d); };
      rec.start(1000);
      ui.stopBtn.onclick = function () { stop(false); }; ui.cancelBtn.onclick = function () { stop(true); };
      tick = setInterval(function () { var s = Math.round((Date.now() - t0) / 1000); ui.timer.textContent = s + 's / ' + sec + 's'; if (s >= sec) stop(false); }, 250);
    }, function () { done(null, 'Allow the ' + (video ? 'camera and microphone' : 'microphone') + ' in your phone settings to record.'); });
  }

  /* ---- the little control panel used by the report form and the SOS screen */
  function mount(el, key, opts) {
    if (!el) return; opts = opts || {}; var D = DRAFT[key] = DRAFT[key] || [], rec = false;
    function count(k) { return D.filter(function (x) { return x.kind === k; }).length; }
    function draw(msg, kind) {
      el.innerHTML = '<div class="media-box"><div class="row" style="flex-wrap:wrap;gap:8px">' +
        '<label class="btn sm' + (count('image') >= LIM.image.n ? ' disabled' : '') + '" style="margin:0">📷 Add pictures<input type="file" accept="image/*" multiple hidden data-m="img"></label>' +
        '<button type="button" class="btn sm" data-m="aud"' + (count('audio') >= LIM.audio.n ? ' disabled' : '') + '>🎤 Voice note</button>' +
        '<button type="button" class="btn sm" data-m="vid"' + (count('video') >= LIM.video.n ? ' disabled' : '') + '>🎥 Short video</button></div>' +
        '<div class="small muted" style="margin-top:6px">Up to ' + LIM.image.n + ' pictures, a voice note (' + LIM.audio.sec + 's) and a ' + LIM.video.sec + 's video. They are shrunk on your phone to save your data, and only security can open them.</div>' +
        (rec ? '<div class="card" style="margin-top:8px"><video data-m="pv" playsinline muted style="width:100%;border-radius:10px;display:' + (rec === 'video' ? 'block' : 'none') + '"></video><div class="row between" style="margin-top:6px"><b>● Recording <span data-m="tm">0s</span></b><span><button type="button" class="btn sm primary" data-m="stop">Done</button> <button type="button" class="btn sm ghost" data-m="cancel">Cancel</button></span></div></div>' : '') +
        (D.length ? '<div class="list" style="margin-top:8px">' + D.map(function (x, i) { return '<div class="item"><div>' + (x.kind === 'image' ? '🖼 Picture' : x.kind === 'audio' ? '🎤 Voice note ' + (x.dur || '') + 's' : '🎥 Video ' + (x.dur || '') + 's') + ' <span class="small muted">' + kb(x.blob.size) + '</span></div><button type="button" class="btn sm ghost" data-m="rm" data-i="' + i + '" aria-label="Remove">✕</button></div>'; }).join('') + '</div>' : '') +
        '<div class="small ' + (kind === 'err' ? 'err-msg' : 'muted') + '" role="status">' + esc(msg || '') + '</div></div>';
      var q = function (s) { return el.querySelector('[data-m=' + s + ']'); };
      q('img').onchange = function (e) {
        var fs = Array.prototype.slice.call(e.target.files || []).slice(0, LIM.image.n - count('image')), left = fs.length, bad = 0; if (!fs.length) return;
        fs.forEach(function (f) { shrinkImage(f, function (b) { if (b) D.push({ kind: 'image', blob: b }); else bad++; if (--left === 0) draw(bad ? bad + ' picture(s) could not be added.' : '', bad ? 'err' : ''); }); });
      };
      var go = function (k) { return function () { rec = k; RECING = true; draw(''); var u = { preview: q('pv'), timer: q('tm'), stopBtn: q('stop'), cancelBtn: q('cancel') }; record(k === 'aud' ? 'audio' : 'video', u, function (b, err, dur) { rec = false; RECING = false; if (b) D.push({ kind: k === 'aud' ? 'audio' : 'video', blob: b, dur: dur }); draw(err || (b ? 'Added.' : ''), err ? 'err' : ''); }); }; };
      q('aud').onclick = go('aud'); q('vid').onclick = go('vid');
      el.querySelectorAll('[data-m=rm]').forEach(function (b) { b.onclick = function () { D.splice(+b.getAttribute('data-i'), 1); draw(''); }; });
    }
    draw(opts.msg || '');
  }
  function drafts(key) { return (DRAFT[key] || []).slice(); }
  function clearDraft(key) { DRAFT[key] = []; }

  /* ---- queue + upload */
  function attach(key, ctx) {                       // move drafts into the offline queue, tied to a report or alert
    var D = drafts(key); clearDraft(key);
    D.forEach(function (x) { put({ mid: uid(), t: Date.now(), tries: 0, ref: ctx.ref, refType: ctx.refType || 'report', kind: x.kind, blob: x.blob, dur: x.dur || 0, anonKey: ctx.anonKey || '', matric: ctx.matric || '', deviceId: ctx.deviceId || '' }, changed); });
    return D.length;
  }
  var DROP = { forbidden: 1, 'too-big': 1, 'bad-file': 1, limit: 1, quota: 1, 'media-off': 1, late: 1, 'bad-kind': 1, empty: 1, 'bad-id': 1, full: 1 };
  function flush(cb) {
    if (busy || (typeof navigator !== 'undefined' && navigator.onLine === false)) return cb && cb(0);
    busy = true;
    all(function (list) {
      var sent = 0, lost = 0, i = 0;
      (function next() {
        if (i >= list.length) { busy = false; if (sent || lost) changed(); return cb && cb(sent, lost); }
        var it = list[i++]; if (it.next && it.next > Date.now()) return next();
        if (Date.now() - it.t > 3 * 86400e3) { lost++; return del(it.mid, next); }
        fetch('api/media-up', { method: 'POST', cache: 'no-store', body: it.blob, headers: { 'Content-Type': 'application/octet-stream', 'X-SG-Id': it.mid, 'X-SG-Ref': it.ref, 'X-SG-Type': it.refType, 'X-SG-Kind': it.kind, 'X-SG-Dur': String(it.dur || 0), 'X-SG-Matric': it.matric, 'X-SG-Device': it.deviceId, 'X-SG-Anon': it.anonKey } })
          .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }, function () { return { ok: false, j: {} }; }); })
          .then(function (r) {
            if (r.ok) { sent++; return del(it.mid, next); }
            var c = r.j && r.j.error && r.j.error.code;
            if (DROP[c]) { lost++; return del(it.mid, next); }
            it.tries = (it.tries || 0) + 1; it.next = Date.now() + Math.min(600000, 15000 * Math.pow(2, it.tries)); put(it, next);   // no-ref = the report is still on its way; wait and retry
          }, function () { busy = false; cb && cb(sent, lost); });
      })();
    });
  }
  function pending(cb) { all(function (l) { cb(l.length); }); }

  g.SGMedia = { recording: function () { return RECING; }, mount: mount, drafts: drafts, clearDraft: clearDraft, attach: attach, flush: flush, pending: pending, onChange: function (f) { listeners.push(f); }, LIM: LIM, kb: kb,
    /* desk side: show saved files (signed short-lived links) */
    gallery: function (items) {
      return items.map(function (m) {
        var u = esc(m.url), lab = '<div class="small muted">' + esc(m.kind) + ' · ' + kb(m.bytes) + (m.dur ? ' · ' + m.dur + 's' : '') + ' · kept until ' + esc(new Date(m.exp).toLocaleDateString()) + '</div>';
        return '<div class="card" style="margin-top:8px">' + (m.kind === 'image' ? '<a href="' + u + '" target="_blank" rel="noopener"><img alt="Evidence picture" loading="lazy" src="' + u + '" style="max-width:100%;border-radius:10px"></a>' : m.kind === 'audio' ? '<audio controls preload="none" src="' + u + '" style="width:100%"></audio>' : '<video controls preload="metadata" playsinline src="' + u + '" style="width:100%;border-radius:10px"></video>') + lab + '</div>';
      }).join('');
    } };
})(typeof window !== 'undefined' ? window : this);
