/* QR decoder in plain JavaScript, so scanning works on every phone (iPhone Safari has no BarcodeDetector).
 * Pipeline: grayscale → adaptive binarize → finder patterns (any rotation) → module size → alignment pattern
 * → homography (perspective-correct) sampling → BCH format info → unmask → Reed–Solomon repair → text.
 * Uses RS block table / alignment table from lib/qrcode.js (QRCodeLib.internals). Supports numeric, alphanumeric, byte, ECI. */
(function (root) {
  'use strict';

  /* ---------------------------------------------------------------- GF(256) + Reed–Solomon */
  var EXP = new Uint8Array(512), LOG = new Uint8Array(256);
  (function () { var x = 1; for (var i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; } for (i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
  function mul(a, b) { return a && b ? EXP[LOG[a] + LOG[b]] : 0; }
  function div(a, b) { return a ? EXP[(LOG[a] + 255 - LOG[b]) % 255] : 0; }

  /* msg: array of codewords (data+ec). Returns corrected array or null. */
  function rsCorrect(msg, nsym) {
    var n = msg.length, S = new Array(nsym), j, i, bad = false;
    for (j = 0; j < nsym; j++) { var s = 0, a = EXP[j]; for (i = 0; i < n; i++) s = mul(s, a) ^ msg[i]; S[j] = s; if (s) bad = true; }
    if (!bad) return msg;
    var C = [1], B = [1], L = 0, m = 1, b = 1, d, T, k;
    for (var r = 0; r < nsym; r++) {
      d = S[r]; for (i = 1; i <= L; i++) if (C[i]) d ^= mul(C[i], S[r - i]);
      if (!d) { m++; continue; }
      T = C.slice(); var coef = div(d, b);
      while (C.length < B.length + m) C.push(0);
      for (i = 0; i < B.length; i++) C[i + m] ^= mul(coef, B[i]);
      if (2 * L <= r) { L = r + 1 - L; B = T; b = d; m = 1; } else m++;
    }
    if (L === 0 || 2 * L > nsym) return null;
    while (C.length > L + 1) { if (C[C.length - 1] === 0) C.pop(); else break; }
    var pos = [];
    for (var p = 0; p < n; p++) {
      var x = EXP[(255 - p) % 255], v = 0, xp = 1;                     // Λ(α^-p)
      for (i = 0; i < C.length; i++) { v ^= mul(C[i], xp); xp = mul(xp, x); }
      if (v === 0) pos.push(p);
    }
    if (pos.length !== L) return null;
    var O = new Array(nsym).fill(0);                                   // Ω = S·Λ mod x^nsym
    for (i = 0; i < nsym; i++) for (k = 0; k < C.length && k <= i; k++) O[i] ^= mul(S[i - k], C[k]);
    var out = msg.slice();
    for (i = 0; i < pos.length; i++) {
      var pw = pos[i], X = EXP[pw % 255], Xi = EXP[(255 - pw) % 255], num = 0, den = 0, t = 1;
      for (k = 0; k < nsym; k++) { num ^= mul(O[k], t); t = mul(t, Xi); }
      t = 1; for (k = 1; k < C.length; k += 2) { den ^= mul(C[k], t); t = mul(t, mul(Xi, Xi)); }
      if (!den) return null;
      out[n - 1 - pw] ^= mul(X, div(num, den));
    }
    for (j = 0; j < nsym; j++) { var s2 = 0, a2 = EXP[j]; for (i = 0; i < n; i++) s2 = mul(s2, a2) ^ out[i]; if (s2) return null; }
    return out;
  }

  /* ---------------------------------------------------------------- matrix → text */
  function bch15(data) { var v = data << 10; for (var i = 14; i >= 10; i--) if (v & (1 << i)) v ^= 0x537 << (i - 10); return ((data << 10) | v) ^ 0x5412; }
  function pop(x) { var c = 0; while (x) { c += x & 1; x >>= 1; } return c; }
  function readFormat(M, dim) {
    function bit(r, c) { return M[r * dim + c] ? 1 : 0; }
    var f1 = 0, f2 = 0, i;
    for (i = 0; i < 6; i++) f1 = (f1 << 1) | bit(8, i);
    f1 = (f1 << 1) | bit(8, 7); f1 = (f1 << 1) | bit(8, 8); f1 = (f1 << 1) | bit(7, 8);
    for (i = 5; i >= 0; i--) f1 = (f1 << 1) | bit(i, 8);
    for (i = dim - 1; i >= dim - 7; i--) f2 = (f2 << 1) | bit(i, 8);
    for (i = dim - 8; i < dim; i++) f2 = (f2 << 1) | bit(8, i);
    var best = -1, bd = 99;
    for (var d = 0; d < 32; d++) {
      var t = bch15(d), x = Math.min(pop(t ^ f1), pop(t ^ f2));
      if (x < bd) { bd = x; best = d; }
    }
    return bd <= 3 ? { ec: best >> 3, mask: best & 7 } : null;
  }
  function maskBit(m, i, j) {
    switch (m) {
      case 0: return (i + j) % 2 === 0; case 1: return i % 2 === 0; case 2: return j % 3 === 0; case 3: return (i + j) % 3 === 0;
      case 4: return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0; case 5: return (i * j) % 2 + (i * j) % 3 === 0;
      case 6: return ((i * j) % 2 + (i * j) % 3) % 2 === 0; default: return ((i * j) % 3 + (i + j) % 2) % 2 === 0;
    }
  }
  function functionMask(ver, dim) {
    var F = new Uint8Array(dim * dim), I = root.QRCodeLib.internals, r, c;
    function rect(r0, c0, r1, c1) { for (r = r0; r <= r1; r++) for (c = c0; c <= c1; c++) if (r >= 0 && c >= 0 && r < dim && c < dim) F[r * dim + c] = 1; }
    rect(0, 0, 8, 8); rect(0, dim - 8, 8, dim - 1); rect(dim - 8, 0, dim - 1, 8);
    for (var i = 0; i < dim; i++) { F[6 * dim + i] = 1; F[i * dim + 6] = 1; }
    var pos = I.QRUtil.PATTERN_POSITION_TABLE[ver - 1] || [];
    for (var a = 0; a < pos.length; a++) for (var b = 0; b < pos.length; b++) {
      if ((a === 0 && b === 0) || (a === 0 && b === pos.length - 1) || (a === pos.length - 1 && b === 0)) continue;
      rect(pos[a] - 2, pos[b] - 2, pos[a] + 2, pos[b] + 2);
    }
    if (ver >= 7) { rect(0, dim - 11, 5, dim - 9); rect(dim - 11, 0, dim - 9, 5); }
    return F;
  }
  var ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
  function parseData(bytes, ver) {
    var pos = 0, total = bytes.length * 8, out = '';
    function read(n) { var v = 0; for (var i = 0; i < n; i++) { if (pos >= total) return -1; v = (v << 1) | ((bytes[pos >> 3] >> (7 - (pos & 7))) & 1); pos++; } return v; }
    while (total - pos >= 4) {
      var mode = read(4);
      if (mode === 0) break;
      if (mode === 7) { var e = read(8); if (e < 0) return null; if (e & 0x80) read((e & 0x40) ? 16 : 8); continue; }
      var cb, n, i, v;
      if (mode === 4) {
        n = read(ver < 10 ? 8 : 16); if (n < 0 || pos + n * 8 > total) return null;
        var arr = []; for (i = 0; i < n; i++) arr.push(read(8));
        try { out += typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(arr)) : String.fromCharCode.apply(null, arr); }
        catch (e2) { out += String.fromCharCode.apply(null, arr); }
      } else if (mode === 2) {
        cb = ver < 10 ? 9 : ver < 27 ? 11 : 13; n = read(cb); if (n < 0) return null;
        for (i = 0; i + 1 < n; i += 2) { v = read(11); if (v < 0 || v >= 2025) return null; out += ALNUM[Math.floor(v / 45)] + ALNUM[v % 45]; }
        if (n & 1) { v = read(6); if (v < 0 || v >= 45) return null; out += ALNUM[v]; }
      } else if (mode === 1) {
        cb = ver < 10 ? 10 : ver < 27 ? 12 : 14; n = read(cb); if (n < 0) return null;
        for (i = 0; i + 2 < n; i += 3) { v = read(10); if (v < 0 || v > 999) return null; out += ('00' + v).slice(-3); }
        if (n % 3 === 2) { v = read(7); if (v < 0 || v > 99) return null; out += ('0' + v).slice(-2); }
        else if (n % 3 === 1) { v = read(4); if (v < 0 || v > 9) return null; out += v; }
      } else return null;
    }
    return out;
  }
  function decodeMatrix(M, dim, ver) {
    var I = root.QRCodeLib.internals, fmt = readFormat(M, dim);
    if (!fmt) return null;
    var F = functionMask(ver, dim), bits = [], up = true, col, cnt, row, k, c;
    for (col = dim - 1; col >= 1; col -= 2) {
      if (col === 6) col = 5;
      for (cnt = 0; cnt < dim; cnt++) {
        row = up ? dim - 1 - cnt : cnt;
        for (k = 0; k < 2; k++) { c = col - k; if (!F[row * dim + c]) bits.push((M[row * dim + c] ? 1 : 0) ^ (maskBit(fmt.mask, row, c) ? 1 : 0)); }
      }
      up = !up;
    }
    var cw = [], i, j; for (i = 0; i + 7 < bits.length; i += 8) { var v = 0; for (j = 0; j < 8; j++) v = (v << 1) | bits[i + j]; cw.push(v); }
    var blocks; try { blocks = I.QRRSBlock.getRSBlocks(ver, fmt.ec); } catch (e) { return null; }
    var totalCw = 0; blocks.forEach(function (b) { totalCw += b.totalCount; });
    if (cw.length < totalCw) return null;
    var maxData = 0; blocks.forEach(function (b) { if (b.dataCount > maxData) maxData = b.dataCount; });
    var bd = blocks.map(function () { return []; }), be = blocks.map(function () { return []; }), idx = 0;
    for (i = 0; i < maxData; i++) for (j = 0; j < blocks.length; j++) if (i < blocks[j].dataCount) bd[j].push(cw[idx++]);
    var maxEc = 0; blocks.forEach(function (b) { if (b.totalCount - b.dataCount > maxEc) maxEc = b.totalCount - b.dataCount; });
    for (i = 0; i < maxEc; i++) for (j = 0; j < blocks.length; j++) if (i < blocks[j].totalCount - blocks[j].dataCount) be[j].push(cw[idx++]);
    var data = [];
    for (j = 0; j < blocks.length; j++) {
      var fixed = rsCorrect(bd[j].concat(be[j]), blocks[j].totalCount - blocks[j].dataCount);
      if (!fixed) return null;
      for (i = 0; i < blocks[j].dataCount; i++) data.push(fixed[i]);
    }
    return parseData(data, ver);
  }

  /* ---------------------------------------------------------------- image → binary */
  function binarize(rgba, w, h) {
    var n = w * h, g = new Uint8Array(n), hist = new Uint32Array(256), i;
    for (i = 0; i < n; i++) { var v = (rgba[i * 4] * 77 + rgba[i * 4 + 1] * 150 + rgba[i * 4 + 2] * 29) >> 8; g[i] = v; hist[v]++; }
    var sum = 0; for (i = 0; i < 256; i++) sum += i * hist[i];
    var wB = 0, sB = 0, best = 0, thr = 128;
    for (i = 0; i < 256; i++) { wB += hist[i]; if (!wB) continue; var wF = n - wB; if (!wF) break; sB += i * hist[i]; var mB = sB / wB, mF = (sum - sB) / wF, bt = wB * wF * (mB - mF) * (mB - mF); if (bt > best) { best = bt; thr = i; } }
    var W = w + 1, I2 = new Uint32Array(W * (h + 1)), x, y;
    for (y = 0; y < h; y++) { var rs = 0; for (x = 0; x < w; x++) { rs += g[y * w + x]; I2[(y + 1) * W + x + 1] = I2[y * W + x + 1] + rs; } }
    var win = Math.max(15, Math.floor(Math.min(w, h) / 5)) | 1, half = win >> 1, out = new Uint8Array(n);
    for (y = 0; y < h; y++) {
      var y0 = Math.max(0, y - half), y1 = Math.min(h, y + half + 1);
      for (x = 0; x < w; x++) {
        var x0 = Math.max(0, x - half), x1 = Math.min(w, x + half + 1), area = (x1 - x0) * (y1 - y0);
        var mean = (I2[y1 * W + x1] - I2[y0 * W + x1] - I2[y1 * W + x0] + I2[y0 * W + x0]) / area, pv = g[y * w + x];
        out[y * w + x] = pv < thr - 28 ? 1 : pv > thr + 28 ? 0 : (pv < mean * 0.93 ? 1 : 0);
      }
    }
    return out;
  }

  /* ---------------------------------------------------------------- finder patterns */
  function ratioOk(r) {
    var t = r[0] + r[1] + r[2] + r[3] + r[4]; if (t < 7) return false;
    var m = t / 7, v = m * 0.62;
    return Math.abs(m - r[0]) < v && Math.abs(m - r[1]) < v && Math.abs(3 * m - r[2]) < 3 * v && Math.abs(m - r[3]) < v && Math.abs(m - r[4]) < v;
  }
  function crossCheck(bin, w, h, cx, cy, dx, dy, maxC) {
    var c = [0, 0, 0, 0, 0], x = cx, y = cy;
    function at(a, b) { return bin[b * w + a]; }
    if (!at(x, y)) return null;
    while (x >= 0 && y >= 0 && x < w && y < h && at(x, y)) { c[2]++; x -= dx; y -= dy; }
    if (x < 0 || y < 0 || x >= w || y >= h) return null;
    while (x >= 0 && y >= 0 && x < w && y < h && !at(x, y) && c[1] <= maxC) { c[1]++; x -= dx; y -= dy; }
    if (x < 0 || y < 0 || x >= w || y >= h || c[1] > maxC) return null;
    while (x >= 0 && y >= 0 && x < w && y < h && at(x, y) && c[0] <= maxC) { c[0]++; x -= dx; y -= dy; }
    if (c[0] > maxC) return null;
    x = cx + dx; y = cy + dy;
    while (x >= 0 && y >= 0 && x < w && y < h && at(x, y)) { c[2]++; x += dx; y += dy; }
    if (x < 0 || y < 0 || x >= w || y >= h) return null;
    while (x >= 0 && y >= 0 && x < w && y < h && !at(x, y) && c[3] <= maxC) { c[3]++; x += dx; y += dy; }
    if (x < 0 || y < 0 || x >= w || y >= h || c[3] > maxC) return null;
    while (x >= 0 && y >= 0 && x < w && y < h && at(x, y) && c[4] <= maxC) { c[4]++; x += dx; y += dy; }
    if (c[4] > maxC) return null;
    if (!ratioOk(c)) return null;
    var tot = c[0] + c[1] + c[2] + c[3] + c[4];
    return { total: tot, center: (dx ? x - c[4] - c[3] - c[2] / 2 : y - c[4] - c[3] - c[2] / 2) - (dx ? dx : dy) * 0 };
  }
  function findFinders(bin, w, h) {
    var cands = [], y, x;
    for (y = 0; y < h; y++) {
      var row = y * w, runs = [], cur = bin[row], len = 0, first = cur;
      for (x = 0; x <= w; x++) {
        var px = x < w ? bin[row + x] : (cur ? 0 : 1);
        if (px === cur) { len++; continue; }
        runs.push(len); len = 1; cur = px;
        var k = runs.length;
        if (k >= 5 && ((first ^ ((k - 5) & 1)) === 1)) {
          var r = [runs[k - 5], runs[k - 4], runs[k - 3], runs[k - 2], runs[k - 1]];
          if (ratioOk(r)) {
            var endX = x, tot = r[0] + r[1] + r[2] + r[3] + r[4], cx = endX - r[4] - r[3] - r[2] / 2;
            var ix = Math.floor(cx), maxC = Math.ceil(tot * 1.2);
            var v = crossCheck(bin, w, h, ix, y, 0, 1, maxC);
            if (v) {
              var cy = v.center, iy = Math.floor(cy), hh = crossCheck(bin, w, h, ix, iy, 1, 0, maxC);
              if (hh) {
                var fx = hh.center, fy = cy, ms = (hh.total + v.total) / 14, found = false;
                for (var i = 0; i < cands.length; i++) {
                  var c = cands[i];
                  if (Math.abs(c.x - fx) <= ms * 1.5 && Math.abs(c.y - fy) <= ms * 1.5 && Math.abs(c.m - ms) <= ms * 0.7) {
                    c.x = (c.x * c.n + fx) / (c.n + 1); c.y = (c.y * c.n + fy) / (c.n + 1); c.m = (c.m * c.n + ms) / (c.n + 1); c.n++; found = true; break;
                  }
                }
                if (!found) cands.push({ x: fx, y: fy, m: ms, n: 1 });
              }
            }
          }
        }
      }
    }
    return cands.filter(function (c) { return c.n >= 2; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 9);
  }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function triples(c) {
    var out = [], i, j, k;
    for (i = 0; i < c.length; i++) for (j = i + 1; j < c.length; j++) for (k = j + 1; k < c.length; k++) {
      var P = [c[i], c[j], c[k]], d = [dist(P[1], P[2]), dist(P[0], P[2]), dist(P[0], P[1])];   // d[t] = side opposite P[t]
      var tl = d.indexOf(Math.max.apply(null, d)), A = P[tl], B = P[(tl + 1) % 3], C = P[(tl + 2) % 3];
      var lb = dist(A, B), lc = dist(A, C), hyp = dist(B, C), avg = (lb + lc) / 2;
      if (Math.abs(lb - lc) / avg > 0.3 || Math.abs(hyp - Math.SQRT2 * avg) / hyp > 0.2) continue;
      var dot = ((B.x - A.x) * (C.x - A.x) + (B.y - A.y) * (C.y - A.y)) / (lb * lc); if (Math.abs(dot) > 0.3) continue;
      var mm = Math.max(A.m, B.m, C.m) / Math.min(A.m, B.m, C.m); if (mm > 1.8) continue;
      // P[tl] is the vertex opposite the longest side → that is the corner with the right angle (top-left)
      var cross = (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x), TR = cross > 0 ? B : C, BL = cross > 0 ? C : B;
      out.push({ tl: A, tr: TR, bl: BL, score: Math.abs(lb - lc) / avg + Math.abs(hyp - Math.SQRT2 * avg) / hyp + Math.abs(dot) + (mm - 1) });
    }
    return out.sort(function (a, b) { return a.score - b.score; });
  }

  /* ---------------------------------------------------------------- geometry */
  function axisModule(bin, w, h, p, ux, uy) {            // module size measured along a unit vector from a finder centre
    var t = 0, st = 0.4, state = 1, marks = 0;
    while (t < 200) {
      t += st; var x = Math.floor(p.x + ux * t), y = Math.floor(p.y + uy * t);
      if (x < 0 || y < 0 || x >= w || y >= h) return 0;
      var v = bin[y * w + x];
      if (v !== state) { state = v; marks++; if (marks === 3) return t / 3.5; }
    }
    return 0;
  }
  function homography(src, dst) {
    var A = [], i, j, k;
    for (i = 0; i < 4; i++) {
      var X = src[i][0], Y = src[i][1], u = dst[i][0], v = dst[i][1];
      A.push([X, Y, 1, 0, 0, 0, -u * X, -u * Y, u]); A.push([0, 0, 0, X, Y, 1, -v * X, -v * Y, v]);
    }
    for (i = 0; i < 8; i++) {
      var p = i; for (j = i + 1; j < 8; j++) if (Math.abs(A[j][i]) > Math.abs(A[p][i])) p = j;
      if (Math.abs(A[p][i]) < 1e-9) return null;
      var t = A[i]; A[i] = A[p]; A[p] = t;
      for (j = i + 1; j < 8; j++) { var f = A[j][i] / A[i][i]; for (k = i; k < 9; k++) A[j][k] -= f * A[i][k]; }
    }
    var hh = new Array(8);
    for (i = 7; i >= 0; i--) { var s = A[i][8]; for (j = i + 1; j < 8; j++) s -= A[i][j] * hh[j]; hh[i] = s / A[i][i]; }
    return hh;
  }
  function proj(H, u, v) { var d = H[6] * u + H[7] * v + 1; return [(H[0] * u + H[1] * v + H[2]) / d, (H[3] * u + H[4] * v + H[5]) / d]; }

  function sample(bin, w, h, tr, dim, mod) {
    var M = new Uint8Array(dim * dim), r, c, o = [[0, 0], [-0.22, 0], [0.22, 0], [0, -0.22], [0, 0.22]];
    var offs = mod > 2.2 ? o : [[0, 0]];
    for (r = 0; r < dim; r++) for (c = 0; c < dim; c++) {
      var votes = 0;
      for (var k = 0; k < offs.length; k++) {
        var p = tr(c + 0.5 + offs[k][0], r + 0.5 + offs[k][1]), x = Math.round(p[0] - 0.5), y = Math.round(p[1] - 0.5);
        if (x < 0 || y < 0 || x >= w || y >= h) return null;
        votes += bin[y * w + x];
      }
      M[r * dim + c] = votes * 2 > offs.length ? 1 : 0;
    }
    return M;
  }

  function tryTriple(bin, w, h, T) {
    var tl = T.tl, tr = T.tr, bl = T.bl;
    var ax = (tr.x - tl.x), ay = (tr.y - tl.y), bx = (bl.x - tl.x), by = (bl.y - tl.y), la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    var ua = [ax / la, ay / la], ub = [bx / lb, by / lb], ms = [];
    [tl, tr, bl].forEach(function (p) { [[ua[0], ua[1]], [-ua[0], -ua[1]], [ub[0], ub[1]], [-ub[0], -ub[1]]].forEach(function (u) { var m = axisModule(bin, w, h, p, u[0], u[1]); if (m > 0.8) ms.push(m); }); });
    var mod;
    if (ms.length >= 4) { ms.sort(function (x, y) { return x - y; }); mod = ms[ms.length >> 1]; }
    else { var th = Math.abs(((Math.atan2(ay, ax) * 180 / Math.PI + 45) % 90 + 90) % 90 - 45) * Math.PI / 180; mod = (tl.m + tr.m + bl.m) / 3 * Math.cos(th); }
    var span = (la + lb) / 2, dimEst = span / mod + 7, v0 = Math.round((dimEst - 17) / 4), tried = [v0, v0 + 1, v0 - 1];
    for (var ti = 0; ti < tried.length; ti++) {
      var ver = tried[ti]; if (ver < 1 || ver > 40) continue;
      var dim = 17 + 4 * ver, step = (dim - 7);
      function affine(u, v) { var s = (u - 3.5) / step, t = (v - 3.5) / step; return [tl.x + s * ax + t * bx, tl.y + s * ay + t * by]; }
      var four = [[dim - 3.5, dim - 3.5]], dst4 = [affine(dim - 3.5, dim - 3.5)];
      if (ver >= 2) {                                           // refine the 4th corner with the alignment pattern
        var pos = root.QRCodeLib.internals.QRUtil.PATTERN_POSITION_TABLE[ver - 1], ap = pos[pos.length - 1] + 0.5, pred = affine(ap, ap), bestS = -1, bestP = null;
        var rad = Math.max(3, Math.round(4 * mod)), stp = Math.max(1, Math.round(mod / 3)), dx, dy;
        function alignScore(cx, cy, graded) {               // how well a 5x5-module alignment pattern fits at (cx,cy)
          var sc = 0, offs = graded ? [[0, 0], [-0.3, 0], [0.3, 0], [0, -0.3], [0, 0.3]] : [[0, 0]];
          for (var i = -2; i <= 2; i++) for (var j = -2; j <= 2; j++) {
            var want = Math.max(Math.abs(i), Math.abs(j)) === 1 ? 0 : 1, hit = 0;
            for (var o = 0; o < offs.length; o++) {
              var q = affineAround(cx, cy, i + offs[o][0], j + offs[o][1], ua, ub, mod), qx = Math.floor(q[0]), qy = Math.floor(q[1]);
              if (qx < 0 || qy < 0 || qx >= w || qy >= h) return -99;
              if (bin[qy * w + qx] === want) hit++;
            }
            sc += hit / offs.length;
          }
          return sc;
        }
        for (dx = -rad; dx <= rad; dx += stp) for (dy = -rad; dy <= rad; dy += stp) {
          var sc0 = alignScore(pred[0] + dx, pred[1] + dy, false);
          if (sc0 > bestS) { bestS = sc0; bestP = [pred[0] + dx, pred[1] + dy]; }
        }
        if (bestS >= 21) {                                   // fine search: centre of the best plateau
          var fr = Math.max(2, Math.round(mod * 0.8)), fb = -1, fx = 0, fy = 0, fw = 0, res = [];
          for (dx = -fr; dx <= fr; dx++) for (dy = -fr; dy <= fr; dy++) { var sg = alignScore(bestP[0] + dx, bestP[1] + dy, true); res.push([bestP[0] + dx, bestP[1] + dy, sg]); if (sg > fb) fb = sg; }
          res.forEach(function (r) { if (r[2] >= fb - 0.6) { fx += r[0]; fy += r[1]; fw++; } });
          if (fw) { bestP = [fx / fw, fy / fw]; bestS = fb; }
        }
        if (bestS >= 21) { four = [[ap, ap]]; dst4 = [bestP]; }
      }
      var H = homography([[3.5, 3.5], [dim - 3.5, 3.5], [3.5, dim - 3.5], four[0]], [[tl.x, tl.y], [tr.x, tr.y], [bl.x, bl.y], dst4[0]]);
      if (!H) continue;
      var M = sample(bin, w, h, function (u, v) { return proj(H, u, v); }, dim, mod);
      if (!M) continue;
      var txt = decodeMatrix(M, dim, ver);
      if (txt != null) return txt;
    }
    return null;
  }
  function affineAround(cx, cy, i, j, ua, ub, mod) { return [cx + i * mod * ua[0] + j * mod * ub[0], cy + i * mod * ua[1] + j * mod * ub[1]]; }

  /* ---------------------------------------------------------------- public API */
  function decode(rgba, w, h) {
    var bin = binarize(rgba, w, h), f = findFinders(bin, w, h);
    if (f.length < 3) return null;
    var T = triples(f);
    for (var i = 0; i < Math.min(4, T.length); i++) { var t = tryTriple(bin, w, h, T[i]); if (t != null) return t; }
    return null;
  }
  root.QRScan = { decode: decode, _rs: rsCorrect, _bin: binarize, _matrix: decodeMatrix };
  if (typeof module === 'object' && module.exports) module.exports = root.QRScan;
})(typeof window !== 'undefined' ? window : globalThis);
