/* SafeGate gate poster: draws an A4 poster (300 dpi) on a canvas. The QR holds only the gate code, never a web address, so it keeps working
   when the school's web address changes and a phone's normal camera app cannot be tricked into opening anything. */
(function () {
  'use strict';
  var W = 2480, H = 3508;
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function fit(g, text, maxW, size, weight) { var s = size; do { g.font = weight + ' ' + s + 'px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif'; if (g.measureText(text).width <= maxW) break; s -= 4; } while (s > 40); return s; }
  function qrMatrix(text) { var q = new window.QRCodeLib(-1, 0); q.addData(text); q.make(); return q; }
  function draw(canvas, o) {
    o = o || {}; var g = canvas.getContext('2d'); canvas.width = W; canvas.height = H;
    var teal = '#0b5d7a', dark = '#0a2a38', gold = '#f5b301';
    var bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0b5d7a'); bg.addColorStop(0.42, '#0e7396'); bg.addColorStop(0.42, '#f4f8fa'); bg.addColorStop(1, '#f4f8fa');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // soft circles
    g.fillStyle = 'rgba(255,255,255,.07)'; g.beginPath(); g.arc(2200, 200, 520, 0, 7); g.fill(); g.beginPath(); g.arc(120, 1000, 380, 0, 7); g.fill();
    // shield logo
    g.save(); g.translate(W / 2, 330); g.scale(5.2, 5.2); g.lineWidth = 5; g.strokeStyle = '#fff'; g.fillStyle = 'rgba(255,255,255,.14)';
    g.beginPath(); g.moveTo(0, -34); g.lineTo(30, -23); g.lineTo(30, 4); g.bezierCurveTo(30, 24, 16, 34, 0, 40); g.bezierCurveTo(-16, 34, -30, 24, -30, 4); g.lineTo(-30, -23); g.closePath(); g.fill(); g.stroke();
    g.lineWidth = 7; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(-12, 3); g.lineTo(-3, 13); g.lineTo(14, -9); g.stroke(); g.restore();
    g.textAlign = 'center'; g.fillStyle = '#fff';
    fit(g, 'SafeGate', 1800, 190, '800'); g.fillText('SafeGate', W / 2, 700);
    var school = (o.school || 'Campus').toUpperCase(); fit(g, school, 2100, 84, '600'); g.fillStyle = 'rgba(255,255,255,.85)'; g.fillText(school, W / 2, 810);
    g.fillStyle = '#fff'; fit(g, 'Scan here. Every time you come in or go out.', 2200, 120, '800'); g.fillText('Scan here. Every time you come in or go out.', W / 2, 1010);
    // QR card
    var cw = 1560, cx = (W - cw) / 2, cy = 1090, ch = cw + 110;
    g.save(); g.shadowColor = 'rgba(8,40,55,.35)'; g.shadowBlur = 70; g.shadowOffsetY = 30; g.fillStyle = '#fff'; rr(g, cx, cy, cw, ch, 90); g.fill(); g.restore();
    var q = qrMatrix(o.token || 'MAIN.S.000000000000'), n = q.getModuleCount(), quiet = 3, size = n + quiet * 2, sc = Math.floor((cw - 160) / size), qs = sc * size, qx = cx + (cw - qs) / 2, qy = cy + 70;
    g.fillStyle = '#fff'; g.fillRect(qx, qy, qs, qs); g.fillStyle = '#000';
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (q.isDark(r, c)) g.fillRect(qx + (c + quiet) * sc, qy + (r + quiet) * sc, sc, sc);
    // corner brackets
    g.strokeStyle = gold; g.lineWidth = 22; g.lineCap = 'round'; var b = 150, m = 28;
    [[cx + m, cy + m, 1, 1], [cx + cw - m, cy + m, -1, 1], [cx + m, cy + ch - m, 1, -1], [cx + cw - m, cy + ch - m, -1, -1]].forEach(function (p) { g.beginPath(); g.moveTo(p[0], p[1] + p[3] * b); g.lineTo(p[0], p[1]); g.lineTo(p[0] + p[2] * b, p[1]); g.stroke(); });
    g.fillStyle = dark; g.font = '800 70px system-ui,sans-serif'; g.fillText('Point the SafeGate scanner at this code', W / 2, cy + ch - 55);
    // steps
    var steps = [['1', 'Open SafeGate', 'on your phone'], ['2', 'Tap Scan', 'at the gate'], ['3', 'Point at the code', 'Done in 2 seconds']], sy = cy + ch + 100, sw = 700, gap = 100, sx = (W - (sw * 3 + gap * 2)) / 2;
    steps.forEach(function (s, i) { var x = sx + i * (sw + gap); g.fillStyle = '#fff'; g.save(); g.shadowColor = 'rgba(8,40,55,.12)'; g.shadowBlur = 30; g.shadowOffsetY = 10; rr(g, x, sy, sw, 290, 50); g.fill(); g.restore();
      g.fillStyle = teal; g.beginPath(); g.arc(x + 110, sy + 105, 62, 0, 7); g.fill(); g.fillStyle = '#fff'; g.font = '800 70px system-ui,sans-serif'; g.fillText(s[0], x + 110, sy + 130);
      g.textAlign = 'left'; g.fillStyle = dark; fit(g, s[1], sw - 260, 62, '800'); g.fillText(s[1], x + 200, sy + 105); g.fillStyle = '#556'; g.font = '500 48px system-ui,sans-serif'; g.fillText(s[2], x + 200, sy + 175); g.textAlign = 'center'; });
    // footer
    var fy = sy + 375;
    g.fillStyle = dark; g.font = '700 62px system-ui,sans-serif'; g.fillText(o.idPolicy === 'required' ? 'Please carry your school ID. Forgot it or in a hurry? Nobody is stopped.' : 'In a hurry, no phone or no ID? Just go. Nobody is stopped for not scanning.', W / 2, fy);
    g.fillStyle = '#556'; g.font = '500 52px system-ui,sans-serif'; g.fillText('Emergencies come first. You can add your sign-out later in the app.', W / 2, fy + 75);
    g.fillStyle = teal; g.font = '700 50px system-ui,sans-serif'; g.fillText('Your location is shared only if you turn it on. Safe campus, safe you.', W / 2, fy + 150);
    g.fillStyle = '#9ab'; g.font = '500 38px system-ui,sans-serif'; g.fillText('Gate ' + (o.gateId || 'MAIN') + ' · printed ' + (o.printed || ''), W / 2, H - 45);
    return canvas;
  }
  window.SGPoster = { draw: draw, W: W, H: H };
})();
