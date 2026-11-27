/* SafeGate map.
   Real street map: picture tiles (streets, buildings, water, houses) are drawn underneath, and SafeGate's own layers are drawn on top:
   safe points, risk areas, hazards (blocked road, flood, no light...), places, the person, the route to safety.
   Without internet the tiles that were seen or saved earlier still show. Where there are none, a plain grid shows and every SafeGate layer still works. */
(function (root) {
  var ICON = { security: '🛡', gate: '🚪', clinic: '🏥', police: '🚓', fire: '🚒', haven: '🏠', assembly: '👥' };
  var COLOR = { security: '#0b5d7a', gate: '#0b5d7a', clinic: '#1a9a5a', police: '#2b4a9a', fire: '#c27a12', haven: '#6a4bc4', assembly: '#0a7a6a' };
  var KIND = { hostel: ['🏠', 'Hostel / house'], lecture: ['🏫', 'Lecture hall'], library: ['📚', 'Library'], food: ['🍽', 'Food'], market: ['🛒', 'Market / shops'], worship: ['⛪', 'Worship'], sports: ['⚽', 'Sports'], transport: ['🚌', 'Transport stop'], other: ['📍', 'Other'] };
  var HICON = { blocked: '⛔', flood: '🌊', construction: '🚧', dark: '🌑', dogs: '🐕', crowd: '👥', accident: '⚠️', other: '⚠️' };
  var W = 360, H = 400, MPP0 = 40075016.686;   // metres around the equator
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  /* Web Mercator, the projection every street map uses, so tiles line up with our layers. */
  function nx(lng) { return (lng + 180) / 360; }
  function ny(lat) { var s = Math.sin(Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI / 180); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); }
  function unx(x) { return x * 360 - 180; }
  function uny(y) { var n = Math.PI - 2 * Math.PI * y; return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); }
  function tileUrl(tpl, z, x, y) { var n = Math.pow(2, z); x = ((x % n) + n) % n; return tpl.replace('{z}', z).replace('{x}', x).replace('{y}', y); }
  /* All tiles that cover a square of metres around a point, for saving a map for offline use. */
  function tilesAround(lat, lng, radiusM, z0, z1, tpl, cap) {
    var out = [];
    for (var z = z0; z <= z1; z++) {
      var n = Math.pow(2, z), dxn = radiusM / (MPP0 * Math.cos(lat * Math.PI / 180)), x0 = Math.floor((nx(lng) - dxn) * n), x1 = Math.floor((nx(lng) + dxn) * n), y0 = Math.floor((ny(lat) - dxn) * n), y1 = Math.floor((ny(lat) + dxn) * n);
      for (var x = x0; x <= x1; x++) for (var y = y0; y <= y1; y++) { if (out.length >= (cap || 400)) return out; out.push(tileUrl(tpl, z, x, y)); }
    }
    return out;
  }
  function create(el, opt) {
    opt = opt || {}; var st = { data: {}, zoom: 1, panX: 0, panY: 0, hit: [] }, api = { onpick: null, onmap: null };
    function pts(d) {
      var a = [];
      if (d.me) a.push(d.me); if (d.target) a.push(d.target);
      (d.focus || []).forEach(function (p) { a.push(p); });
      if (!a.length && d.campus && d.campus.lat != null) a.push(d.campus);
      if (!a.length) (d.safe || []).slice(0, 4).forEach(function (p) { a.push(p); });
      return a.filter(function (p) { return p && typeof p.lat === 'number' && typeof p.lng === 'number'; });
    }
    function draw() {
      var d = st.data, fit = pts(d), tpl = d.tiles || '';
      if (!fit.length) { el.innerHTML = '<div class="mapempty">No map position yet.</div>'; return; }
      var minx = 9, maxx = -9, miny = 9, maxy = -9, la = 0; fit.forEach(function (p) { minx = Math.min(minx, nx(p.lng)); maxx = Math.max(maxx, nx(p.lng)); miny = Math.min(miny, ny(p.lat)); maxy = Math.max(maxy, ny(p.lat)); la += p.lat; }); la /= fit.length;
      var cosl = Math.cos(la * Math.PI / 180), unit = MPP0 * cosl;                       // metres in one world width at this latitude
      var spx = Math.max((maxx - minx) * 1.5, 260 / unit), spy = Math.max((maxy - miny) * 1.5, 300 / unit);
      var z = Math.min(19.4, Math.max(2, Math.log(Math.min(W / (256 * spx), H / (256 * spy))) / Math.LN2)) + Math.log(st.zoom) / Math.LN2; z = Math.max(1, Math.min(20, z));
      var S = 256 * Math.pow(2, z), mpp = unit / S;                                       // metres per screen pixel
      var cxw = (minx + maxx) / 2 * S + st.panX, cyw = (miny + maxy) / 2 * S + st.panY;
      function px(p) { return W / 2 + nx(p.lng) * S - cxw; } function py(p) { return H / 2 + ny(p.lat) * S - cyw; }
      function inView(x, y) { return x > -40 && x < W + 40 && y > -40 && y < H + 40; }
      var g = '', hit = [], i;
      // 1. the street map
      var tiled = false;
      if (tpl && d.layers !== false) {
        var zt = Math.max(0, Math.min(19, Math.round(z))), sc = Math.pow(2, z - zt), TS = 256 * sc, Sz = 256 * Math.pow(2, zt), cx0 = cxw / S * Sz, cy0 = cyw / S * Sz;
        var tx0 = Math.floor((cx0 - W / 2 / sc) / 256), tx1 = Math.floor((cx0 + W / 2 / sc) / 256), ty0 = Math.max(0, Math.floor((cy0 - H / 2 / sc) / 256)), ty1 = Math.min(Math.pow(2, zt) - 1, Math.floor((cy0 + H / 2 / sc) / 256));
        if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) <= 36) {
          tiled = true; if (d.night) g += '<g style="filter:invert(.9) hue-rotate(180deg) brightness(.9) contrast(.9)">';
          for (var tx = tx0; tx <= tx1; tx++) for (var ty = ty0; ty <= ty1; ty++) g += '<image href="' + esc(tileUrl(tpl, zt, tx, ty)) + '" x="' + (W / 2 + (tx * 256 - cx0) * sc - 0.4).toFixed(2) + '" y="' + (H / 2 + (ty * 256 - cy0) * sc - 0.4).toFixed(2) + '" width="' + (TS + 0.8).toFixed(2) + '" height="' + (TS + 0.8).toFixed(2) + '" preserveAspectRatio="none"/>';
          if (d.night) g += '</g>';
        }
      }
      // 2. plain grid under or instead of tiles, so there is always something to read
      var steps = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000], step = 10; for (i = 0; i < steps.length; i++) { step = steps[i]; if (step / mpp >= 60) break; }
      if (!tiled) { var gx0 = (cxw - W / 2) * mpp, gy0 = (cyw - H / 2) * mpp; for (var gx = Math.ceil(gx0 / step) * step; gx < gx0 + W * mpp; gx += step) g += '<line x1="' + ((gx - gx0) / mpp).toFixed(1) + '" y1="0" x2="' + ((gx - gx0) / mpp).toFixed(1) + '" y2="' + H + '" stroke="#d5e0dc"/>'; for (var gy = Math.ceil(gy0 / step) * step; gy < gy0 + H * mpp; gy += step) g += '<line x1="0" y1="' + ((gy - gy0) / mpp).toFixed(1) + '" x2="' + W + '" y2="' + ((gy - gy0) / mpp).toFixed(1) + '" stroke="#d5e0dc"/>'; }
      var L = d.show || {};
      // 3. campus
      if (d.campus && d.campus.lat != null) g += '<circle cx="' + px(d.campus).toFixed(1) + '" cy="' + py(d.campus).toFixed(1) + '" r="' + ((d.campus.radiusM || 300) / mpp).toFixed(1) + '" fill="#0b5d7a" fill-opacity=".07" stroke="#0b5d7a" stroke-width="2" stroke-opacity=".7" stroke-dasharray="6 5"/>';
      // 4. risk areas and hazard areas
      if (L.risk !== false) (d.zones || []).forEach(function (z2) { var x = px(z2), y = py(z2), r = (z2.radiusM || 150) / mpp, on = z2.active !== false; g += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r.toFixed(1) + '" fill="#d93636" fill-opacity="' + (on ? '.22' : '.07') + '" stroke="#d93636" stroke-width="2"' + (on ? '' : ' stroke-dasharray="4 4"') + '/><text x="' + x.toFixed(1) + '" y="' + (y - r + 13).toFixed(1) + '" font-size="11" text-anchor="middle" fill="#a61b1b" font-weight="700" stroke="#fff" stroke-width="3" paint-order="stroke">' + esc((z2.name || '').slice(0, 18)) + '</text>'; });
      if (L.hazards !== false) (d.hazards || []).forEach(function (h) { var x = px(h), y = py(h), r = Math.max(10, (h.radiusM || 50) / mpp); g += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r.toFixed(1) + '" fill="#f59e0b" fill-opacity="' + (h.verified === false ? '.1' : '.25') + '" stroke="#c27a12" stroke-width="2" stroke-dasharray="5 4"/>'; });
      (d.hotspots || []).forEach(function (h) { var x = px(h), y = py(h); g += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + Math.max(14, Math.min(34, 10 + h.count * 3)) + '" fill="#f59e0b" fill-opacity=".3" stroke="#c27a12" stroke-width="2"/><text x="' + x.toFixed(1) + '" y="' + (y + 4).toFixed(1) + '" font-size="12" text-anchor="middle" font-weight="800" fill="#7a4b00">' + h.count + '</text>'; });
      // 5. paths: movement trail, then the way to safety
      (d.tracks || (d.track ? [{ points: d.track }] : [])).forEach(function (tr) { var pp = tr.points || []; if (pp.length > 1) { g += '<polyline fill="none" stroke="' + (tr.color || '#2b4a9a') + '" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" stroke-opacity=".9" points="' + pp.map(function (p) { return px(p).toFixed(1) + ',' + py(p).toFixed(1); }).join(' ') + '"/>'; pp.forEach(function (p, j) { if (j % Math.ceil(pp.length / 24) === 0 || j === pp.length - 1) g += '<circle cx="' + px(p).toFixed(1) + '" cy="' + py(p).toFixed(1) + '" r="3.5" fill="' + (tr.color || '#2b4a9a') + '" stroke="#fff"/>'; }); } });
      if (d.route && d.route.length > 1) g += '<polyline fill="none" stroke="#fff" stroke-width="9" stroke-linejoin="round" stroke-linecap="round" points="' + d.route.map(function (p) { return px(p).toFixed(1) + ',' + py(p).toFixed(1); }).join(' ') + '"/><polyline fill="none" stroke="#1a9a5a" stroke-width="5" stroke-linejoin="round" stroke-linecap="round" points="' + d.route.map(function (p) { return px(p).toFixed(1) + ',' + py(p).toFixed(1); }).join(' ') + '"/>';
      else if (d.me && d.target) g += '<line x1="' + px(d.me).toFixed(1) + '" y1="' + py(d.me).toFixed(1) + '" x2="' + px(d.target).toFixed(1) + '" y2="' + py(d.target).toFixed(1) + '" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-opacity=".8"/><line x1="' + px(d.me).toFixed(1) + '" y1="' + py(d.me).toFixed(1) + '" x2="' + px(d.target).toFixed(1) + '" y2="' + py(d.target).toFixed(1) + '" stroke="#1a9a5a" stroke-width="5" stroke-dasharray="2 9" stroke-linecap="round"/>';
      // 6. markers
      function marker(p, kind, label, icon, color, extra, small) { var x = px(p), y = py(p); if (!inView(x, y)) return ''; hit.push({ kind: kind, item: p }); var r = small ? 11 : 15; return '<g class="mk" data-k="' + (hit.length - 1) + '" tabindex="0" role="button" aria-label="' + esc(label) + '"><circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r + '" fill="' + color + '" stroke="#fff" stroke-width="2.5"/><text x="' + x.toFixed(1) + '" y="' + (y + (small ? 4 : 5)).toFixed(1) + '" font-size="' + (small ? 12 : 15) + '" text-anchor="middle">' + icon + '</text>' + (extra || '') + '<text x="' + x.toFixed(1) + '" y="' + (y + r + 13).toFixed(1) + '" font-size="11" text-anchor="middle" fill="#0e2433" stroke="#fff" stroke-width="3.5" paint-order="stroke" font-weight="600">' + esc((p.name || label).slice(0, 20)) + '</text></g>'; }
      if (L.places !== false) (d.places || []).forEach(function (p) { g += marker(p, 'place', p.name, p.danger ? '⚠' : (KIND[p.kind] || KIND.other)[0], p.danger ? '#c27a12' : '#5c6f7c', '', true); });
      if (L.hazards !== false) (d.hazards || []).forEach(function (h) { g += marker(Object.assign({}, h, { name: h.label }), 'hazard', h.label || 'Hazard', HICON[h.kind] || '⚠️', h.verified === false ? '#b8860b' : '#c27a12', '', true); });
      if (L.safe !== false) (d.safe || []).forEach(function (p) { var tgt = d.target && d.target.id === p.id; g += marker(p, 'safe', p.name, ICON[p.type] || (p.kind && KIND[p.kind] ? KIND[p.kind][0] : '📍'), COLOR[p.type] || '#0b5d7a', tgt ? '<circle cx="' + px(p).toFixed(1) + '" cy="' + py(p).toFixed(1) + '" r="21" fill="none" stroke="#1a9a5a" stroke-width="3.5"/>' : ''); });
      (d.reports || []).forEach(function (p) { g += marker(Object.assign({ name: p.label }, p), 'report', p.label || 'Report', '❗', p.urgency === 'critical' ? '#c62828' : '#c27a12'); });
      (d.escorts || []).forEach(function (p) { g += marker(Object.assign({}, p, { name: p.name }), 'escort', 'Escort', '🚶', '#0a7a6a'); });
      (d.students || []).forEach(function (p) { g += marker(p, 'student', p.name, '👤', '#2b4a9a'); });
      (d.sos || []).forEach(function (p) { var x = px(p), y = py(p); g += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="22" fill="#d93636" fill-opacity=".25"><animate attributeName="r" values="16;34;16" dur="1.6s" repeatCount="indefinite"/><animate attributeName="fill-opacity" values=".4;0;.4" dur="1.6s" repeatCount="indefinite"/></circle>' + marker(p, 'sos', 'EMERGENCY ' + (p.name || ''), '🆘', '#c62828'); });
      if (d.pin) { var qx = px(d.pin), qy = py(d.pin); g += '<g aria-label="Dropped pin"><path d="M' + qx.toFixed(1) + ' ' + qy.toFixed(1) + ' l-9 -22 a11 11 0 1 1 18 0 z" fill="#c62828" stroke="#fff" stroke-width="2"/><circle cx="' + qx.toFixed(1) + '" cy="' + (qy - 24).toFixed(1) + '" r="4" fill="#fff"/></g>'; }
      if (d.me) { var mx = px(d.me), my = py(d.me), ar = d.me.acc ? Math.min(140, Math.max(8, d.me.acc / mpp)) : 0; g += (ar ? '<circle cx="' + mx.toFixed(1) + '" cy="' + my.toFixed(1) + '" r="' + ar.toFixed(1) + '" fill="#1d6fe0" fill-opacity=".15" stroke="#1d6fe0" stroke-opacity=".45"/>' : '') + (typeof d.heading === 'number' ? '<g transform="rotate(' + d.heading.toFixed(0) + ' ' + mx.toFixed(1) + ' ' + my.toFixed(1) + ')"><path d="M' + mx.toFixed(1) + ' ' + (my - 32).toFixed(1) + ' L' + (mx + 12).toFixed(1) + ' ' + (my - 8).toFixed(1) + ' L' + (mx - 12).toFixed(1) + ' ' + (my - 8).toFixed(1) + 'Z" fill="#1d6fe0" fill-opacity=".6"/></g>' : '') + '<circle cx="' + mx.toFixed(1) + '" cy="' + my.toFixed(1) + '" r="9" fill="#1d6fe0" stroke="#fff" stroke-width="3.5"/><text x="' + mx.toFixed(1) + '" y="' + (my + 24).toFixed(1) + '" font-size="11" text-anchor="middle" font-weight="700" fill="#1d6fe0" stroke="#fff" stroke-width="3.5" paint-order="stroke">You</text>'; }
      // 7. scale, north, credit
      var bar = step / mpp, credit = tiled ? (opt.attribution || '© OpenStreetMap contributors') : '';
      g += '<g transform="translate(14 ' + (H - 18) + ')"><rect x="-4" y="-18" width="' + (bar + 8).toFixed(0) + '" height="26" rx="4" fill="#fff" fill-opacity=".75"/><rect x="0" y="-3" width="' + bar.toFixed(0) + '" height="4" fill="#0e2433"/><text x="0" y="-8" font-size="11" fill="#0e2433" font-weight="600">' + (step >= 1000 ? step / 1000 + ' km' : step + ' m') + '</text></g><g transform="translate(' + (W - 22) + ' 24)"><circle r="13" fill="#fff" stroke="#c9d6d2"/><path d="M0 -9 L5 4 L0 1 L-5 4Z" fill="#c62828"/><text y="-13" font-size="11" text-anchor="middle" fill="#0e2433" font-weight="700">N</text></g>' +
        (credit ? '<g><rect x="' + (W - credit.length * 5.6 - 12) + '" y="' + (H - 15) + '" width="' + (credit.length * 5.6 + 12) + '" height="15" fill="#fff" fill-opacity=".8"/><text x="' + (W - 5) + '" y="' + (H - 4) + '" font-size="11" text-anchor="end" fill="#334">' + esc(credit) + '</text></g>' : '');
      el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(opt.label || 'Safety map') + '" style="display:block;width:100%;height:auto;background:#eef3f1;border-radius:18px;touch-action:none"><rect width="' + W + '" height="' + H + '" fill="#eef3f1"/>' + g + '</svg>' +
        '<div class="mapctl"><button type="button" data-z="+" aria-label="Zoom in">+</button><button type="button" data-z="-" aria-label="Zoom out">−</button><button type="button" data-z="0" aria-label="Reset view">◎</button></div>';
      st.hit = hit; st.view = { z: z, S: S, cxw: cxw, cyw: cyw };
      st.inv = function (x, y) { var v = st.view; return { lat: uny((v.cyw + y - H / 2) / v.S), lng: unx((v.cxw + x - W / 2) / v.S) }; };
    }
    el.classList.add('sgmap');
    el.addEventListener('click', function (e) {
      var z = e.target.closest && e.target.closest('[data-z]'); if (z) { var v = z.getAttribute('data-z'); if (v === '+') st.zoom = Math.min(24, st.zoom * 1.7); else if (v === '-') st.zoom = Math.max(0.1, st.zoom / 1.7); else { st.zoom = 1; st.panX = 0; st.panY = 0; } draw(); return; }
      var mk = e.target.closest && e.target.closest('.mk'); if (mk && api.onpick) { var h = st.hit[+mk.getAttribute('data-k')]; if (h) api.onpick(h.kind, h.item); return; }
      if (moved) { moved = false; return; }
      if (api.onmap && st.inv) { var svg = el.querySelector('svg'); if (svg) { var r = svg.getBoundingClientRect(); api.onmap(st.inv((e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height)); } }
    });
    var drag = null, moved = false;
    el.addEventListener('pointerdown', function (e) { if (e.target.closest && (e.target.closest('.mk') || e.target.closest('.mapctl'))) return; drag = { x: e.clientX, y: e.clientY, px: st.panX, py: st.panY }; moved = false; });
    el.addEventListener('pointermove', function (e) { if (!drag) return; var svg = el.querySelector('svg'); if (!svg) return; var sc = W / svg.getBoundingClientRect().width, dx = (e.clientX - drag.x) * sc, dy = (e.clientY - drag.y) * sc; if (Math.abs(dx) + Math.abs(dy) > 4) moved = true; if (moved) { st.panX = drag.px - dx; st.panY = drag.py - dy; draw(); } });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { el.addEventListener(ev, function () { drag = null; }); });
    api.update = function (d) { st.data = d || {}; draw(); }; api.reset = function () { st.zoom = 1; st.panX = 0; st.panY = 0; draw(); };
    return api;
  }
  function gview(lat, lng) { return 'https://www.google.com/maps/search/?api=1&query=' + (+lat).toFixed(6) + ',' + (+lng).toFixed(6); }
  function gdir(lat, lng, mode) { return 'https://www.google.com/maps/dir/?api=1&travelmode=' + (mode || 'walking') + '&destination=' + (+lat).toFixed(6) + ',' + (+lng).toFixed(6); }
  function glink(lat, lng, label, dir, mode) { if (lat == null || lng == null || isNaN(+lat) || isNaN(+lng)) return ''; return '<a class="btn sm primary" target="_blank" rel="noopener" href="' + (dir ? gdir(lat, lng, mode) : gview(lat, lng)) + '">' + label + '</a>'; }
  root.SGMap = { gview: gview, gdir: gdir, glink: glink, create: create, ICON: ICON, HICON: HICON, KIND: KIND, tilesAround: tilesAround, tileUrl: tileUrl, _merc: { nx: nx, ny: ny, unx: unx, uny: uny }, TYPE_NAME: { security: 'Security post', gate: 'Gate', clinic: 'Clinic', police: 'Police', fire: 'Fire service', haven: 'Safe place', assembly: 'Assembly point' } };
})(window);
