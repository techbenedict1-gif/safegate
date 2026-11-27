/* SafeGate core — business logic shared by the browser (demo mode) and server.js.
 * No dependencies. Pure JS SHA-256/HMAC so it works on http:// and file:// too. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SGCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DAY = 86400000, MIN = 60000, HOUR = 3600000;
  var MEDIA_LIM = { image: { max: 450000, per: 6 }, audio: { max: 700000, per: 2 }, video: { max: 6000000, per: 1 } };

  function SGError(code, msg) { this.code = code; this.message = msg || code; this.name = 'SGError'; }
  SGError.prototype = Object.create(Error.prototype);
  function fail(code, msg) { throw new SGError(code, msg); }

  /* ------------------------------------------------------------------ crypto */
  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  var H0 = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

  function utf8(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 128) out.push(c);
      else if (c < 2048) out.push(192 | (c >> 6), 128 | (c & 63));
      else if (c >= 0xd800 && c < 0xdc00 && i + 1 < str.length) {
        var c2 = str.charCodeAt(++i);
        c = 0x10000 + ((c & 0x3ff) << 10) + (c2 & 0x3ff);
        out.push(240 | (c >> 18), 128 | ((c >> 12) & 63), 128 | ((c >> 6) & 63), 128 | (c & 63));
      } else out.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63));
    }
    return out;
  }
  function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
  function sha256Bytes(msg) {
    var l = msg.length, bytes = msg.slice();
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    var hi = Math.floor(l * 8 / 0x100000000), lo = (l * 8) >>> 0;
    bytes.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255,
      (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);
    var h = H0.slice(), w = new Array(64);
    for (var i = 0; i < bytes.length; i += 64) {
      var t;
      for (t = 0; t < 16; t++) w[t] = ((bytes[i + 4 * t] << 24) | (bytes[i + 4 * t + 1] << 16) | (bytes[i + 4 * t + 2] << 8) | bytes[i + 4 * t + 3]) >>> 0;
      for (t = 16; t < 64; t++) {
        var a15 = w[t - 15], a2 = w[t - 2];
        var s0 = rotr(a15, 7) ^ rotr(a15, 18) ^ (a15 >>> 3);
        var s1 = rotr(a2, 17) ^ rotr(a2, 19) ^ (a2 >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
      }
      var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
      for (t = 0; t < 64; t++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ (~e & g);
        var t1 = (hh + S1 + ch + K[t] + w[t]) >>> 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) >>> 0;
        hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
      h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
    }
    var out = [];
    for (var j = 0; j < 8; j++) out.push((h[j] >>> 24) & 255, (h[j] >>> 16) & 255, (h[j] >>> 8) & 255, h[j] & 255);
    return out;
  }
  function toHex(bytes) { var s = ''; for (var i = 0; i < bytes.length; i++) s += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16); return s; }
  function sha256Hex(str) { return toHex(sha256Bytes(utf8(str))); }
  function hmacHex(key, msg) {
    var kb = utf8(key);
    if (kb.length > 64) kb = sha256Bytes(kb);
    while (kb.length < 64) kb.push(0);
    var ipad = kb.map(function (b) { return b ^ 0x36; }), opad = kb.map(function (b) { return b ^ 0x5c; });
    return toHex(sha256Bytes(opad.concat(sha256Bytes(ipad.concat(utf8(msg))))));
  }
  function rnd(n) {
    var a = new Uint8Array(n), c = (typeof crypto !== 'undefined' && crypto.getRandomValues) ? crypto : null;
    if (c) c.getRandomValues(a); else for (var i = 0; i < n; i++) a[i] = Math.floor(Math.random() * 256);
    return toHex(Array.prototype.slice.call(a));
  }
  function hashPin(pin, salt) {
    var h = hmacHex(salt, pin);
    for (var i = 0; i < 6000; i++) h = hmacHex(salt, h + pin);
    return h;
  }

  /* ------------------------------------------------------------------- utils */
  function str(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max); }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function numOrNull(v) { return isNum(v) ? v : null; }
  function haversine(a1, o1, a2, o2) {
    var R = 6371000, r = Math.PI / 180, dA = (a2 - a1) * r, dO = (o2 - o1) * r;
    var x = Math.sin(dA / 2) * Math.sin(dA / 2) + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.sin(dO / 2) * Math.sin(dO / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
  }
  /* Compass bearing in degrees (0 = north) from point 1 to point 2. */
  function bearing(la1, lo1, la2, lo2) {
    var r = Math.PI / 180, y = Math.sin((lo2 - lo1) * r) * Math.cos(la2 * r), x = Math.cos(la1 * r) * Math.sin(la2 * r) - Math.sin(la1 * r) * Math.cos(la2 * r) * Math.cos((lo2 - lo1) * r);
    return (Math.atan2(y, x) / r + 360) % 360;
  }
  /* Nearest safe points to a position: distance in metres, bearing, and a walking estimate (about 75 m a minute). */
  function nearestSafe(lat, lng, points, limit) {
    return (points || []).filter(function (p) { return p && typeof p.lat === 'number' && typeof p.lng === 'number'; }).map(function (p) {
      var d = haversine(lat, lng, p.lat, p.lng);
      return { id: p.id, type: p.type, name: p.name, note: p.note || '', phone: p.phone || '', lat: p.lat, lng: p.lng, distM: Math.round(d), bearing: Math.round(bearing(lat, lng, p.lat, p.lng)), walkMin: Math.max(1, Math.round(d / 75)) };
    }).sort(function (a, b) { return a.distM - b.distM; }).slice(0, limit || 3);
  }
  /* Does the straight walk from A to B pass through a circle? Works in metres around A. */
  function lineHitsCircle(la1, lo1, la2, lo2, cla, clo, r) {
    var k = Math.cos(la1 * Math.PI / 180) * 111320, ky = 110540, bx = (lo2 - lo1) * k, by = (la2 - la1) * ky, cx = (clo - lo1) * k, cy = (cla - la1) * ky, L2 = bx * bx + by * by;
    var t = L2 ? Math.max(0, Math.min(1, (cx * bx + cy * by) / L2)) : 0, dx = cx - t * bx, dy = cy - t * by;
    return dx * dx + dy * dy <= r * r;
  }
  /* Safe places ranked by how safe the walk is, not only how short. A walk through a risk area or past a blocked road costs extra distance. */
  function rankSafe(lat, lng, points, zones, hazards, limit) {
    var zs = (zones || []).filter(function (z) { return z.active !== false; }), hs = hazards || [];
    return nearestSafe(lat, lng, points, 60).map(function (p) {
      var cr = zs.filter(function (z) { return lineHitsCircle(lat, lng, p.lat, p.lng, z.lat, z.lng, z.radiusM); }).map(function (z) { return z.name; });
      var ch = hs.filter(function (h) { return lineHitsCircle(lat, lng, p.lat, p.lng, h.lat, h.lng, h.radiusM || 40); }).map(function (h) { return h.label || h.kind; });
      p.crossesRisk = cr; p.crossesHazard = ch; p.cost = p.distM + cr.length * 250 + ch.length * 400; return p;
    }).sort(function (a, b) { return a.cost - b.cost; }).slice(0, limit || 4);
  }
  var HAZARD_KINDS = { blocked: 'Road blocked', flood: 'Flooding', construction: 'Construction', dark: 'No light', dogs: 'Aggressive dogs', crowd: 'Crowd or protest', accident: 'Accident', other: 'Other danger' };
  /* Report triage: a transparent keyword score. It only decides what staff read first. A person always decides what it means. */
  var TRIAGE = [
    [/\b(gun|rifle|pistol|knife|machete|cutlass|weapon|armed|stab(bed|bing)?|shot|shooting)\b/i, 60, 'weapon'],
    [/\b(kidnap\w*|abduct\w*|forced into|dragged|bundled)\b/i, 70, 'abduction'],
    [/\b(rape\w*|sexual(ly)? assault\w*|molest\w*|touched me|forced me)\b/i, 65, 'sexual violence'],
    [/\b(unconscious|not breathing|bleeding|blood|seizure|collapsed|dying|overdose|poison\w*)\b/i, 60, 'medical danger'],
    [/\b(kill|threaten\w*|beat(ing|en)?|attack\w*|assault\w*|fight(ing)?|cult\w*)\b/i, 40, 'violence or threat'],
    [/\b(follow(ed|ing)|stalk\w*|chas(e|ed|ing))\b/i, 35, 'being followed'],
    [/\b(blackmail\w*|harass\w*|bully\w*|intimidat\w*|extort\w*)\b/i, 30, 'harassment'],
    [/\b(drug\w*|weed|cocaine|tramadol|codeine)\b/i, 20, 'drugs']
  ];
  function triage(cat, text) {
    var score = { followed: 35, unsafe: 30, medical: 45, threat: 40, violence: 55, sexual: 50, abuse: 40, theft: 15, bullying: 20, harassment: 25, suspicious: 15 }[cat] || 5, tags = [];
    TRIAGE.forEach(function (r) { if (r[0].test(text)) { score = Math.max(score, r[1]) + 5; tags.push(r[2]); } });
    score = Math.min(100, score);
    return { score: score, level: score >= 60 ? 'critical' : score >= 35 ? 'high' : 'normal', tags: tags };
  }
  /* The reference number comes from the report's own id, so the phone can show it at once, even offline. */
  function refOf(id) { var A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', h = sha256Hex('ref:' + id), r = 'SG-', k; for (k = 0; k < 7; k++) r += A[parseInt(h.substr(k * 2, 2), 16) % 31]; return r; }
  function localMinutes(t, tz) { return ((Math.floor(t / MIN) + tz) % 1440 + 1440) % 1440; }
  function parseHM(s) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(s || '');
    if (!m) return null;
    var h = +m[1], mi = +m[2];
    return (h > 23 || mi > 59) ? null : h * 60 + mi;
  }
  function inWindow(minute, from, until) {
    if (from === until) return true;
    return from < until ? (minute >= from && minute < until) : (minute >= from || minute < until);
  }
  function trackExpected(t, cfg) {
    var f = parseHM(cfg.trackFrom), u = parseHM(cfg.trackUntil);
    if (f == null || u == null) return false;
    return inWindow(localMinutes(t, cfg.tzOffsetMin || 0), f, u);
  }
  function windowStart(t, cfg) { // start of the tracking window that contains t
    var f = parseHM(cfg.trackFrom), m = localMinutes(t, cfg.tzOffsetMin || 0);
    return Math.floor(t / MIN) * MIN - ((m - f + 1440) % 1440) * MIN;
  }
  function nextLocalTime(t, minOfDay, tz) {
    var cur = localMinutes(t, tz), delta = (minOfDay - cur + 1440) % 1440;
    var c = Math.floor(t / MIN) * MIN + delta * MIN;
    return c <= t ? c + DAY : c;
  }
  function parseGatePayload(text) {
    text = String(text || '').trim();
    if (/^#?\d{6}$/.test(text)) return '#' + text.replace('#', '');
    var m = /[?&#]g=([A-Za-z0-9_.\-]+)/.exec(text);
    var tok = m ? m[1] : text;
    return /^[A-Za-z0-9_-]{1,12}\.(\d{1,10}|S)\.[a-fA-F0-9]{12}$/.test(tok) ? tok : null;
  }
  function fmtLocal(t, tz) { // "2026-11-02 17:30" in school time
    var d = new Date(t + (tz || 0) * MIN), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes());
  }

  /* ---------------------------------------------------------------- defaults */
  function defaultPlaces() {
    return [
      { id: 'afama', name: 'Afama Market', area: 'Market close to the school', tip: 'Busy market. Keep your phone and money out of sight, go with a friend the first time, and come back before dark.', lat: null, lng: null, radiusM: 400 },
      { id: 'town', name: 'Town / city centre', area: 'Main town', tip: 'Use registered taxis or buses. Share your trip with someone before you go.', lat: null, lng: null, radiusM: 1500 },
      { id: 'clinic', name: 'Hospital or clinic', area: 'Health', tip: 'If you feel very unwell, call security first so they can help.', lat: null, lng: null, radiusM: 300 },
      { id: 'worship', name: 'Church / mosque', area: 'Worship', tip: 'Tell a friend your expected return time.', lat: null, lng: null, radiusM: 300 },
      { id: 'bank', name: 'Bank or ATM', area: 'Money', tip: 'Do not count money in public. Prefer ATMs inside banks and go in daylight.', lat: null, lng: null, radiusM: 300 },
      { id: 'home', name: 'Home / family house', area: 'Home', tip: 'Let your emergency contact know when you leave and arrive.', lat: null, lng: null, radiusM: 500 },
      { id: 'hostel', name: 'Off-campus hostel or lodge', area: 'Where you live', tip: 'Keep your door locked and share your location with a trusted friend.', lat: null, lng: null, radiusM: 400 },
      { id: 'visit', name: 'Visiting a friend', area: 'Someone you know', tip: 'Share your friend\'s name and phone number with your emergency contact.', lat: null, lng: null, radiusM: 400 }
    ];
  }
  function defaultSettings() {
    return {
      schoolName: 'University', securityPhone: '', gateId: 'MAIN', gateSecret: rnd(16), cardSecret: rnd(16), gateMode: 'rotating', gatePolicy: 'standard', idPolicy: 'none', freeForStudents: true, controllerName: '', privacyContact: '', gatePeriodSec: 60,
      appUrl: '', tzOffsetMin: 60, trackFrom: '17:30', trackUntil: '06:00', curfew: '22:00', graceMin: 15, silenceMin: 20,
      pingIntervalSec: 120, mapTiles: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', routeUrl: 'https://router.project-osrm.org', searchUrl: 'https://nominatim.openstreetmap.org', campus: { lat: null, lng: null, radiusM: 300 },
      retentionDaysPings: 30, retentionDaysEvents: 365, trailAccessMin: 30, mediaOn: true, mediaDays: 30, mediaDayMB: 30, mediaTotalMB: 3000,
      lowBattery: 10, mismatchM: 2500, askWaitMin: 10, walkGraceMin: 2, escalateMin: 5,
      visitorMaxHours: 8, escortWaitMin: 10, requireRoster: false, lockDevice: true, smsEnabled: false, parentUpdates: false, parentUpdatesPaidBy: 'parent', parentStarter: 10, currency: '₦', payInstructions: '', smsContactOnSos: true, smsContactOverdueHours: 0, smsDailyCap: 150, countryCode: '234', policyVersion: 1, directory: [],
      policyText: 'SafeGate records when you leave and enter the campus, where you said you were going, and when you plan to return. Your location is shared only if you turn it on for a trip, and only from the evening tracking time until you scan back in. Officers cannot open your location without choosing a reason, and every look is recorded and shown to you. Pressing the emergency button shares your live location at once, and security may also text your emergency contact. You can download your data or delete your location history at any time. Trip records are kept for safety and are removed after the retention period set by the school.'
    };
  }
  function defaultConfig() {
    var s = defaultSettings();
    return {
      schoolName: s.schoolName, securityPhone: '', gateId: s.gateId, tzOffsetMin: s.tzOffsetMin, trackFrom: s.trackFrom,
      trackUntil: s.trackUntil, curfew: s.curfew, pingIntervalSec: s.pingIntervalSec, campus: s.campus, places: defaultPlaces()
    };
  }

  /* ------------------------------------------------------------------ server */
  /* A destination is "vague" when someone searching for a missing student could not tell where to start: one word, or only generic words like "market" or "town". */
  var GENERIC = /^(the|a|my|to|at|in|on|going|go|market|town|church|mosque|shop|shops|shopping|outside|hospital|school|home|house|hostel|park|village|junction|bank|pharmacy|mall|store|friend|friends|friend's|area|place|campus|city|road|street|visit|visiting|out|stationery|cafe|restaurant|club|beach|gym)$/i;
  function vagueDest(text) {
    var raw = String(text || ''), w = raw.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean);
    if (w.length < 2) return true;
    if (w.every(function (x) { return GENERIC.test(x); })) return true;
    return w.length < 3 && !/[,\d]/.test(raw);
  }

  function createServer(db, opts) {
    opts = opts || {};
    var save = opts.save || function () {};
    var clock = opts.now || Date.now;

    // ---- db shape
    function normalize() {
      db.v = 1;
      db.createdAt = db.createdAt || clock();
      db.settings = Object.assign(defaultSettings(), db.settings || {});
      db.settings.campus = Object.assign({ lat: null, lng: null, radiusM: 300 }, db.settings.campus || {});
      db.settings.gatePoint = Object.assign({ lat: null, lng: null, radiusM: 120 }, db.settings.gatePoint || {});
      db.places = db.places || defaultPlaces();
      db.safePoints = db.safePoints || []; db.riskZones = db.riskZones || []; db.hazards = db.hazards || []; db.placeIdeas = db.placeIdeas || []; db.integrity = db.integrity || {}; db.media = db.media || {}; db.mediaQuota = db.mediaQuota || {}; db.mediaBytes = db.mediaBytes || 0; db.deviceMap = db.deviceMap || {};
      ['students', 'resolutions', 'grants', 'sessions'].forEach(function (k) { db[k] = db[k] || {}; });
      ['events', 'pings', 'sos', 'audit'].forEach(function (k) { db[k] = db[k] || []; });
      db.lock = db.lock || { fails: 0, until: 0 };
      db.staff = db.staff || null;
      ['asks', 'claims', 'passes', 'guardians'].forEach(function (k) { db[k] = db[k] || {}; });
      ['notices', 'reports', 'notes', 'visitors'].forEach(function (k) { db[k] = db[k] || []; });
      db.consentLog = db.consentLog || [];
      ['escorts', 'consents', 'roster', 'transfers', 'transferCodes', 'pushed', 'cardVer'].forEach(function (k) { db[k] = db[k] || {}; });
      db.drills = db.drills || []; db.rollcalls = db.rollcalls || []; db.subs = db.subs || {}; db.pv = db.pv || {};
      var bl = db.billing = db.billing || {};
      bl.enabled = !!bl.enabled; bl.prices = bl.prices || { sms: { cost: 0, price: 1000 } }; bl.wallets = bl.wallets || {}; bl.wallets.school = bl.wallets.school || { bal: 0, t: 0 };
      bl.ledger = bl.ledger || []; bl.refs = bl.refs || {}; bl.pending = bl.pending || {}; if (bl.reserve == null) bl.reserve = 500000; if (bl.lowAt == null) bl.lowAt = 100000; db.smsLog = db.smsLog || []; db.smsKeys = db.smsKeys || {};
      db.push = db.push || {}; db.push.students = db.push.students || {}; db.push.staff = db.push.staff || {};
      (function () { var m = db.monet = db.monet || {}; var d = monetDefaults(); m.plans = Object.assign({}, d.plans, m.plans || {}); m.plans.plus = Object.assign({}, d.plans.plus, m.plans.plus || {}); m.plans.family = Object.assign({}, d.plans.family, m.plans.family || {}); m.licence = Object.assign({}, d.licence, m.licence || {}); m.adsOn = !!m.adsOn; m.subs = m.subs || {}; m.sales = m.sales || []; m.ads = m.ads || []; m.texts = m.texts || {}; m.rate = m.rate || d.rate; })();
      db.cases = db.cases || []; db.ict = db.ict || { links: {} }; db.trash = db.trash || []; db.tomb = db.tomb || {}; db.help = db.help || [];
      db.auditAnchor = db.auditAnchor || '';
      if (db.staff && !db.staff.accounts) {            // v1 single-PIN desk → one administrator account
        var who = 'Admin', legacy = db.staff, ai;
        for (ai = 0; ai < db.audit.length; ai++) if (db.audit[ai].action === 'setup') { who = db.audit[ai].officer || who; break; }
        db.staff = { accounts: {} };
        db.staff.accounts[who.toLowerCase()] = { name: who, role: 'admin', salt: legacy.salt, hash: legacy.hash, active: true, fails: 0, until: 0, created: db.createdAt };
      }
      db.lastPurge = db.lastPurge || 0;
    }
    normalize();

    var ids = new Set(), by = new Map();
    function bucket(m) { var b = by.get(m); if (!b) { b = { events: [], pings: [] }; by.set(m, b); } return b; }
    function rebuild() {
      ids.clear(); by.clear();
      db.events.forEach(function (e) { ids.add(e.id); bucket(e.matric).events.push(e); });
      db.pings.forEach(function (p) { ids.add(p.id); bucket(p.matric).pings.push(p); });
      db.sos.forEach(function (s) { ids.add(s.id); });
      Object.keys(db.tomb || {}).forEach(function (k) { ids.add(k); });
      by.forEach(function (b) { b.events.sort(function (a, c) { return a.t - c.t; }); b.pings.sort(function (a, c) { return a.t - c.t; }); });
    }
    rebuild();

    function addEvent(e) {
      var b = bucket(e.matric);
      db.events.push(e); b.events.push(e); ids.add(e.id);
      var n = b.events.length;
      if (n > 1 && b.events[n - 2].t > e.t) b.events.sort(function (a, c) { return a.t - c.t; });
    }
    function auditHash(prev, e) { return sha256Hex(prev + '|' + JSON.stringify([e.t, e.officer, e.action, e.target, e.reason, e.detail])); }
    function verifyChain() {
      var prev = db.auditAnchor || '', n = 0;
      for (var i = 0; i < db.audit.length; i++) {
        var e = db.audit[i];
        if (!e.h) { prev = ''; continue; }                                  // entries written before sealing was added
        if (auditHash(prev, e) !== e.h) return { ok: false, brokenAt: i, t: e.t, checked: n };
        prev = e.h; n++;
      }
      return { ok: true, checked: n, total: db.audit.length };
    }
    function audit(action, o) {
      o = o || {};
      var e = { t: clock(), officer: o.officer || 'system', action: action, target: o.target || '', reason: str(o.reason, 200), detail: str(o.detail, 200) };
      var last = db.audit.length ? db.audit[db.audit.length - 1] : null;
      e.h = auditHash(last ? (last.h || '') : (db.auditAnchor || ''), e);   // each entry seals the one before it
      db.audit.push(e);
    }

    // ---- gate tokens
    function tokenAt(t) {
      var s = db.settings, body, win = null, validFor = null;
      if (s.gateMode === 'static') body = s.gateId + '.S';
      else { var sec = Math.floor(t / 1000); win = Math.floor(sec / s.gatePeriodSec); body = s.gateId + '.' + win; validFor = s.gatePeriodSec - (sec % s.gatePeriodSec); }
      return { token: body + '.' + hmacHex(s.gateSecret, body).slice(0, 12), win: win, validForSec: validFor, code: manualCode(win == null ? 'S' : win) };
    }
    function manualCode(win) {
      var n = parseInt(hmacHex(db.settings.gateSecret, 'M.' + db.settings.gateId + '.' + win).slice(0, 8), 16) % 1000000;
      return ('000000' + n).slice(-6);
    }
    function verifyGate(tok, t) {
      if (!tok || typeof tok !== 'string') return { status: 'missing' };
      var mc = /^#(\d{6})$/.exec(tok.trim());
      if (mc) {
        if (db.settings.gateMode === 'static') return { status: manualCode('S') === mc[1] ? 'static' : 'invalid' };
        var sw = Math.floor(t / 1000 / db.settings.gatePeriodSec), tl = Math.max(2, Math.ceil(180 / db.settings.gatePeriodSec));
        for (var w = sw - tl; w <= sw + tl; w++) if (manualCode(w) === mc[1]) return { status: 'verified' };
        return { status: 'invalid' };
      }
      var m = /^([A-Za-z0-9_-]{1,12})\.(\d{1,10}|S)\.([a-fA-F0-9]{12})$/.exec(tok.trim());
      if (!m) return { status: 'invalid' };
      var s = db.settings;
      if (m[1].toUpperCase() !== s.gateId) return { status: 'invalid' };
      if (hmacHex(s.gateSecret, s.gateId + '.' + m[2]).slice(0, 12) !== m[3].toLowerCase()) {
        if (m[2] === 'S' && s.gateMode === 'static' && s.gateSecretPrev && s.gatePrevUntil > t && hmacHex(s.gateSecretPrev, s.gateId + '.S').slice(0, 12) === m[3].toLowerCase()) return { status: 'static', old: true };   // the previous poster still works for a short grace period, but is flagged
        return { status: 'invalid' };
      }
      if (m[2] === 'S') return { status: s.gateMode === 'static' ? 'static' : 'invalid' };
      var scanWin = Math.floor(t / 1000 / s.gatePeriodSec), tol = Math.max(2, Math.ceil(180 / s.gatePeriodSec));
      return { status: Math.abs(scanWin - (+m[2])) <= tol ? 'verified' : 'stale' };
    }

    // ---- staff auth
    var SESSION_TTL = 12 * 3600 * 1000;
    function newSession(acct) {
      var tok = rnd(24), now = clock();
      Object.keys(db.sessions).forEach(function (k) { if (db.sessions[k].exp < now) delete db.sessions[k]; });
      db.sessions[sha256Hex(tok)] = { officer: acct.name, exp: now + SESSION_TTL, seen: now };
      return tok;
    }
    function acctOf(name) { return db.staff && db.staff.accounts ? db.staff.accounts[String(name || '').toLowerCase()] : null; }
    function auth(token) {
      if (typeof token !== 'string' || !token) fail('auth', 'Please sign in');
      var h = sha256Hex(token), s = db.sessions[h], now = clock();
      if (!s || s.exp < now) fail('auth', 'Session expired. Please sign in again.');
      if (s.ict) { s.role = 'admin'; return s; }
      var ac = acctOf(s.officer);
      if (!ac || !ac.active) { delete db.sessions[h]; fail('auth', 'This account is disabled.'); }
      s.role = ac.role;
      if (now - s.seen > 10 * MIN) { s.seen = now; s.exp = now + SESSION_TTL; save(); }
      return s;
    }
    function adminOnly(token) { var s = auth(token); if (s.role !== 'admin') fail('forbidden', 'Only an administrator can do this.'); return s; }
    function killSessions(name) { Object.keys(db.sessions).forEach(function (k) { if (db.sessions[k].officer.toLowerCase() === name.toLowerCase()) delete db.sessions[k]; }); }
    function mkAccount(name, pin, role) { var salt = rnd(16); return { name: name, role: role, salt: salt, hash: hashPin(pin, salt), active: true, fails: 0, until: 0, created: clock() }; }
    function activeAdmins() { return Object.keys(db.staff.accounts).filter(function (k) { var a = db.staff.accounts[k]; return a.active && a.role === 'admin'; }); }
    function checkPin(pin) { pin = String(pin || ''); if (pin.length < 6 || pin.length > 64) fail('weak-pin', 'PIN must be at least 6 characters'); return pin; }
    function officerName(n) { n = str(n, 60); if (n.length < 2) fail('bad-officer', 'Enter the officer name'); return n; }

    // ---- student helpers
    function normMatric(m) {
      m = str(m, 30).toUpperCase().replace(/\s+/g, '');
      if (!/^[A-Z0-9][A-Z0-9\/\-._]{3,23}$/.test(m)) fail('bad-matric', 'Matric number looks wrong');
      return m;
    }
    function nameTokens(n) { return String(n || '').toLowerCase().replace(/[^a-z\u00c0-\u024f ]/g, ' ').split(/\s+/).filter(function (x) { return x.length >= 3; }); }
    function rosterCheckFor(matric, name) {
      if (!db.settings.requireRoster || !Object.keys(db.roster).length) return null;
      var r = db.roster[matric];
      if (!r) return { code: 'not-on-roster', message: 'This matric number is not on the school list. Check it, or visit the admin office.' };
      var a = nameTokens(r.name), b = nameTokens(name);
      if (a.length && !a.some(function (t) { return b.indexOf(t) >= 0; })) return { code: 'name-mismatch', message: 'The name does not match the school record for this matric number.' };
      return null;
    }
    /* ---- push: core decides who and what; the server process delivers (opts.notify) */
    function subsFor(audience, matric) {
      if (audience === 'staff') { var o = []; Object.keys(db.push.staff).forEach(function (k) { var a = db.staff && db.staff.accounts && db.staff.accounts[k]; if (a && a.active) o = o.concat(db.push.staff[k]); }); return o; }
      return (db.push.students[matric] || []).slice();
    }
    function notify(audience, matric, payload, urgent) {
      if (!opts.notify) return;
      var subs = subsFor(audience, matric); if (!subs.length) return;
      try { opts.notify({ audience: audience, matric: matric, payload: payload, urgent: !!urgent }, subs); } catch (e) { /* delivery must never break a rule */ }
    }
    function pushHostOk(u) {
      var h; try { var x = new URL(u); h = x.hostname; if (x.protocol !== 'https:') return !!opts.pushAllowLocal && (h === 'localhost' || h === '127.0.0.1'); } catch (e) { return false; }
      return /(^|\.)(googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com|push\.microsoft\.com)$/.test(h);
    }
    function cleanSub(sub) {
      if (!sub || typeof sub.endpoint !== 'string' || sub.endpoint.length > 600 || !pushHostOk(sub.endpoint)) fail('bad-subscription', 'This browser cannot receive alerts here');
      var k = sub.keys || {}; if (typeof k.p256dh !== 'string' || typeof k.auth !== 'string' || k.p256dh.length > 120 || k.auth.length > 40) fail('bad-subscription');
      return { endpoint: sub.endpoint, keys: { p256dh: k.p256dh, auth: k.auth } };
    }
    function addSub(list, sub) { var i; for (i = list.length - 1; i >= 0; i--) if (list[i].endpoint === sub.endpoint) list.splice(i, 1); list.push(sub); while (list.length > 5) list.shift(); }
    function dropSub(id) {
      [db.push.students, db.push.staff].forEach(function (g) { Object.keys(g).forEach(function (k) { g[k] = g[k].filter(function (x) { return (x.endpoint || x.fcm) !== id; }); if (!g[k].length) delete g[k]; }); });
    }
    function cleanNative(t) { t = String(t || ''); if (t.length < 20 || t.length > 400 || /[\s"<>]/.test(t)) fail('bad-subscription', 'Bad device token'); return { fcm: t }; }
    function addSub2(list, sub) { var i, id = sub.endpoint || sub.fcm; for (i = list.length - 1; i >= 0; i--) if ((list[i].endpoint || list[i].fcm) === id) list.splice(i, 1); list.push(sub); while (list.length > 5) list.shift(); }

    /* ---- SMS: core decides who and what; the server process delivers (opts.sms(msg, done)) */
    function toIntl(n) {
      var raw = String(n || '').trim(), d = raw.replace(/\D/g, '');
      if (raw.charAt(0) === '+') { /* already international */ } else if (d.slice(0, 2) === '00') d = d.slice(2); else if (d.charAt(0) === '0') d = (db.settings.countryCode || '234') + d.slice(1);
      return d.length >= 9 && d.length <= 15 ? d : null;
    }
    /* ---- billing: prepaid wallets in kobo (100 kobo = 1 naira). A text that failed is never charged. Emergencies are never blocked for lack of funds. */
    var ESSENTIAL = { rollcall: 1, sos: 1, 'sos-contact': 1, esc1: 1, esc2: 1, drill: 1, 'parent-sos': 1 };
    function wallet(id) { var w = db.billing.wallets[id]; if (!w) w = db.billing.wallets[id] = { bal: 0, t: clock() }; return w; }
    function ledgerAdd(wid, type, svc, amt, ref, note, extra) {
      var w = wallet(wid); w.bal += amt;
      var e = { id: 'l' + rnd(5), t: clock(), w: wid, type: type, svc: svc || '', amt: amt, bal: w.bal, ref: ref || '', note: str(note, 80) };
      if (extra) Object.keys(extra).forEach(function (k) { e[k] = extra[k]; });
      db.billing.ledger.push(e); if (db.billing.ledger.length > 6000) db.billing.ledger.splice(0, db.billing.ledger.length - 6000); return e;
    }
    function creditWallet(wid, kobo, type, ref, note) {
      kobo = Math.round(kobo); if (!(kobo > 0) || kobo > 1e10) fail('bad-amount', 'Bad amount');
      if (ref) { if (db.billing.refs[ref]) return null; db.billing.refs[ref] = clock(); }
      var e = ledgerAdd(wid, type || 'credit', '', kobo, ref, note); save(); return e;
    }
    /* ---- Money: SafeGate Plus (students), SafeGate Family (parents), a school licence, and local sponsor ads.
       Rules that never change: safety is free (SOS, gate scan, reports, help requests, escorts), ads never appear on those screens, nobody's location or movement is used to pick or sell an ad, and sponsors only see totals. */
    function monetDefaults() {
      return {
        plans: { plus: { name: 'SafeGate Plus', on: true, month: 30000, term: 80000 }, family: { name: 'SafeGate Family', on: true, month: 150000, term: 400000, texts: 60 } },
        licence: { on: false, perStudent: 100000, students: 0, until: 0, school: '' },
        rate: [{ id: 'starter', name: 'Starter', price: 1000000, note: 'One Home-screen card for a month' }, { id: 'partner', name: 'Campus Partner', price: 3000000, note: 'Home-screen card, first in rotation, your name on a campus notice' }, { id: 'launch', name: 'Launch week', price: 500000, note: 'Seven days, one card' }]
      };
    }
    function dayKey(t) { return new Date(t).toISOString().slice(0, 10); }
    function subActive(id, plan) { var x = db.monet.subs[id]; return !!(x && x.plan === plan && x.until > clock()); }
    function licenceOn() { var l = db.monet.licence; return !!(l.on && l.until > clock()); }
    function studentEnt(matric) { if (subActive(matric, 'plus')) return { plan: 'plus', until: db.monet.subs[matric].until }; if (licenceOn()) return { plan: 'campus', until: db.monet.licence.until }; return null; }
    function familyFree(ph) {
      if (!subActive('g:' + ph, 'family')) return false;
      var k = ph + '|' + new Date(clock()).toISOString().slice(0, 7), T = db.monet.texts, cap = db.monet.plans.family.texts || 0;
      if ((T[k] || 0) >= cap) return false;
      if (Object.keys(T).length > 4000) T = db.monet.texts = {};
      T[k] = (T[k] || 0) + 1; return true;
    }
    function safeAdUrl(u) { u = String(u || '').trim().slice(0, 300); return /^https:\/\/[^\s"'<>]+$/i.test(u) || /^tel:\+?[0-9]{6,15}$/.test(u) ? u : ''; }
    function adLive(a, now) { return a.on !== false && (!a.from || a.from <= now) && (!a.until || a.until > now); }
    function freeMode() { return db.settings.freeForStudents !== false; }   // free for every student: no ads, no Plus, nothing to buy
    function adFor(st) {
      var m = db.monet, now = clock(); if (freeMode() || !m.adsOn || studentEnt(st.matric)) return null;
      var live = m.ads.filter(function (a) { return adLive(a, now); }); if (!live.length) return null;
      var dk = dayKey(now); live.sort(function (x, y) { return ((x.stats && x.stats[dk] && x.stats[dk].v) || 0) - ((y.stats && y.stats[dk] && y.stats[dk].v) || 0) || (y.priority || 0) - (x.priority || 0); });
      var a = live[0]; return { id: a.id, sponsor: a.sponsor, title: a.title, text: a.text, cta: a.cta, url: a.url };
    }
    function smsSegs(text) { var t = String(text); return /[^\x00-\x7F]/.test(t) ? (t.length <= 70 ? 1 : Math.ceil(t.length / 67)) : (t.length <= 160 ? 1 : Math.ceil(t.length / 153)); }
    function chargeSms(wid, text, essential, ref) {
      var b = db.billing; if (wid.indexOf('g:') === 0 && familyFree(wid.slice(2))) return { ok: true, family: true };
      if (!b.enabled) return { ok: true };
      var segs = smsSegs(text), pr = b.prices.sms, price = segs * pr.price, w = wallet(wid), floor = wid === 'school' ? -b.reserve : 0;
      if (w.bal - price < floor && !essential) return { ok: false, reason: 'nofunds' };
      var e = ledgerAdd(wid, 'debit', 'sms', -price, ref, 'Text message', { cost: segs * pr.cost, segs: segs, st: 'held' });
      if (wid === 'school' && w.bal < b.lowAt && clock() - (b.lowSent || 0) > 12 * HOUR) {
        b.lowSent = clock(); notify('staff', '', { title: 'SafeGate balance is low', body: 'Top up soon so text alerts keep going. Emergencies are never blocked.', tag: 'low-balance', url: '/desk' }, false);
      }
      return { ok: true, entry: e };
    }
    function settleCharge(e, ok) { if (!e || e.st !== 'held') return; if (ok) e.st = 'final'; else { e.st = 'refunded'; ledgerAdd(e.w, 'refund', e.svc, -e.amt, e.ref, 'Not delivered, not charged'); } }
    function maskPhone(n) { return '****' + String(n).slice(-4); }
    function hmOf(t) { return fmtLocal(t, db.settings.tzOffsetMin).slice(11); }
    function firstName(m) { var s = db.students[m]; return s ? (s.name || '').split(/\s+/)[0] : 'your student'; }
    function rollcallFor(m, now) {
      for (var i = db.rollcalls.length - 1; i >= 0; i--) { var r = db.rollcalls[i]; if (!r.closed && now <= r.exp && r.targets.indexOf(m) >= 0) { var a = r.replies[m]; return { id: r.id, title: r.title, text: r.text, t: r.t, exp: r.exp, answered: !!a, ok: a ? a.ok : null }; } }
      return null;
    }
    function rcSummary(r, now) {
      var sf = 0, hp = [], sl = [];
      r.targets.forEach(function (m) {
        var a = r.replies[m], st = db.students[m] || {};
        if (a && a.ok) sf++; else if (a) hp.push({ matric: m, name: st.name || m, phone: st.phone || '', note: a.note, t: a.t, lat: a.lat, lng: a.lng });
        else sl.push({ matric: m, name: st.name || m, phone: st.phone || '', lastSeen: st.lastSeen || 0, outside: !!statusOf(m).outside });
      });
      sl.sort(function (x, y) { return (y.outside - x.outside) || (y.lastSeen - x.lastSeen); });
      return { id: r.id, title: r.title, text: r.text, t: r.t, exp: r.exp, by: r.by, scope: r.scope, closed: !!r.closed, open: !r.closed && now <= r.exp, total: r.targets.length, safe: sf, helpN: hp.length, silentN: sl.length, help: hp, silent: sl.slice(0, 400) };
    }
    function parentUpdatesOn() { return !!db.settings.parentUpdates && !!db.settings.smsEnabled; }
    function tellParents(m, kind, text, evId) {
      if (!parentUpdatesOn()) return; var subs = db.subs[m]; if (!subs || !subs.length) return;
      var paidBy = db.settings.parentUpdatesPaidBy;
      subs.forEach(function (x) {
        if (!x.on[kind]) return;
        var ess = kind === 'sos', acct = paidBy === 'school' || ess ? 'school' : 'g:' + x.phone;
        var id = sendSms(x.phone, text, ess ? 'parent-sos' : 'parent', m, kind + ':' + evId + ':' + x.phone, acct);
        var rec = id && db.smsLog.filter(function (r) { return r.id === id; })[0];
        if (rec && rec.status === 'nofunds' && acct !== 'school') sendSms(x.phone, 'SafeGate: your text credit is finished, so updates about ' + firstName(m) + ' have paused. Add credit from your family link to continue. Emergency texts are still free.', 'parent-low', m, 'low:' + Math.floor(clock() / DAY) + ':' + x.phone, 'school');
      });
    }
    function parentBlock(m, link) {
      var b = db.billing, paid = db.settings.parentUpdatesPaidBy, pr0 = b.prices.sms.price || 1, subs = (db.subs[m] || []).filter(function (x) { return !link || x.link === link; });
      return { available: parentUpdatesOn(), paidBy: paid, metered: !!b.enabled && paid === 'parent', price: b.enabled && paid === 'parent' ? b.prices.sms.price : 0, currency: db.settings.currency || '₦', payOnline: !!opts.payEnabled, instructions: db.settings.payInstructions || '',
        subs: subs.map(function (x) { return { id: x.id, phone: maskPhone(x.phone), bal: b.enabled && paid === 'parent' ? wallet('g:' + x.phone).bal : null, texts: b.enabled && paid === 'parent' ? Math.floor(wallet('g:' + x.phone).bal / pr0) : null, on: x.on }; }), starter: db.settings.parentStarter || 0 };
    }
    function sendSms(to, text, kind, matric, dedupe, acct) {
      if (!opts.sms || !db.settings.smsEnabled) return null;
      var num = toIntl(to); if (!num) return null;
      var now = clock(), key = dedupe ? kind + '|' + num + '|' + dedupe : '';
      if (key && db.smsKeys[key]) return null;
      var used = db.smsLog.filter(function (x) { return now - x.t < 86400000 && x.status !== 'capped'; }).length;
      var rec = { id: 'm' + rnd(4), t: now, to: '***' + num.slice(-4), kind: kind, matric: matric || '', status: 'queued', err: '', preview: str(text, 50) };
      if (key) db.smsKeys[key] = now;
      if (used >= (db.settings.smsDailyCap || 150) && !ESSENTIAL[kind]) rec.status = 'capped';
      db.smsLog.push(rec); if (db.smsLog.length > 300) db.smsLog.splice(0, db.smsLog.length - 300);
      if (rec.status === 'capped') { save(); return rec.id; }
      var ch = chargeSms(acct || 'school', text, !!ESSENTIAL[kind], rec.id);
      if (!ch.ok) { rec.status = 'nofunds'; save(); return rec.id; }
      try { opts.sms({ id: rec.id, to: num, text: str(text, 300) }, function (res) { rec.status = res && res.ok ? 'sent' : 'failed'; rec.err = res && res.error ? String(res.error).slice(0, 100) : ''; settleCharge(ch.entry, !!(res && res.ok)); save(); }); }
      catch (e) { rec.status = 'failed'; rec.err = 'exception'; settleCharge(ch.entry, false); }
      save(); return rec.id;
    }
    function staffNumbers(mode) {                       // mode: 'oncall' | 'admins'
      var out = [], accs = Object.keys(db.staff && db.staff.accounts || {}).map(function (k) { return db.staff.accounts[k]; }).filter(function (a) { return a.active && a.phone; });
      var pick = mode === 'admins' ? accs.filter(function (a) { return a.role === 'admin'; }) : accs.filter(function (a) { return a.onCall; });
      if (mode !== 'admins' && !pick.length) pick = accs.filter(function (a) { return a.role !== 'guard'; });
      pick.forEach(function (a) { out.push(a.phone); });
      if (mode !== 'admins' && db.settings.securityPhone) out.push(db.settings.securityPhone);
      var seen = {}; return out.filter(function (n) { var i = toIntl(n); if (!i || seen[i]) return false; seen[i] = 1; return true; });
    }
    function smsStaff(mode, text, kind, matric, dedupe) { staffNumbers(mode).forEach(function (n) { sendSms(n, text, kind, matric, dedupe); }); }
    function mapsUrl(lat, lng) { return 'https://maps.google.com/?q=' + (+lat).toFixed(5) + ',' + (+lng).toFixed(5); }
    /* ---- personal ID-card code: SGC1.<matric>.<version>.<hmac>. Printed on cards; scanned by officers when a student has no working phone. */
    function lastEv(m) { var b = by.get(m); return b && b.events.length ? b.events[b.events.length - 1] : null; }
    function cardTok(m) { var body = 'SGC1.' + m + '.' + (db.cardVer[m] || 0); return body + '.' + hmacHex(db.settings.cardSecret, body).slice(0, 16); }
    function parseCard(tok) {
      var x = /^SGC1\.(.+)\.(\d{1,3})\.([0-9a-f]{16})$/i.exec(String(tok || '').trim()); if (!x) return null;
      if (hmacHex(db.settings.cardSecret, 'SGC1.' + x[1] + '.' + x[2]).slice(0, 16) !== x[3].toLowerCase()) return null;
      var m = normMatric(x[1]); return (db.cardVer[m] || 0) !== +x[2] ? { matric: m, revoked: true } : { matric: m };
    }
    function cardPerson(a) {
      var c = parseCard(a.card); if (!c) fail('bad-card', 'This is not a valid SafeGate ID code');
      if (c.revoked) fail('card-revoked', 'This card was replaced. Ask the student for the new card.');
      var s = db.students[c.matric], r = db.roster[c.matric]; if (!s && !r) fail('unknown-student', 'This student is not on the school list');
      return { matric: c.matric, s: s, r: r };
    }
    function studentCount() { if (db._n == null) db._n = Object.keys(db.students).length; return db._n; }
    function consentNote(m, what, on, by) { db.consentLog.push({ m: m, t: clock(), what: what, on: !!on, ver: db.settings.policyVersion, by: by }); if (db.consentLog.length > 30000) db.consentLog.splice(0, 3000); }
    function upsertStudent(p, deviceId, t0, transferCode) {
      if (!p || typeof p !== 'object') fail('bad-student');
      var matric = normMatric(p.matric), name = str(p.name, 80);
      if (name.length < 3) fail('bad-name', 'Enter your full name');
      var phone = str(p.phone, 24);
      var em = p.emergency || {};
      var rr = rosterCheckFor(matric, name); if (rr) fail(rr.code, rr.message);
      var s = db.students[matric];
      deviceId = str(deviceId, 64);
      if (!s) { if (studentCount() >= 100000) fail('full', 'This system is full. Contact the school.'); s = db.students[matric] = { matric: matric, registeredAt: t0 }; db._n = studentCount() + 1; }
      else if (s.deviceId && deviceId && s.deviceId !== deviceId && !s.unregistered) {
        if (db.settings.lockDevice !== false) {              // identity lock: this matric belongs to another phone
          var tc = db.transferCodes[matric], tr = db.transfers[matric], via = null;
          if (tc && tc.exp > t0 && transferCode && String(transferCode).replace(/\D/g, '') === tc.code) { via = 'code from the old phone'; delete db.transferCodes[matric]; }
          else if (tr && tr.status === 'approved' && tr.deviceId === deviceId) via = 'approved by ' + (tr.by || 'an officer');
          if (!via && tc && transferCode && ++tc.tries >= 5) delete db.transferCodes[matric];
          if (!via) {
            if (!tr || tr.deviceId !== deviceId || tr.status === 'denied' && t0 - tr.t > 10 * 60000) {
              db.transfers[matric] = { id: 'tr' + t0.toString(36), matric: matric, deviceId: deviceId, name: name, phone: phone, t: t0, status: 'pending' };
              audit('transfer_request', { target: matric, detail: 'A new phone asked to take over this matric number' });
              save();
            }
            var cur = db.transfers[matric];
            fail(cur.status === 'denied' ? 'device-denied' : 'device-locked', cur.status === 'denied' ? 'Security did not approve this phone. Visit the security post with your student ID.' : 'This matric number is already used on another phone. Ask for a transfer code on your old phone (Me → Move to a new phone), or wait for security to approve this phone.');
          }
          delete db.transfers[matric];
          audit('device_transfer', { target: matric, detail: 'Moved to a new phone: ' + via });
        }
        s.deviceChanged = true; s.deviceChangedAt = t0;
        s.prev = { name: s.name, phone: s.phone, emergency: s.emergency, at: t0 };
        audit('device_change', { target: matric, detail: 'Profile re-registered from a different device' });
      }
      s.name = name; s.phone = phone; s.residence = str(p.residence, 40);
      s.emergency = { name: str(em.name, 80), phone: str(em.phone, 24) };
      var rost = db.roster[matric]; if (rost) { if (!s.emergency.phone && rost.guardianPhone) s.emergency = { name: rost.guardianName || 'Guardian', phone: rost.guardianPhone }; if (!s.residence && rost.hostel) s.residence = rost.hostel; }
      var wasLoc = s.consentLoc; if ('minor' in p) s.minor = !!p.minor;
      s.consentLoc = !!p.consentLoc && !(s.minor && !s.guardianOk);   // under 18: location stays off until a parent or guardian has agreed
      if (!!wasLoc !== s.consentLoc) consentNote(matric, 'location', s.consentLoc, 'student');
      s.deviceId = str(deviceId, 64); s.updatedAt = t0; s.unregistered = false;
      if (s.deviceId) { var dm0 = db.deviceMap[s.deviceId] || (db.deviceMap[s.deviceId] = []); if (dm0.indexOf(matric) < 0) { dm0.push(matric); if (dm0.length > 1 && dm0.length <= 6) dm0.forEach(function (mm) { integ(mm, 'shared', 'One phone is registered for ' + dm0.length + ' matric numbers', t0); }); } }
      return s;
    }
    function prevInOut(matric, t) {
      var b = by.get(matric), last = null;
      if (!b) return null;
      for (var i = 0; i < b.events.length; i++) { var e = b.events[i]; if (e.t >= t) break; if (e.type === 'out' || e.type === 'in') last = e; }
      return last;
    }
    function statusOf(matric) {
      var b = by.get(matric), ev, i, last;
      if (!b) return { outside: false, lastEventT: 0 };
      ev = b.events;
      for (i = ev.length - 1; i >= 0; i--) if (ev[i].type === 'out' || ev[i].type === 'in') break;
      if (i < 0) return { outside: false, lastEventT: 0 };
      last = ev[i];
      if (last.type === 'in') return { outside: false, lastEventT: last.t };
      var ret = last.expectedReturn || null;
      for (var k = i + 1; k < ev.length; k++) if (ev[k].type === 'extend' && ev[k].expectedReturn) ret = ev[k].expectedReturn;
      return { outside: true, since: last.t, out: last, expectedReturn: ret, lastEventT: last.t };
    }
    function lastPing(matric, sinceT) {
      var b = by.get(matric);
      if (!b || !b.pings.length) return null;
      var p = b.pings[b.pings.length - 1];
      return p.t >= (sinceT || 0) ? p : null;
    }

    // ---- ingest
    function normT(t, t0) {
      if (!isNum(t)) fail('bad-time');
      if (t > t0 + 5 * MIN) return { t: t0, ahead: true };
      if (t < t0 - 30 * DAY) fail('too-old');
      return { t: Math.floor(t), ahead: false };
    }
    /* Integrity watch: counts of things that look like cheating or faking. They are CLUES for a human to review, never automatic punishment: a flat battery or a bad GPS fix can look suspicious too. */
    var INTEG_W = { jump: 30, shared: 25, far: 12, noloc: 4, quicksos: 8, perfect: 10, oldloc: 6, oldposter: 3 };
    function integ(matric, kind, detail, t) {
      var isNew = !db.integrity[matric], r = db.integrity[matric] || (db.integrity[matric] = { n: {}, last: [] });
      r.n[kind] = (r.n[kind] || 0) + 1; r.at = t; r.last.push({ kind: kind, t: t, detail: str(detail, 120) }); if (r.last.length > 6) r.last.shift();
      db._ni = (db._ni == null ? Object.keys(db.integrity).length : db._ni + (isNew ? 1 : 0));
      if (db._ni > 20000) { db._ni = null; var ks = Object.keys(db.integrity).sort(function (a, b) { return (db.integrity[a].at || 0) - (db.integrity[b].at || 0); }); for (var q = 0; q < 2000; q++) delete db.integrity[ks[q]]; }
    }
    function scanChecks(st, base, flags, t) {
      if (base.source !== 'qr' || db.settings.gatePolicy === 'open') return;
      if (flags.indexOf('away-from-gate') >= 0) integ(st.matric, 'far', 'Gate scan made ' + (base.gateDist != null ? base.gateDist + ' m' : 'far') + ' from campus: a photographed or relayed QR code?', t);
      else if (base.gateDist == null) { flags.push('scan-no-location'); integ(st.matric, 'noloc', 'Gate scan without any location', t); }
      if (flags.indexOf('old-location') >= 0) integ(st.matric, 'oldloc', 'The location sent with the scan was taken minutes earlier', t);
      if (flags.indexOf('old-poster') >= 0) integ(st.matric, 'oldposter', 'Scanned a retired poster', t);
    }
    function gateDistance(it, flags) {                 // was the scan made at the gate? (catches photographed / relayed QR codes)
      var pol = db.settings.gatePolicy; if (pol === 'open') { var oc = db.settings.gatePoint.lat != null ? db.settings.gatePoint : db.settings.campus; return isNum(it.lat) && isNum(it.lng) && oc.lat != null ? Math.round(haversine(it.lat, it.lng, oc.lat, oc.lng)) : null; }   // Relaxed: record the distance, never mark anyone
      var gp = db.settings.gatePoint, c = db.settings.campus, tight = gp && gp.lat != null, ctr = tight ? gp : c;
      if (ctr.lat == null || !isNum(it.lat) || !isNum(it.lng) || Math.abs(it.lat) > 90 || Math.abs(it.lng) > 180) return null;
      var d = haversine(it.lat, it.lng, ctr.lat, ctr.lng), acc = isNum(it.acc) ? Math.max(0, Math.min(it.acc, 500)) : 0;
      // a precise gate point is judged tightly (radius + the phone's own stated error, capped); a rough campus circle keeps its generous margin
      if (d > ctr.radiusM + (tight ? Math.min(acc, pol === 'strict' ? 40 : 100) + (pol === 'strict' ? 10 : 20) : acc + 150)) flags.push('away-from-gate');
      if (acc > 250) flags.push('vague-location');
      if (isNum(it.locAt) && isNum(it.t) && it.t - it.locAt > 150000 && it.t - it.locAt < 7 * DAY) flags.push('old-location');   // the position was taken long before the scan
      return Math.round(d);
    }
    /* Silent duress: the student entered their duress code. To anyone watching the phone it looks like a normal cancel. Staff get a quiet, urgent alert; parents are NOT texted (a call could endanger the student). */
    function duressRaise(st, id, t, t0, existing) {
      var lp = lastPing(st.matric, t - 6 * HOUR), so = existing && existing.status === 'open' ? existing : null;
      if (!so) { so = { id: 'dz_' + id, matric: st.matric, t: t, receivedAt: t0, lat: lp ? lp.lat : null, lng: lp ? lp.lng : null, acc: lp ? lp.acc : null, battery: lp ? lp.battery : null, message: '', status: 'open' }; db.sos.push(so); }
      so.duress = true; so.message = 'SILENT DURESS: the student entered their duress code';
      notify('staff', '', { title: '🆘 SILENT DURESS: ' + (st.name || st.matric), body: 'Do not call or message the student openly. Last known location is on the alert.', tag: 'sos-' + so.id, url: '/desk', urgent: true, require: true }, true);
      smsStaff('oncall', 'SILENT DURESS: ' + (st.name || st.matric) + ' ' + (st.phone || '') + '. Do not call openly.' + (so.lat != null ? ' ' + mapsUrl(so.lat, so.lng) : ''), 'sos', st.matric, 'dz:' + id);
      audit('duress', { target: st.matric, detail: 'Silent duress code used' });
    }
    function applyItem(st, it, t0) {
      var nt = normT(it.t, t0), t = nt.t, flags = nt.ahead ? ['clock-ahead'] : [];
      var base = { id: it.id, type: it.type, matric: st.matric, name: st.name, t: t, receivedAt: t0, flags: flags };
      var g, prev, d;
      switch (it.type) {
        case 'out':
          g = verifyGate(it.gate, t); prev = prevInOut(st.matric, t);
          if (prev && prev.type === 'out') flags.push('already-out');
          if (g.status !== 'verified' && g.status !== 'static') flags.push('gate-' + g.status); if (g.old) flags.push('old-poster');
          d = it.destination || {};
          var rp = d.placeId ? placeById(str(d.placeId, 40)) : null; if (rp && rp.danger) flags.push('risky-destination');
          base.destination = { placeId: str(d.placeId, 40), name: str(d.name, 80), text: str(d.text, 120) };
          if (!base.destination.name && !base.destination.text) fail('no-destination');
          if (!base.destination.placeId && vagueDest(base.destination.text || base.destination.name)) flags.push('vague-destination');
          base.meet = str(it.meet, 100);
          base.purpose = str(it.purpose, 40); base.companions = str(it.companions, 100); base.note = str(it.note, 160);
          base.expectedReturn = isNum(it.expectedReturn) && it.expectedReturn > t && it.expectedReturn < t + 3 * DAY ? Math.floor(it.expectedReturn) : null;
          base.consentLoc = !!it.consentLoc; base.battery = isNum(it.battery) ? Math.max(0, Math.min(100, Math.round(it.battery))) : null;
          base.source = it.source === 'no-scan' || !it.gate ? 'no-scan' : 'qr'; base.gate = g.status;
          base.gateDist = gateDistance(it, flags); scanChecks(st, base, flags, t);
          addEvent(base);
          if (Math.abs(t0 - t) < 30 * 60000) tellParents(st.matric, 'out', 'SafeGate: ' + st.name + ' left campus at ' + hmOf(t) + ' for ' + (base.destination.name || base.destination.text) + (base.expectedReturn ? ', due back about ' + hmOf(base.expectedReturn) : '') + '.', it.id);
          break;
        case 'in':
          g = verifyGate(it.gate, t); prev = prevInOut(st.matric, t);
          if (!prev || prev.type === 'in') flags.push('no-exit-scan');
          if (g.status !== 'verified' && g.status !== 'static') flags.push('gate-' + g.status); if (g.old) flags.push('old-poster');
          base.source = it.source === 'no-scan' || !it.gate ? 'no-scan' : 'qr'; base.gate = g.status; base.note = str(it.note, 160);
          base.gateDist = gateDistance(it, flags); scanChecks(st, base, flags, t);
          addEvent(base);
          if (Math.abs(t0 - t) < 30 * 60000 && flags.indexOf('away-from-gate') < 0) tellParents(st.matric, 'in', 'SafeGate: ' + st.name + ' is back on campus (' + hmOf(t) + ').', it.id);
          break;
        case 'ping':
          if (st.minor && !st.guardianOk) break;   // nothing is stored about a minor's movements without a parent's or guardian's agreement
          if (!isNum(it.lat) || !isNum(it.lng) || Math.abs(it.lat) > 90 || Math.abs(it.lng) > 180) fail('bad-location');
          var p = { id: it.id, matric: st.matric, t: t, receivedAt: t0, lat: it.lat, lng: it.lng,
            acc: isNum(it.acc) ? Math.min(100000, Math.max(0, Math.round(it.acc))) : null,
            battery: isNum(it.battery) ? Math.max(0, Math.min(100, Math.round(it.battery))) : null, charging: !!it.charging };
          db.pings.push(p); bucket(st.matric).pings.push(p); ids.add(p.id);
          var pb = bucket(st.matric).pings, n = pb.length;
          if (n > 1 && pb[n - 2].t > p.t) pb.sort(function (a, c) { return a.t - c.t; });
          zoneWatch(st, p, t0);
          if (n > 1) { var pv = pb[n - 2], dtp = (p.t - pv.t) / 1000, dm = haversine(pv.lat, pv.lng, p.lat, p.lng); if (dtp >= 20 && dtp < 3600 && dm > 1500 && dm / dtp > 36 && (p.acc == null || p.acc < 200)) integ(st.matric, 'jump', Math.round(dm / 1000 * 10) / 10 + ' km in ' + Math.round(dtp) + ' s (' + Math.round(dm / dtp * 3.6) + ' km/h)', t0); }
          if (n >= 8 && pb.slice(n - 8).every(function (z) { return z.acc === 0 || (z.acc === 1 && z.lat === pb[n - 1].lat); })) integ(st.matric, 'perfect', 'Many identical, impossibly exact GPS readings: a fake-location app?', t0);
          break;
        case 'sos':
          var hasLoc = isNum(it.lat) && isNum(it.lng) && Math.abs(it.lat) <= 90 && Math.abs(it.lng) <= 180;
          /* A frightened student may press the button again and again. One open alert per student per 10 minutes: repeat presses add their position to it and do NOT send security, parents and family a second round of texts (which would cost money and bury the real alert). */
          var dupSos = null; for (var si = db.sos.length - 1; si >= 0 && si > db.sos.length - 400; si--) { var so0 = db.sos[si]; if (so0.matric === st.matric && so0.status === 'open' && !so0.duress && t0 - so0.receivedAt < 10 * MIN) { dupSos = so0; break; } }
          if (dupSos) {
            if (hasLoc) { dupSos.lat = it.lat; dupSos.lng = it.lng; dupSos.acc = isNum(it.acc) ? Math.round(it.acc) : dupSos.acc; }
            dupSos.repeats = (dupSos.repeats || 0) + 1; dupSos.sameAs = dupSos.sameAs || {}; dupSos.sameAs[it.id] = 1;
            base.note = 'Pressed again (alert already open)'; addEvent(base);
            break;
          }
          db.sos.push({ id: it.id, matric: st.matric, t: t, receivedAt: t0, lat: hasLoc ? it.lat : null, lng: hasLoc ? it.lng : null,
            acc: isNum(it.acc) ? Math.round(it.acc) : null, battery: isNum(it.battery) ? Math.round(it.battery) : null,
            message: str(it.message, 160), kind: ['danger', 'medical', 'followed', 'accident', 'other'].indexOf(it.kind) >= 0 ? it.kind : 'danger', status: 'open' });
          base.note = (it.kind && it.kind !== 'danger' ? '[' + it.kind + '] ' : '') + str(it.message, 160); addEvent(base);
          notify('staff', '', { title: '🆘 EMERGENCY: ' + (st.name || st.matric), body: (st.phone || '') + (hasLoc ? ' · live location available' : ' · no location yet'), tag: 'sos-' + it.id, url: '/desk', urgent: true, require: true }, true);
          tellParents(st.matric, 'sos', 'SafeGate EMERGENCY: ' + st.name + ' pressed the emergency button at ' + hmOf(t) + '. Security has been alerted and is responding.', it.id);
          var sl = hasLoc ? ' ' + mapsUrl(it.lat, it.lng) : '', stz = db.settings.tzOffsetMin;
          smsStaff('oncall', 'SOS: ' + (st.name || st.matric) + ' ' + (st.phone || '') + sl, 'sos', st.matric, 'sos:' + it.id);
          if (db.settings.smsContactOnSos !== false && st.emergency && st.emergency.phone) sendSms(st.emergency.phone, (st.name || 'Your student') + ' pressed the emergency button on SafeGate. Security has been alerted.' + sl + ' Call ' + (st.name || 'them') + ': ' + (st.phone || ''), 'sos-contact', st.matric, 'sos:' + it.id);
          break;
        case 'hazard': {
          if (!HAZARD_KINDS[it.kind] || !isNum(it.lat) || !isNum(it.lng) || Math.abs(it.lat) > 90 || Math.abs(it.lng) > 180) fail('bad-hazard');
          var dayAgo = t - 24 * HOUR, mine = db.hazards.filter(function (h) { return (h.reporters || []).indexOf(st.matric) >= 0 && h.t > dayAgo; }).length;
          if (mine >= 6) break;
          var near = db.hazards.filter(function (h) { return h.kind === it.kind && h.until > t && haversine(h.lat, h.lng, it.lat, it.lng) <= 120; })[0];
          if (near) { if ((near.reporters || []).indexOf(st.matric) < 0) { near.reporters.push(st.matric); if (near.reporters.length >= 2 && !near.verified) { near.verified = true; near.by = 'two students'; } near.until = Math.max(near.until, t + 12 * HOUR); } break; }
          if (db.hazards.length >= 500) db.hazards = db.hazards.filter(function (h) { return h.until > t; }).slice(-400);
          db.hazards.push({ id: 'hz-' + it.id, kind: it.kind, lat: it.lat, lng: it.lng, radiusM: 50, note: str(it.note, 120), t: t, until: t + 12 * HOUR, verified: false, by: '', reporters: [st.matric] });
          break;
        }
        case 'place_idea': {
          var pn = str(it.name, 60); if (pn.length < 3 || !isNum(it.lat) || !isNum(it.lng) || Math.abs(it.lat) > 90 || Math.abs(it.lng) > 180) fail('bad-place');
          var pk = ['hostel','lecture','library','food','market','worship','sports','transport','other'].indexOf(it.kind) >= 0 ? it.kind : 'other', nrm = function (x) { return String(x).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); };
          if (db.places.some(function (x) { return x.lat != null && nrm(x.name) === nrm(pn) && haversine(x.lat, x.lng, it.lat, it.lng) <= 150; })) break;
          var pday = t - 24 * HOUR; if (db.placeIdeas.filter(function (x) { return x.by.indexOf(st.matric) === 0 && x.t > pday; }).length >= 5) break;
          var pi = db.placeIdeas.filter(function (x) { return nrm(x.name) === nrm(pn) && haversine(x.lat, x.lng, it.lat, it.lng) <= 150; })[0];
          if (pi) {
            if (pi.by.indexOf(st.matric) < 0) { pi.by.push(st.matric); pi.lat = (pi.lat * (pi.by.length - 1) + it.lat) / pi.by.length; pi.lng = (pi.lng * (pi.by.length - 1) + it.lng) / pi.by.length; }
            if (pi.by.length >= 2) { addCommunityPlace(pi, 'two students'); }
          } else {
            if (db.placeIdeas.length >= 300) db.placeIdeas = db.placeIdeas.slice(-200);
            db.placeIdeas.push({ id: 'pi-' + it.id, name: pn, kind: pk, lat: it.lat, lng: it.lng, note: str(it.note, 160), t: t, by: [st.matric] });
          }
          break;
        }
        case 'sos_update':
          var su = db.sos.filter(function (x) { return (x.id === it.sosId || (x.sameAs && x.sameAs[it.sosId])) && x.matric === st.matric && x.status === 'open'; })[0];
          if (su) { if (['danger', 'medical', 'followed', 'accident', 'other'].indexOf(it.kind) >= 0) su.kind = it.kind; if (str(it.message, 160)) su.message = str(it.message, 160); base.note = 'Emergency update: ' + (su.kind || '') + (str(it.message, 160) ? ', ' + str(it.message, 160) : ''); addEvent(base); }
          break;
        case 'sos_cancel':
          var so = db.sos.filter(function (s) { return (s.id === it.sosId || (s.sameAs && s.sameAs[it.sosId])) && s.matric === st.matric; })[0];
          if (it.duress) { duressRaise(st, it.id, t, t0, so); base.note = 'Student cancelled alert'; addEvent(base); break; }
          if (so && so.status === 'open' && t0 - so.receivedAt < 45000) integ(st.matric, 'quicksos', 'Emergency cancelled within 45 s', t0);
          if (so && so.status === 'open') { so.status = 'cancelled'; so.closedAt = t0; so.closedBy = 'student'; }
          base.note = 'Student cancelled alert'; addEvent(base); break;
        case 'rollcall_reply':
          var rc = db.rollcalls.filter(function (r) { return r.id === it.rid; })[0];
          if (!rc || rc.closed || t0 > rc.exp || rc.targets.indexOf(st.matric) < 0) fail('rollcall-closed');
          var rhasLoc = isNum(it.lat) && isNum(it.lng) && Math.abs(it.lat) <= 90 && Math.abs(it.lng) <= 180;
          rc.replies[st.matric] = { t: t0, ok: it.ok !== false, note: str(it.note, 100), lat: rhasLoc ? it.lat : null, lng: rhasLoc ? it.lng : null };
          base.note = it.ok === false ? 'Roll call: needs help' : 'Roll call: safe'; addEvent(base);
          if (it.ok === false) applyItem(st, { id: 'rcs_' + it.id, type: 'sos', t: it.t, lat: rhasLoc ? it.lat : null, lng: rhasLoc ? it.lng : null, message: 'Roll call: needs help. ' + str(it.note, 100) }, t0);
          break;
        case 'medical':
          var mv = it.medical && typeof it.medical === 'object' ? it.medical : null;
          if (mv && (mv.blood || mv.allergies || mv.conditions || mv.meds || mv.note)) { st.medical = { blood: str(mv.blood, 10), allergies: str(mv.allergies, 160), conditions: str(mv.conditions, 160), meds: str(mv.meds, 160), note: str(mv.note, 160) }; st.medicalShare = it.share !== false; }
          else { delete st.medical; delete st.medicalShare; }
          base.note = st.medical ? 'Emergency health card saved' : 'Emergency health card removed'; addEvent(base); break;
        case 'checkin': base.note = str(it.note, 80) || 'Safe'; addEvent(base); break;
        case 'extend':
          if (!isNum(it.expectedReturn) || it.expectedReturn <= t) fail('bad-return');
          base.expectedReturn = Math.floor(it.expectedReturn); addEvent(base); break;
        case 'walk_start':
          if (!isNum(it.until) || it.until <= t || it.until > t + 3 * HOUR) fail('bad-walk');
          base.until = Math.floor(it.until); base.note = str(it.note, 80);
          if (it.dest && isNum(it.dest.lat) && isNum(it.dest.lng) && Math.abs(it.dest.lat) <= 90 && Math.abs(it.dest.lng) <= 180) base.dest = { name: str(it.dest.name, 60), lat: it.dest.lat, lng: it.dest.lng };
          addEvent(base); break;
        case 'walk_end': base.note = 'Arrived safely'; addEvent(base); if (it.duress) duressRaise(st, it.id, t, t0, null); break;
        case 'reply':
          var ak = db.asks[st.matric];
          if (ak && ak.id === it.askId && ak.status === 'pending') { ak.status = 'answered'; ak.answeredAt = t0; ak.ok = it.ok !== false; }
          base.note = it.ok === false ? 'Replied to security: needs help' : 'Replied to security: OK'; addEvent(base); break;
        case 'pass_request':
          if (!isNum(it.until) || it.until <= t || it.until > t + 14 * DAY) fail('bad-pass');
          var pendingN = 0; Object.keys(db.passes).forEach(function (k) { if (db.passes[k].matric === st.matric && db.passes[k].status === 'pending') pendingN++; });
          if (pendingN >= 3) fail('too-many-passes');
          if (str(it.reason, 160).length < 3) fail('no-reason');
          db.passes[it.id] = { id: it.id, matric: st.matric, name: st.name, t: t, from: isNum(it.from) && it.from < it.until ? Math.floor(it.from) : t, until: Math.floor(it.until),
            dest: str(it.destination, 80), reason: str(it.reason, 160), status: 'pending' };
          base.note = 'Requested an exit pass'; addEvent(base); break;
        case 'report':
          var cat = ['followed', 'suspicious', 'unsafe', 'theft', 'medical', 'bullying', 'harassment', 'threat', 'violence', 'sexual', 'abuse', 'drugs', 'discrimination', 'misconduct', 'other'].indexOf(it.cat) >= 0 ? it.cat : 'other', anon = !!it.anonymous, rl = isNum(it.lat) && isNum(it.lng) && Math.abs(it.lat) <= 90 && Math.abs(it.lng) <= 180;
          if (str(it.text, 500).length < 3) fail('no-text');
          var rtxt = str(it.text, 500), tri = triage(cat, rtxt), rlat = rl ? it.lat : null, rlng = rl ? it.lng : null, dup = null;
          db.reports.forEach(function (x) { if (!dup && x.cat === cat && Math.abs(x.t - t) < HOUR && x.lat != null && rlat != null && haversine(x.lat, x.lng, rlat, rlng) < 200) dup = x.id; });
          var ev = typeof it.evidence === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(it.evidence) && it.evidence.length <= 300000 ? it.evidence : null;
          var rep = { id: it.id, ref: refOf(it.id), receivedAt: t0, matric: anon ? '' : st.matric, name: anon ? 'Anonymous' : st.name, phone: anon ? '' : st.phone, cat: cat, text: rtxt, t: t, status: 'open', notes: [],
            lat: anon ? (rlat == null ? null : Math.round(rlat * 500) / 500) : rlat, lng: anon ? (rlng == null ? null : Math.round(rlng * 500) / 500) : rlng, urgency: tri.level, score: tri.score, tags: tri.tags, dupOf: dup, evidence: ev, anon: anon, anonKey: anon ? sha256Hex(String(it.id) + ':' + String(it.anonKey || '')) : '' };
          db.reports.push(rep);
          ids.add(it.id);
          if (!anon) { base.note = 'Reported a concern: ' + cat; addEvent(base); }
          break;
        case 'escort_request':
          var open = Object.keys(db.escorts).filter(function (k) { return db.escorts[k].matric === st.matric && (db.escorts[k].status === 'open' || db.escorts[k].status === 'assigned'); });
          if (open.length) fail('escort-active');
          var el2 = isNum(it.lat) && isNum(it.lng) && Math.abs(it.lat) <= 90 && Math.abs(it.lng) <= 180;
          if (str(it.to, 80).length < 2) fail('no-destination');
          db.escorts[it.id] = { id: it.id, matric: st.matric, name: st.name, phone: st.phone, t: t, from: str(it.from, 80), to: str(it.to, 80), note: str(it.note, 120), lat: el2 ? it.lat : null, lng: el2 ? it.lng : null, status: 'open' };
          base.note = 'Asked for a security escort'; addEvent(base);
          notify('staff', '', { title: '🚶 Escort requested: ' + (st.name || st.matric), body: 'To ' + str(it.to, 80), tag: 'esc-' + it.id, url: '/desk', urgent: true }, true); break;
        case 'escort_cancel':
          var ec = db.escorts[it.escortId];
          if (ec && ec.matric === st.matric && (ec.status === 'open' || ec.status === 'assigned')) { ec.status = 'cancelled'; ec.doneAt = t0; }
          base.note = 'Cancelled escort request'; addEvent(base); break;
        case 'consent':
          if (isNum(it.version)) { db.consents[st.matric] = { version: Math.floor(it.version), t: t0 }; consentNote(st.matric, 'notice v' + Math.floor(it.version), true, 'student'); }
          base.note = 'Read the privacy notice'; addEvent(base); break;
        case 'notice_ack':
          var nn = db.notices.filter(function (x) { return x.id === it.noticeId; })[0];
          if (nn) { nn.acks = nn.acks || {}; if (!nn.acks[st.matric]) nn.acks[st.matric] = t0; }
          ids.add(it.id); break;
        default: fail('bad-type');
      }
    }

    function accessLogFor(matric) {
      var out = [];
      for (var i = db.audit.length - 1; i >= 0 && out.length < 20; i--) {
        var a = db.audit[i];
        if (a.target === matric && (a.action === 'trail_access' || a.action === 'view_profile')) out.push({ t: a.t, officer: a.officer, action: a.action, reason: a.reason });
      }
      return out;
    }
    function purge(now) {
      if (now - db.lastPurge < 6 * 3600 * 1000) return;
      db.lastPurge = now;
      var s = db.settings, pc = now - s.retentionDaysPings * DAY, ec = now - s.retentionDaysEvents * DAY;
      var np = db.pings.length, ne = db.events.length;
      db.pings = db.pings.filter(function (p) { return p.t >= pc; });
      db.events = db.events.filter(function (e) { return e.t >= ec; });
      db.sos = db.sos.filter(function (x) { return x.t >= ec; });
      var keepFrom = now - 2 * 365 * DAY, ai = 0;
      while (ai < db.audit.length && db.audit[ai].t < keepFrom) ai++;
      if (ai > 0) { if (db.audit[ai - 1].h) db.auditAnchor = db.audit[ai - 1].h; db.audit = db.audit.slice(ai); }
      Object.keys(db.asks).forEach(function (k) { if (db.asks[k].status !== 'pending' && db.asks[k].t < now - 7 * DAY) delete db.asks[k]; });
      Object.keys(db.grants).forEach(function (k) { if (db.grants[k].until < now) delete db.grants[k]; });
      Object.keys(db.passes).forEach(function (k) { if (db.passes[k].until < now - 90 * DAY) delete db.passes[k]; });
      Object.keys(db.guardians).forEach(function (k) { if (db.guardians[k].exp < now) delete db.guardians[k]; });
      Object.keys(db.escorts).forEach(function (k) { if (db.escorts[k].t < ec) delete db.escorts[k]; });
      db.visitors = db.visitors.filter(function (v) { return v.inT >= ec; });
      db.cases = db.cases.filter(function (c) { return c.status === 'open' || c.openedAt >= ec; });
      db.notices = db.notices.filter(function (n) { return n.exp > now - 30 * DAY; });
      db.reports = db.reports.filter(function (r) { return r.status !== 'closed' || r.t >= ec; });
      if (np !== db.pings.length || ne !== db.events.length) rebuild();
    }

    function publicConfig() {
      var s = db.settings;
      return { serverTime: clock(), schoolName: s.schoolName, securityPhone: s.securityPhone, gateId: s.gateId, tzOffsetMin: s.tzOffsetMin,
        trackFrom: s.trackFrom, trackUntil: s.trackUntil, curfew: s.curfew, pingIntervalSec: s.pingIntervalSec,
        mediaOn: s.mediaOn !== false, campus: s.campus, places: db.places, mapTiles: s.mapTiles, routeUrl: s.routeUrl, searchUrl: s.searchUrl, hazards: activeHazards(false), safePoints: db.safePoints, riskZones: db.riskZones.map(function (z) { return { id: z.id, name: z.name, lat: z.lat, lng: z.lng, radiusM: z.radiusM, reason: z.reason, from: z.from, until: z.until }; }), directory: s.directory || [], policyText: s.policyText, policyVersion: s.policyVersion, escortEnabled: true, pushKey: opts.pushKey || '' };
    }

    /* ------------------------------------------------------------- alerts */
    function placeById(id) { for (var i = 0; i < db.places.length; i++) if (db.places[i].id === id) return db.places[i]; return null; }
    function passCovering(m, o, now) {                  // newest approved exit pass that covers this trip
      var best = null;
      Object.keys(db.passes).forEach(function (k) { var x = db.passes[k]; if (x.matric === m && x.status === 'approved' && x.from <= now && x.until >= o.t && (!best || x.until > best.until)) best = x; });
      return best;
    }
    function normMatricSoft(m) { try { return normMatric(m); } catch (e) { return ''; } }
    function nearCampus(p) { var c = db.settings.campus; return c.lat != null && haversine(p.lat, p.lng, c.lat, c.lng) <= c.radiusM + Math.min(p.acc || 0, 300); }
    function computeAlerts(now) {
      var s = db.settings, out = [], tz = s.tzOffsetMin;
      var cf = parseHM(s.curfew), tu = parseHM(s.trackUntil);
      function add(a) { var r = db.resolutions[a.key]; if (r) a.ack = r; var c = db.claims[a.key]; if (c) a.claim = c; out.push(a); }
      function who(m, st) { return { matric: m, name: st.name, phone: st.phone, emergency: st.emergency }; }
      function locOf(p) { return p ? { lat: p.lat, lng: p.lng, acc: p.acc, t: p.t } : null; }
      db.drills.forEach(function (d) {
        if (db.resolutions['drill:' + d.id] || now - d.t > 2 * HOUR) return;
        add({ key: 'drill:' + d.id, type: 'drill', level: 'critical', matric: '', name: 'DRILL', phone: '', since: d.t, text: 'PRACTICE EMERGENCY. No real student is in danger. Press "I am responding", then close it, to record your response time.' });
      });
      db.sos.forEach(function (x) {
        if (x.status !== 'open') return;
        var st = db.students[x.matric] || {}, lp = lastPing(x.matric, x.t), sloc = x.lat == null ? null : { lat: x.lat, lng: x.lng, acc: x.acc, t: x.t };
        if (lp && (!sloc || lp.t >= sloc.t)) sloc = locOf(lp);
        add({ key: 'sos:' + x.id, type: 'sos', level: 'critical', matric: x.matric, name: st.name || x.matric, phone: st.phone || '',
          emergency: st.emergency || null, since: x.t, text: x.duress ? 'The student entered their duress code, so they may be under threat. Do NOT call or message them openly. Move quietly and carefully.' : (x.message || 'SOS pressed'), duress: !!x.duress, mediaN: x.mediaN || 0, medical: st.medicalShare && st.medical ? st.medical : null, loc: sloc, battery: lp && lp.battery != null ? lp.battery : x.battery });
      });
      Object.keys(db.students).forEach(function (m) {
        var st = db.students[m], b = by.get(m), base = who(m, st), i, n;
        if (b) {                                                        // safe-walk dead-man timer: fires even if the phone has died
          var ev = b.events, w = null;
          for (i = ev.length - 1, n = 0; i >= 0 && n < 60; i--, n++) { if (ev[i].type === 'walk_end') break; if (ev[i].type === 'walk_start') { w = ev[i]; break; } }
          if (w && now > w.until + s.walkGraceMin * MIN) {
            var wp = lastPing(m, w.t - 5 * MIN);
            add(Object.assign({ key: 'walk:' + w.id, type: 'walk', level: 'critical', since: w.until, loc: locOf(wp), battery: wp ? wp.battery : null,
              text: 'Safe-walk timer ran out ' + Math.round((now - w.until) / MIN) + ' min ago and the student has not confirmed arrival.' + (w.note ? ' (' + w.note + ')' : '') }, base));
          }
        }
        var ak = db.asks[m];
        if (ak && ak.status === 'pending' && now > ak.t + s.askWaitMin * MIN) {
          var waited = now - ak.t;
          add(Object.assign({ key: 'noreply:' + ak.id, type: 'noreply', level: waited > 3 * s.askWaitMin * MIN ? 'critical' : 'warning', since: ak.t,
            text: 'Asked to check in ' + Math.round(waited / MIN) + ' min ago by ' + ak.by + '. No reply yet.' }, base));
        }
        var stat = statusOf(m);
        if (!stat.outside) return;
        var o = stat.out, grace = s.graceMin * MIN, lp = lastPing(m, o.t), pass = passCovering(m, o, now), er = Math.max(stat.expectedReturn || 0, pass ? pass.until : 0) || null;
        if (er && now > er + grace) {
          var late = now - er;
          add(Object.assign({ key: 'overdue:' + o.id, type: 'overdue', level: late > 120 * MIN ? 'critical' : 'warning', since: er,
            text: (pass ? 'Exit pass expired. ' : '') + 'Not back ' + Math.round(late / MIN) + ' min after expected return' + (lp && now - lp.t < 30 * MIN && nearCampus(lp) ? ' (last location was on campus: maybe forgot to scan in)' : '') + (o.meet ? '. Was meeting: ' + o.meet : '') + (o.companions ? '. Went with: ' + o.companions : '') }, base));
        }
        if (cf != null && tu != null && !(pass && pass.until >= now) && inWindow(localMinutes(now, tz), cf, tu)) {
          add(Object.assign({ key: 'curfew:' + o.id, type: 'curfew', level: 'warning', since: now, text: 'Outside campus after curfew (' + s.curfew + ')' }, base));
        }
        if (o.consentLoc && trackExpected(now, s)) {
          var ws = windowStart(now, s), ref = Math.max(st.lastSeen || 0, o.receivedAt || 0, ws);
          if (now - ref > s.silenceMin * MIN) {
            add(Object.assign({ key: 'silent:' + o.id + ':' + ws, type: 'silent', level: 'warning', since: ref,
              text: 'No data received for ' + Math.round((now - ref) / MIN) + ' min (phone may be offline, off or out of battery)' }, base));
          }
        }
        if (lp && now - lp.t <= 20 * MIN && lp.battery != null && lp.battery <= s.lowBattery && !lp.charging) {
          add(Object.assign({ key: 'battery:' + o.id, type: 'battery', level: 'warning', since: lp.t, text: 'Battery at ' + lp.battery + '%. The phone may switch off soon; last location is saved.' }, base));
        }
        if (lp && now - lp.t <= 20 * MIN) {
          db.places.forEach(function (zp) {
            if (zp.danger && zp.lat != null && haversine(lp.lat, lp.lng, zp.lat, zp.lng) <= zp.radiusM)
              add(Object.assign({ key: 'danger:' + o.id + ':' + zp.id, type: 'danger', level: 'warning', since: lp.t, loc: locOf(lp), text: 'Last location is inside the flagged area "' + zp.name + '".' + (zp.tip ? ' ' + zp.tip : '') }, base));
          });
        }
        if (lp && now - lp.t <= 90 * MIN && now - o.t >= 30 * MIN && o.destination && o.destination.placeId) {
          var pl = placeById(o.destination.placeId);
          if (pl && pl.lat != null && !nearCampus(lp)) {
            var dd = haversine(lp.lat, lp.lng, pl.lat, pl.lng);
            if (dd > pl.radiusM + s.mismatchM) {
              add(Object.assign({ key: 'mismatch:' + o.id, type: 'mismatch', level: 'warning', since: lp.t, loc: locOf(lp),
                text: 'Last seen about ' + (dd / 1000).toFixed(1) + ' km from ' + pl.name + ', the place the student said they were going.' }, base));
            }
          }
        }
      });
      Object.keys(db.escorts).forEach(function (k) {
        var e = db.escorts[k]; if (e.status !== 'open') return;
        var waited = now - e.t, est = db.students[e.matric] || {};
        add({ key: 'escort:' + e.id, type: 'escort', level: waited > s.escortWaitMin * MIN ? 'critical' : 'warning', matric: e.matric, name: e.name, phone: e.phone, emergency: est.emergency || null, since: e.t,
          text: 'Wants an escort from ' + (e.from || 'where they are') + ' to ' + e.to + '. Waiting ' + Math.round(waited / MIN) + ' min.' + (e.note ? ' ' + e.note : ''), loc: e.lat == null ? null : { lat: e.lat, lng: e.lng, t: e.t }, escortId: e.id });
      });
      db.cases.forEach(function (c) {
        if (c.status !== 'open') return;
        var cs = db.students[c.matric] || {}, stc = statusOf(c.matric), lpc = lastPing(c.matric, 0), back = !stc.outside && stc.lastEventT > c.openedAt;
        add({ key: 'case:' + c.id, type: 'case', level: 'critical', matric: c.matric, name: c.name, phone: cs.phone, emergency: cs.emergency || null, since: c.openedAt, loc: locOf(lpc), caseId: c.id,
          text: back ? 'Student scanned back in at ' + fmtLocal(stc.lastEventT, tz).slice(11) + '. Confirm they are safe, then close the case.' : 'Missing person case open for ' + Math.round((now - c.openedAt) / HOUR * 10) / 10 + ' h. ' + c.reason });
      });
      db.visitors.forEach(function (v) {
        if (v.outT || now - v.inT <= s.visitorMaxHours * HOUR) return;
        add({ key: 'visitor:' + v.id, type: 'visitor', level: 'warning', matric: '', name: v.name, phone: v.phone, since: v.inT + s.visitorMaxHours * HOUR,
          text: 'Visitor has been inside ' + Math.round((now - v.inT) / HOUR) + ' h (limit ' + s.visitorMaxHours + ' h)' + (v.host ? '. Visiting ' + v.host : '') + (v.badge ? '. Badge ' + v.badge : '') + '.' });
      });
      db.reports.forEach(function (r) {
        if (r.status !== 'open') return;
        add({ key: 'report:' + r.id, type: 'report', level: r.cat === 'followed' || r.cat === 'unsafe' || r.cat === 'medical' || r.urgency === 'critical' || r.urgency === 'high' ? 'critical' : 'warning', matric: r.matric, name: r.name, phone: r.phone, emergency: r.matric && db.students[r.matric] ? db.students[r.matric].emergency : null,
          since: r.t, text: REPORT_LABEL[r.cat] + ': ' + r.text + (r.tags && r.tags.length ? ' [' + r.tags.join(', ') + ']' : ''), loc: r.lat == null ? null : { lat: r.lat, lng: r.lng, t: r.t }, reportId: r.id });
      });
      out.forEach(function (a) { if (a.level === 'critical' && !a.claim && !a.ack && now - a.since > s.escalateMin * MIN) a.escalated = true; });
      /* Concern score: a transparent aid for deciding who to look for first. Every point is explained. It never looks at gender, religion, tribe or home area. */
      /* What is normal for THIS student: median trip length and how often they go out at night, from their own last completed trips. Needs at least 4 trips; says nothing until then. */
      var normCache = {};
      function studentNorm(m) {
        if (normCache[m] !== undefined) return normCache[m]; var b = by.get(m), r = null;
        if (b) {
          var durs = [], night = 0, open = null;
          b.events.forEach(function (e) {
            if (e.type === 'out') open = e;
            else if (e.type === 'in' && open) { var d = e.t - open.t; if (d > 5 * MIN && d < 48 * HOUR) { durs.push(d); var lm0 = localMinutes(open.t, db.settings.tzOffsetMin); if (lm0 >= 18 * 60 + 30 || lm0 < 5 * 60 + 30) night++; } open = null; }
          });
          if (durs.length >= 4) { var recent = durs.slice(-12), nn = recent.length, srt = recent.slice().sort(function (x, y) { return x - y; }); r = { n: durs.length, med: srt[Math.floor(srt.length / 2)], night: night / durs.length }; }
        }
        return (normCache[m] = r);
      }
      function hrsTxt(ms) { var h = ms / HOUR; return h < 1 ? Math.round(ms / MIN) + ' min' : (Math.round(h * 10) / 10) + ' h'; }
      var dangerBy = {}; out.forEach(function (a) { if (a.type === 'danger' && a.matric) dangerBy[a.matric] = 1; });
      out.forEach(function (a) {
        if (a.type === 'drill' || a.type === 'visitor') return;
        var sc = 0, why = [], m = a.matric, stz = db.settings.tzOffsetMin;
        function pt(p, w) { sc += p; why.push((p > 0 ? '+' : '') + p + ' ' + w); }
        if (a.type === 'sos') { pt(a.duress ? 100 : 90, a.duress ? 'Silent duress code used' : 'Emergency button pressed'); }
        else if (a.type === 'case') { pt(85, 'Missing-person case is open'); }
        else if (a.type === 'report') { pt(a.level === 'critical' ? 65 : 35, 'Safety report: ' + (a.text || '').split(':')[0]); }
        else {
          var base = { overdue: 20, silent: 15, noreply: 20, curfew: 10, battery: 10, danger: 20, mismatch: 5, escort: 25, walk: 25 }[a.type]; pt(base == null ? 10 : base, 'Alert: ' + a.type);
          if (a.type === 'overdue') { var lm = Math.round((now - a.since) / MIN); if (lm >= 30) pt(Math.min(30, Math.round(lm / 4)), 'Late by ' + lm + ' min'); }
          var stt = m ? statusOf(m) : null, oe = stt && stt.outside ? stt.out : null, lp2 = oe ? lastPing(m, oe.t) : null, lmn = localMinutes(now, stz);
          if (oe) {
            if (lmn >= 18 * 60 + 30 || lmn < 5 * 60 + 30) pt(15, 'After dark');
            if ((oe.flags || []).indexOf('vague-destination') >= 0) pt(10, 'Vague destination');
            var nm = studentNorm(m);
            if (nm) {
              var dur = now - oe.t, darkStart = localMinutes(oe.t, stz) >= 18 * 60 + 30 || localMinutes(oe.t, stz) < 5 * 60 + 30;
              if (dur > 2.5 * nm.med && dur > 3 * HOUR) pt(15, 'Much longer than their usual trips (usually about ' + hrsTxt(nm.med) + ', now ' + hrsTxt(dur) + ')');
              if (darkStart && nm.n >= 5 && nm.night < 0.1) pt(10, 'Does not normally go out at night');
            }
            if (oe.meet) pt(-5, 'Gave a person they were meeting'); if (oe.companions) pt(-5, 'Went with someone');
            if (oe.consentLoc && lp2 && now - lp2.t > 60 * MIN) pt(12, 'No location for ' + Math.round((now - lp2.t) / MIN) + ' min');
            if (lp2 && lp2.battery != null && lp2.battery <= s.lowBattery && !lp2.charging && now - lp2.t < 3 * HOUR) pt(10, 'Battery was ' + lp2.battery + '%, phone may be off');
            if (lp2 && now - lp2.t < 30 * MIN && nearCampus(lp2)) pt(-25, 'Last location was on campus, probably forgot to scan in');
          }
          if (m && dangerBy[m] && a.type !== 'danger') pt(15, 'Last location is in a flagged area');
          if (m && db.cases.some(function (c) { return c.matric === m && c.status === 'open'; }) && a.type !== 'case') pt(20, 'A missing-person case is already open');
        }
        sc = Math.max(0, Math.min(100, sc)); a.risk = { score: sc, band: sc >= 70 ? 'High' : sc >= 40 ? 'Medium' : 'Lower', why: why };
      });
      out.sort(function (a, b) { return (a.level === 'critical' ? 0 : 1) - (b.level === 'critical' ? 0 : 1) || ((b.risk ? b.risk.score : 0) - (a.risk ? a.risk.score : 0)) || a.since - b.since; });
      return out;
    }

    /* Hazards students can trust: staff-confirmed, or reported by two different students close together. They expire. */
    function addCommunityPlace(pi, by) {
        var id = (pi.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'place') + '-' + rnd(2);
        db.places.push({ id: id, name: pi.name, area: '', tip: pi.note || '', lat: pi.lat, lng: pi.lng, radiusM: 150, danger: false, kind: pi.kind, community: true, by: by });
        db.placeIdeas = db.placeIdeas.filter(function (x) { return x.id !== pi.id; });
      }
      function activeHazards(all) {
      var now = clock();
      return (db.hazards || []).filter(function (h) { return h.until > now && (all || h.verified); }).map(function (h) {
        return { id: h.id, kind: h.kind, label: HAZARD_KINDS[h.kind], lat: h.lat, lng: h.lng, radiusM: h.radiusM, note: h.note, until: h.until, verified: !!h.verified, t: h.t, by: all ? h.by : undefined, n: all ? (h.reporters || []).length : undefined };
      });
    }
    /* Entering a marked risk area while out is written once per area and trip. It is a quiet note on the student's record, not an alarm. */
    function zoneActiveNow(z, t) { var m = localMinutes(t, db.settings.tzOffsetMin); return !z.from || !z.until || inWindow(m, parseHM(z.from), parseHM(z.until)); }
    function zoneWatch(st, p, t0) {
      if (!db.riskZones.length || !statusOf(st.matric).outside) return;
      var hits = st.zoneHits = st.zoneHits || {}, o = statusOf(st.matric).out, since = o ? o.t : 0;
      db.riskZones.forEach(function (z) {
        if (!zoneActiveNow(z, p.t) || haversine(p.lat, p.lng, z.lat, z.lng) > z.radiusM) return;
        if (hits[z.id] && hits[z.id] >= since) return;
        hits[z.id] = p.t; addEvent({ id: 'zone-' + p.id, type: 'zone', matric: st.matric, name: st.name, t: p.t, receivedAt: t0, flags: [], note: 'Entered risk area: ' + z.name + (z.reason ? ' (' + z.reason + ')' : '') });
      });
    }
    var REPORT_LABEL = { followed: 'Being followed', suspicious: 'Suspicious person or activity', unsafe: 'Unsafe situation', theft: 'Theft or robbery', medical: 'Medical help needed', bullying: 'Bullying', harassment: 'Harassment', threat: 'Threat', violence: 'Violence', sexual: 'Sexual harassment or assault', abuse: 'Abuse', drugs: 'Drug-related concern', discrimination: 'Discrimination', misconduct: 'Staff misconduct', other: 'Concern' };
    function eventView(e) {
      return { id: e.id, type: e.type, matric: e.matric, name: e.name, t: e.t, source: e.source || '', gate: e.gate || '',
        destination: e.destination ? (e.destination.name || e.destination.text) : '', purpose: e.purpose || '',
        expectedReturn: e.expectedReturn || null, flags: e.flags || [], note: e.note || '', companions: e.companions || '', meet: e.meet || '' };
    }

    /* called by the server every ~30 s: push new serious alerts to staff, and overdue nudges to students */
    function tick() {
      var now = clock(), al = computeAlerts(now);
      /* A kind heads-up 15 minutes before the return time, so a student who needs longer can say so instead of triggering an overdue alert. */
      by.forEach(function (b, mm) {
        var stt = statusOf(mm); if (!stt.outside || !stt.out || !stt.expectedReturn) return;
        var left = stt.expectedReturn - now, pk = 'pre:' + stt.out.id + ':' + stt.expectedReturn;
        if (left > 0 && left <= 15 * MIN && !db.pushed[pk]) { db.pushed[pk] = now; notify('student', mm, { title: 'Due back at ' + hmOf(stt.expectedReturn), body: 'Need more time? Open SafeGate and tap Extend so nobody worries.', tag: 'pre-due', url: '/' }, false); }
      });
      al.forEach(function (x) {
        if (db.pushed[x.key]) return;
        var serious = x.level === 'critical' || x.type === 'overdue' || x.type === 'case';
        if (!serious || x.type === 'sos') { if (x.type === 'sos') db.pushed[x.key] = now; return; }
        db.pushed[x.key] = now;
        notify('staff', '', { title: '⚠ ' + (x.name || 'Student') + ': ' + x.type, body: x.text || '', tag: x.key, url: '/desk', urgent: x.level === 'critical' }, x.level === 'critical');
        if (x.type === 'overdue' && x.matric) notify('student', x.matric, { title: 'You are past your return time', body: 'Scan back in at the gate, or open SafeGate and extend your time.', tag: 'od-' + x.key, url: '/', urgent: true }, true);
      });
      /* escalation ladder: unclaimed critical alert -> level 1 text to on-call officers; still unclaimed after twice the wait -> text every administrator */
      var esc = db.settings.escalateMin * 60000, ovh = db.settings.smsContactOverdueHours;
      al.forEach(function (x) {
        if (x.escalated && !db.pushed['e1:' + x.key]) {
          db.pushed['e1:' + x.key] = now; var mins = Math.round((now - x.since) / 60000);
          notify('staff', '', { title: '⏰ UNANSWERED ' + mins + ' min: ' + (x.name || x.type), body: 'Nobody has taken this alert. Open the desk now.', tag: 'esc-' + x.key, url: '/desk', urgent: true, require: true }, true);
          smsStaff('oncall', 'UNANSWERED ' + mins + ' min: ' + x.type + ' - ' + (x.name || '') + ' ' + (x.phone || '') + '. Open the SafeGate desk.', 'esc1', x.matric || '', x.key);
        }
        if (x.escalated && !x.claim && !x.ack && now - x.since > 2 * esc && !db.pushed['e2:' + x.key]) {
          db.pushed['e2:' + x.key] = now;
          smsStaff('admins', 'STILL UNANSWERED: ' + x.type + ' - ' + (x.name || '') + ' ' + (x.phone || '') + '. On-call officers have not responded.', 'esc2', x.matric || '', x.key);
        }
        if (x.type === 'overdue' && x.matric && !db.pushed['po:' + x.key]) { db.pushed['po:' + x.key] = now; tellParents(x.matric, 'overdue', 'SafeGate: ' + (db.students[x.matric] ? db.students[x.matric].name : 'Your student') + ' has not come back to campus yet. Security is checking. Call ' + (db.settings.securityPhone || 'the school security') + ' if you know where they are.', x.key); }
        if (x.type === 'overdue' && ovh > 0 && x.matric && now - x.since > ovh * 3600000 && !db.pushed['oc:' + x.key]) {
          var st = db.students[x.matric];
          db.pushed['oc:' + x.key] = now;
          if (st && st.emergency && st.emergency.phone) sendSms(st.emergency.phone, (st.name || 'Your student') + ' has not come back to campus yet and security is checking. If you know where they are, please call security' + (db.settings.securityPhone ? ' on ' + db.settings.securityPhone : '') + '.', 'overdue-contact', x.matric, x.key);
        }
      });
      Object.keys(db.pushed).forEach(function (k) { if (now - db.pushed[k] > 2 * 86400000) delete db.pushed[k]; });
      Object.keys(db.students).forEach(function (m) {
        var stt = statusOf(m); if (!stt.outside || !stt.out) return; var er2 = stt.expectedReturn;
        if (er2 && er2 > now && er2 - now <= 15 * MIN && !db.pushed['due:' + stt.out.id]) { db.pushed['due:' + stt.out.id] = now;
          notify('student', m, { title: 'Due back in about ' + Math.max(1, Math.round((er2 - now) / MIN)) + ' minutes', body: 'Running late? Open SafeGate and tap "Need more time" so security does not worry.', tag: 'due-soon', url: '/' }, false); }
      });
      db.rollcalls.forEach(function (rc) {
        if (rc.closed || now > rc.exp || !rc.sms || rc.smsDone || now - rc.t < 5 * MIN || !db.settings.smsEnabled) return; rc.smsDone = true;
        rc.targets.forEach(function (m) { var s2 = db.students[m]; if (!rc.replies[m] && s2 && s2.phone) sendSms(s2.phone, 'SafeGate: ' + rc.title + '. Please open SafeGate and tap I am safe, or reply SAFE to this number.', 'rollcall', m, 'rc:' + rc.id + ':' + m, 'school'); });
      });
      Object.keys(db.billing.pending).forEach(function (r) { if (now - db.billing.pending[r].t > 3 * DAY) delete db.billing.pending[r]; });
      db.billing.ledger.forEach(function (e) { if (e.st === 'held' && now - e.t > 15 * MIN) settleCharge(e, false); });
      Object.keys(db.smsKeys).forEach(function (k) { if (now - db.smsKeys[k] > 2 * 86400000) delete db.smsKeys[k]; });
      return al.length;
    }
    /* -------------------------------------------------------------- methods */
    var methods = {
      health: function () { return { ok: true, time: clock() }; },
      config: function () { return publicConfig(); },

      ingest: function (a) {
        var t0 = clock(), st = upsertStudent(a.student, a.deviceId, t0, a.transferCode);
        var items = Array.isArray(a.items) ? a.items.slice(0, 200) : [], acked = [], rejected = [];
        items.forEach(function (it) {
          if (!it || typeof it.id !== 'string' || it.id.length > 64 || !it.id) return;
          if (ids.has(it.id)) { acked.push(it.id); return; }
          try { applyItem(st, it, t0); acked.push(it.id); }
          catch (e) { if (e instanceof SGError) rejected.push({ id: it.id, reason: e.code }); else throw e; }
        });
        st.lastSeen = t0; purge(t0); save();
        var stat = statusOf(st.matric), o = stat.out;
        var mySos = null;
        for (var si = db.sos.length - 1; si >= 0; si--) if (db.sos[si].matric === st.matric) { mySos = { id: db.sos[si].id, ids: [db.sos[si].id].concat(Object.keys(db.sos[si].sameAs || {})), status: db.sos[si].duress ? 'cancelled' : db.sos[si].status, stage: db.sos[si].duress ? 'received' : sosStages(db.sos[si]).stage, steps: db.sos[si].duress ? [] : sosStages(db.sos[si]).steps }; break; }
        var pk = db.asks[st.matric], myAsk = pk && pk.status === 'pending' ? { id: pk.id, text: pk.text, by: pk.by, t: pk.t } : null;
        var myPasses = Object.keys(db.passes).map(function (k) { return db.passes[k]; }).filter(function (x) { return x.matric === st.matric; }).sort(function (x, y) { return y.t - x.t; }).slice(0, 8)
          .map(function (x) { return { id: x.id, status: x.status, from: x.from, until: x.until, dest: x.dest, reason: x.reason, note: x.decisionNote || '', by: x.by || '' }; });
        var myNotices = db.notices.filter(function (n) { return n.exp > t0; }).sort(function (x, y) { return y.t - x.t; }).slice(0, 5)
          .map(function (n) { return { id: n.id, title: n.title, text: n.text, level: n.level, t: n.t, by: n.by, acked: !!(n.acks && n.acks[st.matric]) }; });
        var myEscort = Object.keys(db.escorts).map(function (k) { return db.escorts[k]; }).filter(function (x) { return x.matric === st.matric; }).sort(function (x, y) { return y.t - x.t; })[0];
        myEscort = myEscort && (myEscort.status === 'open' || myEscort.status === 'assigned' || t0 - (myEscort.doneAt || myEscort.t) < 2 * HOUR) ? { id: myEscort.id, status: myEscort.status, by: myEscort.by || '', from: myEscort.from, to: myEscort.to, t: myEscort.t, note: myEscort.doneNote || '' } : null;
        var myReports = db.reports.filter(function (r) { return r.matric === st.matric; }).sort(function (x, y) { return y.t - x.t; }).slice(0, 5).map(function (r) { var ln = r.notes.length ? r.notes[r.notes.length - 1] : null; var sg = reportStages(r); return { id: r.id, ref: r.ref, label: REPORT_LABEL[r.cat], status: r.status, t: r.t, outcome: ln ? ln.text : '', stage: sg.stage, steps: sg.steps }; });
        var myVisitors = db.visitors.filter(function (v) { return !v.outT && v.hostMatric === st.matric; }).map(function (v) { return { name: v.name, t: v.inT }; });
        var glinks = Object.keys(db.guardians).filter(function (k) { return db.guardians[k].matric === st.matric; }).length;
        return { serverTime: t0, acked: acked, rejected: rejected, config: publicConfig(), access: accessLogFor(st.matric), sos: mySos, ask: myAsk,
          passes: myPasses, notices: myNotices, guardianLinks: glinks,
          rollcall: rollcallFor(st.matric, t0), escort: myEscort, consent: db.consents[st.matric] || null, needConsent: !(db.consents[st.matric] && db.consents[st.matric].version >= db.settings.policyVersion),
          myReports: myReports, visitorsForMe: myVisitors, free: freeMode(), monet: { ent: studentEnt(st.matric), ad: adFor(st) },
          status: { outside: stat.outside, since: stat.since || null, lastEventT: stat.lastEventT, eventId: o ? o.id : null,
            destination: o ? o.destination : null, expectedReturn: stat.expectedReturn || null, source: o ? o.source : null } };
      },

      staffStatus: function () { return { configured: !!(db.staff && db.staff.accounts && Object.keys(db.staff.accounts).length), schoolName: db.settings.schoolName }; },
      setupStaff: function (a) {
        if (db.staff && db.staff.accounts && Object.keys(db.staff.accounts).length) fail('already-setup', 'This system is already set up');
        var pin = checkPin(a.pin), officer = officerName(a.officer);
        db.staff = { accounts: {} }; db.staff.accounts[officer.toLowerCase()] = mkAccount(officer, pin, 'admin');
        if (a.schoolName) db.settings.schoolName = str(a.schoolName, 80) || db.settings.schoolName;
        if (isNum(a.tzOffsetMin) && Math.abs(a.tzOffsetMin) <= 840) db.settings.tzOffsetMin = Math.round(a.tzOffsetMin);
        audit('setup', { officer: officer }); save();
        return { token: newSession(db.staff.accounts[officer.toLowerCase()]), officer: officer, role: 'admin' };
      },
      login: function (a) {
        var now = clock();
        if (!db.staff || !db.staff.accounts) fail('not-setup', 'Set up the security desk first');
        var name = officerName(a.officer), ac = acctOf(name), pin = String(a.pin || '');
        if (!ac || !ac.active) { hashPin(pin, '00000000000000000000000000000000'); audit('login_failed', { officer: name, detail: 'unknown or disabled account' }); save(); fail('bad-login', 'Wrong name or PIN'); }
        if (ac.until > now) fail('locked', 'Too many wrong attempts for this account. Try again in ' + Math.ceil((ac.until - now) / 1000) + ' seconds.');
        if (hashPin(pin, ac.salt) !== ac.hash) {
          ac.fails = (ac.fails || 0) + 1;
          if (ac.fails >= 5) { ac.until = now + 5 * MIN; ac.fails = 0; audit('lockout', { officer: ac.name }); }
          audit('login_failed', { officer: ac.name }); save();
          fail('bad-login', 'Wrong name or PIN');
        }
        ac.fails = 0; ac.lastLogin = now; audit('login', { officer: ac.name }); save();
        return { token: newSession(ac), officer: ac.name, role: ac.role };
      },
      logout: function (a) { delete db.sessions[sha256Hex(String(a.token || ''))]; save(); return { ok: true }; },
      changePin: function (a) {
        var s = auth(a.token), ac = acctOf(s.officer);
        if (hashPin(String(a.oldPin || ''), ac.salt) !== ac.hash) fail('bad-pin', 'Current PIN is wrong');
        var np = checkPin(a.newPin); ac.salt = rnd(16); ac.hash = hashPin(np, ac.salt);
        killSessions(ac.name); audit('change_pin', { officer: s.officer }); save();
        return { ok: true };
      },
      whoami: function (a) { var s = auth(a.token); return { officer: s.officer, role: s.role }; },
      listStaff: function (a) {
        adminOnly(a.token);
        return Object.keys(db.staff.accounts).map(function (k) { var x = db.staff.accounts[k]; return { name: x.name, role: x.role, active: x.active, created: x.created, lastLogin: x.lastLogin || null, phone: x.phone || '', onCall: !!x.onCall }; })
          .sort(function (p, q) { return p.name.localeCompare(q.name); });
      },
      addStaff: function (a) {
        var s = adminOnly(a.token), name = officerName(a.name), pin = checkPin(a.pin), role = a.role === 'admin' ? 'admin' : a.role === 'guard' ? 'guard' : 'officer';
        if (acctOf(name)) fail('exists', 'There is already an officer with that name');
        db.staff.accounts[name.toLowerCase()] = mkAccount(name, pin, role);
        audit('add_staff', { officer: s.officer, target: name, detail: role }); save();
        return { ok: true };
      },
      resetStaffPin: function (a) {
        var s = adminOnly(a.token), ac = acctOf(a.name); if (!ac) fail('not-found', 'No such officer');
        var pin = checkPin(a.pin); ac.salt = rnd(16); ac.hash = hashPin(pin, ac.salt); ac.fails = 0; ac.until = 0; killSessions(ac.name);
        audit('reset_pin', { officer: s.officer, target: ac.name }); save();
        return { ok: true };
      },
      setStaffActive: function (a) {
        var s = adminOnly(a.token), ac = acctOf(a.name); if (!ac) fail('not-found', 'No such officer');
        var on = !!a.active;
        if (!on && ac.name.toLowerCase() === s.officer.toLowerCase()) fail('self', 'You cannot disable your own account');
        if (!on && ac.role === 'admin' && activeAdmins().length <= 1) fail('last-admin', 'There must be at least one active administrator');
        ac.active = on; if (!on) killSessions(ac.name);
        audit(on ? 'enable_staff' : 'disable_staff', { officer: s.officer, target: ac.name }); save();
        return { ok: true };
      },

      board: function (a) {
        var sess = auth(a.token), now = clock(), cfg = db.settings;
        purge(now);
        var alerts = computeAlerts(now), outside = [], regs = 0, W = { case: 95, sos: 100, walk: 90, escort: 25, report: 50, danger: 45, noreply: 40, overdue: 40, mismatch: 35, silent: 30, battery: 20, curfew: 15 };
        Object.keys(db.students).forEach(function (m) {
          var st = db.students[m]; if (!st.unregistered) regs++;
          var stat = statusOf(m);
          if (!stat.outside) return;
          var o = stat.out, mine = alerts.filter(function (x) { return x.matric === m && !x.ack; }), risk = 0, lp = lastPing(m, o.t), where = null, f = o.flags || [];
          mine.forEach(function (x) { risk += (W[x.type] || 10) + (x.level === 'critical' ? 20 : 0); });
          if (f.indexOf('gate-invalid') >= 0 || f.indexOf('gate-stale') >= 0) risk += 15;
          if (f.indexOf('away-from-gate') >= 0) risk += 12;
          if (o.source === 'no-scan') risk += 8;
          if (st.deviceChanged) risk += 10;
          if (lp && now - lp.t <= 30 * MIN) {                                        // coarse category only; exact position stays hidden
            var pl = o.destination && o.destination.placeId ? placeById(o.destination.placeId) : null;
            if (nearCampus(lp)) where = 'campus';
            else if (pl && pl.lat != null) where = haversine(lp.lat, lp.lng, pl.lat, pl.lng) <= pl.radiusM + 300 ? 'destination' : 'elsewhere';
            else where = 'elsewhere';
          }
          var pk = db.asks[m];
          outside.push({ matric: m, name: st.name, phone: st.phone, residence: st.residence, destination: o.destination.name || o.destination.text,
            since: stat.since, expectedReturn: stat.expectedReturn, overdue: !!(stat.expectedReturn && now > stat.expectedReturn + cfg.graceMin * MIN),
            tracking: !!o.consentLoc, source: o.source, gate: o.gate, flags: f, lastSeen: st.lastSeen || null, alert: mine.length > 0, deviceChanged: !!st.deviceChanged,
            pass: (function () { var ps = passCovering(m, o, now); return ps ? { until: ps.until, dest: ps.dest } : null; })(),
            risk: risk, riskLevel: risk >= 60 ? 'high' : risk >= 25 ? 'medium' : 'low', where: where, battery: lp && now - lp.t <= 30 * MIN ? lp.battery : null,
            ask: pk && pk.status === 'pending' ? { t: pk.t, by: pk.by } : null });
        });
        outside.sort(function (x, y) { return y.risk - x.risk || x.since - y.since; });
        var recent = db.events.slice(-300).sort(function (x, y) { return y.t - x.t; }).slice(0, 40).map(eventView);
        var active = alerts.filter(function (x) { return !x.ack; });
        var asks = Object.keys(db.asks).filter(function (k) { return db.asks[k].status === 'pending'; }).length;
        return { serverTime: now, tz: cfg.tzOffsetMin, officer: sess.officer, role: sess.role, schoolName: cfg.schoolName,
          counts: { outside: outside.length, registered: regs, alerts: active.length, asks: asks, transfers: Object.keys(db.transfers).filter(function (k) { return db.transfers[k].status === 'pending'; }).length,
            sos: active.filter(function (x) { return x.type === 'sos'; }).length,
            unclaimedSos: active.filter(function (x) { return x.type === 'sos' && !x.claim; }).length,
            walk: active.filter(function (x) { return x.type === 'walk'; }).length,
            escalated: active.filter(function (x) { return x.escalated; }).length,
            passes: Object.keys(db.passes).filter(function (k) { return db.passes[k].status === 'pending'; }).length,
            reports: db.reports.filter(function (r) { return r.status === 'open'; }).length,
            cases: db.cases.filter(function (c) { return c.status === 'open'; }).length,
            escorts: Object.keys(db.escorts).filter(function (k) { return db.escorts[k].status === 'open'; }).length,
            visitorsIn: db.visitors.filter(function (v) { return !v.outT; }).length },
          alerts: alerts, outside: outside, recent: recent };
      },

      students: function (a) {
        auth(a.token);
        var q = str(a.q, 40).toLowerCase(), out = [];
        Object.keys(db.students).forEach(function (m) {
          var s = db.students[m];
          if (q && m.toLowerCase().indexOf(q) < 0 && (s.name || '').toLowerCase().indexOf(q) < 0) return;
          out.push({ matric: m, name: s.name, phone: s.phone, residence: s.residence, outside: statusOf(m).outside, unregistered: !!s.unregistered, deviceChanged: !!s.deviceChanged });
        });
        out.sort(function (x, y) { return (x.name || '').localeCompare(y.name || ''); });
        return out.slice(0, 100);
      },

      studentDetail: function (a) {
        var sess = auth(a.token), m = normMatric(a.matric), s = db.students[m];
        if (!s) fail('not-found', 'Student not found');
        audit('view_profile', { officer: sess.officer, target: m }); save();
        var b = by.get(m), stat = statusOf(m), now = clock(), g = db.grants[m + '|' + sess.officer];
        return { matric: m, name: s.name, phone: s.phone, residence: s.residence, emergency: s.emergency, consentLoc: !!s.consentLoc,
          roster: db.roster[m] ? { level: db.roster[m].level, hostel: db.roster[m].hostel, guardianName: db.roster[m].guardianName, guardianPhone: db.roster[m].guardianPhone } : null, onRoster: !!db.roster[m], openCase: db.cases.filter(function (c) { return c.matric === m && c.status === 'open'; }).map(function (c) { return c.id; })[0] || null,
          registeredAt: s.registeredAt, lastSeen: s.lastSeen || null, deviceChanged: !!s.deviceChanged, unregistered: !!s.unregistered,
          status: { outside: stat.outside, since: stat.since || null, expectedReturn: stat.expectedReturn || null },
          events: b ? b.events.slice(-30).reverse().map(eventView) : [], grantUntil: g && g.until > now ? g.until : null,
          ask: db.asks[m] ? { text: db.asks[m].text, by: db.asks[m].by, t: db.asks[m].t, status: db.asks[m].status } : null };
      },

      /* Everything the police or family will ask for first, on one printable page. Location points are included only while the officer has an active, reasoned grant. */
      traceSheet: function (a) {
        var sess = auth(a.token), m = normMatric(a.matric), s = db.students[m]; if (!s) fail('not-found', 'Student not found');
        var now = clock(), g = db.grants[m + '|' + sess.officer], b = by.get(m), stat = statusOf(m), ro = db.roster[m];
        audit('trace_sheet', { officer: sess.officer, target: m, detail: 'Printed trace sheet' }); save();
        var lastIn = b ? b.events.filter(function (e) { return e.type === 'in'; }).pop() : null, outEv = stat.outside && stat.out ? stat.out : null;
        return { generatedAt: now, by: sess.officer, school: db.settings.schoolName, securityPhone: db.settings.securityPhone || '',
          student: { matric: m, name: s.name, phone: s.phone, residence: s.residence, level: ro ? ro.level : '', hostel: ro ? ro.hostel : '', emergency: s.emergency || null, guardian: ro ? { name: ro.guardianName, phone: ro.guardianPhone } : null },
          status: { outside: stat.outside, since: stat.since || null, expectedReturn: stat.expectedReturn || null, lastSeenApp: s.lastSeen || null, lastCampusScan: lastIn ? lastIn.t : null },
          trip: outEv ? { left: outEv.t, destination: outEv.destination ? (outEv.destination.name || outEv.destination.text) : '', purpose: outEv.purpose || '', companions: outEv.companions || '', meet: outEv.meet || '', vague: (outEv.flags || []).indexOf('vague-destination') >= 0, battery: outEv.battery } : null,
          recent: b ? b.events.slice(-8).reverse().map(eventView) : [],
          locations: g && g.until > now && b ? b.pings.filter(function (p) { return p.t >= now - 24 * HOUR; }).slice(-12).reverse().map(function (p) { return { t: p.t, lat: p.lat, lng: p.lng, acc: p.acc, battery: p.battery }; }) : null };
      },
      requestTrail: function (a) {
        var sess = auth(a.token), m = normMatric(a.matric), reason = str(a.reason, 120);
        if (reason.length < 3) fail('reason', 'Choose or type a reason');
        if (!db.students[m]) fail('not-found', 'Student not found');
        var now = clock();
        db.grants[m + '|' + sess.officer] = { until: now + db.settings.trailAccessMin * MIN, reason: reason };
        audit('trail_access', { officer: sess.officer, target: m, reason: reason }); save();
        return methods.trail({ token: a.token, matric: m, hours: a.hours });
      },
      trail: function (a) {
        var sess = auth(a.token), m = normMatric(a.matric), now = clock(), g = db.grants[m + '|' + sess.officer];
        if (!g || g.until < now) fail('no-grant', 'Location access expired. Request it again with a reason.');
        var hours = Math.max(1, Math.min(72, +a.hours || 12)), b = by.get(m), s = db.students[m];
        var pts = (b ? b.pings : []).filter(function (p) { return p.t >= now - hours * 3600000; }).map(function (p) { return { t: p.t, lat: p.lat, lng: p.lng, acc: p.acc, battery: p.battery }; });
        var stat = statusOf(m), dest = null;
        if (stat.outside && stat.out) {
          var pl = db.places.filter(function (x) { return x.id === stat.out.destination.placeId; })[0];
          dest = { name: stat.out.destination.name || stat.out.destination.text, lat: pl ? pl.lat : null, lng: pl ? pl.lng : null };
        }
        return { matric: m, name: s.name, points: pts, last: pts.length ? pts[pts.length - 1] : null, until: g.until, destination: dest };
      },

      resolveAlert: function (a) {
        var sess = auth(a.token), key = str(a.key, 120), note = str(a.note, 200), now = clock();
        if (!key) fail('bad-key');
        if (key.indexOf('sos:') === 0) {
          var id = key.slice(4), so = db.sos.filter(function (x) { return x.id === id; })[0];
          if (!so) fail('not-found');
          so.status = 'resolved'; so.closedAt = now; so.closedBy = sess.officer;
        }
        if (key.indexOf('noreply:') === 0) { Object.keys(db.asks).forEach(function (mm) { if (db.asks[mm].id === key.slice(8) && db.asks[mm].status === 'pending') db.asks[mm].status = 'closed'; }); }
        db.resolutions[key] = { by: sess.officer, at: now, note: note };
        audit('resolve_alert', { officer: sess.officer, target: key, reason: note }); save();
        return { ok: true };
      },

      manualLog: function (a) {
        var sess = auth(a.token), e = a.entry || {}, now = clock(), m = normMatric(e.matric);
        var dir = e.direction === 'in' ? 'in' : e.direction === 'out' ? 'out' : fail('bad-direction', 'Choose OUT or IN');
        var t = isNum(e.t) ? e.t : now;
        if (t > now + 5 * MIN) fail('bad-time', 'Time is in the future');
        var s = db.students[m];
        if (!s) {
          var rst = db.roster[m], nm = str(e.name, 80) || (rst ? rst.name : ''); if (nm.length < 3) fail('bad-name', 'Student is not registered. Enter their full name.');
          s = db.students[m] = { matric: m, name: nm, phone: str(e.phone, 24) || (rst && rst.phone) || '', emergency: rst && rst.guardianPhone ? { name: rst.guardianName || 'Guardian', phone: rst.guardianPhone } : { name: '', phone: '' }, unregistered: true, registeredAt: now, consentLoc: false };
        }
        var flags = [], prev = prevInOut(m, t), dest = str(e.destination, 120);
        if (dir === 'out') { if (!dest) fail('no-destination', 'Enter the destination written in the register'); if (prev && prev.type === 'out') flags.push('already-out'); }
        else if (!prev || prev.type === 'in') flags.push('no-exit-scan');
        var ev = { id: 'p_' + rnd(8), type: dir, matric: m, name: s.name, t: t, receivedAt: now, source: 'paper', gate: 'paper', flags: flags, note: str(e.note, 160) + (sess.officer ? ' [by ' + sess.officer + ']' : '') };
        if (dir === 'out') {
          ev.destination = { placeId: '', name: dest, text: '' }; ev.purpose = ''; ev.consentLoc = false;
          ev.expectedReturn = isNum(e.expectedReturn) && e.expectedReturn > t ? e.expectedReturn : null;
        }
        addEvent(ev); audit('manual_log', { officer: sess.officer, target: m, detail: dir.toUpperCase() + (dest ? ' → ' + dest : '') }); save();
        return { ok: true, id: ev.id };
      },

      savePlace: function (a) {
        var sess = adminOnly(a.token), p = a.place || {}, name = str(p.name, 80);
        if (name.length < 2) fail('bad-name', 'Enter a place name');
        var id = str(p.id, 40) || (name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) + '-' + rnd(2));
        var lat = isNum(p.lat) && Math.abs(p.lat) <= 90 ? p.lat : null, lng = isNum(p.lng) && Math.abs(p.lng) <= 180 ? p.lng : null;
        if ((lat == null) !== (lng == null)) { lat = null; lng = null; }
        var rec = { id: id, name: name, area: str(p.area, 80), tip: str(p.tip, 300), lat: lat, lng: lng, radiusM: isNum(p.radiusM) ? Math.max(50, Math.min(10000, p.radiusM)) : 400, danger: !!p.danger, kind: ['hostel','lecture','library','food','market','worship','sports','transport','other'].indexOf(p.kind) >= 0 ? p.kind : 'other' };
        var i = db.places.findIndex(function (x) { return x.id === id; });
        if (i >= 0) db.places[i] = rec; else db.places.push(rec);
        audit('save_place', { officer: sess.officer, target: id }); save();
        return { ok: true, places: db.places };
      },
      deletePlace: function (a) {
        var sess = adminOnly(a.token), id = str(a.id, 40);
        db.places = db.places.filter(function (x) { return x.id !== id; });
        audit('delete_place', { officer: sess.officer, target: id }); save();
        return { ok: true, places: db.places };
      },

      getSettings: function (a) {
        auth(a.token);
        var s = Object.assign({}, db.settings); delete s.gateSecret; delete s.cardSecret; delete s.gateSecretPrev;
        return s;
      },
      saveSettings: function (a) {
        var sess = adminOnly(a.token), p = a.settings || {}, s = db.settings;
        function hm(k) { if (k in p) { if (parseHM(p[k]) == null) fail('bad-' + k, 'Time must look like 17:30'); s[k] = p[k].length === 4 ? '0' + p[k] : p[k]; } }
        function int(k, lo, hi) { if (k in p) { var v = Math.round(+p[k]); if (!isFinite(v) || v < lo || v > hi) fail('bad-' + k, k + ' must be between ' + lo + ' and ' + hi); s[k] = v; } }
        if ('schoolName' in p) s.schoolName = str(p.schoolName, 80) || s.schoolName;
        if ('securityPhone' in p) s.securityPhone = str(p.securityPhone, 24);
        if ('gateId' in p) { var g = str(p.gateId, 12).toUpperCase(); if (!/^[A-Z0-9_-]{1,12}$/.test(g)) fail('bad-gateId', 'Gate ID: letters, numbers, - or _'); s.gateId = g; }
        if ('freeForStudents' in p) s.freeForStudents = !!p.freeForStudents;
        if ('controllerName' in p) s.controllerName = str(p.controllerName, 120);
        if ('privacyContact' in p) s.privacyContact = str(p.privacyContact, 160);
        if ('idPolicy' in p) s.idPolicy = p.idPolicy === 'required' ? 'required' : p.idPolicy === 'ask' ? 'ask' : 'none';
        if ('gatePolicy' in p) s.gatePolicy = ['open', 'standard', 'strict'].indexOf(p.gatePolicy) >= 0 ? p.gatePolicy : 'standard';
        if ('gateMode' in p) s.gateMode = p.gateMode === 'static' ? 'static' : 'rotating';
        if ('appUrl' in p) { var u = str(p.appUrl, 200); if (u && !/^https?:\/\//i.test(u)) fail('bad-appUrl', 'Address must start with http:// or https://'); s.appUrl = u; }
        if ('mapTiles' in p) { var mt = str(p.mapTiles, 200); if (mt && !(/^https:\/\/[a-z0-9.-]+(:\d+)?\/[^\s"'<>]*\{z\}[^\s"'<>]*\{x\}[^\s"'<>]*\{y\}[^\s"'<>]*$/i.test(mt) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/[^\s"'<>]*\{z\}[^\s"'<>]*\{x\}[^\s"'<>]*\{y\}[^\s"'<>]*$/i.test(mt))) fail('bad-mapTiles', 'Tile address must be https and contain {z}, {x} and {y}'); s.mapTiles = mt; }
        if ('searchUrl' in p) { var su2 = str(p.searchUrl, 120).replace(/\/+$/, ''); if (su2 && !/^(https:\/\/[a-z0-9.-]+(:\d+)?|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/i.test(su2)) fail('bad-searchUrl', 'Search service must be an https address with no path'); s.searchUrl = su2; }
        if ('routeUrl' in p) { var ru = str(p.routeUrl, 120).replace(/\/+$/, ''); if (ru && !/^(https:\/\/[a-z0-9.-]+(:\d+)?|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/i.test(ru)) fail('bad-routeUrl', 'Route service must be an https address with no path'); s.routeUrl = ru; }
        hm('trackFrom'); hm('trackUntil'); hm('curfew');
        int('gatePeriodSec', 15, 600); int('graceMin', 0, 720); int('silenceMin', 5, 240); int('tzOffsetMin', -720, 840);
        int('mediaDays', 1, 365); int('mediaDayMB', 1, 500); int('mediaTotalMB', 50, 500000); if ('mediaOn' in p) s.mediaOn = !!p.mediaOn; int('pingIntervalSec', 30, 900); int('lowBattery', 1, 50); int('mismatchM', 200, 50000); int('askWaitMin', 2, 120); int('walkGraceMin', 0, 30); int('escalateMin', 1, 60); int('retentionDaysPings', 1, 3650); int('retentionDaysEvents', 30, 3650); int('trailAccessMin', 5, 240);
        if ('requireRoster' in p) s.requireRoster = !!p.requireRoster; if ('lockDevice' in p) s.lockDevice = !!p.lockDevice; if ('smsEnabled' in p) s.smsEnabled = !!p.smsEnabled; if ('parentUpdates' in p) s.parentUpdates = !!p.parentUpdates; if (p.parentStarter != null) s.parentStarter = Math.max(0, Math.min(50, Math.round(+p.parentStarter) || 0)); if (p.parentUpdatesPaidBy === 'parent' || p.parentUpdatesPaidBy === 'school') s.parentUpdatesPaidBy = p.parentUpdatesPaidBy; if ('payInstructions' in p) s.payInstructions = str(p.payInstructions, 400); if ('smsContactOnSos' in p) s.smsContactOnSos = !!p.smsContactOnSos; int('smsContactOverdueHours', 0, 72); int('smsDailyCap', 10, 5000); if ('countryCode' in p) { var cc = String(p.countryCode || '').replace(/\D/g, '').slice(0, 4); if (!cc) fail('bad-countryCode', 'Country code like 234'); s.countryCode = cc; }
        int('visitorMaxHours', 1, 72); int('escortWaitMin', 2, 60);
        if ('policyText' in p) { var pt = String(p.policyText || '').replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').trim().slice(0, 3000); if (pt && pt !== s.policyText) { s.policyText = pt; s.policyVersion = (s.policyVersion || 1) + 1; } }
        if (Array.isArray(p.directory)) s.directory = p.directory.slice(0, 15).map(function (d) { return { name: str(d && d.name, 60), phone: str(d && d.phone, 24), note: str(d && d.note, 80) }; }).filter(function (d) { return d.name && d.phone; });
        if (p.campus) {
          var c = p.campus;
          if (c.lat === null || c.lng === null || c.lat === '' || c.lng === '') { s.campus.lat = null; s.campus.lng = null; }
          else if (isNum(c.lat) && isNum(c.lng) && Math.abs(c.lat) <= 90 && Math.abs(c.lng) <= 180) { s.campus.lat = c.lat; s.campus.lng = c.lng; }
          if ('radiusM' in c) { var r = Math.round(+c.radiusM); if (r >= 50 && r <= 5000) s.campus.radiusM = r; }
        }
        if (p.gatePoint) {
          var q = p.gatePoint;
          if (q.lat === null || q.lng === null || q.lat === '' || q.lng === '') { s.gatePoint.lat = null; s.gatePoint.lng = null; }
          else if (isNum(q.lat) && isNum(q.lng) && Math.abs(q.lat) <= 90 && Math.abs(q.lng) <= 180) { s.gatePoint.lat = q.lat; s.gatePoint.lng = q.lng; }
          if ('radiusM' in q) { var gr = Math.round(+q.radiusM); if (gr >= 30 && gr <= 1000) s.gatePoint.radiusM = gr; }
        }
        if (p.posterRotate) { s.gateSecretPrev = s.gateSecret; s.gatePrevUntil = clock() + 14 * DAY; s.gateSecret = rnd(16); audit('poster_rotate', { officer: sess.officer, detail: 'New gate poster code. The old poster still works for 14 days.' }); }
        if (p.rotateSecret) s.gateSecret = rnd(16);
        if (p.rotateCards) { s.cardSecret = rnd(16); audit('rotate_cards', { officer: sess.officer, detail: 'All printed ID cards are now invalid' }); }
        audit('save_settings', { officer: sess.officer }); save();
        var out = Object.assign({}, s); delete out.gateSecret; delete out.cardSecret; delete out.gateSecretPrev; return out;
      },

      gateToken: function (a) {
        auth(a.token);
        var s = db.settings, tk = tokenAt(clock());
        return { token: tk.token, code: tk.code, gateId: s.gateId, mode: s.gateMode, validForSec: tk.validForSec, periodSec: s.gatePeriodSec, appUrl: s.appUrl, serverTime: clock() };
      },

      exportCsv: function (a) {
        var sess = adminOnly(a.token), from = isNum(a.from) ? a.from : 0, to = isNum(a.to) ? a.to : Infinity, tz = db.settings.tzOffsetMin;
        function cell(v) { v = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; }
        var rows = [['time', 'matric', 'name', 'event', 'source', 'gate_check', 'destination', 'purpose', 'expected_return', 'flags', 'note']];
        db.events.filter(function (e) { return e.t >= from && e.t <= to && ['out', 'in', 'sos', 'sos_cancel'].indexOf(e.type) >= 0; })
          .sort(function (x, y) { return x.t - y.t; })
          .forEach(function (e) {
            rows.push([fmtLocal(e.t, tz), e.matric, e.name, e.type.toUpperCase(), e.source || '', e.gate || '', e.destination ? (e.destination.name || e.destination.text) : '',
              e.purpose || '', e.expectedReturn ? fmtLocal(e.expectedReturn, tz) : '', (e.flags || []).join(' '), e.note || '']);
          });
        audit('export', { officer: sess.officer, detail: (rows.length - 1) + ' rows' }); save();
        return { csv: rows.map(function (r) { return r.map(cell).join(','); }).join('\r\n'), rows: rows.length - 1 };
      },

      records: function (a) {
        auth(a.token);
        var from = isNum(a.from) ? a.from : 0, to = isNum(a.to) ? a.to : Infinity, q = str(a.q, 40).toLowerCase(), type = str(a.type, 12);
        var list = db.events.filter(function (e) {
          if (e.t < from || e.t > to) return false;
          if (type && e.type !== type) return false;
          if (type === '' && ['out', 'in', 'sos'].indexOf(e.type) < 0) return false;
          if (q && e.matric.toLowerCase().indexOf(q) < 0 && (e.name || '').toLowerCase().indexOf(q) < 0) return false;
          return true;
        }).sort(function (x, y) { return y.t - x.t; });
        return { total: list.length, rows: list.slice(0, 200).map(eventView) };
      },

      backup: function (a) {
        var sess = adminOnly(a.token);
        audit('backup', { officer: sess.officer }); save();
        var copy = JSON.parse(JSON.stringify(db));
        copy.sessions = {}; copy.lock = { fails: 0, until: 0 };
        return copy;
      },
      restore: function (a) {
        var sess = adminOnly(a.token), d = a.data;
        if (!d || typeof d !== 'object' || d.v !== 1 || !d.staff || !(d.staff.accounts || typeof d.staff.hash === 'string') || !d.settings || !Array.isArray(d.events) || !Array.isArray(d.pings) ||
          !d.students || typeof d.students !== 'object') fail('bad-backup', 'This file is not a SafeGate backup');
        var now = clock(), copy = JSON.parse(JSON.stringify(d)), keepIct = db.ict;
        Object.keys(db).forEach(function (k) { delete db[k]; });
        Object.keys(copy).forEach(function (k) { db[k] = copy[k]; });
        db.sessions = {}; db.lock = { fails: 0, until: 0 }; db.lastPurge = 0; db._n = null; db._ni = null; if (keepIct) db.ict = keepIct;
        normalize(); rebuild();
        if (!acctOf(sess.officer)) {                       // the backup came from another desk: keep this administrator able to sign in
          var keep = Object.keys(db.staff.accounts)[0]; sess = { officer: db.staff.accounts[keep].name };
        }
        db.sessions[sha256Hex(String(a.token))] = { officer: sess.officer, exp: now + SESSION_TTL, seen: now };
        audit('restore', { officer: sess.officer, detail: db.events.length + ' events, ' + Object.keys(db.students).length + ' students' }); save();
        return { ok: true, events: db.events.length, students: Object.keys(db.students).length };
      },

      ask: function (a) {
        var sess = auth(a.token), m = normMatric(a.matric); if (!db.students[m]) fail('not-found', 'Student not found');
        var text = str(a.text, 120) || 'Security is checking on you. Are you OK?', now = clock();
        db.asks[m] = { id: 'a_' + rnd(6), t: now, by: sess.officer, text: text, status: 'pending' };
        notify('student', m, { title: 'Security is checking on you', body: text, tag: 'ask', url: '/', urgent: true }, true);
        audit('ask_checkin', { officer: sess.officer, target: m, detail: text }); save();
        return { ok: true };
      },
      startDrill: function (a) {
        var sess = adminOnly(a.token), now = clock(), d = { id: 'd' + rnd(4), t: now, by: sess.officer };
        if (db.drills.some(function (x) { return now - x.t < 10 * MIN && !db.resolutions['drill:' + x.id]; })) fail('drill-open', 'A drill is already running. Close it first.');
        db.drills.push(d); if (db.drills.length > 50) db.drills.shift();
        db.pushed['drill:' + d.id] = now;
        notify('staff', '', { title: 'DRILL: practice emergency', body: 'This is a drill. Open the desk and press "I am responding".', tag: 'drill-' + d.id, url: '/desk', urgent: true, require: true }, true);
        smsStaff('oncall', 'DRILL (practice, not real): open the SafeGate desk and press "I am responding".', 'drill', '', d.id);
        audit('start_drill', { officer: sess.officer, detail: d.id }); save(); return { ok: true, id: d.id };
      },
      drillResults: function (a) {
        auth(a.token);
        return db.drills.slice(-15).reverse().map(function (d) {
          var c = db.claims['drill:' + d.id], r = db.resolutions['drill:' + d.id];
          return { id: d.id, t: d.t, by: d.by, claimedBy: c ? c.by : '', claimSec: c ? Math.round((c.at - d.t) / 1000) : null, closedSec: r ? Math.round((r.at - d.t) / 1000) : null, open: !r && clock() - d.t <= 2 * HOUR };
        });
      },
      claimAlert: function (a) {
        var sess = auth(a.token), key = str(a.key, 120), now = clock(), c = db.claims[key];
        if (!key) fail('bad-key');
        if (c && c.by !== sess.officer && now - c.at < 30 * MIN) fail('claimed', c.by + ' is already responding');
        var first = !c; db.claims[key] = { by: sess.officer, at: now };
        if (first && key.indexOf('sos:') === 0) { var sx = db.sos.filter(function (q) { return 'sos:' + q.id === key; })[0]; if (sx && sx.matric && !sx.duress) notify('student', sx.matric, { title: 'An officer is responding', body: 'Security has seen your emergency alert and is on the way. Stay safe.', tag: 'sos-claim', url: '/', urgent: true }, true); }
        audit('claim_alert', { officer: sess.officer, target: key }); save();
        return { ok: true };
      },

      analytics: function (a) {
        auth(a.token);
        var cfg = db.settings, now = clock(), tz = cfg.tzOffsetMin, days = Math.max(1, Math.min(90, Math.round(+a.days) || 14)), from = now - days * DAY;
        var perDay = {}, hours = []; for (var h = 0; h < 24; h++) hours.push(0);
        var dest = {}, typed = {}, src = { qr: 0, paper: 0, 'no-scan': 0 }, flagc = {}, outs = 0, ins = 0, sosN = 0, walks = 0, uniq = {}, durs = [], onTime = 0, late = 0, lateSum = 0;
        for (var d = days - 1; d >= 0; d--) perDay[fmtLocal(now - d * DAY, tz).slice(0, 10)] = 0;
        db.events.forEach(function (e) {
          if (e.t < from) return;
          if (e.type === 'out') {
            outs++; uniq[e.matric] = 1;
            var dk = fmtLocal(e.t, tz).slice(0, 10); if (dk in perDay) perDay[dk]++;
            hours[Math.floor(localMinutes(e.t, tz) / 60)]++;
            var dn = e.destination && e.destination.placeId ? e.destination.name : 'Somewhere else (typed)';
            dest[dn] = (dest[dn] || 0) + 1;
            if (e.destination && !e.destination.placeId) { var tx = str(e.destination.text || e.destination.name, 40).toLowerCase(); if (tx) typed[tx] = (typed[tx] || 0) + 1; }
            src[e.source] = (src[e.source] || 0) + 1;
            (e.flags || []).forEach(function (f) { flagc[f] = (flagc[f] || 0) + 1; });
          } else if (e.type === 'in') ins++;
          else if (e.type === 'sos') sosN++;
          else if (e.type === 'walk_start') walks++;
        });
        var lateN = {};
        by.forEach(function (b, mm) {
          var open = null, ex = null;
          b.events.forEach(function (e) {
            if (e.t < from) return;
            if (e.type === 'out') { open = e; ex = e.expectedReturn || null; }
            else if (e.type === 'extend' && open && e.expectedReturn) ex = e.expectedReturn;
            else if (e.type === 'in' && open) {
              var du = e.t - open.t; if (du > 0 && du < 3 * DAY) durs.push(du);
              if (ex) { if (e.t <= ex + cfg.graceMin * MIN) onTime++; else { late++; lateSum += e.t - ex; lateN[mm] = (lateN[mm] || 0) + 1; } }
              open = null; ex = null;
            }
          });
        });
        durs.sort(function (x, y) { return x - y; });
        function top(o, n) { return Object.keys(o).map(function (k) { return { name: k, n: o[k] }; }).sort(function (x, y) { return y.n - x.n; }).slice(0, n); }
        var peak = 0; hours.forEach(function (v, i) { if (v > hours[peak]) peak = i; });
        var sum = 0; durs.forEach(function (x) { sum += x; });
        return { days: days, outs: outs, ins: ins, students: Object.keys(uniq).length, sos: sosN, walks: walks,
          perDay: Object.keys(perDay).map(function (k) { return { day: k, n: perDay[k] }; }), hours: hours, peakHour: outs ? peak : null,
          destinations: top(dest, 8), typed: top(typed, 8), sources: src, flags: top(flagc, 8),
          avgDurMin: durs.length ? Math.round(sum / durs.length / MIN) : null, medianDurMin: durs.length ? Math.round(durs[durs.length >> 1] / MIN) : null,
          response: (function () {
            var cs = [], un = 0, rs = [];
            db.sos.forEach(function (x) { if (x.t < from) return; var c = db.claims['sos:' + x.id], r = db.resolutions['sos:' + x.id]; if (c) cs.push(Math.max(0, Math.round((c.at - x.t) / 1000))); else un++; if (r) rs.push(Math.max(0, Math.round((r.at - x.t) / 60000))); });
            cs.sort(function (p, q) { return p - q; }); rs.sort(function (p, q) { return p - q; });
            return { sos: cs.length + un, unclaimed: un, medianClaimSec: cs.length ? cs[cs.length >> 1] : null, slowestClaimSec: cs.length ? cs[cs.length - 1] : null, medianResolveMin: rs.length ? rs[rs.length >> 1] : null };
          })(),
          p90DurMin: durs.length ? Math.round(durs[Math.min(durs.length - 1, Math.floor(durs.length * 0.9))] / MIN) : null,
          safety: (function () {
            var cats = {}, grid = {}, esc = 0, wait = 0, waitN = 0, vis = 0;
            db.reports.forEach(function (r) { if (r.t < from) return; cats[REPORT_LABEL[r.cat]] = (cats[REPORT_LABEL[r.cat]] || 0) + 1; if (r.lat != null) { var gk = r.lat.toFixed(3) + ',' + r.lng.toFixed(3); (grid[gk] = grid[gk] || { lat: +r.lat.toFixed(3), lng: +r.lng.toFixed(3), n: 0, kinds: {} }).n++; grid[gk].kinds[REPORT_LABEL[r.cat]] = 1; } });
            db.sos.forEach(function (x) { if (x.t < from || x.lat == null) return; var gk = x.lat.toFixed(3) + ',' + x.lng.toFixed(3); (grid[gk] = grid[gk] || { lat: +x.lat.toFixed(3), lng: +x.lng.toFixed(3), n: 0, kinds: {} }).n++; grid[gk].kinds['Emergency'] = 1; });
            Object.keys(db.escorts).forEach(function (k) { var e = db.escorts[k]; if (e.t < from) return; esc++; if (e.at) { wait += e.at - e.t; waitN++; } if (e.lat != null) { var gk = e.lat.toFixed(3) + ',' + e.lng.toFixed(3); (grid[gk] = grid[gk] || { lat: +e.lat.toFixed(3), lng: +e.lng.toFixed(3), n: 0, kinds: {} }).n++; grid[gk].kinds['Escort request'] = 1; } });
            db.visitors.forEach(function (v) { if (v.inT >= from) vis++; });
            return { reportsByKind: Object.keys(cats).map(function (k) { return { name: k, n: cats[k] }; }).sort(function (x, y) { return y.n - x.n; }),
              hotspots: Object.keys(grid).map(function (k) { return { lat: grid[k].lat, lng: grid[k].lng, n: grid[k].n, kinds: Object.keys(grid[k].kinds) }; }).sort(function (x, y) { return y.n - x.n; }).slice(0, 6),
              escorts: esc, escortAvgWaitMin: waitN ? Math.round(wait / waitN / MIN) : null, visitors: vis };
          })(),
          repeatLate: Object.keys(lateN).filter(function (k) { return lateN[k] >= 2; }).sort(function (x, y) { return lateN[y] - lateN[x]; }).slice(0, 8).map(function (k) { return { matric: k, name: (db.students[k] || {}).name || k, n: lateN[k] }; }),
          trips: durs.length, onTime: onTime, late: late, avgLateMin: late ? Math.round(lateSum / late / MIN) : null };
      },

      /* ---- exit passes */
      listPasses: function (a) {
        auth(a.token);
        return Object.keys(db.passes).map(function (k) { return db.passes[k]; }).sort(function (x, y) { return (x.status === 'pending' ? 0 : 1) - (y.status === 'pending' ? 0 : 1) || y.t - x.t; }).slice(0, 100);
      },
      decidePass: function (a) {
        var sess = auth(a.token), ps = db.passes[str(a.id, 64)]; if (!ps) fail('not-found', 'Pass not found');
        if (ps.status === 'denied') fail('decided', 'Already denied');
        ps.status = a.approve ? 'approved' : 'denied'; ps.by = sess.officer; ps.decidedAt = clock(); ps.decisionNote = str(a.note, 120);
        notify('student', ps.matric, { title: 'Exit pass ' + (a.approve ? 'approved' : 'not approved'), body: a.approve ? 'Security approved your pass.' : (ps.decisionNote || 'Security did not approve this pass.'), tag: 'pass-' + ps.id, url: '/' }, false);
        audit(a.approve ? 'approve_pass' : 'deny_pass', { officer: sess.officer, target: ps.matric, detail: ps.dest + ' until ' + fmtLocal(ps.until, db.settings.tzOffsetMin) }); save();
        return { ok: true };
      },
      /* ---- notices */
      postNotice: function (a) {
        var sess = auth(a.token), title = str(a.title, 80), text = str(a.text, 400), now = clock();
        if (title.length < 3) fail('bad-title', 'Give the notice a title');
        var hrs = Math.max(1, Math.min(720, Math.round(+a.hours) || 24));
        db.notices.push({ id: 'n_' + rnd(4), title: title, text: text, level: a.level === 'urgent' ? 'urgent' : 'info', t: now, exp: now + hrs * HOUR, by: sess.officer, acks: {} });
        if (a.level === 'urgent') Object.keys(db.push.students).forEach(function (m) { notify('student', m, { title: '📢 ' + title, body: text, tag: 'notice', url: '/', urgent: true }, true); });
        audit('post_notice', { officer: sess.officer, detail: title }); save();
        return { ok: true };
      },
      listNotices: function (a) {
        auth(a.token); var now = clock(), total = Object.keys(db.students).length;
        return db.notices.slice().sort(function (x, y) { return y.t - x.t; }).slice(0, 50).map(function (n) { return { id: n.id, title: n.title, text: n.text, level: n.level, t: n.t, exp: n.exp, by: n.by, active: n.exp > now, acks: Object.keys(n.acks || {}).length, total: total }; });
      },
      deleteNotice: function (a) {
        var sess = adminOnly(a.token), id = str(a.id, 40), n0 = db.notices.length;
        db.notices = db.notices.filter(function (n) { return n.id !== id; });
        if (db.notices.length !== n0) { audit('delete_notice', { officer: sess.officer, target: id }); save(); }
        return { ok: true };
      },
      /* ---- concern reports */
      listReports: function (a) {
        var sess = auth(a.token), nowS = clock(), seenNow = 0;
        db.reports.forEach(function (r) { if (!r.seenAt) { r.seenAt = nowS; r.seenBy = sess.officer; seenNow++; tellStudent(r, 'Security has seen your report', 'Your report ' + (r.ref || '') + ' has been opened by security.'); } });
        if (seenNow) save();
        return db.reports.slice().sort(function (x, y) { return (x.status === 'open' ? 0 : 1) - (y.status === 'open' ? 0 : 1) || y.t - x.t; }).slice(0, 100).map(function (r) { var o = Object.assign({}, r, { label: REPORT_LABEL[r.cat], hasEvidence: !!r.evidence, stage: reportStages(r).stage }); delete o.evidence; delete o.anonKey; return o; });
      },
      listSos: function (a) {
        auth(a.token);
        return db.sos.slice().sort(function (x, y) { return y.t - x.t; }).slice(0, 100).map(function (x) { var st = db.students[x.matric] || {}; return { id: x.id, t: x.t, status: x.status, matric: x.matric, name: st.name || '', kind: x.kind || 'danger', message: x.message || '', closedAt: x.closedAt || null, closedBy: x.closedBy || '' }; });
      },
      updateReport: function (a) {
        var sess = auth(a.token), r = db.reports.filter(function (x) { return x.id === a.id; })[0]; if (!r) fail('not-found', 'Report not found');
        var note = str(a.note, 200); if (note) r.notes.push({ t: clock(), by: sess.officer, text: note, pub: !!a.pub });
        var nowU = clock(), stg = a.stage === 'handling' || a.stage === 'dispatched' ? a.stage : '';
        if (stg) {
          if (!r.seenAt) { r.seenAt = nowU; r.seenBy = sess.officer; }
          if (!r.handlingAt) { r.handlingAt = nowU; r.handledBy = sess.officer; tellStudent(r, 'Security is on it', 'Your report ' + (r.ref || '') + ' is being handled.'); }
          if (stg === 'dispatched' && !r.dispatchAt) { r.dispatchAt = nowU; tellStudent(r, 'Help is on the way', 'Security is sending help for your report ' + (r.ref || '') + '.'); }
        }
        if (a.status === 'open' || a.status === 'closed') { if (a.status === 'closed' && r.status !== 'closed') { r.closedAt = clock(); tellStudent(r, 'Your report is resolved', 'Report ' + (r.ref || '') + ' has been closed by security.'); } if (a.status === 'open') r.closedAt = null; r.status = a.status; }
        audit('update_report', { officer: sess.officer, target: r.matric || 'anonymous', detail: (r.status) + (note ? ': ' + note : '') }); save();
        return { ok: true };
      },

      /* ---- Deleting data. Nothing is destroyed at once: it goes to the Recycle bin for 30 days, where it can be restored. Every deletion needs a reason and is written to the audit trail. */
      plansInfo: function (a) {
        var m = db.monet, st = a.matric ? db.students[normMatric(a.matric)] : null, mine = st && st.deviceId && st.deviceId === str(a.deviceId, 64) ? studentEnt(st.matric) : null, cur = db.settings.currency || '₦';
        return { free: freeMode(), currency: cur, plus: freeMode() ? Object.assign({}, m.plans.plus, { on: false }) : m.plans.plus, family: freeMode() ? Object.assign({}, m.plans.family, { on: false }) : m.plans.family, campus: licenceOn(), mine: mine, pay: db.settings.payInstructions || '', adsOn: freeMode() ? false : m.adsOn,
          promise: 'Safety is always free: emergency alerts, gate scans, reports, help requests and escorts never cost anything and never show ads. Your location is never used to choose or sell an ad.' };
      },
      adEvent: function (a) {
        var st = db.students[normMatric(a.matric)]; if (!st || !st.deviceId || st.deviceId !== str(a.deviceId, 64)) return { ok: true };
        var ad = db.monet.ads.filter(function (x) { return x.id === str(a.id, 24); })[0], kind = a.kind === 'click' ? 'c' : a.kind === 'hide' ? 'h' : a.kind === 'view' ? 'v' : ''; if (!ad || !kind) return { ok: true };
        var key = st.matric + '|' + ad.id + '|' + kind, now = clock(); adSeen = adSeen || {}; if (adSeen[key] && now - adSeen[key] < 30 * MIN) return { ok: true }; adSeen[key] = now; if (Object.keys(adSeen).length > 20000) adSeen = {};
        var dk = dayKey(now); ad.stats = ad.stats || {}; var d = ad.stats[dk] = ad.stats[dk] || { v: 0, c: 0, h: 0 }; d[kind]++;
        var ks = Object.keys(ad.stats); if (ks.length > 120) delete ad.stats[ks.sort()[0]]; save(); return { ok: true };
      },
      helpAsk: function (a) {
        var dev = str(a.deviceId, 64), msg = str(a.message, 600), m = a.matric ? normMatric(a.matric) : '', now = clock();
        if (dev.length < 8) fail('bad-device', 'Open the app and try again');
        if (msg.length < 8) fail('too-short', 'Please say a little more about the problem (at least 8 letters)');
        var r = helpRate[dev] = (helpRate[dev] || []).filter(function (x) { return now - x < HOUR; }); if (r.length >= 4) fail('slow-down', 'You have sent several requests already. ICT will answer them, please wait.'); r.push(now);
        if (Object.keys(helpRate).length > 5000) helpRate = {};
        var open = db.help.filter(function (x) { return x.dev === dev && x.status !== 'closed'; }); if (open.length >= 3) fail('too-many', 'You already have 3 open requests. Wait for an answer, or close one.');
        var st = m ? db.students[m] : null, verified = !!(st && st.deviceId && st.deviceId === dev);
        var t = { id: 'H' + rnd(6), t: now, dev: dev, matric: m, name: st ? st.name : str(a.name, 80), verified: verified, contact: str(a.contact, 60), message: msg, diag: cleanDiag(a.diag), status: 'open', replies: [], unread: false };
        db.help.push(t); if (db.help.length > 600) db.help = db.help.slice(-600);
        audit('help_ask', { officer: t.name || 'a student', target: m || 'unknown', detail: verified ? 'from registered phone' : 'from an unverified phone' }); save(); return { ok: true, id: t.id };
      },
      helpMine: function (a) {
        var dev = str(a.deviceId, 64); if (dev.length < 8) return { items: [] };
        return { items: db.help.filter(function (x) { return x.dev === dev; }).slice(-10).reverse().map(helpMineView) };
      },
      helpSeen: function (a) {
        var dev = str(a.deviceId, 64), t = db.help.filter(function (x) { return x.dev === dev && x.id === str(a.id, 24); })[0]; if (t && t.unread) { t.unread = false; save(); } return { ok: true };
      },
      deleteReport: function (a) {
        var sess = auth(a.token), reason = delReason(a), i = indexById(db.reports, a.id); if (i < 0) fail('not-found', 'Report not found');
        var r = db.reports.splice(i, 1)[0]; tomb(r.id);
        var tid = trashPut('report', 'Report ' + (r.ref || r.id) + ' · ' + (REPORT_LABEL[r.cat] || r.cat), r, sess.officer, reason);
        audit('delete_report', { officer: sess.officer, target: r.ref || r.id, reason: reason, detail: 'moved to recycle bin' }); save(); return { ok: true, trashId: tid };
      },
      deleteSos: function (a) {
        var sess = auth(a.token), reason = delReason(a), i = indexById(db.sos, a.id); if (i < 0) fail('not-found', 'Emergency record not found');
        if (db.sos[i].status === 'open') fail('sos-open', 'This emergency is still open. Resolve it first so nobody is left without help.');
        var x = db.sos.splice(i, 1)[0]; tomb(x.id); Object.keys(x.sameAs || {}).forEach(tomb);
        var tid = trashPut('sos', 'Emergency alert · ' + (x.matric || '') + ' · ' + new Date(x.t).toLocaleDateString(), x, sess.officer, reason);
        audit('delete_sos', { officer: sess.officer, target: x.matric, reason: reason, detail: 'moved to recycle bin' }); save(); return { ok: true, trashId: tid };
      },
      deleteLocationHistory: function (a) {
        var sess = auth(a.token), reason = delReason(a), m = normMatric(a.matric); if (!db.students[m]) fail('not-found', 'Student not found');
        var mine = db.pings.filter(function (p) { return p.matric === m; }); if (!mine.length) return { ok: true, removed: 0 };
        db.pings = db.pings.filter(function (p) { return p.matric !== m; }); rebuild();
        var tid = trashPut('location', 'Location history · ' + m + ' (' + mine.length + ' points)', { matric: m, pings: mine.slice(-3000) }, sess.officer, reason);
        audit('delete_location', { officer: sess.officer, target: m, reason: reason, detail: mine.length + ' points moved to recycle bin' }); save(); return { ok: true, removed: mine.length, trashId: tid };
      },
      deleteStudent: function (a) {
        var sess = adminOnly(a.token), reason = delReason(a), m = normMatric(a.matric), st = db.students[m]; if (!st) fail('not-found', 'Student not found');
        if (db.sos.some(function (x) { return x.matric === m && x.status === 'open'; })) fail('sos-open', 'This student has an open emergency. Resolve it first.');
        var snap = { matric: m, student: st, events: (by.get(m) || { events: [] }).events.slice(-2000), pings: (by.get(m) || { pings: [] }).pings.slice(-3000), transfer: db.transfers[m] || null, ask: db.asks[m] || null };
        delete db.students[m]; delete db.transfers[m]; delete db.asks[m];
        db.events = db.events.filter(function (e) { return e.matric !== m; }); db.pings = db.pings.filter(function (p) { return p.matric !== m; });
        Object.keys(db.deviceMap || {}).forEach(function (d) { db.deviceMap[d] = db.deviceMap[d].filter(function (x) { return x !== m; }); if (!db.deviceMap[d].length) delete db.deviceMap[d]; });
        Object.keys(db.grants).forEach(function (k) { if (k.indexOf(m + '|') === 0) delete db.grants[k]; });
        Object.keys(db.guardians).forEach(function (k) { if (db.guardians[k].matric === m) delete db.guardians[k]; }); delete db.subs[m];
        rebuild(); snap.events.forEach(function (e) { tomb(e.id); });
        var tid = trashPut('student', 'Student · ' + (st.name || m) + ' (' + m + ')', snap, sess.officer, reason);
        audit('delete_student', { officer: sess.officer, target: m, reason: reason, detail: 'account and history moved to recycle bin' }); save(); return { ok: true, trashId: tid };
      },
      listTrash: function (a) {
        auth(a.token); var now = clock();
        return { days: TRASH_DAYS, items: trashStore().slice().reverse().map(function (x) { return { id: x.id, kind: x.kind, label: x.label, by: x.by, reason: x.reason, t: x.t, daysLeft: Math.max(0, Math.ceil((x.t + TRASH_DAYS * DAY - now) / DAY)) }; }) };
      },
      restoreTrash: function (a) {
        var sess = auth(a.token), it = trashStore().filter(function (x) { return x.id === str(a.id, 20); })[0]; if (!it) fail('not-found', 'That item is no longer in the recycle bin');
        var d = it.data;
        if (it.kind === 'report') { if (indexById(db.reports, d.id) >= 0) fail('exists', 'Already restored'); db.reports.push(d); }
        else if (it.kind === 'sos') { if (indexById(db.sos, d.id) >= 0) fail('exists', 'Already restored'); db.sos.push(d); }
        else if (it.kind === 'location') { if (!db.students[d.matric]) fail('no-student', 'The student no longer exists'); db.pings = db.pings.concat(d.pings); }
        else if (it.kind === 'student') {
          if (db.students[d.matric]) fail('exists', 'A student with this matric number already exists'); db.students[d.matric] = d.student; db.events = db.events.concat(d.events); db.pings = db.pings.concat(d.pings);
          if (d.transfer) db.transfers[d.matric] = d.transfer; if (d.ask) db.asks[d.matric] = d.ask;
        } else fail('bad-kind', 'Cannot restore this');
        [d.id].concat(Object.keys(d.sameAs || {})).concat((d.events || []).map(function (e) { return e.id; })).forEach(function (k) { if (k) delete db.tomb[k]; });
        db.trash = db.trash.filter(function (x) { return x !== it; }); rebuild(); if (it.kind !== 'location') Object.keys(db.tomb).forEach(function (k) { ids.add(k); });
        audit('restore_trash', { officer: sess.officer, target: it.label, detail: 'restored from recycle bin' }); save(); return { ok: true };
      },
      purgeTrash: function (a) {
        var sess = adminOnly(a.token), n = 0, id = str(a.id, 20);
        db.trash = trashStore().filter(function (x) { if (id && x.id !== id) return true; trashDrop(x); n++; return false; });
        audit('purge_trash', { officer: sess.officer, detail: n + ' item(s) permanently deleted' }); save(); return { ok: true, n: n };
      },

      /* ---- Evidence media (voice notes, pictures, short videos). Files live on disk (server.js); only small records live here. */
      mediaBegin: function (a) {
        var s = db.settings, lim = MEDIA_LIM[a.kind], ref = str(a.ref, 64), cid = str(a.cid, 40), owner, rec, now = clock(), isSos = a.refType === 'sos';
        if (s.mediaOn === false) fail('media-off', 'Sending pictures, voice notes and videos is turned off by the school.');
        if (!lim) fail('bad-kind', 'That kind of file is not accepted.');
        if (!/^[A-Za-z0-9-]{8,40}$/.test(cid)) fail('bad-id', 'Bad file id');
        var bytes = Math.floor(Number(a.bytes)); if (!(bytes > 200)) fail('empty', 'The file is empty.'); if (bytes > lim.max) fail('too-big', 'That file is too big. Pictures up to ' + Math.round(MEDIA_LIM.image.max / 1000) + ' KB, voice notes ' + Math.round(MEDIA_LIM.audio.max / 1000) + ' KB, videos ' + Math.round(MEDIA_LIM.video.max / 1e6) + ' MB.');
        if (isSos) {
          var x = db.sos.filter(function (q) { return q.id === ref || (q.sameAs && q.sameAs[ref]); })[0], m = normMatricSoft(a.matric), st = m && db.students[m];
          if (!x || !st || x.matric !== m) fail('no-ref', 'That alert has not reached the server yet.');
          if (!st.deviceId || st.deviceId !== str(a.deviceId, 64)) fail('forbidden', 'Open this on the phone you registered with');
          if (now - x.t > 12 * HOUR) fail('late', 'That alert is too old to add files to. Send a report instead.');
          owner = m; rec = x;
        } else {
          var r = db.reports.filter(function (q) { return q.id === ref; })[0];
          if (!r) fail('no-ref', 'That report has not reached the server yet.');
          if (r.anon) { if (sha256Hex(String(r.id) + ':' + String(a.anonKey || '')) !== r.anonKey) fail('forbidden', 'Not your report'); owner = 'anon:' + r.id; }
          else { var m2 = normMatricSoft(a.matric), st2 = m2 && db.students[m2]; if (!st2 || r.matric !== m2 || !st2.deviceId || st2.deviceId !== str(a.deviceId, 64)) fail('forbidden', 'Open this on the phone you registered with'); owner = m2; }
          rec = r;
        }
        var ex = db.media[cid]; if (ex) { if (ex.ref === ref && ex.owner === owner) return { id: cid, done: true }; fail('bad-id', 'Bad file id'); }
        var n = (rec.mids || []).filter(function (k) { return db.media[k] && db.media[k].kind === a.kind; }).length;
        if (n >= lim.per) fail('limit', 'You can add at most ' + lim.per + ' ' + (a.kind === 'image' ? 'pictures' : a.kind === 'audio' ? 'voice notes' : 'video') + ' here.');
        var day = Math.floor((now + (s.tzOffsetMin || 0) * MIN) / DAY), q2 = db.mediaQuota[owner];
        if (!q2 || q2.day !== day) q2 = db.mediaQuota[owner] = { day: day, bytes: 0 };
        if (q2.bytes + bytes > s.mediaDayMB * 1e6 * (isSos ? 3 : 1)) fail('quota', 'Daily limit reached for sending files. Try again tomorrow, or call security.');
        if (!isSos && db.mediaBytes + bytes > s.mediaTotalMB * 1e6) fail('full', 'The security desk storage is full. Please call security.');
        return { id: cid, owner: owner };
      },
      mediaDone: function (a) {
        var s = db.settings, now = clock(), ref = str(a.ref, 64);
        if (db.media[a.id]) return { ok: true, again: true };
        db.media[a.id] = { id: a.id, ref: ref, refType: a.refType === 'sos' ? 'sos' : 'report', owner: str(a.owner, 60), kind: a.kind, mime: str(a.mime, 40), bytes: a.bytes | 0, sha: str(a.sha, 64), dur: Math.min(600, a.dur | 0), t: now, exp: now + s.mediaDays * DAY };
        db.mediaBytes += a.bytes | 0;
        var q = db.mediaQuota[a.owner]; if (q) q.bytes += a.bytes | 0;
        var rec = a.refType === 'sos' ? db.sos.filter(function (z) { return z.id === ref || (z.sameAs && z.sameAs[ref]); })[0] : db.reports.filter(function (z) { return z.id === ref; })[0];
        if (rec) { rec.mediaN = (rec.mediaN || 0) + 1; (rec.mids = rec.mids || []).push(a.id); }
        save(); return { ok: true };
      },
      mediaSweep: function () {
        var now = clock(), gone = [];
        Object.keys(db.media).forEach(function (k) { var m = db.media[k]; if (m.exp < now) { gone.push(k); db.mediaBytes = Math.max(0, db.mediaBytes - m.bytes); delete db.media[k]; var rec = m.refType === 'sos' ? db.sos.filter(function (z) { return z.id === m.ref || (z.sameAs && z.sameAs[m.ref]); })[0] : db.reports.filter(function (z) { return z.id === m.ref; })[0]; if (rec) { if (rec.mediaN) rec.mediaN--; if (rec.mids) rec.mids = rec.mids.filter(function (z) { return z !== k; }); } } });
        var day = Math.floor((now + (db.settings.tzOffsetMin || 0) * MIN) / DAY); Object.keys(db.mediaQuota).forEach(function (k) { if (db.mediaQuota[k].day < day - 1) delete db.mediaQuota[k]; });
        if (gone.length) save(); return { gone: gone };
      },
      mediaCheck: function (a) {
        var m = db.media[str(a.id, 40)], e = Number(a.e); if (!m || !(e > clock()) || e > clock() + 30 * MIN) return null;
        if (hmacHex(db.settings.gateSecret, 'media|' + m.id + '|' + e) !== str(a.s, 64)) return null;
        return { kind: m.kind, mime: m.mime, bytes: m.bytes };
      },
      mediaList: function (a) {
        var sess = auth(a.token), ref = str(a.ref, 64), e = clock() + 10 * MIN;
        var rc = a.refType === 'sos' ? db.sos.filter(function (z) { return z.id === ref || (z.sameAs && z.sameAs[ref]); })[0] : db.reports.filter(function (z) { return z.id === ref; })[0];
        var items = ((rc && rc.mids) || []).map(function (k) { return db.media[k]; }).filter(Boolean).sort(function (x, y) { return x.t - y.t; });
        if (items.length) audit('view_media', { officer: sess.officer, target: (a.refType === 'sos' ? 'sos:' : 'report:') + ref.slice(0, 8), detail: items.length + ' file(s)' });
        return { items: items.map(function (m) { return { id: m.id, kind: m.kind, mime: m.mime, bytes: m.bytes, dur: m.dur, t: m.t, exp: m.exp, url: 'api/media/' + m.id + '?e=' + e + '&s=' + hmacHex(db.settings.gateSecret, 'media|' + m.id + '|' + e) }; }) };
      },
      /* ---- Safety Brief: a one-page, no-names summary for the principal, compared with the period before */
      safetyBrief: function (a) {
        auth(a.token);
        var cfg = db.settings, now = clock(), days = Math.max(1, Math.min(90, Math.round(+a.days) || 7)), P = days * DAY;
        function med(l) { if (!l.length) return null; l.sort(function (x, y) { return x - y; }); return l[l.length >> 1]; }
        function win(from, to) {
          var m = { trips: 0, students: 0, returns: 0, onTime: 0, late: 0, sos: 0, sosClaimed: 0, sosUnclaimed: 0, reports: 0, reportsClosed: 0, unverified: 0, escorts: 0, files: 0 }, uniq = {}, open = {}, claimS = [], replyM = [], grid = {};
          db.events.forEach(function (e) {
            if (e.type === 'out') { open[e.matric] = { ex: e.expectedReturn || null }; if (e.t >= from && e.t < to) { m.trips++; uniq[e.matric] = 1; if (e.source === 'no-scan' || (e.flags || []).some(function (f) { return f === 'gate-invalid' || f === 'gate-stale'; })) m.unverified++; } }
            else if (e.type === 'extend' && open[e.matric] && e.expectedReturn) open[e.matric].ex = e.expectedReturn;
            else if (e.type === 'in' && open[e.matric]) { var o = open[e.matric]; delete open[e.matric]; if (e.t >= from && e.t < to) { m.returns++; if (o.ex) { if (e.t <= o.ex + cfg.graceMin * MIN) m.onTime++; else m.late++; } } }
          });
          m.students = Object.keys(uniq).length;
          db.sos.forEach(function (x) { if (x.t < from || x.t >= to || x.drill) return; m.sos++; var c = db.claims['sos:' + x.id]; if (c) { m.sosClaimed++; claimS.push(Math.max(0, Math.round((c.at - x.t) / 1000))); } else if (!db.resolutions['sos:' + x.id]) m.sosUnclaimed++; if (x.lat != null) { var k = x.lat.toFixed(3) + ',' + x.lng.toFixed(3); grid[k] = grid[k] || { lat: +x.lat.toFixed(3), lng: +x.lng.toFixed(3), n: 0 }; grid[k].n++; } });
          db.reports.forEach(function (r) { if (r.t < from || r.t >= to) return; m.reports++; if (r.status === 'closed') m.reportsClosed++; var f = (r.notes || []).map(function (n) { return n.t; }).sort(function (x, y) { return x - y; })[0]; if (f) replyM.push(Math.max(0, Math.round((f - r.t) / MIN))); if (r.lat != null) { var k = r.lat.toFixed(3) + ',' + r.lng.toFixed(3); grid[k] = grid[k] || { lat: +r.lat.toFixed(3), lng: +r.lng.toFixed(3), n: 0 }; grid[k].n++; } });
          Object.keys(db.escorts).forEach(function (k) { var e = db.escorts[k]; if (e.t >= from && e.t < to) m.escorts++; });
          Object.keys(db.media).forEach(function (k) { var q = db.media[k]; if (q.t >= from && q.t < to) m.files++; });
          m.onTimePct = (m.onTime + m.late) ? Math.round(100 * m.onTime / (m.onTime + m.late)) : null;
          m.medianClaimSec = med(claimS); m.medianReplyMin = med(replyM);
          m.hotspots = Object.keys(grid).map(function (k) { return grid[k]; }).sort(function (x, y) { return y.n - x.n; }).slice(0, 3);
          return m;
        }
        var cur = win(now - P, now), prev = win(now - 2 * P, now - P), attention = [], staleOpen = 0;
        db.reports.forEach(function (r) { if (r.status !== 'closed' && now - r.t > 2 * DAY) staleOpen++; });
        if (cur.sosUnclaimed) attention.push(cur.sosUnclaimed + ' emergency alert(s) in this period were never claimed by an officer.');
        if (staleOpen) attention.push(staleOpen + ' concern report(s) have been open for more than 2 days.');
        if (cur.medianClaimSec != null && cur.medianClaimSec > 120) attention.push('Typical first response to an emergency was ' + Math.round(cur.medianClaimSec / 60 * 10) / 10 + ' minutes. Aim for under 2.');
        if (cur.onTimePct != null && cur.onTimePct < 80) attention.push('Only ' + cur.onTimePct + '% of students came back on time.');
        if (cur.trips && cur.unverified / cur.trips > 0.1) attention.push(Math.round(100 * cur.unverified / cur.trips) + '% of exits were not verified at the gate.');
        if (cur.hotspots[0] && cur.hotspots[0].n >= 3) attention.push('Repeated alerts or reports near one spot (' + cur.hotspots[0].n + '). Consider lighting or a patrol there.');
        return { school: cfg.schoolName || 'School', days: days, from: now - P, to: now, generatedAt: now, cur: cur, prev: prev, staleOpen: staleOpen, attention: attention, retentionDays: cfg.mediaDays };
      },
      /* ---- Live pulse: what is happening right now, for the desk graph */
      pulse: function (a) {
        auth(a.token);
        var now = clock(), tz = db.settings.tzOffsetMin, outNow = methods.board({ token: a.token }).counts.outside, bars = [], i;
        var B5 = 5 * MIN, start5 = Math.floor(now / B5) * B5 - 23 * B5;
        for (i = 0; i < 24; i++) bars.push({ t: start5 + i * B5, out: 0, inn: 0 });
        var step = 30 * MIN, N = 48, net = []; for (i = 0; i < N; i++) net.push(0);
        var cut = now - 24 * HOUR, older = 0, today = { out: 0, inn: 0, sos: 0, reports: 0 }, dayStart = Date.UTC(+fmtLocal(now, tz).slice(0, 4), +fmtLocal(now, tz).slice(5, 7) - 1, +fmtLocal(now, tz).slice(8, 10)) - tz * MIN;
        for (i = db.events.length - 1; i >= 0 && older < 300; i--) {
          var e = db.events[i]; if (e.t < cut) { older++; continue; } if (e.t > now) continue;
          var d = e.type === 'out' ? 1 : e.type === 'in' ? -1 : 0;
          if (d) { net[Math.min(N - 1, Math.floor((e.t - cut) / step))] += d; if (e.t >= start5) { var bi = Math.floor((e.t - start5) / B5); if (bars[bi]) { if (d > 0) bars[bi].out++; else bars[bi].inn++; } } if (e.t >= dayStart) { if (d > 0) today.out++; else today.inn++; } }
          else if (e.type === 'sos' && e.t >= dayStart) today.sos++;
        }
        for (i = db.reports.length - 1; i >= 0 && db.reports[i].t >= dayStart; i--) today.reports++;
        var series = [], run = outNow; for (i = N - 1; i >= 0; i--) { series.unshift({ t: cut + (i + 1) * step, outside: Math.max(0, run) }); run -= net[i]; }
        var cs = [], open = 0; db.sos.forEach(function (x) { if (x.t < cut) return; var c = db.claims['sos:' + x.id]; if (c) cs.push(Math.max(0, Math.round((c.at - x.t) / 1000))); else if (!db.resolutions['sos:' + x.id]) open++; });
        cs.sort(function (p, q) { return p - q; });
        return { now: now, outside: outNow, series: series, bars: bars, today: today, peak: series.reduce(function (m, p) { return Math.max(m, p.outside); }, 0), medianClaimSec: cs.length ? cs[cs.length >> 1] : null, sosOpen: open };
      },
      /* ---- My Safety: a student's own journey (never anyone else's) */
      myStats: function (a) {
        var m = normMatric(a.matric), s = db.students[m];
        if (!s || !s.deviceId || s.deviceId !== str(a.deviceId, 64)) fail('forbidden', 'Open this on the phone you registered with');
        var evs = (bucket(m).events || []).slice(), tz = db.settings.tzOffsetMin, now = clock(), grace = db.settings.graceMin * MIN;
        var trips = 0, on = 0, late = 0, streak = 0, best = 0, open = null, walks = 0, outMs = 0, perDay = {}, d;
        for (d = 6; d >= 0; d--) perDay[fmtLocal(now - d * DAY, tz).slice(0, 10)] = 0;
        evs.forEach(function (e) {
          if (e.type === 'out') { open = { t: e.t, ex: e.expectedReturn || null }; trips++; var k = fmtLocal(e.t, tz).slice(0, 10); if (k in perDay) perDay[k]++; }
          else if (e.type === 'extend' && open && e.expectedReturn) open.ex = e.expectedReturn;
          else if (e.type === 'in' && open) { if (open.ex) { if (e.t <= open.ex + grace) { on++; streak++; if (streak > best) best = streak; } else { late++; streak = 0; } } outMs += Math.max(0, e.t - open.t); open = null; }
          else if (e.type === 'walk_end') walks++;
        });
        var rep = db.reports.filter(function (r) { return r.matric === m; }), helped = rep.filter(function (r) { return r.status === 'closed'; }).length;
        var hz = db.hazards.filter(function (h) { return (h.reporters || []).indexOf(m) >= 0; }).length, ideas = db.placeIdeas.filter(function (x) { return x.by.indexOf(m) === 0; }).length;
        var days = Math.max(1, Math.floor((now - (s.registeredAt || s.createdAt || now)) / DAY));
        var ms = [['first', 'First trip logged', trips >= 1], ['on5', '5 on-time returns', on >= 5], ['on25', '25 on-time returns', on >= 25], ['str3', '3 on time in a row', best >= 3], ['str7', '7 on time in a row', best >= 7], ['walk', 'First safe walk finished', walks >= 1], ['rep', 'A report you sent was handled', helped >= 1], ['helper', 'Helped the community (hazard or place)', hz + ideas >= 1]];
        return { name: s.name, trips: trips, onTime: on, late: late, onTimePct: (on + late) ? Math.round(100 * on / (on + late)) : null, streak: streak, bestStreak: best, walks: walks, reports: rep.length, reportsHandled: helped, helped: hz + ideas, hoursOut: Math.round(outMs / HOUR * 10) / 10, week: Object.keys(perDay).map(function (k) { return { day: k, n: perDay[k] }; }), daysWithUs: days, milestones: ms.map(function (x) { return { id: x[0], label: x[1], done: x[2] }; }), nextMilestone: (ms.filter(function (x) { return !x[2]; })[0] || [0, ''])[1] };
      },
      reportEvidence: function (a) {
        var sess = auth(a.token), r = db.reports.filter(function (x) { return x.id === a.id; })[0]; if (!r || !r.evidence) fail('not-found', 'No picture');
        audit('view_evidence', { officer: sess.officer, target: r.ref }); return { image: r.evidence };
      },
      /* The reporter (even an anonymous one) follows a case with the reference number only. Staff replies marked public are shown. */
      trackReport: function (a) {
        var ref = str(a.ref, 16).toUpperCase(), r = db.reports.filter(function (x) { return x.ref === ref; })[0];
        if (!r || r.anon && sha256Hex(String(r.id) + ':' + String(a.anonKey || '')) !== r.anonKey) fail('not-found', 'No report with that number');
        var sgt = reportStages(r); return { ref: r.ref, label: REPORT_LABEL[r.cat], status: r.status, t: r.t, stage: sgt.stage, steps: sgt.steps, updates: r.notes.filter(function (n) { return n.pub; }).map(function (n) { return { t: n.t, text: n.text }; }) };
      },
      /* ---- safe points and risk areas (admin sets them, every student phone keeps a copy for offline use) */
      saveSafePoint: function (a) {
        var sess = adminOnly(a.token), p = a.point || {}, name = str(p.name, 80);
        if (name.length < 2) fail('bad-name', 'Enter a name');
        if (!isNum(p.lat) || !isNum(p.lng) || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180) fail('bad-location', 'Set the map position');
        var type = ['security', 'gate', 'clinic', 'police', 'fire', 'haven', 'assembly'].indexOf(p.type) >= 0 ? p.type : 'haven';
        if (db.safePoints.length >= 300 && !db.safePoints.some(function (x) { return x.id === p.id; })) fail('too-many');
        var id = str(p.id, 40) || (type + '-' + rnd(4)), rec = { id: id, type: type, name: name, lat: p.lat, lng: p.lng, note: str(p.note, 160), phone: str(p.phone, 24) };
        var i = db.safePoints.findIndex(function (x) { return x.id === id; }); if (i >= 0) db.safePoints[i] = rec; else db.safePoints.push(rec);
        audit('save_safepoint', { officer: sess.officer, target: id }); save(); return { ok: true, safePoints: db.safePoints };
      },
      deleteSafePoint: function (a) {
        var sess = adminOnly(a.token), id = str(a.id, 40); db.safePoints = db.safePoints.filter(function (x) { return x.id !== id; });
        audit('delete_safepoint', { officer: sess.officer, target: id }); save(); return { ok: true, safePoints: db.safePoints };
      },
      saveRiskZone: function (a) {
        var sess = adminOnly(a.token), z = a.zone || {}, name = str(z.name, 80);
        if (name.length < 2) fail('bad-name', 'Enter a name');
        if (!isNum(z.lat) || !isNum(z.lng) || Math.abs(z.lat) > 90 || Math.abs(z.lng) > 180) fail('bad-location', 'Set the map position');
        var hm = /^([01]\d|2[0-3]):[0-5]\d$/, from = hm.test(z.from) && hm.test(z.until) ? z.from : '', until = from ? z.until : '';
        if (db.riskZones.length >= 200 && !db.riskZones.some(function (x) { return x.id === z.id; })) fail('too-many');
        var id = str(z.id, 40) || ('zone-' + rnd(4)), rec = { id: id, name: name, lat: z.lat, lng: z.lng, radiusM: isNum(z.radiusM) ? Math.max(30, Math.min(3000, Math.round(z.radiusM))) : 150, reason: str(z.reason, 120), from: from, until: until };
        var i = db.riskZones.findIndex(function (x) { return x.id === id; }); if (i >= 0) db.riskZones[i] = rec; else db.riskZones.push(rec);
        audit('save_riskzone', { officer: sess.officer, target: id }); save(); return { ok: true, riskZones: db.riskZones };
      },
      deleteRiskZone: function (a) {
        var sess = adminOnly(a.token), id = str(a.id, 40); db.riskZones = db.riskZones.filter(function (x) { return x.id !== id; });
        audit('delete_riskzone', { officer: sess.officer, target: id }); save(); return { ok: true, riskZones: db.riskZones };
      },
      saveHazard: function (a) {
        var sess = auth(a.token), h = a.hazard || {};
        if (!HAZARD_KINDS[h.kind]) fail('bad-kind', 'Choose what is wrong');
        if (!isNum(h.lat) || !isNum(h.lng) || Math.abs(h.lat) > 90 || Math.abs(h.lng) > 180) fail('bad-location', 'Set the map position');
        var now = clock(), hrs = Math.max(1, Math.min(24 * 30, +h.hours || 24)), id = str(h.id, 40) || ('hz-' + rnd(5)), prev = db.hazards.filter(function (x) { return x.id === id; })[0];
        var rec = { id: id, kind: h.kind, lat: h.lat, lng: h.lng, radiusM: isNum(h.radiusM) ? Math.max(15, Math.min(1000, Math.round(h.radiusM))) : 50, note: str(h.note, 120), t: prev ? prev.t : now, until: now + hrs * HOUR, verified: true, by: sess.officer, reporters: prev ? prev.reporters : [] };
        if (prev) db.hazards[db.hazards.indexOf(prev)] = rec; else db.hazards.push(rec);
        audit('save_hazard', { officer: sess.officer, target: id }); save(); return { ok: true, id: id };
      },
      integrity: function (a) {
        auth(a.token); var out = [];
        Object.keys(db.integrity).forEach(function (m) {
          var r = db.integrity[m], st = db.students[m] || {}, sc = 0; Object.keys(r.n).forEach(function (k) { sc += (INTEG_W[k] || 5) * Math.min(r.n[k], 5); });
          if (st.deviceChanged) sc += 10; if (sc >= 10) out.push({ matric: m, name: st.name || m, score: sc, counts: r.n, last: r.last.slice(-3), at: r.at });
        });
        out.sort(function (x, y) { return y.score - x.score; }); return { list: out.slice(0, 40) };
      },
      placeIdeas: function (a) { auth(a.token); return { ideas: db.placeIdeas.map(function (x) { return { id: x.id, name: x.name, kind: x.kind, lat: x.lat, lng: x.lng, note: x.note, t: x.t, votes: x.by.length }; }) }; },
      reviewPlaceIdea: function (a) {
        var sess = auth(a.token), pi = db.placeIdeas.filter(function (x) { return x.id === str(a.id, 60); })[0]; if (!pi) fail('not-found');
        if (a.ok === false) db.placeIdeas = db.placeIdeas.filter(function (x) { return x !== pi; });
        else { if (str(a.name, 60).length >= 3) pi.name = str(a.name, 60); addCommunityPlace(pi, sess.officer); }
        audit(a.ok === false ? 'reject_place_idea' : 'approve_place_idea', { officer: sess.officer, target: pi.id }); save(); return { ok: true };
      },
      verifyHazard: function (a) {
        var sess = auth(a.token), h = db.hazards.filter(function (x) { return x.id === str(a.id, 40); })[0]; if (!h) fail('not-found');
        if (a.ok === false) db.hazards.splice(db.hazards.indexOf(h), 1); else { h.verified = true; h.by = sess.officer; h.until = Math.max(h.until, clock() + 12 * HOUR); }
        audit(a.ok === false ? 'dismiss_hazard' : 'verify_hazard', { officer: sess.officer, target: h.id }); save(); return { ok: true };
      },
      /* What is happening on the map right now. It shows emergencies, reports and escorts, not every student. Finding one student still goes through a logged reason (requestTrail). */
      liveMap: function (a) {
        auth(a.token); var now = clock();
        var sos = db.sos.filter(function (x) { return x.status === 'open' && x.lat != null; }).map(function (x) { var s2 = db.students[x.matric] || {}; return { id: x.id, matric: x.matric, name: s2.name || x.matric, phone: s2.phone || '', t: x.t, lat: x.lat, lng: x.lng, acc: x.acc, kind: x.kind || 'danger', message: x.message }; });
        var reps = db.reports.filter(function (r) { return r.status === 'open' && r.lat != null && now - r.t < 48 * HOUR; }).map(function (r) { return { id: r.id, ref: r.ref, label: REPORT_LABEL[r.cat], urgency: r.urgency, t: r.t, lat: r.lat, lng: r.lng, anon: !!r.anon }; });
        var esc = Object.keys(db.escorts).map(function (k) { return db.escorts[k]; }).filter(function (e) { return (e.status === 'open' || e.status === 'assigned') && e.lat != null; }).map(function (e) { return { id: e.id, name: e.name, to: e.to, lat: e.lat, lng: e.lng, status: e.status }; });
        return { now: now, campus: db.settings.campus, hazards: activeHazards(true), places: db.places.filter(function (p) { return p.lat != null; }).map(function (p) { return { id: p.id, name: p.name, lat: p.lat, lng: p.lng, danger: !!p.danger }; }), safePoints: db.safePoints, riskZones: db.riskZones, sos: sos, reports: reps, escorts: esc, hotspots: methods.hotspots(a).hotspots };
      },
      /* Where safety problems repeat: reports and emergencies with a position, grouped into areas of about 150 m, with the hours they happen at. */
      hotspots: function (a) {
        auth(a.token); var now = clock(), from = now - (Math.max(7, Math.min(365, +a.days || 90))) * 24 * HOUR, cells = {}, tz = db.settings.tzOffsetMin;
        function put(kind, lat, lng, t, label) {
          if (lat == null || t < from) return; var k = Math.round(lat / 0.0014) + ':' + Math.round(lng / 0.0014), c = cells[k] = cells[k] || { n: 0, lat: 0, lng: 0, kinds: {}, night: 0, last: 0 };
          c.n++; c.lat += lat; c.lng += lng; c.kinds[label] = (c.kinds[label] || 0) + 1; c.last = Math.max(c.last, t);
          var m = localMinutes(t, tz); if (m >= 17 * 60 + 30 || m < 6 * 60) c.night++;
        }
        db.reports.forEach(function (r) { put('r', r.lat, r.lng, r.t, REPORT_LABEL[r.cat]); });
        db.sos.forEach(function (x) { put('s', x.lat, x.lng, x.t, 'Emergency'); });
        var list = Object.keys(cells).map(function (k) { var c = cells[k], top = Object.keys(c.kinds).sort(function (x, y) { return c.kinds[y] - c.kinds[x]; })[0], lat = c.lat / c.n, lng = c.lng / c.n;
          var near = db.riskZones.some(function (z) { return haversine(lat, lng, z.lat, z.lng) <= z.radiusM + 150; });
          return { lat: lat, lng: lng, count: c.n, night: c.night, top: top, kinds: c.kinds, last: c.last, marked: near, advice: c.n >= 3 && c.night * 2 >= c.n ? 'Most of these happen after dark. Consider a risk area from 17:30, better lighting, or an escort point.' : c.n >= 3 ? 'Repeated reports here. Consider marking it as a risk area.' : 'Watching.' };
        }).filter(function (c) { return c.count >= 2; }).sort(function (x, y) { return y.count - x.count; }).slice(0, 12);
        return { hotspots: list, days: Math.round((now - from) / (24 * HOUR)) };
      },
      /* ---- shift log */
      addNote: function (a) {
        var sess = auth(a.token), text = str(a.text, 300); if (text.length < 2) fail('bad-text', 'Write a note');
        var m = a.matric ? normMatric(a.matric) : '';
        db.notes.push({ t: clock(), by: sess.officer, text: text, matric: m }); if (db.notes.length > 1000) db.notes.splice(0, db.notes.length - 1000);
        save(); return { ok: true };
      },
      listNotes: function (a) { auth(a.token); return db.notes.slice(-100).reverse(); },
      /* ---- guardian link (student side, proved by the device that registered) */
      makeGuardianLink: function (a) {
        var m = normMatric(a.matric), s = db.students[m], now = clock();
        if (!s || !s.deviceId || s.deviceId !== str(a.deviceId, 64)) fail('forbidden', 'Open this on the phone you registered with');
        var mine = Object.keys(db.guardians).filter(function (k) { return db.guardians[k].matric === m; });
        if (mine.length >= 5) fail('too-many', 'Stop an old link first');
        var token = rnd(20); db.guardians[sha256Hex(token)] = { matric: m, t: now, exp: now + 30 * DAY, label: str(a.label, 40), views: 0 }; save();
        return { token: token, expires: now + 30 * DAY };
      },
      revokeGuardianLinks: function (a) {
        var m = normMatric(a.matric), s = db.students[m];
        if (!s || !s.deviceId || s.deviceId !== str(a.deviceId, 64)) fail('forbidden', 'Open this on the phone you registered with');
        Object.keys(db.guardians).forEach(function (k) { if (db.guardians[k].matric === m) delete db.guardians[k]; }); delete db.subs[m]; save();
        return { ok: true };
      },
      guardianView: function (a) {
        var g = db.guardians[sha256Hex(String(a.token || ''))], now = clock();
        if (!g || g.exp < now) fail('invalid-link', 'This link is not valid any more. Ask the student for a new one.');
        var st = db.students[g.matric]; if (!st) fail('invalid-link', 'This link is not valid any more.');
        g.views++; g.lastView = now;
        var stat = statusOf(g.matric), o = stat.out, al = computeAlerts(now).filter(function (x) { return x.matric === g.matric && !x.ack && x.level === 'critical'; });
        var ps = o ? passCovering(g.matric, o, now) : null;
        return { name: (st.name || '').split(/\s+/)[0], school: db.settings.schoolName, securityPhone: db.settings.securityPhone, serverTime: now, tz: db.settings.tzOffsetMin,
          outside: stat.outside, since: stat.since || null, lastEventT: stat.lastEventT || null, destination: o ? (o.destination.name || o.destination.text) : null,
          expectedReturn: stat.expectedReturn || (ps ? ps.until : null) || null, alerted: al.length > 0, label: g.label, updates: parentBlock(g.matric, sha256Hex(String(a.token))) };
      },
      /* ---- roll call: "is everyone safe?" for fire, flood, unrest, severe weather */
      startRollCall: function (a) {
        var sess = auth(a.token), now = clock();
        if (db.rollcalls.some(function (r) { return !r.closed && now <= r.exp; })) fail('open-rollcall', 'A roll call is already running. Close it first.');
        var title = str(a.title, 60); if (title.length < 3) fail('bad-title', 'Say what it is for');
        var mins = Math.max(5, Math.min(240, Math.round(+a.minutes) || 30)), scope = a.scope === 'outside' ? 'outside' : 'all';
        var targets = Object.keys(db.students).filter(function (m) { return scope === 'all' || statusOf(m).outside; }).slice(0, 5000);
        if (!targets.length) fail('no-students', 'No students to ask');
        var rc = { id: 'rc_' + rnd(5), t: now, exp: now + mins * MIN, by: sess.officer, title: title, text: str(a.text, 200) || 'Please tell security you are safe. One tap.', scope: scope, targets: targets, replies: {}, sms: !!a.sms };
        db.rollcalls.push(rc); if (db.rollcalls.length > 40) db.rollcalls.splice(0, db.rollcalls.length - 40);
        targets.forEach(function (m) { notify('student', m, { title: '🔔 ' + title, body: rc.text, tag: 'rollcall', url: '/', urgent: true, require: true }, true); });
        audit('rollcall_start', { officer: sess.officer, detail: title + ' (' + targets.length + ' students)' }); save();
        return rcSummary(rc, now);
      },
      rollCallStatus: function (a) {
        auth(a.token); var now = clock(), r = a.id ? db.rollcalls.filter(function (x) { return x.id === a.id; })[0] : db.rollcalls[db.rollcalls.length - 1];
        return r ? rcSummary(r, now) : null;
      },
      closeRollCall: function (a) {
        var sess = auth(a.token), r = db.rollcalls.filter(function (x) { return x.id === a.id; })[0]; if (!r) fail('not-found', 'Not found');
        r.closed = clock(); audit('rollcall_close', { officer: sess.officer, detail: r.title + ': ' + Object.keys(r.replies).length + ' of ' + r.targets.length + ' answered' }); save(); return rcSummary(r, clock());
      },
      listRollCalls: function (a) { auth(a.token); var now = clock(); return db.rollcalls.slice(-15).reverse().map(function (r) { var x = rcSummary(r, now); delete x.help; delete x.silent; return x; }); },
      /* ---- parent text updates: the parent proves the phone with a code, then pays (if metered) from a wallet keyed to that phone */
      guardianSubscribe: function (a) {
        var key = sha256Hex(String(a.token || '')), g = db.guardians[key], now = clock();
        if (!g || g.exp < now) fail('invalid-link', 'This link is not valid any more.');
        if (!parentUpdatesOn()) fail('off', 'Text updates are not switched on at this school.');
        var ph = toIntl(a.phone); if (!ph) fail('bad-phone', 'Enter a valid phone number');
        var cur = db.subs[g.matric] || []; if (cur.length >= 3 && !cur.some(function (x) { return x.phone === ph; })) fail('too-many', 'Three phones are already getting updates for this student');
        var pv = db.pv[key] = db.pv[key] || { n: 0, t: now }; if (now - pv.t > HOUR) { pv.n = 0; pv.t = now; }
        if (++pv.n > 3) fail('slow-down', 'Too many codes. Try again in an hour.');
        var code = String(parseInt(rnd(4), 16) % 900000 + 100000);
        db['pvc'] = db['pvc'] || {}; db.pvc[key + ':' + ph] = { code: sha256Hex(code), exp: now + 10 * MIN, tries: 0 };
        sendSms(ph, 'SafeGate code ' + code + ' to get updates about ' + firstName(g.matric) + '. Ignore this if you did not ask. Reply STOP to opt out.', 'verify', g.matric, 'v:' + key + ':' + now, 'school');
        save(); return { ok: true, phone: maskPhone(ph) };
      },
      guardianVerify: function (a) {
        var key = sha256Hex(String(a.token || '')), g = db.guardians[key], now = clock();
        if (!g || g.exp < now) fail('invalid-link', 'This link is not valid any more.');
        var ph = toIntl(a.phone), c = ph && db.pvc && db.pvc[key + ':' + ph];
        if (!c || c.exp < now) fail('expired', 'Code expired. Ask for a new one.');
        if (++c.tries > 5) { delete db.pvc[key + ':' + ph]; fail('too-many', 'Too many tries. Ask for a new code.'); }
        if (sha256Hex(String(a.code || '').trim()) !== c.code) { save(); fail('bad-code', 'That code is not right'); }
        delete db.pvc[key + ':' + ph];
        var list = db.subs[g.matric] = db.subs[g.matric] || [], ex = list.filter(function (x) { return x.phone === ph; })[0];
        if (!ex) {
          ex = { id: 's' + rnd(4), phone: ph, link: key, t: now, on: { out: true, in: true, overdue: true, sos: true } }; list.push(ex);
          if (db.billing.enabled && db.settings.parentUpdatesPaidBy === 'parent' && db.settings.parentStarter > 0) creditWallet('g:' + ph, db.settings.parentStarter * db.billing.prices.sms.price, 'gift', 'gift:' + ph, 'Welcome gift: first texts free');
        }
        sendSms(ph, 'SafeGate: you will get a text when ' + firstName(g.matric) + ' leaves, gets back, is late, or presses emergency.' + (db.billing.enabled && db.settings.parentStarter > 0 && db.settings.parentUpdatesPaidBy === 'parent' ? ' Your first ' + db.settings.parentStarter + ' texts are free.' : '') + ' Reply STOP to stop.', 'parent-welcome', g.matric, 'w:' + ex.id, 'school');
        audit('parent_sub', { target: g.matric, detail: 'Parent updates added ' + maskPhone(ph) }); save();
        return { ok: true, updates: parentBlock(g.matric, key) };
      },
      guardianSettings: function (a) {
        var key = sha256Hex(String(a.token || '')), g = db.guardians[key]; if (!g || g.exp < clock()) fail('invalid-link', 'This link is not valid any more.');
        var x = (db.subs[g.matric] || []).filter(function (y) { return y.id === a.id && y.link === key; })[0]; if (!x) fail('not-found', 'Not found');
        ['out', 'in', 'overdue'].forEach(function (k) { if (a.on && k in a.on) x.on[k] = !!a.on[k]; }); save(); return { ok: true, updates: parentBlock(g.matric, key) };
      },
      guardianRemove: function (a) {
        var key = sha256Hex(String(a.token || '')), g = db.guardians[key]; if (!g) fail('invalid-link', 'This link is not valid any more.');
        db.subs[g.matric] = (db.subs[g.matric] || []).filter(function (y) { return !(y.id === a.id && y.link === key); }); save(); return { ok: true, updates: parentBlock(g.matric, key) };
      },
      myWatchers: function (a) {
        var m = normMatric(a.matric), s = db.students[m]; if (!s || !s.deviceId || s.deviceId !== str(a.deviceId, 64)) fail('forbidden', 'Open this on the phone you registered with');
        return (db.subs[m] || []).map(function (x) { return { id: x.id, phone: maskPhone(x.phone), t: x.t }; });
      },
      removeWatcher: function (a) {
        var m = normMatric(a.matric), s = db.students[m]; if (!s || !s.deviceId || s.deviceId !== str(a.deviceId, 64)) fail('forbidden', 'Open this on the phone you registered with');
        db.subs[m] = (db.subs[m] || []).filter(function (x) { return x.id !== a.id; }); audit('parent_unsub', { target: m, detail: 'Student removed a text watcher' }); save(); return { ok: true };
      },
      payPrepare: function (a) {
        var b = db.billing, wid, max, now = clock();
        if (!opts.payEnabled) fail('pay-off', 'Online payment is not set up');
        if (a.gtoken) {
          var key = sha256Hex(String(a.gtoken)), g = db.guardians[key]; if (!g || g.exp < now) fail('invalid-link', 'This link is not valid any more.');
          var x = (db.subs[g.matric] || []).filter(function (y) { return y.id === a.subId && y.link === key; })[0]; if (!x) fail('not-found', 'Verify your phone first');
          wid = 'g:' + x.phone; max = 2000000;
        } else { adminOnly(a.token); wid = 'school'; max = 500000000; }
        var kobo = Math.round(+a.naira * 100); if (!(kobo >= 10000 && kobo <= max)) fail('bad-amount', 'Amount must be between ' + (db.settings.currency || '₦') + '100 and ' + (db.settings.currency || '₦') + (max / 100));
        var open = Object.keys(b.pending).filter(function (r) { return b.pending[r].wid === wid && b.pending[r].st === 'open' && now - b.pending[r].t < 10 * MIN; }).length; if (open >= 5) fail('slow-down', 'Finish or wait for the earlier payments');
        var ref = 'sg' + rnd(8); b.pending[ref] = { wid: wid, kobo: kobo, t: now, st: 'open' }; save();
        return { ref: ref, kobo: kobo, wid: wid };
      },
      walletSummary: function (a) {
        adminOnly(a.token); var b = db.billing, now = clock(), day = now - DAY, mon = now - 30 * DAY, w = wallet('school');
        function sum(f, t) { return b.ledger.filter(function (e) { return e.w === 'school' && e.type === 'debit' && e.st !== 'refunded' && e.t > t && f(e); }).reduce(function (n, e) { return n - e.amt; }, 0); }
        var series = []; for (var i = 6; i >= 0; i--) { var a0 = now - (i + 1) * DAY, b0 = now - i * DAY; series.push(b.ledger.filter(function (e) { return e.w === 'school' && e.type === 'debit' && e.st !== 'refunded' && e.t > a0 && e.t <= b0; }).reduce(function (n, e) { return n - e.amt; }, 0)); }
        var avg = series.reduce(function (n, v) { return n + v; }, 0) / 7;
        return { enabled: b.enabled, bal: w.bal, reserve: b.reserve, lowAt: b.lowAt, today: sum(function () { return true; }, day), month: sum(function () { return true; }, mon), series: series, daysLeft: avg > 0 ? Math.max(0, Math.floor((w.bal + b.reserve) / avg)) : null,
          price: b.prices.sms.price, currency: db.settings.currency || '₦', payOnline: !!opts.payEnabled, instructions: db.settings.payInstructions || '', recent: b.ledger.filter(function (e) { return e.w === 'school'; }).slice(-30).reverse() };
      },
      /* ---- escorts */
      listEscorts: function (a) {
        auth(a.token);
        return Object.keys(db.escorts).map(function (k) { return db.escorts[k]; }).sort(function (x, y) { var o = { open: 0, assigned: 1, done: 2, cancelled: 3 }; return o[x.status] - o[y.status] || y.t - x.t; }).slice(0, 60);
      },
      updateEscort: function (a) {
        var sess = auth(a.token), e = db.escorts[str(a.id, 64)], now = clock(); if (!e) fail('not-found', 'Request not found');
        if (a.action === 'assign') { if (e.status !== 'open') fail('state', 'Already ' + e.status); e.status = 'assigned'; e.by = sess.officer; e.at = now; }
        else if (a.action === 'done') { if (e.status !== 'assigned' && e.status !== 'open') fail('state', 'Already ' + e.status); e.status = 'done'; e.doneAt = now; e.doneNote = str(a.note, 120); if (!e.by) { e.by = sess.officer; e.at = now; } }
        else if (a.action === 'cancel') { if (e.status === 'done' || e.status === 'cancelled') fail('state', 'Already ' + e.status); e.status = 'cancelled'; e.doneAt = now; e.doneNote = str(a.note, 120); }
        else fail('bad-action');
        if (a.action === 'assign') notify('student', e.matric, { title: 'Security escort', body: sess.officer + ' is coming to you.', tag: 'escort', url: '/', urgent: true }, true);
        audit('escort_' + a.action, { officer: sess.officer, target: e.matric, detail: e.from + ' to ' + e.to }); save();
        return { ok: true };
      },
      /* ---- visitors */
      visitorIn: function (a) {
        var sess = auth(a.token), name = str(a.name, 80), now = clock();
        if (name.length < 3) fail('bad-name', 'Enter the visitor\'s full name');
        var hm = a.hostMatric ? normMatricSoft(a.hostMatric) : '';
        var v = { id: 'v_' + rnd(5), name: name, phone: str(a.phone, 24), idType: str(a.idType, 24), idLast4: str(a.idNo, 40).replace(/\s/g, '').slice(-4), host: str(a.host, 80), hostMatric: hm && db.students[hm] ? hm : '', purpose: str(a.purpose, 80), badge: str(a.badge, 12), inT: now, outT: null, by: sess.officer };
        if (v.hostMatric && !v.host) v.host = db.students[v.hostMatric].name;
        db.visitors.push(v); audit('visitor_in', { officer: sess.officer, target: v.hostMatric, detail: name }); save();
        return { ok: true, id: v.id };
      },
      visitorOut: function (a) {
        var sess = auth(a.token), v = db.visitors.filter(function (x) { return x.id === a.id; })[0]; if (!v) fail('not-found', 'Visitor not found');
        if (!v.outT) { v.outT = clock(); v.outBy = sess.officer; save(); }
        return { ok: true };
      },
      listVisitors: function (a) {
        auth(a.token);
        return db.visitors.slice(-150).reverse();
      },
      /* ---- student data rights (device-proved) */
      pushSubscribeNative: function (a) {
        var s = db.students[normMatric(a.matric)];
        if (!s || !s.deviceId || s.deviceId !== str(a.deviceId, 64)) fail('forbidden', 'Open this on the phone you registered with');
        addSub2(db.push.students[s.matric] = db.push.students[s.matric] || [], cleanNative(a.fcm)); save(); return { ok: true };
      },
      pushSubscribeStaffNative: function (a) {
        var sess = auth(a.token), k = sess.officer.toLowerCase();
        addSub2(db.push.staff[k] = db.push.staff[k] || [], cleanNative(a.fcm)); save(); return { ok: true };
      },
      setMyDuty: function (a) {
        var sess = auth(a.token), ac = acctOf(sess.officer); if (!ac) fail('not-found');
        if ('phone' in a) { var ph = str(a.phone, 24); if (ph && !toIntl(ph)) fail('bad-phone', 'Enter a phone number like 0803 123 4567'); ac.phone = ph; }
        if ('onCall' in a) ac.onCall = !!a.onCall;
        if (ac.onCall && !ac.phone) fail('need-phone', 'Add your phone number first so security can text you');
        audit('duty', { officer: sess.officer, detail: ac.onCall ? 'on call' : 'off call' }); save();
        return { onCall: !!ac.onCall, phone: ac.phone || '' };
      },
      myDuty: function (a) { var sess = auth(a.token), ac = acctOf(sess.officer) || {}; return { onCall: !!ac.onCall, phone: ac.phone || '', smsEnabled: !!db.settings.smsEnabled }; },
      setStaffPhone: function (a) {
        var s = adminOnly(a.token), ac = acctOf(a.name); if (!ac) fail('not-found', 'No such officer');
        var ph = str(a.phone, 24); if (ph && !toIntl(ph)) fail('bad-phone', 'Phone number looks wrong'); ac.phone = ph; if (!ph) ac.onCall = false;
        audit('staff_phone', { officer: s.officer, target: ac.name }); save(); return { ok: true };
      },
      smsStatus: function (a) {
        adminOnly(a.token); var si = opts.smsInfo ? opts.smsInfo() : { configured: false, provider: '' };
        return { enabled: !!db.settings.smsEnabled, provider: si.provider, configured: si.configured, inbound: si.inbound || '', log: db.smsLog.slice(-40).reverse(), onCall: staffNumbers('oncall').length, sentToday: db.smsLog.filter(function (x) { return clock() - x.t < 86400000 && x.status === 'sent'; }).length, cap: db.settings.smsDailyCap };
      },
      smsTest: function (a) {
        var sess = auth(a.token), ac = acctOf(sess.officer) || {}; if (!ac.phone) fail('need-phone', 'Add your phone number first');
        if (!db.settings.smsEnabled) fail('sms-off', 'Text messages are switched off in Settings'); if (!opts.sms) fail('unsupported', 'Texting works on the server only');
        var id = sendSms(ac.phone, 'SafeGate test: texts reach this phone.', 'test', '', ''); return { ok: !!id };
      },
      smsInbound: function (a) {
        var t0 = clock(), digits = String(a.from || '').replace(/\D/g, ''), tail = digits.slice(-9), txt = str(a.text, 300);
        if (/^\s*(STOP|UNSUBSCRIBE|END|CANCEL)\b/i.test(txt) && tail.length >= 9) {
          var rm = 0; Object.keys(db.subs).forEach(function (k) { var n0 = db.subs[k].length; db.subs[k] = db.subs[k].filter(function (x) { return x.phone.slice(-9) !== tail; }); rm += n0 - db.subs[k].length; });
          if (rm) audit('parent_stop', { detail: 'Opted out by text ****' + tail.slice(-4) }); save(); return { ok: true, stopped: rm };
        }
        if (/^\s*SAFE\b/i.test(txt) && !/\bSOS\b/i.test(txt) && tail.length >= 9) {
          var sh = Object.keys(db.students).filter(function (k) { return String(db.students[k].phone || '').replace(/\D/g, '').slice(-9) === tail; });
          if (sh.length === 1) { var rcq = null; for (var qi = db.rollcalls.length - 1; qi >= 0; qi--) { var qr = db.rollcalls[qi]; if (!qr.closed && t0 <= qr.exp && qr.targets.indexOf(sh[0]) >= 0) { rcq = qr; break; } }
            if (rcq) { rcq.replies[sh[0]] = { t: t0, ok: true, note: 'by text', lat: null, lng: null }; save(); return { ok: true, safe: true }; } }
          return { ok: true, ignored: true };
        }
        if (!/\bSOS\b/i.test(txt)) return { ok: true, ignored: true };
        var st = null, hits = Object.keys(db.students).filter(function (k) { return tail.length >= 9 && String(db.students[k].phone || '').replace(/\D/g, '').slice(-9) === tail; });
        if (hits.length === 1) st = db.students[hits[0]];
        if (!st) { var toks = txt.toUpperCase().split(/[\s,;]+/); for (var i = 0; i < toks.length && !st; i++) if (db.students[toks[i]]) st = db.students[toks[i]]; }
        var m = /(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/.exec(txt), lat = m ? +m[1] : null, lng = m ? +m[2] : null;
        if (!st) {
          audit('sms_sos_unmatched', { detail: '+' + digits.slice(-4) + ': ' + txt.slice(0, 80) });
          notify('staff', '', { title: '🆘 SOS text from unknown number', body: '+' + digits + ': ' + txt.slice(0, 100), tag: 'sms-sos-' + digits, url: '/desk', urgent: true, require: true }, true);
          smsStaff('oncall', 'SOS text from unregistered number +' + digits + ': ' + txt.slice(0, 80), 'sos', '', 'u:' + digits + ':' + Math.floor(t0 / 600000));
          save(); return { ok: true, matched: false };
        }
        applyItem(st, { id: 'sms_' + sha256Hex(digits + '|' + txt + '|' + Math.floor(t0 / 60000)).slice(0, 20), type: 'sos', t: t0, lat: lat != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? lat : null, lng: lat != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? lng : null, message: 'SOS sent by text message' }, t0);
        audit('sms_sos', { target: st.matric, detail: 'Emergency received by text message' }); save();
        return { ok: true, matched: true, matric: st.matric };
      },
      pushSubscribe: function (a) {
        var s = db.students[normMatric(a.matric)];
        if (!s || !s.deviceId || s.deviceId !== str(a.deviceId, 64)) fail('forbidden', 'Open this on the phone you registered with');
        addSub2(db.push.students[s.matric] = db.push.students[s.matric] || [], cleanSub(a.sub)); save(); return { ok: true };
      },
      pushSubscribeStaff: function (a) {
        var sess = auth(a.token), k = sess.officer.toLowerCase();
        addSub2(db.push.staff[k] = db.push.staff[k] || [], cleanSub(a.sub)); save(); return { ok: true };
      },
      pushUnsubscribe: function (a) { if (a.token) auth(a.token); else { var s = db.students[normMatric(a.matric)]; if (!s || s.deviceId !== str(a.deviceId, 64)) fail('forbidden'); } dropSub(str(a.endpoint, 600)); save(); return { ok: true }; },
      pushTest: function (a) {
        var sess = auth(a.token), n = (db.push.staff[sess.officer.toLowerCase()] || []).length;
        notify('staff', '', { title: 'SafeGate test', body: 'Alerts reach this device.', tag: 'test', url: '/desk' }, false); return { devices: n, enabled: !!opts.notify };
      },
      pushStats: function (a) { adminOnly(a.token); var st = 0, sf = 0; Object.keys(db.push.students).forEach(function (k) { st += db.push.students[k].length; }); Object.keys(db.push.staff).forEach(function (k) { sf += db.push.staff[k].length; }); return { students: st, staff: sf, enabled: !!opts.notify }; },
      systemHealth: function (a) {
        adminOnly(a.token);
        var now = clock(), ev = db.events.length, pg = db.pings.length, al = computeAlerts(now), lastEv = ev ? db.events[ev - 1].t : 0;
        var si = opts.sysinfo ? opts.sysinfo() : null;
        return { time: now, students: Object.keys(db.students).length, events: ev, pings: pg, audit: db.audit.length, alerts: al.length, lastEventT: lastEv,
          staff: Object.keys(db.staff.accounts).length, pushDevices: { students: Object.keys(db.push.students).length, staff: Object.keys(db.push.staff).length },
          gateConfigured: !!db.settings.appUrl, campusSet: db.settings.campus.lat != null, securityPhone: !!db.settings.securityPhone, rosterSize: Object.keys(db.roster).length,
          auditOk: methods.verifyAudit({ token: a.token }).ok, server: si, pushEnabled: !!opts.notify };
      },
      backupNow: function (a) { adminOnly(a.token); if (!opts.backupNow) fail('unsupported', 'Automatic backups run on the server only'); return opts.backupNow(); },
      cardLookup: function (a) {
        auth(a.token); var P = cardPerson(a), st = statusOf(P.matric), now = clock();
        var last = lastEv(P.matric);
        return { matric: P.matric, name: P.s ? P.s.name : P.r.name, registered: !!(P.s && !P.s.unregistered), phone: P.s ? P.s.phone : (P.r && P.r.phone) || '',
          outside: !!st.outside, since: st.outside ? st.since : null, destination: st.outside && st.out ? st.out.destination && st.out.destination.name : '', expectedReturn: st.outside ? st.expectedReturn : null,
          direction: st.outside ? 'in' : 'out', justScanned: !!(last && now - last.t < 20000 && last.source === 'card') };
      },
      guardScan: function (a) {
        var sess = auth(a.token), P = cardPerson(a), now = clock(), m = P.matric, s = P.s;
        if (!s) {
          var rst = P.r; s = db.students[m] = { matric: m, name: rst.name, phone: rst.phone || '', emergency: rst.guardianPhone ? { name: rst.guardianName || 'Guardian', phone: rst.guardianPhone } : { name: '', phone: '' }, registeredAt: now, unregistered: true, residence: 'off' };
        }
        var outside = statusOf(m).outside, dir = a.direction === 'in' || a.direction === 'out' ? a.direction : outside ? 'in' : 'out';
        var last = lastEv(m);
        if (!a.force && !a.direction && last && now - last.t < 15000 && last.source === 'card') fail('duplicate', 'Just scanned (' + last.type.toUpperCase() + '). Scan again after a few seconds if this is a mistake.');
        var flags = []; if (dir === 'out' && outside) flags.push('already-out'); if (dir === 'in' && !outside) flags.push('no-exit-scan');
        var ev = { id: 'c_' + rnd(8), type: dir, matric: m, name: s.name, t: now, receivedAt: now, source: 'card', gate: 'card', flags: flags, note: str(a.note, 120) + ' [ID scan by ' + sess.officer + ']' };
        if (dir === 'out') {
          var dest = str(a.destination, 80); if (!dest) fail('no-destination', 'Choose where the student is going');
          var pl = a.placeId ? placeById(str(a.placeId, 40)) : null; if (pl && pl.danger) ev.flags.push('risky-destination');
          if (!pl && vagueDest(dest)) ev.flags.push('vague-destination');
          ev.destination = { placeId: pl ? pl.id : '', name: dest, text: '' }; ev.purpose = str(a.purpose, 40); ev.consentLoc = false; ev.companions = '';
          var mins = isNum(a.returnInMin) ? Math.max(10, Math.min(2880, a.returnInMin)) : 0; ev.expectedReturn = mins ? now + mins * 60000 : null;
        }
        addEvent(ev); audit('card_scan', { officer: sess.officer, target: m, detail: dir.toUpperCase() + (ev.destination ? ' → ' + ev.destination.name : '') }); save();
        return { ok: true, direction: dir, name: s.name, matric: m };
      },
      myCard: function (a) {
        var s = db.students[normMatric(a.matric)];
        if (!s || !s.deviceId || s.deviceId !== str(a.deviceId, 64)) fail('forbidden', 'Open this on the phone you registered with');
        return { card: cardTok(s.matric), name: s.name, matric: s.matric };
      },
      listCards: function (a) {
        adminOnly(a.token); var seen = {}, out = [], want = Array.isArray(a.matrics) ? a.matrics.map(normMatric) : null;
        Object.keys(db.students).concat(Object.keys(db.roster)).forEach(function (m) {
          if (seen[m] || (want && want.indexOf(m) < 0)) return; seen[m] = 1;
          var s = db.students[m], r = db.roster[m]; out.push({ matric: m, name: s ? s.name : r.name, card: cardTok(m), registered: !!(s && !s.unregistered) });
        });
        out.sort(function (x, y) { return x.name.localeCompare(y.name); }); return { school: db.settings.schoolName, cards: out.slice(0, 600), total: out.length };
      },
      reissueCard: function (a) {
        var sess = adminOnly(a.token), m = normMatric(a.matric); if (!db.students[m] && !db.roster[m]) fail('not-found', 'No such student');
        db.cardVer[m] = ((db.cardVer[m] || 0) + 1) % 1000; audit('reissue_card', { officer: sess.officer, target: m, detail: 'Old card no longer works' }); save(); return { card: cardTok(m) };
      },
      makeTransferCode: function (a) {
        var s = db.students[normMatric(a.matric)];
        if (!s || !s.deviceId || s.deviceId !== str(a.deviceId, 64)) fail('forbidden', 'Open this on the phone you registered with');
        var t0 = clock(), code = '', rb = rnd(6); for (var i = 0; i < 6; i++) code += parseInt(rb.substr(i * 2, 2), 16) % 10;
        db.transferCodes[s.matric] = { code: code, exp: t0 + 10 * 60000, tries: 0 };
        audit('transfer_code', { target: s.matric, detail: 'Student made a code to move to a new phone' }); save();
        return { code: code, exp: t0 + 10 * 60000 };
      },
      transferStatus: function (a) {
        var m = normMatric(a.matric), tr = db.transfers[m], s = db.students[m], d = str(a.deviceId, 64);
        if (s && s.deviceId === d) return { status: 'active' };
        if (tr && tr.deviceId === d) return { status: tr.status, note: tr.note || '' };
        return { status: 'none' };
      },
      listTransfers: function (a) {
        auth(a.token);
        return Object.keys(db.transfers).map(function (k) { var x = db.transfers[k], o = db.students[k]; return { matric: k, name: x.name, phone: x.phone, t: x.t, status: x.status, by: x.by || '', note: x.note || '', currentName: o ? o.name : '', currentPhone: o ? o.phone : '', emergency: o ? o.emergency : null }; })
          .sort(function (x, y) { return y.t - x.t; });
      },
      decideTransfer: function (a) {
        var sess = auth(a.token); if (sess.role === 'guard') fail('forbidden', 'Only officers can approve a new phone.');
        var m = normMatric(a.matric), tr = db.transfers[m]; if (!tr) fail('not-found', 'No request');
        tr.status = a.ok ? 'approved' : 'denied'; tr.by = sess.officer; tr.note = str(a.note, 120); tr.t = clock();
        audit(a.ok ? 'transfer_approve' : 'transfer_deny', { officer: sess.officer, target: m, detail: tr.note }); save();
        return { ok: true };
      },
      myData: function (a) {
        var m = normMatric(a.matric), st = db.students[m];
        if (!st || !st.deviceId || st.deviceId !== str(a.deviceId, 64)) fail('forbidden', 'Open this on the phone you registered with');
        var b = by.get(m), now = clock();
        audit('student_export', { target: m }); save();
        return { exportedAt: now, profile: { matric: m, name: st.name, phone: st.phone, residence: st.residence, emergency: st.emergency, registeredAt: st.registeredAt, consentLoc: !!st.consentLoc },
          consent: db.consents[m] || null, consentHistory: db.consentLog.filter(function (x) { return x.m === m; }), trips: b ? b.events.map(eventView) : [], locationPoints: b ? b.pings.map(function (p) { return { t: p.t, lat: p.lat, lng: p.lng, acc: p.acc, battery: p.battery }; }) : [],
          passes: Object.keys(db.passes).map(function (k) { return db.passes[k]; }).filter(function (x) { return x.matric === m; }),
          reports: db.reports.filter(function (r) { return r.matric === m; }).map(function (r) { return { t: r.t, type: REPORT_LABEL[r.cat], text: r.text, status: r.status, notes: r.notes }; }),
          escorts: Object.keys(db.escorts).map(function (k) { return db.escorts[k]; }).filter(function (x) { return x.matric === m; }),
          officerAccessLog: db.audit.filter(function (x) { return x.target === m; }).map(function (x) { return { t: x.t, officer: x.officer, action: x.action, reason: x.reason }; }) };
      },
      privacyInfo: function () {
        var c = db.settings;
        return { school: c.schoolName, controller: c.controllerName || c.schoolName, contact: c.privacyContact || c.securityPhone || '', policyVersion: c.policyVersion, free: freeMode(), text: c.policyText,
          retention: { locationDays: c.retentionDaysPings, tripDays: c.retentionDaysEvents, mediaDays: c.mediaDays, binDays: TRASH_DAYS }, hasPrivacyContact: !!c.privacyContact };
      },
      eraseMyAccount: function (a) {
        var m = normMatric(a.matric), st = db.students[m];
        if (!st || !st.deviceId || st.deviceId !== str(a.deviceId, 64)) fail('forbidden', 'Open this on the phone you registered with');
        if (normMatricSoft(a.confirm) !== m) fail('bad-confirm', 'Type your matric number to confirm');
        var open = db.sos.filter(function (x) { return x.matric === m && x.status === 'open'; }).length; if (open) fail('sos-open', 'You have an open emergency. Close it first.');
        var tag = 'erased-' + hmacHex(db.settings.cardSecret, m).slice(0, 8), n0 = db.pings.length;
        db.pings = db.pings.filter(function (p) { return p.matric !== m; });
        // safety records stay for the school's legal duty, but nothing in them points to you any more
        [db.events, db.reports, db.sos, db.help].forEach(function (arr) { (arr || []).forEach(function (x) { if (x.matric === m) { x.matric = tag; delete x.name; delete x.phone; delete x.dev; delete x.guardian; x.erased = true; } }); });
        Object.keys(db.grants).forEach(function (k) { if (k.indexOf(m + '|') === 0) delete db.grants[k]; });
        ['escorts', 'passes', 'transfers', 'transferCodes', 'consents'].forEach(function (k) { Object.keys(db[k] || {}).forEach(function (id) { var x = db[k][id]; if (id === m || (x && x.matric === m)) delete db[k][id]; }); });
        Object.keys(db.deviceMap || {}).forEach(function (d) { db.deviceMap[d] = db.deviceMap[d].filter(function (x) { return x !== m; }); if (!db.deviceMap[d].length) delete db.deviceMap[d]; });
        db.consentLog = db.consentLog.filter(function (x) { return x.m !== m; });
        delete db.students[m]; rebuild();
        audit('student_account_erased', { target: tag, detail: 'Student erased their own account (' + (n0 - db.pings.length) + ' location points removed)' }); save();
        return { ok: true };
      },
      guardianConsent: function (a) {
        var sess = auth(a.token), m = normMatric(a.matric), st = db.students[m]; if (!st) fail('not-found', 'No such student');
        st.guardianOk = !!a.ok; if (st.guardianOk) st.guardianAt = clock(); consentNote(m, 'parent or guardian agreement', st.guardianOk, sess.officer);
        audit('guardian_consent', { officer: sess.officer, target: m, detail: st.guardianOk ? 'Parent or guardian agreed' : 'Parent or guardian agreement removed' }); save(); return { ok: true, guardianOk: st.guardianOk };
      },
      eraseMyLocation: function (a) {
        var m = normMatric(a.matric), st = db.students[m];
        if (!st || !st.deviceId || st.deviceId !== str(a.deviceId, 64)) fail('forbidden', 'Open this on the phone you registered with');
        var n0 = db.pings.length; db.pings = db.pings.filter(function (p) { return p.matric !== m; }); rebuild();
        Object.keys(db.grants).forEach(function (k) { if (k.indexOf(m + '|') === 0) delete db.grants[k]; });
        audit('student_erase_location', { target: m, detail: (n0 - db.pings.length) + ' points' }); save();
        return { ok: true, removed: n0 - db.pings.length };
      },
      /* ---- daily report / roll call */
      dailyReport: function (a) {
        auth(a.token);
        var cfg = db.settings, tz = cfg.tzOffsetMin, now = clock(), ds = /^\d{4}-\d{2}-\d{2}$/.test(a.date || '') ? a.date : fmtLocal(now, tz).slice(0, 10);
        var y = +ds.slice(0, 4), mo = +ds.slice(5, 7), d = +ds.slice(8, 10), start = Date.UTC(y, mo - 1, d) - tz * MIN, end = start + DAY;
        var outs = 0, ins = 0, flagged = 0, unver = 0, walks = 0, sosL = [], dest = {}, lateR = [], hours = [];
        for (var h = 0; h < 24; h++) hours.push(0);
        db.events.forEach(function (e) {
          if (e.t < start || e.t >= end) return;
          if (e.type === 'out') { outs++; hours[Math.floor(localMinutes(e.t, tz) / 60)]++; var dn = e.destination && (e.destination.name || e.destination.text) || '?'; dest[dn] = (dest[dn] || 0) + 1; if ((e.flags || []).length) flagged++; if (e.source === 'no-scan' || (e.flags || []).some(function (f) { return /^gate-/.test(f); })) unver++; }
          else if (e.type === 'in') ins++;
          else if (e.type === 'walk_start') walks++;
          else if (e.type === 'sos') sosL.push({ t: e.t, name: e.name, matric: e.matric, note: e.note });
        });
        by.forEach(function (b, mm) {
          var open = null, ex = null;
          b.events.forEach(function (e) {
            if (e.type === 'out') { open = e; ex = e.expectedReturn || null; } else if (e.type === 'extend' && open && e.expectedReturn) ex = e.expectedReturn;
            else if (e.type === 'in' && open) { if (ex && e.t >= start && e.t < end && e.t > ex + cfg.graceMin * MIN) lateR.push({ name: e.name, matric: mm, minutes: Math.round((e.t - ex) / MIN) }); open = null; ex = null; }
          });
        });
        var outside = [];
        Object.keys(db.students).forEach(function (m) { var st = statusOf(m); if (!st.outside) return; var s = db.students[m], o = st.out; outside.push({ name: s.name, matric: m, phone: s.phone, residence: s.residence, emergency: s.emergency, destination: o.destination.name || o.destination.text, since: st.since, expectedReturn: st.expectedReturn || null }); });
        outside.sort(function (x, y) { return x.since - y.since; });
        var peak = 0; hours.forEach(function (v, i) { if (v > hours[peak]) peak = i; });
        var reps = db.reports.filter(function (r) { return r.t >= start && r.t < end; }).map(function (r) { return { t: r.t, label: REPORT_LABEL[r.cat], status: r.status, name: r.name }; });
        var pcs = Object.keys(db.passes).map(function (k) { return db.passes[k]; }).filter(function (x) { return x.t >= start && x.t < end; });
        return { date: ds, school: cfg.schoolName, generatedAt: now, tz: tz, outs: outs, ins: ins, flagged: flagged, unverified: unver, walks: walks, sos: sosL, lateReturns: lateR, reports: reps,
          passes: { requested: pcs.length, approved: pcs.filter(function (x) { return x.status === 'approved'; }).length, denied: pcs.filter(function (x) { return x.status === 'denied'; }).length },
          destinations: Object.keys(dest).map(function (k) { return { name: k, n: dest[k] }; }).sort(function (x, y) { return y.n - x.n; }).slice(0, 8), peakHour: outs ? peak : null, outsideNow: outside,
          notes: db.notes.filter(function (n) { return n.t >= start && n.t < end; }) };
      },

      /* ---- school roster (verified registration) */
      rosterCheck: function (a) {                       // public: used by the student app before registering
        var m; try { m = normMatric(a.matric); } catch (e) { return { ok: false, code: 'bad-matric', message: e.message }; }
        var r = rosterCheckFor(m, str(a.name, 80)); return r ? { ok: false, code: r.code, message: r.message } : { ok: true, onRoster: !!db.roster[m] };
      },
      importRoster: function (a) {
        var sess = adminOnly(a.token), rows = parseCsv(String(a.csv || '').slice(0, 4e6));
        if (rows.length < 2) fail('empty', 'The file has no rows');
        var head = rows[0].map(function (h) { return h.toLowerCase().replace(/[^a-z]/g, ''); });
        function col() { for (var i = 0; i < arguments.length; i++) { var x = head.indexOf(arguments[i]); if (x >= 0) return x; } return -1; }
        var cM = col('matric', 'matricno', 'matricnumber', 'regno', 'registrationnumber', 'studentid', 'id'), cN = col('name', 'fullname', 'studentname'), cL = col('level', 'year'),
          cH = col('hostel', 'residence', 'hall', 'room'), cP = col('phone', 'phonenumber', 'mobile'), cGN = col('guardianname', 'parentname', 'nextofkin', 'emergencyname'), cGP = col('guardianphone', 'parentphone', 'emergencyphone', 'nextofkinphone');
        if (cM < 0 || cN < 0) fail('bad-header', 'The first row must have columns named matric and name');
        if (a.replace) db.roster = {};
        var added = 0, updated = 0, skipped = 0, errors = [];
        rows.slice(1, 20001).forEach(function (r, i) {
          if (r.every(function (x) { return !x; })) return;
          var m; try { m = normMatric(r[cM]); } catch (e) { skipped++; if (errors.length < 8) errors.push('Row ' + (i + 2) + ': bad matric "' + str(r[cM], 30) + '"'); return; }
          var nm = str(r[cN], 80); if (nm.length < 3) { skipped++; if (errors.length < 8) errors.push('Row ' + (i + 2) + ': missing name'); return; }
          var rec = { name: nm, level: cL >= 0 ? str(r[cL], 12) : '', hostel: cH >= 0 ? str(r[cH], 40) : '', phone: cP >= 0 ? str(r[cP], 24) : '', guardianName: cGN >= 0 ? str(r[cGN], 80) : '', guardianPhone: cGP >= 0 ? str(r[cGP], 24) : '' };
          if (db.roster[m]) updated++; else added++; db.roster[m] = rec;
        });
        audit('import_roster', { officer: sess.officer, detail: added + ' added, ' + updated + ' updated, ' + skipped + ' skipped' }); save();
        return { added: added, updated: updated, skipped: skipped, errors: errors, total: Object.keys(db.roster).length };
      },
      rosterStatus: function (a) {
        var sess = auth(a.token), keys = Object.keys(db.roster), reg = 0, byH = {};
        keys.forEach(function (m) { var s = db.students[m], on = s && !s.unregistered; if (on) reg++; var h = db.roster[m].hostel || 'Not stated'; byH[h] = byH[h] || { name: h, total: 0, registered: 0 }; byH[h].total++; if (on) byH[h].registered++; });
        var extra = Object.keys(db.students).filter(function (m) { return !db.roster[m] && !db.students[m].unregistered; }).length;
        return { total: keys.length, registered: reg, notRegistered: keys.length - reg, notOnList: keys.length ? extra : 0, require: !!db.settings.requireRoster,
          hostels: Object.keys(byH).map(function (k) { return byH[k]; }).sort(function (x, y) { return (y.total - y.registered) - (x.total - x.registered); }).slice(0, 12), role: sess.role };
      },
      rosterMissing: function (a) {
        auth(a.token); var h = str(a.hostel, 40), out = [];
        Object.keys(db.roster).forEach(function (m) { var s = db.students[m]; if (s && !s.unregistered) return; var r = db.roster[m]; if (h && (r.hostel || 'Not stated') !== h) return; out.push({ matric: m, name: r.name, hostel: r.hostel, level: r.level, phone: r.phone || r.guardianPhone }); });
        return out.slice(0, 300);
      },
      clearRoster: function (a) { var sess = adminOnly(a.token); db.roster = {}; db.settings.requireRoster = false; audit('clear_roster', { officer: sess.officer }); save(); return { ok: true }; },

      /* ---- missing-person cases and welfare checks */
      welfare: function (a) {
        auth(a.token); var now = clock(), hrs = Math.max(1, Math.min(240, +a.hours || 12)), out = [];
        Object.keys(db.students).forEach(function (m) {
          var st = statusOf(m); if (!st.outside || now - st.since < hrs * HOUR) return;
          var s = db.students[m], lp = lastPing(m, 0);
          out.push({ matric: m, name: s.name, phone: s.phone, since: st.since, destination: st.out.destination.name || st.out.destination.text, lastPingT: lp ? lp.t : null, lastSeen: s.lastSeen || null, hasCase: db.cases.some(function (c) { return c.matric === m && c.status === 'open'; }) });
        });
        return out.sort(function (x, y) { return x.since - y.since; }).slice(0, 100);
      },
      openCase: function (a) {
        var sess = auth(a.token), m = normMatric(a.matric), s = db.students[m], now = clock(), reason = str(a.reason, 200);
        if (!s) fail('not-found', 'Student not found'); if (reason.length < 3) fail('reason', 'Say why you are opening the case');
        if (db.cases.some(function (c) { return c.matric === m && c.status === 'open'; })) fail('exists', 'A case is already open for this student');
        var stat = statusOf(m), b = by.get(m), lp = lastPing(m, 0), le = null;
        if (b) for (var i = b.events.length - 1; i >= 0; i--) if (b.events[i].type === 'out' || b.events[i].type === 'in') { le = b.events[i]; break; }
        var snap = { lastSeen: s.lastSeen || null, outside: stat.outside, since: stat.since || null, expectedReturn: stat.expectedReturn || null,
          lastScan: le ? { type: le.type, t: le.t, gate: le.gate, source: le.source } : null, destination: stat.outside ? (stat.out.destination.name || stat.out.destination.text) : null, companions: stat.outside ? (stat.out.companions || '') : '',
          lastPing: lp ? { t: lp.t, lat: lp.lat, lng: lp.lng, acc: lp.acc, battery: lp.battery } : null, deviceChanged: !!s.deviceChanged };
        var c = { id: 'c_' + rnd(4), matric: m, name: s.name, openedAt: now, openedBy: sess.officer, reason: reason, status: 'open', snapshot: snap, timeline: [{ t: now, by: sess.officer, text: 'Case opened: ' + reason }] };
        db.cases.push(c);
        db.grants[m + '|' + sess.officer] = { until: now + db.settings.trailAccessMin * MIN, reason: 'Missing person case' };
        audit('open_case', { officer: sess.officer, target: m, reason: reason });
        audit('trail_access', { officer: sess.officer, target: m, reason: 'Missing person case' }); save();
        return { id: c.id };
      },
      listCases: function (a) {
        auth(a.token);
        return db.cases.slice().sort(function (x, y) { return (x.status === 'open' ? 0 : 1) - (y.status === 'open' ? 0 : 1) || y.openedAt - x.openedAt; }).slice(0, 60).map(function (c) { return { id: c.id, matric: c.matric, name: c.name, status: c.status, openedAt: c.openedAt, openedBy: c.openedBy, reason: c.reason, outcome: c.outcome || '', closedAt: c.closedAt || null }; });
      },
      caseDetail: function (a) {
        var sess = auth(a.token), c = db.cases.filter(function (x) { return x.id === a.id; })[0]; if (!c) fail('not-found', 'Case not found');
        var now = clock(), s = db.students[c.matric] || {}, stat = statusOf(c.matric), b = by.get(c.matric), g = db.grants[c.matric + '|' + sess.officer], live = null, sys = [];
        var lp = lastPing(c.matric, 0);
        if (g && g.until > now && lp) live = { t: lp.t, lat: lp.lat, lng: lp.lng, acc: lp.acc, battery: lp.battery };
        if (b) b.events.forEach(function (e) { if (e.t >= c.openedAt && (e.type === 'in' || e.type === 'out' || e.type === 'sos' || e.type === 'reply')) sys.push({ t: e.t, by: 'System', text: e.type === 'in' ? 'Scanned IN at the gate' : e.type === 'out' ? 'Scanned OUT of the gate' : e.type === 'sos' ? 'Pressed the emergency button' : 'Replied to a check-in', system: true }); });
        if (lp && lp.t >= c.openedAt) sys.push({ t: lp.t, by: 'System', text: 'Phone reported its location' + (lp.battery != null ? ' (battery ' + lp.battery + '%)' : ''), system: true });
        var r = db.roster[c.matric];
        return { id: c.id, matric: c.matric, name: c.name, status: c.status, openedAt: c.openedAt, openedBy: c.openedBy, reason: c.reason, outcome: c.outcome || '', closedAt: c.closedAt || null, snapshot: c.snapshot,
          live: live, now: { outside: stat.outside, since: stat.since || null }, contacts: { student: s.phone, emergency: s.emergency || null, guardian: r && r.guardianPhone ? { name: r.guardianName, phone: r.guardianPhone } : null, hostel: (r && r.hostel) || s.residence || '' },
          school: db.settings.schoolName, securityPhone: db.settings.securityPhone, timeline: c.timeline.concat(sys).sort(function (x, y) { return x.t - y.t; }) };
      },
      caseNote: function (a) {
        var sess = auth(a.token), c = db.cases.filter(function (x) { return x.id === a.id; })[0]; if (!c) fail('not-found', 'Case not found');
        var t = str(a.text, 300); if (t.length < 2) fail('bad-text', 'Write a note');
        c.timeline.push({ t: clock(), by: sess.officer, text: t }); save(); return { ok: true };
      },
      closeCase: function (a) {
        var sess = auth(a.token), c = db.cases.filter(function (x) { return x.id === a.id; })[0]; if (!c) fail('not-found', 'Case not found');
        if (c.status !== 'open') fail('state', 'Case is already closed');
        var oc = ['found-safe', 'found-hurt', 'false-alarm', 'unresolved'].indexOf(a.outcome) >= 0 ? a.outcome : fail('bad-outcome', 'Choose an outcome'), note = str(a.note, 300), now = clock();
        c.status = 'closed'; c.outcome = oc; c.closedAt = now; c.timeline.push({ t: now, by: sess.officer, text: 'Case closed: ' + oc.replace(/-/g, ' ') + (note ? '. ' + note : '') });
        audit('close_case', { officer: sess.officer, target: c.matric, detail: oc }); save(); return { ok: true };
      },

      auditLog: function (a) {
        adminOnly(a.token);
        return db.audit.slice(-200).reverse();
      },
      verifyAudit: function (a) { adminOnly(a.token); return verifyChain(); }
    };

    function parseCsv(text) {
      var rows = [], row = [], cur = '', q = false, i, ch, delim = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : (text.split('\n')[0].indexOf('\t') >= 0 ? '\t' : ',');
      text = text.replace(/^\uFEFF/, '');
      for (i = 0; i < text.length; i++) {
        ch = text[i];
        if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
        else if (ch === '"') q = true;
        else if (ch === delim) { row.push(cur.trim()); cur = ''; }
        else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur.trim()); cur = ''; rows.push(row); row = []; }
        else cur += ch;
      }
      if (cur || row.length) { row.push(cur.trim()); rows.push(row); }
      return rows;
    }
    /* Scale: the live board is the same for every officer, so compute it once per 2 seconds and only when something changed. With 50 officers polling a big school this is the difference between one computation and fifty. */
    var rev = 0, boardMemo = null, READ_ONLY = { plansInfo: 1, pulse: 1, helpMine: 1, myStats: 1, safetyBrief: 1, mediaCheck: 1, board: 1, whoami: 1, config: 1, getSettings: 1, gateToken: 1, students: 1, records: 1, listVisitors: 1, listNotes: 1, liveMap: 1, hotspots: 1, integrity: 1, placeIdeas: 1, auditLog: 1, analytics: 1 };
    var boardCompute = methods.board;
    methods.board = function (a) {
      var sess0 = auth(a.token), nowc = clock();
      if (boardMemo && boardMemo.rev === rev && nowc - boardMemo.t >= 0 && nowc - boardMemo.t < 2000) { var c = {}; Object.keys(boardMemo.v).forEach(function (k) { c[k] = boardMemo.v[k]; }); c.officer = sess0.officer; c.role = sess0.role; return c; }
      var v = boardCompute(a); boardMemo = { rev: rev, t: nowc, v: v }; return v;
    };
    function rpc(name, args) {
      if (!Object.prototype.hasOwnProperty.call(methods, name)) fail('no-method', 'Unknown method');
      if (!READ_ONLY[name]) rev++;
      args = args && typeof args === 'object' ? args : {};
      if (args.token && !GUARD_OK[name]) {
        var gs; try { gs = auth(args.token); } catch (e) { gs = null; }
        if (gs && gs.role === 'guard') fail('forbidden', 'Gate guards cannot open this. Ask an officer.');
      }
      return methods[name](args);
    }
    var GUARD_OK = { mediaList: 1, whoami: 1, logout: 1, changePin: 1, board: 1, getSettings: 1, gateToken: 1, manualLog: 1, students: 1, records: 1, listVisitors: 1, visitorIn: 1, visitorOut: 1, addNote: 1, listNotes: 1, claimAlert: 1, login: 1, staffStatus: 1, pushSubscribeStaff: 1, pushSubscribeStaffNative: 1, setMyDuty: 1, myDuty: 1, cardLookup: 1, guardScan: 1, pushUnsubscribe: 1, pushTest: 1 };
    /* operator controls: never reachable through rpc; server.js exposes them only behind OPERATOR_KEY */

    /* ---- Progress a student can follow: sent, received, seen by security, being handled, help on the way, resolved ---- */
    var REPORT_STEPS = [['sent', 'Sent'], ['received', 'Received'], ['seen', 'Seen by security'], ['handling', 'Security is on it'], ['dispatched', 'Help is on the way'], ['closed', 'Resolved']];
    function reportStages(r) {
      var at = { sent: r.t, received: r.receivedAt || r.t, seen: r.seenAt || null, handling: r.handlingAt || null, dispatched: r.dispatchAt || null, closed: r.status === 'closed' ? (r.closedAt || r.t) : null };
      var cur = 'received'; REPORT_STEPS.forEach(function (x) { if (at[x[0]]) cur = x[0]; });
      return { stage: cur, steps: REPORT_STEPS.map(function (x) { return { key: x[0], label: x[1], t: at[x[0]] }; }) };
    }
    var SOS_STEPS = [['sent', 'Alert sent'], ['received', 'Received by SafeGate'], ['responding', 'An officer is responding'], ['resolved', 'Handled']];
    function sosStages(x) {
      var c = db.claims['sos:' + x.id], at = { sent: x.t, received: x.receivedAt || x.t, responding: c ? c.at : null, resolved: x.status === 'resolved' ? (x.closedAt || x.t) : null };
      var cur = 'received'; SOS_STEPS.forEach(function (k) { if (at[k[0]]) cur = k[0]; });
      return { stage: cur, steps: SOS_STEPS.map(function (k) { return { key: k[0], label: k[1], t: at[k[0]] }; }) };
    }
    function tellStudent(r, title, body) { if (r.matric) notify('student', r.matric, { title: title, body: body, tag: 'rep-' + r.id, url: '/' }, false); }
    /* ---- Help requests: a student whose phone will not work asks ICT, with the phone's own check results attached ---- */
    var helpRate = {}, adSeen = {};
    var DIAG_KEYS = { ver: 24, ua: 140, online: 1, loc: 12, camera: 12, notif: 16, offline: 1, persist: 1, pending: 1, oldestMin: 1, skewSec: 1, battery: 1, charging: 1, standalone: 1, native: 1, lastSyncMin: 1, secure: 1, screen: 16, lang: 12, lock: 24 };
    function cleanDiag(d) { var o = {}; d = d && typeof d === 'object' ? d : {}; Object.keys(DIAG_KEYS).forEach(function (k) { var v = d[k], lim = DIAG_KEYS[k]; if (typeof v === 'string') o[k] = v.slice(0, lim === 1 ? 24 : lim); else if (typeof v === 'number' && isFinite(v)) o[k] = Math.round(v); else if (typeof v === 'boolean') o[k] = v; }); return o; }
    function helpHints(t) {
      var d = t.diag || {}, h = [], st = db.students[t.matric];
      if (!t.verified && st && st.deviceId) h.push({ tone: 'warn', text: 'Sent from a phone that is not the registered one. Check their ID card before you release the old phone.' });
      if (!t.verified && st && !st.deviceId) h.push({ tone: 'ok', text: 'This student has no phone registered. They should be able to sign in again.' });
      if (!t.verified && !st) h.push({ tone: 'warn', text: 'This matric number has no account. They may have mistyped it. Check the student list, or fix it with Fix matric number.' });
      if (d.online === false) h.push({ tone: 'warn', text: 'The phone had no internet when this was sent.' });
      if (typeof d.skewSec === 'number' && Math.abs(d.skewSec) > 120) h.push({ tone: 'bad', text: 'Phone clock is wrong by about ' + Math.round(Math.abs(d.skewSec) / 60) + ' minutes. Ask them to turn on Set time automatically. Wrong clocks break QR scans.' });
      if (d.loc === 'denied') h.push({ tone: 'bad', text: 'Location is blocked in the browser. Ask them to open site settings and choose Allow.' });
      if (d.notif === 'denied') h.push({ tone: 'warn', text: 'Notifications are blocked, so they will not receive alerts from security.' });
      if (d.pending > 0 && d.oldestMin > 60) h.push({ tone: 'warn', text: d.pending + ' records are stuck on the phone for ' + Math.round(d.oldestMin / 60) + ' hours. Ask them to open the app with good signal for a minute.' });
      if (d.battery != null && d.battery < 15 && !d.charging) h.push({ tone: 'warn', text: 'Battery was almost empty (' + d.battery + '%).' });
      if (d.persist === false) h.push({ tone: 'warn', text: 'The phone may clear the app\'s saved data when storage is low. Ask them to add SafeGate to the Home Screen.' });
      if (d.standalone === false) h.push({ tone: 'ok', text: 'Not installed on the Home Screen. Installing it makes the app steadier.' });
      if (d.ver && d.ver !== (db.settings.appVersion || d.ver)) h.push({ tone: 'warn', text: 'Old app version ' + d.ver + '. A reload or reinstall may fix it.' });
      return h;
    }
    function helpMineView(t) { return { id: t.id, t: t.t, message: t.message, status: t.status, replies: t.replies.map(function (r) { return { t: r.t, text: r.text, by: r.by }; }), unread: !!t.unread }; }
    /* ---- Recycle bin helpers ---- */
    var TRASH_DAYS = 30;
    function indexById(arr, id) { id = String(id || ''); for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return i; return -1; }
    function delReason(a) { var r = str(a.reason, 160); if (r.length < 3) fail('no-reason', 'Write a short reason (at least 3 letters). It is kept in the activity log.'); return r; }
    function trashDrop(x) { var d = x.data || {}; (d.mids || []).forEach(function (k) { if (db.media[k]) db.media[k].exp = 0; }); }
    function trashStore() { var cut = clock() - TRASH_DAYS * DAY; db.trash = (db.trash || []).filter(function (x) { if (x.t > cut) return true; trashDrop(x); return false; }); return db.trash; }
    function trashPut(kind, label, data, by, reason) { var id = 'T' + rnd(5); trashStore().push({ id: id, kind: kind, label: str(label, 120), t: clock(), by: by, reason: reason, data: data }); if (db.trash.length > 400) trashDrop(db.trash.shift()); return id; }
    function tomb(id) { if (!id) return; db.tomb[id] = clock(); ids.add(id); var ks = Object.keys(db.tomb); if (ks.length > 20000) { var cut = clock() - 90 * DAY; ks.forEach(function (k) { if (db.tomb[k] < cut) delete db.tomb[k]; }); } }
    /* ============ ICT console ============
       One private link opens it, no password. The link is the key: 20 random letters and digits (about 100 bits),
       stored only as a hash. Every action is written to the audit trail under the name of the link that did it.
       ICT can run the system but cannot see anyone's location, SOS, reports or evidence. */
    var ICT_CH = 'abcdefghijklmnopqrstuvwxyz0123456789';
    var ICT_ALLOW = { guardianConsent: 1, listStaff: 1, setStaffActive: 1, importRoster: 1, rosterStatus: 1, clearRoster: 1, auditLog: 1, verifyAudit: 1, smsStatus: 1, smsTest: 1, pushStats: 1, decideTransfer: 1, postNotice: 1, listNotices: 1, deleteNotice: 1, listTrash: 1, restoreTrash: 1, purgeTrash: 1 };
    var ICT_SETTINGS = { schoolName: 1, securityPhone: 1, appUrl: 1, tzOffsetMin: 1, graceMin: 1, silenceMin: 1, gatePeriodSec: 1, gateMode: 1, gatePolicy: 1, idPolicy: 1, freeForStudents: 1, controllerName: 1, privacyContact: 1, lockDevice: 1, requireRoster: 1, smsEnabled: 1, mediaOn: 1, mediaDays: 1, mediaDayMB: 1, mediaTotalMB: 1, mapTiles: 1, searchUrl: 1, routeUrl: 1, rotateSecret: 1, gatePoint: 1, posterRotate: 1 };
    function ictToken() { var out = ''; while (out.length < 20) { var b = rnd(40), i; for (i = 0; i < b.length - 1 && out.length < 20; i += 2) { var v = parseInt(b.substr(i, 2), 16); if (v < 252) out += ICT_CH.charAt(v % 36); } } return out; }
    function ictStore() { if (!db.ict || typeof db.ict !== 'object') db.ict = { links: {} }; if (!db.ict.links) db.ict.links = {}; return db.ict; }
    function ictHash(tok) { return sha256Hex('ict:' + tok); }
    function ictLinkFor(tok) { if (typeof tok !== 'string' || !/^[a-z0-9]{20}$/.test(tok)) return null; var l = ictStore().links[ictHash(tok)]; return l && !l.revoked ? l : null; }
    function ictActive() { var L = ictStore().links; return Object.keys(L).filter(function (k) { return !L[k].revoked; }); }
    function ictNewLink(name, by, preset) { var tok = /^[a-z0-9]{20}$/.test(preset || '') ? preset : ictToken(); ictStore().links[ictHash(tok)] = { id: 'L' + rnd(4), name: str(name, 40) || 'ICT team', created: clock(), by: by || 'system', lastUsed: 0, uses: 0, revoked: false }; audit('ict_link_create', { officer: by || 'system', target: str(name, 40) || 'ICT team' }); save(); return tok; }
    function ictBootstrap(preset) { return ictActive().length ? null : ictNewLink('ICT team', 'system', preset); }
    function ictReset() { var st = ictStore().links; Object.keys(st).forEach(function (k) { st[k].revoked = true; }); return ictNewLink('ICT team', 'recovery'); }
    function ictMask(p) { p = String(p || ''); return p.length > 4 ? p.slice(0, 3) + '•••••' + p.slice(-3) : p; }
    function csvCell(v) { v = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
    function csvOut(rows) { return rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n'); }
    function ictAsAdmin(who, fn) {
      var tok = rnd(24), h = sha256Hex(tok), now = clock();
      db.sessions[h] = { officer: who, exp: now + 120000, seen: now, ict: true };
      try { return fn(tok); } finally { delete db.sessions[h]; }
    }
    function randPin() { var out = '', b = rnd(16), i; for (i = 0; i < b.length - 1 && out.length < 8; i += 2) { var v = parseInt(b.substr(i, 2), 16); if (v < 250) out += String(v % 10); } while (out.length < 8) out += String(Math.floor(Math.random() * 10)); return out; }
    function ictStudentRow(m) {
      var st = db.students[m], dev = st.unregistered ? 'released' : st.deviceId ? 'locked' : 'none';
      return { matric: m, name: st.name || '', residence: st.residence || '', phone: ictMask(st.phone), registeredAt: st.registeredAt || 0, lastSeen: st.lastSeen || st.updatedAt || 0, device: dev, deviceChanged: !!st.deviceChanged, consent: !!st.consentLoc, onRoster: !!db.roster[m] };
    }
    var ICTH = {
      overview: function (a, L, who, ctx) {
        var now = clock(), c = ctx() || {}, ac = db.staff && db.staff.accounts ? Object.keys(db.staff.accounts).map(function (k) { return db.staff.accounts[k]; }) : [], reg = 0, rel = 0, chg = 0;
        Object.keys(db.students).forEach(function (m) { var st = db.students[m]; if (st.unregistered) rel++; else if (st.deviceId) reg++; if (st.deviceChanged) chg++; });
        var checks = ICTH.checkup({ clientTime: a.clientTime }, L, who, ctx).checks, bad = checks.filter(function (x) { return x.level === 'bad'; }).length, warn = checks.filter(function (x) { return x.level === 'warn'; }).length;
        return { school: db.settings.schoolName, time: now, version: c.version || '', link: { name: L.name }, setup: !!(db.staff && db.staff.accounts && Object.keys(db.staff.accounts).length),
          counts: { students: studentCount(), phonesActive: reg, phonesReleased: rel, deviceChanged: chg, staff: ac.length, staffActive: ac.filter(function (x) { return x.active; }).length, roster: Object.keys(db.roster).length, events: db.events.length, pings: db.pings.length, audit: db.audit.length },
          open: { reports: db.reports.filter(function (r) { return r.status !== 'closed'; }).length, sos: db.sos.filter(function (x) { return x.status === 'open'; }).length, transfers: Object.keys(db.transfers).filter(function (k) { return db.transfers[k].status === 'pending'; }).length, help: db.help.filter(function (x) { return x.status !== 'closed'; }).length },
          media: { files: Object.keys(db.media).length, bytes: db.mediaBytes || 0, capMB: db.settings.mediaTotalMB, days: db.settings.mediaDays },
          status: bad ? 'bad' : warn ? 'warn' : 'ok', bad: bad, warn: warn, checks: checks.filter(function (x) { return x.level !== 'ok'; }), server: c, links: ictActive().length };
      },
      checkup: function (a, L, who, ctx) {
        var c = ctx() || {}, now = clock(), out = [], s = db.settings;
        function add(level, id, title, detail, fix) { out.push({ level: level, id: id, title: title, detail: detail || '', fix: fix || '' }); }
        var hasStaff = !!(db.staff && db.staff.accounts && Object.keys(db.staff.accounts).length);
        hasStaff ? add('ok', 'admin', 'Security desk is set up') : add('bad', 'admin', 'No security desk administrator yet', 'Nobody can sign in to the security desk.', 'Open Staff and add an administrator.');
        if (hasStaff && !activeAdmins().length) add('bad', 'admin2', 'No active administrator', 'Every administrator account is switched off.', 'Open Staff and switch one on, or add a new administrator.');
        var url = s.appUrl || c.publicUrl || '';
        !url ? add('warn', 'url', 'Public address is not set', 'Share links and QR codes use whatever address was opened first.', 'Open Settings and enter the school address.') : /^https:/i.test(url) ? add('ok', 'url', 'Public address set (secure)') : add('warn', 'url', 'Public address is not secure (http)', url, 'Use an https address so phones allow location, camera and microphone.');
        var bk = (c.backups || [])[0];
        !c.backups ? 0 : !bk ? add('bad', 'backup', 'No automatic backup exists', '', 'Open Backups and press Back up now.') : (now - bk.t > 24 * HOUR ? add('warn', 'backup', 'Last backup is more than a day old', new Date(bk.t).toLocaleString(), 'Press Back up now. If it keeps happening, check disk space.') : add('ok', 'backup', 'Backups are running', 'Newest: ' + new Date(bk.t).toLocaleString()));
        if (c.disk) { var fr = c.disk.freeMB; fr < 200 ? add('bad', 'disk', 'Disk almost full', fr + ' MB free', 'Free space now. Lower the evidence retention days, or move to a bigger disk.') : fr < 1000 ? add('warn', 'disk', 'Disk space is getting low', fr + ' MB free', 'Plan more space or lower evidence retention days.') : add('ok', 'disk', 'Disk space is fine', fr + ' MB free'); }
        if (c.freeMemMB != null && c.freeMemMB < 80) add('warn', 'mem', 'Memory is low', c.freeMemMB + ' MB free', 'Restart the server, or use a server with more memory.');
        if (c.dbMB != null && c.dbMB > 250) add('warn', 'dbsize', 'Database file is large', c.dbMB + ' MB', 'Lower the location history retention days in Settings.');
        var hw = db.help.filter(function (x) { return x.status === 'open' && now - x.t > 24 * HOUR; }).length; if (hw) add('warn', 'help', hw + ' help request' + (hw > 1 ? 's have' : ' has') + ' waited over a day for an answer', 'Students who ask for help and get silence stop trusting the app.', 'Open People, then Help requests, and answer them.');
        var v = verifyChain(); v.ok ? add('ok', 'audit', 'Audit trail is intact') : add('bad', 'audit', 'Audit trail was changed or damaged', 'An entry no longer matches its seal.', 'Restore the last good backup and find out who had file access.');
        if (s.gateMode === 'static') (s.gatePoint && s.gatePoint.lat != null) ? add('ok', 'gatepoint', 'Gate point is set for the printed poster') : add('warn', 'gatepoint', 'The poster is in use but the exact gate spot is not set', 'Without it, a photo of the poster taken off-campus is harder to catch.', 'Stand at the gate and use "I am at the gate now" in Gate poster.');
        s.campus && s.campus.lat != null ? add('ok', 'campus', 'Campus location is set') : add('warn', 'campus', 'Campus location is not set', 'Gate and away-from-campus checks are weaker.', 'Ask the security desk admin to set it in Settings.');
        s.securityPhone ? add('ok', 'secphone', 'Security phone number is set') : add('warn', 'secphone', 'Security phone number is not set', 'The SOS call button has no number.', 'Open Settings and enter it.');
        var rn = Object.keys(db.roster).length; rn ? add('ok', 'roster', 'Student list loaded (' + rn + ')') : add(s.requireRoster ? 'bad' : 'warn', 'roster', 'No student list loaded', s.requireRoster ? 'Registration requires the list, so nobody can register.' : 'Anyone can register with any matric number.', 'Open Students and import the list.');
        if (c.mail) c.mail.configured ? add('ok', 'mail', 'Feedback email is on') : add('warn', 'mail', 'Feedback email is off', 'Feedback is saved but not emailed.', 'Run the email setup on the server (see Help).');
        if (c.fbUnsent) add('warn', 'fbq', c.fbUnsent + ' feedback message(s) not emailed yet', '', 'Open Messages and press Retry.');
        if (c.errors1h) add('warn', 'errs', c.errors1h + ' server error(s) in the last hour', '', 'Open Diagnostics to read them.');
        if (db.mediaBytes && s.mediaTotalMB && db.mediaBytes > 0.8 * s.mediaTotalMB * 1e6) add('warn', 'media', 'Evidence storage is over 80% of its limit', Math.round(db.mediaBytes / 1e6) + ' MB used', 'Lower the retention days or raise the limit in Settings.');
        var ct = Number(a.clientTime); if (ct && Math.abs(ct - now) > 2 * MIN) add('warn', 'clock', 'This server clock differs from your device by ' + Math.round(Math.abs(ct - now) / 60000) + ' min', '', 'Gate QR codes and curfew times rely on the clock. Fix the server time.');
        var pend = Object.keys(db.transfers).filter(function (k) { return db.transfers[k].status === 'pending'; }).length; if (pend) add('warn', 'transfers', pend + ' student(s) waiting for a new-phone approval', '', 'Open Students, then Phone requests.');
        return { checks: out, time: now };
      },
      students: function (a) {
        var q = str(a.q, 40).toLowerCase(), f = str(a.filter, 12), out = [];
        Object.keys(db.students).forEach(function (m) {
          if (out.length >= 150) return; var st = db.students[m];
          if (q && m.toLowerCase().indexOf(q) < 0 && (st.name || '').toLowerCase().indexOf(q) < 0) return;
          if (f === 'released' && !st.unregistered) return; if (f === 'changed' && !st.deviceChanged) return; if (f === 'noroster' && db.roster[m]) return;
          out.push(ictStudentRow(m));
        });
        out.sort(function (x, y) { return x.name.localeCompare(y.name); }); return { items: out, total: studentCount() };
      },
      studentRelease: function (a, L, who) {
        var m = normMatric(a.matric), st = db.students[m]; if (!st) fail('not-found', 'No such student');
        st.unregistered = true; st.deviceId = ''; st.deviceChanged = false; delete db.transfers[m];
        Object.keys(db.deviceMap || {}).forEach(function (d) { db.deviceMap[d] = db.deviceMap[d].filter(function (x) { return x !== m; }); if (!db.deviceMap[d].length) delete db.deviceMap[d]; });
        audit('ict_release_device', { officer: who, target: m, detail: str(a.note, 120) || 'Phone released: student can sign in on a new phone' }); save(); return { ok: true };
      },
      studentEdit: function (a, L, who) {
        var m = normMatric(a.matric), st = db.students[m]; if (!st) fail('not-found', 'No such student');
        var nm = str(a.name, 80); if (nm.length < 3) fail('bad-name', 'Enter the full name');
        var old = st.name; st.name = nm; if ('residence' in a) st.residence = str(a.residence, 60);
        audit('ict_edit_student', { officer: who, target: m, detail: 'name: ' + str(old, 40) + ' to ' + str(nm, 40) }); save(); return { ok: true };
      },
      studentEraseLocation: function (a, L, who) {
        var m = normMatric(a.matric); if (!db.students[m]) fail('not-found', 'No such student');
        var n0 = db.pings.length; db.pings = db.pings.filter(function (p) { return p.matric !== m; }); rebuild();
        Object.keys(db.grants).forEach(function (k) { if (k.indexOf(m + '|') === 0) delete db.grants[k]; });
        audit('ict_erase_location', { officer: who, target: m, detail: (n0 - db.pings.length) + ' points removed' + (a.note ? ': ' + str(a.note, 100) : '') }); save(); return { ok: true, removed: n0 - db.pings.length };
      },

      voices: function (a, L, who, ctx) {
        if (!a.quiet) audit('ict_view_voices', { officer: who, detail: 'Opened reports and SOS (read only)' });
        var now = clock(), mine = function (m) { var st = db.students[m]; return st ? { name: st.name || '', matric: m } : { name: '', matric: m }; };
        var reports = db.reports.slice().sort(function (x, y) { return (x.status === 'open' ? 0 : 1) - (y.status === 'open' ? 0 : 1) || y.t - x.t; }).slice(0, 150).map(function (r) {
          return { id: r.id, ref: r.ref, cat: r.cat, label: REPORT_LABEL[r.cat] || r.cat, text: r.text, t: r.t, status: r.status, urgency: r.urgency || 'normal', anon: !!r.anon, name: r.anon ? 'Anonymous' : r.name, matric: r.anon ? '' : r.matric, closedAt: r.closedAt || null,
            notes: (r.notes || []).length, files: r.mediaN || 0, handled: (r.notes || []).length > 0 || r.status === 'closed' };
        });
        var sos = db.sos.slice().sort(function (x, y) { return (x.status === 'open' ? 0 : 1) - (y.status === 'open' ? 0 : 1) || y.t - x.t; }).slice(0, 100).map(function (x) {
          var st = db.students[x.matric] || {};
          return { id: x.id, t: x.t, kind: x.kind || 'danger', message: x.message || '', status: x.status, name: st.name || '', matric: x.matric, closedAt: x.closedAt || null, closedBy: x.closedBy || '', repeats: x.repeats || 0, files: x.mediaN || 0, hadLocation: x.lat != null };
        });
        return { reports: reports, sos: sos, time: now };
      },
      insights: function (a, L, who, ctx) {
        var now = clock(), c = ctx() || {}, since = now - 30 * DAY, WK = 7 * DAY, i;
        var rp = db.reports.filter(function (r) { return r.t >= since; }), so = db.sos.filter(function (x) { return x.t >= since; });
        var byCat = {}; rp.forEach(function (r) { byCat[r.cat] = (byCat[r.cat] || 0) + 1; });
        var cats = Object.keys(byCat).map(function (k) { return { cat: k, label: REPORT_LABEL[k] || k, n: byCat[k] }; }).sort(function (x, y) { return y.n - x.n; });
        var closed = db.reports.filter(function (r) { return r.closedAt && r.t >= since; }), avgClose = closed.length ? Math.round(closed.reduce(function (n, r) { return n + (r.closedAt - r.t); }, 0) / closed.length / 36e5 * 10) / 10 : null;
        var wk = function (arr) { var out = []; for (i = 7; i >= 0; i--) { var a0 = now - i * WK - WK, b0 = now - i * WK; out.push(arr.filter(function (x) { return x.t > a0 && x.t <= b0; }).length); } return out; };
        var byKind = {}; so.forEach(function (x) { var k = x.kind || 'danger'; byKind[k] = (byKind[k] || 0) + 1; });
        var sClosed = so.filter(function (x) { return x.status === 'resolved' && x.closedAt; }), avgSos = sClosed.length ? Math.round(sClosed.reduce(function (n, x) { return n + (x.closedAt - x.t); }, 0) / sClosed.length / 6000) / 10 : null;
        var fb = (c.feedback || []).filter(function (f) { return f.t >= since; }), fk = {}, rd = [0, 0, 0, 0, 0], rs = 0, rn = 0;
        fb.forEach(function (f) { fk[f.kind] = (fk[f.kind] || 0) + 1; if (f.rating >= 1 && f.rating <= 5) { rd[f.rating - 1]++; rs += f.rating; rn++; } });
        var STOP = 'the a an and or but to of in on at for from with is are was were be been it its this that these those i me my we our you your he she they them his her their not no do did does have has had will would can could should am as by if so than then there here just very too also about into out up down over after before when what who which because them been get got really still dont cant didnt'.split(' '), wc = {}, texts = rp.map(function (r) { return r.text; }).concat(fb.map(function (f) { return f.message; }));
        texts.forEach(function (tx) { String(tx || '').toLowerCase().replace(/[^a-z\s']/g, ' ').split(/\s+/).forEach(function (w) { if (w.length > 3 && STOP.indexOf(w) < 0) wc[w] = (wc[w] || 0) + 1; }); });
        var themes = Object.keys(wc).filter(function (w) { return wc[w] >= 2; }).map(function (w) { return { w: w, n: wc[w] }; }).sort(function (x, y) { return y.n - x.n; }).slice(0, 14);
        var ideas = fb.filter(function (f) { return f.kind === 'idea' || f.kind === 'fix' || f.kind === 'broke'; }).slice(0, 12).map(function (f) { return { kind: f.kind, t: f.t, message: f.message, rating: f.rating || 0 }; });
        var loves = fb.filter(function (f) { return f.kind === 'love'; }).slice(0, 6).map(function (f) { return { t: f.t, message: f.message }; });
        var tips = [];
        if (cats[0]) tips.push('"' + cats[0].label + '" is the most reported concern in the last 30 days (' + cats[0].n + '). Ask the security desk what would prevent it.');
        var open = db.reports.filter(function (r) { return r.status === 'open' && now - r.t > 3 * DAY; }).length; if (open) tips.push(open + ' report(s) have been open for more than 3 days. Slow follow-up makes students stop reporting.');
        if (avgSos != null && avgSos > 20) tips.push('Emergency alerts take about ' + avgSos + ' minutes to close. Aim for under 10.');
        if (rn >= 3 && rs / rn < 3.5) tips.push('Average rating is ' + (Math.round(rs / rn * 10) / 10) + ' out of 5. Read the Fix and Broken messages first.');
        if (!fb.length) tips.push('No feedback in 30 days. Remind students about the feedback button, since silence usually means people have given up.');
        var anonN = rp.filter(function (r) { return r.anon; }).length; if (rp.length >= 5 && anonN / rp.length > 0.4) tips.push('Many reports are anonymous (' + Math.round(anonN / rp.length * 100) + '%). Students may not trust that reports are safe. Say more about how privacy works.');
        return { days: 30, reports: { total: rp.length, open: db.reports.filter(function (r) { return r.status === 'open'; }).length, cats: cats, weekly: wk(db.reports), avgCloseHrs: avgClose, anon: anonN, urgent: rp.filter(function (r) { return r.urgency === 'critical'; }).length },
          sos: { total: so.length, open: db.sos.filter(function (x) { return x.status === 'open'; }).length, byKind: byKind, weekly: wk(db.sos), avgCloseMin: avgSos, cancelled: so.filter(function (x) { return x.status === 'cancelled'; }).length },
          feedback: { total: fb.length, avg: rn ? Math.round(rs / rn * 10) / 10 : null, rated: rn, dist: rd, kinds: fk }, themes: themes, ideas: ideas, loves: loves, tips: tips };
      },
      studentProfile: function (a, L, who) {
        var m = normMatric(a.matric), st = db.students[m], rs = db.roster[m]; if (!st && !rs) fail('not-found', 'No such student');
        audit('ict_view_profile', { officer: who, target: m }); save();
        var b = by.get(m), tr = db.transfers[m], now = clock();
        var reps = db.reports.filter(function (r) { return r.matric === m; }), sos = db.sos.filter(function (x) { return x.matric === m; });
        return { minor: !!(st && st.minor), guardianOk: !!(st && st.guardianOk), matric: m, registered: !!st, name: st ? st.name : rs.name, phone: st ? st.phone : (rs.phone || ''), residence: st ? st.residence : (rs.hostel || ''), emergency: st && st.emergency ? st.emergency : { name: rs ? rs.guardianName : '', phone: rs ? rs.guardianPhone : '' },
          level: rs ? rs.level : '', roster: !!rs, registeredAt: st ? st.registeredAt || 0 : 0, lastSeen: st ? st.lastSeen || st.updatedAt || 0 : 0, device: !st ? 'none' : st.unregistered ? 'released' : st.deviceId ? 'locked' : 'none', deviceChanged: !!(st && st.deviceChanged), consent: !!(st && st.consentLoc),
          outside: st ? statusOf(m).outside : false, transfer: tr && tr.status === 'pending' ? { t: tr.t, phone: tr.phone } : null,
          counts: { events: b ? b.events.length : 0, reports: reps.length, sos: sos.length, openReports: reps.filter(function (r) { return r.status === 'open'; }).length },
          recent: b ? b.events.slice(-8).reverse().map(function (e) { return { type: e.type, t: e.t, source: e.source || '', note: e.note || '' }; }) : [], guardians: Object.keys(db.guardians).filter(function (k) { return db.guardians[k].matric === m; }).length };
      },
      studentCreate: function (a, L, who) {
        var m = normMatric(a.matric), nm = str(a.name, 80); if (nm.length < 3) fail('bad-name', 'Enter the full name');
        if (db.roster[m]) fail('exists', 'This matric number is already on the student list. Open the student and edit it instead.');
        db.roster[m] = { name: nm, level: str(a.level, 12), hostel: str(a.hostel, 40), phone: str(a.phone, 24), guardianName: str(a.guardianName, 80), guardianPhone: str(a.guardianPhone, 24) };
        audit('ict_create_student', { officer: who, target: m, detail: nm + ' added to the student list' }); save(); return { ok: true, matric: m };
      },
      studentUpdate: function (a, L, who) {
        var m = normMatric(a.matric), st = db.students[m], rs = db.roster[m]; if (!st && !rs) fail('not-found', 'No such student');
        var nm = 'name' in a ? str(a.name, 80) : null; if (nm !== null && nm.length < 3) fail('bad-name', 'Enter the full name');
        var ch = [];
        function setv(o, k, v, lab) { if (v == null || o[k] === v) return; ch.push(lab + ': "' + str(o[k], 30) + '" to "' + str(v, 30) + '"'); o[k] = v; }
        if (st) {
          if (nm !== null) setv(st, 'name', nm, 'name'); if ('residence' in a) setv(st, 'residence', str(a.residence, 60), 'residence'); if ('phone' in a) setv(st, 'phone', str(a.phone, 24), 'phone');
          if ('guardianName' in a || 'guardianPhone' in a) { st.emergency = st.emergency || { name: '', phone: '' }; if ('guardianName' in a) setv(st.emergency, 'name', str(a.guardianName, 80), 'guardian'); if ('guardianPhone' in a) setv(st.emergency, 'phone', str(a.guardianPhone, 24), 'guardian phone'); }
        }
        if (rs) { if (nm !== null) setv(rs, 'name', nm, 'list name'); if ('level' in a) setv(rs, 'level', str(a.level, 12), 'level'); if ('residence' in a) setv(rs, 'hostel', str(a.residence, 40), 'hostel'); if ('phone' in a) setv(rs, 'phone', str(a.phone, 24), 'list phone'); if ('guardianName' in a) setv(rs, 'guardianName', str(a.guardianName, 80), 'guardian'); if ('guardianPhone' in a) setv(rs, 'guardianPhone', str(a.guardianPhone, 24), 'guardian phone'); }
        if (!ch.length) return { ok: true, changed: 0 };
        audit('ict_edit_student', { officer: who, target: m, detail: ch.join('; ').slice(0, 220), reason: str(a.note, 120) }); save(); return { ok: true, changed: ch.length };
      },
      matricFix: function (a, L, who) {
        var from = normMatric(a.from), to = normMatric(a.to); if (from === to) fail('same', 'The two numbers are the same');
        if (!db.students[from] && !db.roster[from]) fail('not-found', 'No student has the old number');
        if (db.students[to] || db.roster[to]) fail('exists', 'The new number is already used by another student');
        if (db.sos.some(function (x) { return x.matric === from && x.status === 'open'; })) fail('sos-open', 'This student has an open emergency. Resolve it first.');
        ['students', 'roster', 'transfers', 'asks', 'subs'].forEach(function (k) { if (db[k][from]) { db[k][to] = db[k][from]; delete db[k][from]; if (k === 'students') db[k][to].matric = to; } });
        ['events', 'pings', 'sos', 'reports', 'cases', 'notes'].forEach(function (k) { db[k].forEach(function (x) { if (x.matric === from) x.matric = to; }); });
        Object.keys(db.passes).forEach(function (k) { if (db.passes[k].matric === from) db.passes[k].matric = to; });
        Object.keys(db.guardians).forEach(function (k) { if (db.guardians[k].matric === from) db.guardians[k].matric = to; });
        Object.keys(db.grants).forEach(function (k) { if (k.indexOf(from + '|') === 0) { db.grants[to + k.slice(from.length)] = db.grants[k]; delete db.grants[k]; } });
        Object.keys(db.deviceMap || {}).forEach(function (d) { db.deviceMap[d] = db.deviceMap[d].map(function (x) { return x === from ? to : x; }); });
        rebuild(); audit('ict_fix_matric', { officer: who, target: from, detail: 'changed to ' + to, reason: str(a.note, 120) }); save(); return { ok: true, matric: to };
      },
      fixStatus: function (a, L, who) {
        var m = normMatric(a.matric); if (!db.students[m]) fail('not-found', 'No such student');
        return ictAsAdmin(who, function (tok) { methods.manualLog({ token: tok, entry: { matric: m, direction: 'in', note: 'Status fixed by ICT: ' + str(a.note, 80) } }); return { ok: true }; });
      },
      guardianReset: function (a, L, who) {
        var m = normMatric(a.matric), n = 0; if (!db.students[m]) fail('not-found', 'No such student');
        Object.keys(db.guardians).forEach(function (k) { if (db.guardians[k].matric === m) { delete db.guardians[k]; n++; } }); delete db.subs[m];
        audit('ict_reset_guardian', { officer: who, target: m, detail: n + ' family link(s) removed' }); save(); return { ok: true, n: n };
      },
      staffUpdate: function (a, L, who) {
        var ac = acctOf(a.name); if (!ac) fail('not-found', 'No such staff member');
        var role = a.role === 'admin' ? 'admin' : a.role === 'guard' ? 'guard' : a.role === 'officer' ? 'officer' : null;
        if (role && role !== ac.role) { if (ac.role === 'admin' && ac.active && activeAdmins().length <= 1) fail('last-admin', 'This is the only active administrator. Make another one first.'); ac.role = role; killSessions(ac.name); }
        if ('phone' in a) ac.phone = str(a.phone, 24);
        if (a.unlock) { ac.fails = 0; ac.until = 0; }
        audit('ict_edit_staff', { officer: who, target: ac.name, detail: (role || ac.role) + (a.unlock ? ', unlocked' : '') }); save(); return { ok: true };
      },
      helpList: function (a, L, who) {
        var f = a.status === 'all' ? null : 'open', now = clock();
        var list = db.help.filter(function (x) { return !f || x.status !== 'closed'; }).slice().reverse().slice(0, 150);
        return { total: db.help.length, openCount: db.help.filter(function (x) { return x.status !== 'closed'; }).length, items: list.map(function (t) {
          var st = db.students[t.matric] || null;
          return { id: t.id, t: t.t, matric: t.matric, name: t.name || '(no name)', verified: t.verified, contact: t.contact, message: t.message, diag: t.diag, status: t.status, hints: helpHints(t), waitingMin: Math.round((now - t.t) / MIN),
            student: st ? { registered: !!st.deviceId, released: !!st.unregistered, phone: ictMask(st.phone) } : null, replies: t.replies };
        }) };
      },
      helpReply: function (a, L, who) {
        var t = db.help.filter(function (x) { return x.id === str(a.id, 24); })[0]; if (!t) fail('not-found', 'Request not found');
        var tx = str(a.text, 600); if (tx.length < 2 && !a.close) fail('too-short', 'Write your answer first');
        if (tx) { t.replies.push({ by: who.replace(/^ICT · /, ''), t: clock(), text: tx }); t.unread = true; }
        t.status = a.close ? 'closed' : 'answered';
        audit('ict_help_reply', { officer: who, target: t.matric || t.name || t.id, detail: a.close ? 'answered and closed' : 'answered' }); save(); return { ok: true };
      },
      transfers: function () {
        return { items: Object.keys(db.transfers).map(function (k) { var x = db.transfers[k]; return { matric: k, name: x.name, phone: ictMask(x.phone), t: x.t, status: x.status, by: x.by || '', note: x.note || '' }; }).sort(function (x, y) { return y.t - x.t; }).slice(0, 100) };
      },
      staffAdd: function (a, L, who) {
        if (!db.staff || !db.staff.accounts) fail('not-setup', 'Set up the first administrator first');
        var name = officerName(a.name), pin = randPin(), role = a.role === 'admin' ? 'admin' : a.role === 'guard' ? 'guard' : 'officer';
        if (acctOf(name)) fail('exists', 'There is already a staff member with that name');
        var ac = mkAccount(name, pin, role); db.staff.accounts[name.toLowerCase()] = ac; if (a.phone) ac.phone = str(a.phone, 24);
        audit('add_staff', { officer: who, target: name, detail: role }); save(); return { ok: true, name: name, role: role, pin: pin };
      },
      staffSetup: function (a, L, who) {
        if (db.staff && db.staff.accounts && Object.keys(db.staff.accounts).length) fail('already-setup', 'The security desk already has an administrator');
        var name = officerName(a.name), pin = randPin(); db.staff = { accounts: {} }; db.staff.accounts[name.toLowerCase()] = mkAccount(name, pin, 'admin');
        audit('setup', { officer: who, target: name, detail: 'first administrator created by ICT' }); save(); return { ok: true, name: name, role: 'admin', pin: pin };
      },
      staffReset: function (a, L, who) {
        var ac = acctOf(a.name); if (!ac) fail('not-found', 'No such staff member');
        var pin = randPin(); ac.salt = rnd(16); ac.hash = hashPin(pin, ac.salt); ac.fails = 0; ac.until = 0; killSessions(ac.name);
        audit('reset_pin', { officer: who, target: ac.name }); save(); return { ok: true, name: ac.name, pin: pin };
      },
      sessions: function () {
        return { items: Object.keys(db.sessions).map(function (k) { var x = db.sessions[k]; return { officer: x.officer, seen: x.seen, exp: x.exp }; }).sort(function (x, y) { return y.seen - x.seen; }).slice(0, 100) };
      },
      signOutAll: function (a, L, who) { var n = Object.keys(db.sessions).length; db.sessions = {}; audit('ict_sign_out_all', { officer: who, detail: n + ' session(s)' }); save(); return { ok: true, n: n }; },
      settingsGet: function () { var s = Object.assign({}, db.settings); delete s.gateSecret; delete s.cardSecret; delete s.gateSecretPrev; var o = {}; Object.keys(ICT_SETTINGS).forEach(function (k) { if (k in s) o[k] = s[k]; }); o.campus = s.campus; return o; },
      gatePoster: function () {
        var s = db.settings, tk = (function () { var b = s.gateId + '.S'; return b + '.' + hmacHex(s.gateSecret, b).slice(0, 12); })();
        return { policy: s.gatePolicy, idPolicy: s.idPolicy || 'none', token: tk, code: manualCode('S'), gateId: s.gateId, school: s.schoolName, mode: s.gateMode, gatePoint: s.gatePoint, campusSet: s.campus.lat != null, prevUntil: s.gatePrevUntil || 0 };
      },
      settingsSave: function (a, L, who) {
        var p = {}, src = a.settings || {}; Object.keys(ICT_SETTINGS).forEach(function (k) { if (k in src) p[k] = src[k]; });
        return ictAsAdmin(who, function (tok) { methods.saveSettings({ token: tok, settings: p }); return ICTH.settingsGet(); });
      },
      exportCsv: function (a, L, who) {
        var kind = str(a.kind, 10), rows;
        if (kind === 'students') { rows = [['matric', 'name', 'residence', 'phone_masked', 'registered', 'phone_state', 'location_consent', 'on_student_list']]; Object.keys(db.students).forEach(function (m) { var r = ictStudentRow(m); rows.push([r.matric, r.name, r.residence, r.phone, r.registeredAt ? new Date(r.registeredAt).toISOString() : '', r.device, r.consent ? 'yes' : 'no', r.onRoster ? 'yes' : 'no']); }); }
        else if (kind === 'staff') { rows = [['name', 'role', 'active', 'created', 'last_login']]; Object.keys(db.staff && db.staff.accounts || {}).forEach(function (k) { var x = db.staff.accounts[k]; rows.push([x.name, x.role, x.active ? 'yes' : 'no', new Date(x.created).toISOString(), x.lastLogin ? new Date(x.lastLogin).toISOString() : '']); }); }
        else if (kind === 'audit') { rows = [['time', 'who', 'action', 'target', 'detail']]; db.audit.forEach(function (e) { rows.push([new Date(e.t).toISOString(), e.officer, e.action, e.target, e.detail]); }); }
        else fail('bad-kind', 'Unknown export');
        audit('ict_export', { officer: who, detail: kind + ' (' + (rows.length - 1) + ' rows)' }); save();
        return { name: 'safegate-' + kind + '-' + new Date(clock()).toISOString().slice(0, 10) + '.csv', csv: '﻿' + csvOut(rows) };
      },
      backups: function (a, L, who, ctx) { var c = ctx() || {}; return { items: c.backups || [], everyHours: c.backupEveryHours || 0 }; },
      backupNow: function (a, L, who, ctx) { var c = ctx() || {}; if (!c.backupNow) fail('unsupported', 'Backups run on the server only'); var r = c.backupNow(); audit('backup', { officer: who, detail: r && r.name || '' }); save(); return r; },
      backupRestore: function (a, L, who, ctx) {
        var c = ctx() || {}; if (!c.readBackup) fail('unsupported', 'Restore runs on the server only');
        var name = str(a.name, 60); if (!/^db-[0-9-]+\.json$/.test(name)) fail('bad-name', 'Choose a backup from the list');
        var data = c.readBackup(name); if (!data) fail('not-found', 'That backup could not be read');
        if (c.backupNow) c.backupNow();                                        // a safety copy of right now, so a restore can be undone
        return ictAsAdmin(who, function (tok) { return methods.restore({ token: tok, data: data }); });
      },
      links: function (a, L) {
        var st = ictStore().links; return { items: Object.keys(st).map(function (k) { var x = st[k]; return { id: x.id, name: x.name, created: x.created, by: x.by, lastUsed: x.lastUsed, uses: x.uses || 0, revoked: !!x.revoked, current: x === L }; }).sort(function (p, q) { return q.created - p.created; }) };
      },
      linkCreate: function (a, L, who) { var name = str(a.name, 40); if (name.length < 2) fail('bad-name', 'Give the link a name, for example the person who will use it'); return { token: ictNewLink(name, who), name: name }; },
      linkRevoke: function (a, L, who) {
        var st = ictStore().links, k = Object.keys(st).filter(function (h) { return st[h].id === a.id; })[0]; if (!k) fail('not-found', 'No such link');
        if (!st[k].revoked && ictActive().length <= 1) fail('last-link', 'This is the only working link. Create another one first so ICT is not locked out.');
        st[k].revoked = true; audit('ict_link_revoke', { officer: who, target: st[k].name }); save(); return { ok: true, self: st[k] === L };
      },
      linkRotate: function (a, L, who) {
        var st = ictStore().links, k = Object.keys(st).filter(function (h) { return st[h].id === a.id; })[0]; if (!k) fail('not-found', 'No such link');
        var name = st[k].name; st[k].revoked = true; audit('ict_link_rotate', { officer: who, target: name }); return { token: ictNewLink(name, who), name: name };
      },
      transferDecide: function (a, L, who) { return ictAsAdmin(who, function (tok) { return methods.decideTransfer({ token: tok, matric: a.matric, ok: !!a.ok, note: a.note }); }); },
      feedback: function (a, L, who, ctx) { var c = ctx() || {}; return { items: c.feedback || [], total: c.fbTotal || 0, unsent: c.fbUnsent || 0, mail: c.mail || {} }; },
      feedbackRetry: function (a, L, who, ctx) { var c = ctx() || {}; return c.feedbackRetry ? c.feedbackRetry() : { sent: 0 }; },
      logs: function (a, L, who, ctx) { var c = ctx() || {}; return { items: c.logs || [] }; }
    };
    function ictRun(a) {
      var L = ictLinkFor(a && a.token); if (!L) fail('ict-link', 'This link is not valid.');
      var now = clock(); L.lastUsed = now; L.uses = (L.uses || 0) + 1;
      var name = String(a.method || ''), args = a.args && typeof a.args === 'object' ? a.args : {}, ctx = typeof a.ctx === 'function' ? a.ctx : function () { return {}; }, who = 'ICT · ' + L.name;
      if (Object.prototype.hasOwnProperty.call(ICTH, name)) return ICTH[name](args, L, who, ctx);
      if (ICT_ALLOW[name]) return ictAsAdmin(who, function (tok) { return methods[name](Object.assign({}, args, { token: tok })); });
      fail('no-method', 'Unknown action');
    }

    var operator = {
      overview: function () {
        var b = db.billing, rev = 0, cost = 0, n = 0, refunded = 0, byW = {};
        b.ledger.forEach(function (e) { if (e.type === 'debit' && e.st === 'final') { rev -= e.amt; cost += e.cost || 0; n++; var k = e.w === 'school' ? 'school' : 'parents'; byW[k] = (byW[k] || 0) - e.amt; } if (e.type === 'refund') refunded -= e.amt; });
        var topups = b.ledger.filter(function (e) { return e.type === 'topup'; }).reduce(function (s2, e) { return s2 + e.amt; }, 0), liab = 0;
        Object.keys(b.wallets).forEach(function (k) { liab += Math.max(0, b.wallets[k].bal); });
        return { enabled: b.enabled, prices: b.prices, reserve: b.reserve, revenue: rev, cost: cost, margin: rev - cost, marginPct: rev ? Math.round((rev - cost) / rev * 1000) / 10 : 0, texts: n, refunded: refunded, topups: topups, gifts: b.ledger.filter(function (e) { return e.type === 'gift'; }).reduce(function (s2, e) { return s2 + e.amt; }, 0), owed: liab, byWallet: byW, school: db.settings.schoolName, wallets: Object.keys(b.wallets).length, parentUpdates: db.settings.parentUpdates, paidBy: db.settings.parentUpdatesPaidBy };
      },
      configure: function (p) {
        var b = db.billing; if ('enabled' in p) b.enabled = !!p.enabled;
        if (p.price != null) { var v = Math.round(+p.price); if (!(v >= 0 && v <= 1e6)) fail('bad-price'); b.prices.sms.price = v; }
        if (p.cost != null) { var c = Math.round(+p.cost); if (!(c >= 0 && c <= 1e6)) fail('bad-price'); b.prices.sms.cost = c; }
        if (p.reserve != null) b.reserve = Math.max(0, Math.round(+p.reserve) || 0); if (p.lowAt != null) b.lowAt = Math.max(0, Math.round(+p.lowAt) || 0);
        audit('billing_config', { officer: 'operator', detail: JSON.stringify({ enabled: b.enabled, price: b.prices.sms.price, cost: b.prices.sms.cost }) }); save(); return operator.overview();
      },
      monetGet: function () {
        var m = db.monet, now = clock(), mon = now - 30 * DAY, act = { plus: 0, family: 0 }, rev = { plus: 0, family: 0 };
        Object.keys(m.subs).forEach(function (k) { var x = m.subs[k]; if (x.until > now) act[x.plan]++; });
        m.sales.forEach(function (x) { if (x.t > mon) rev[x.plan] = (rev[x.plan] || 0) + x.amt; });
        var adPaid = m.ads.reduce(function (n2, a) { return n2 + (a.paidAt > mon ? a.paid || 0 : 0); }, 0);
        var ads = m.ads.map(function (a) { var v = 0, c = 0, h = 0; Object.keys(a.stats || {}).forEach(function (k) { v += a.stats[k].v; c += a.stats[k].c; h += a.stats[k].h || 0; }); return Object.assign({}, a, { views: v, clicks: c, hides: h, live: adLive(a, now), stats: undefined }); });
        return { plans: m.plans, licence: m.licence, adsOn: m.adsOn, rate: m.rate, active: act, revenue30: rev, adPaid30: adPaid, licenceValue: m.licence.on ? m.licence.students * m.licence.perStudent : 0, ads: ads, sales: m.sales.slice(-40).reverse(),
          subs: Object.keys(m.subs).map(function (k) { var x = m.subs[k]; return { id: k.indexOf('g:') === 0 ? maskPhone(k.slice(2)) : k, key: k, plan: x.plan, until: x.until, active: x.until > now }; }).slice(-60).reverse(), students: Object.keys(db.students).length };
      },
      monetSave: function (p) {
        var m = db.monet; function kobo(v) { v = Math.round(+v); if (!(v >= 0 && v <= 1e9)) fail('bad-price', 'Price looks wrong'); return v; }
        ['plus', 'family'].forEach(function (k) { var q = p.plans && p.plans[k]; if (!q) return; if ('month' in q) m.plans[k].month = kobo(q.month); if ('term' in q) m.plans[k].term = kobo(q.term); if ('on' in q) m.plans[k].on = !!q.on; if (k === 'family' && 'texts' in q) m.plans.family.texts = Math.max(0, Math.min(500, Math.round(+q.texts) || 0)); });
        if (p.licence) { var l = p.licence, L = m.licence; if ('on' in l) L.on = !!l.on; if ('perStudent' in l) L.perStudent = kobo(l.perStudent); if ('students' in l) L.students = Math.max(0, Math.round(+l.students) || 0); if ('until' in l) L.until = Math.max(0, Math.round(+l.until) || 0); if ('school' in l) L.school = str(l.school, 80); }
        if ('adsOn' in p) m.adsOn = !!p.adsOn;
        if ('freeForStudents' in p) db.settings.freeForStudents = !!p.freeForStudents;
        audit('monet_save', { officer: 'operator', detail: 'plans/licence/ads settings changed' }); save(); return operator.monetGet();
      },
      adSave: function (p) {
        var m = db.monet, url = safeAdUrl(p.url), a = p.id ? m.ads.filter(function (x) { return x.id === str(p.id, 24); })[0] : null;
        if (!str(p.sponsor, 60) || !str(p.title, 60)) fail('bad-ad', 'A sponsor name and a headline are needed'); if (!url) fail('bad-url', 'The link must start with https:// or tel:+234…');
        if (!a) { if (m.ads.length >= 60) fail('too-many', 'Remove an old ad first'); a = { id: 'ad' + rnd(5), stats: {} }; m.ads.push(a); }
        a.sponsor = str(p.sponsor, 60); a.title = str(p.title, 60); a.text = str(p.text, 140); a.cta = str(p.cta, 24) || 'Open'; a.url = url; a.on = p.on !== false; a.from = +p.from || 0; a.until = +p.until || 0;
        if (p.paid != null) { var pk = Math.round(+p.paid); if (pk >= 0 && pk <= 1e9) { if (pk > (a.paid || 0)) a.paidAt = clock(); a.paid = pk; } }
        a.priority = Math.max(0, Math.min(5, Math.round(+p.priority) || 0));
        audit('ad_save', { officer: 'operator', detail: a.sponsor }); save(); return operator.monetGet();
      },
      adDelete: function (id) { var m = db.monet, n0 = m.ads.length; m.ads = m.ads.filter(function (x) { return x.id !== str(id, 24); }); if (m.ads.length !== n0) { audit('ad_delete', { officer: 'operator', detail: id }); save(); } return operator.monetGet(); },
      subGrant: function (p) {
        var plan = p.plan === 'family' ? 'family' : 'plus', id = plan === 'family' ? 'g:' + (toIntl(p.who) || fail('bad-phone', 'Enter a valid parent phone number')) : normMatric(p.who);
        if (plan === 'plus' && !db.students[id]) fail('not-found', 'No student with that matric number');
        var months = Math.max(0.25, Math.min(12, +p.months || 1)), now = clock(), x = db.monet.subs[id], base = x && x.plan === plan && x.until > now ? x.until : now;
        db.monet.subs[id] = { plan: plan, until: Math.round(base + months * 30 * DAY), at: now };
        var amt = Math.max(0, Math.round((+p.naira || 0) * 100)); db.monet.sales.push({ t: now, id: plan === 'family' ? maskPhone(id.slice(2)) : id, plan: plan, months: months, amt: amt, method: str(p.method, 20) || 'transfer' }); if (db.monet.sales.length > 3000) db.monet.sales.splice(0, 500);
        audit('sub_grant', { officer: 'operator', target: plan === 'plus' ? id : '', detail: plan + ' ' + months + ' month(s)' }); save();
        if (plan === 'plus') notify('student', id, { title: 'SafeGate Plus is on', body: 'Thank you! No ads, and your extras are unlocked.', tag: 'plus', url: '/' }, false);
        return operator.monetGet();
      },
      subRevoke: function (id) { id = String(id || ''); if (db.monet.subs[id]) { delete db.monet.subs[id]; audit('sub_revoke', { officer: 'operator', detail: id.indexOf('g:') === 0 ? maskPhone(id.slice(2)) : id }); save(); } return operator.monetGet(); },
      credit: function (wid, kobo, ref, note, type) { return creditWallet(wid, kobo, type || 'topup', ref, note || 'Top-up'); },
      parentWallet: function (phone) { var ph = toIntl(phone); if (!ph) fail('bad-phone'); return 'g:' + ph; },
      ledgerCsv: function () {
        var rows = ['time,wallet,type,service,amount_kobo,balance_kobo,cost_kobo,status,ref,note'];
        db.billing.ledger.forEach(function (e) { rows.push([new Date(e.t).toISOString(), e.w.replace(/\d{4}$/, '****'), e.type, e.svc, e.amt, e.bal, e.cost || '', e.st || '', e.ref, '"' + String(e.note).replace(/"/g, "'") + '"'].join(',')); });
        return rows.join('\n');
      },
      pending: function (ref) { return db.billing.pending[ref] || null; },
      settle: function (ref, paidKobo) {
        var p = db.billing.pending[ref]; if (!p) return { ok: false, reason: 'unknown' };
        if (p.st === 'done') return { ok: true, already: true };
        if (Math.round(paidKobo) !== p.kobo) { p.st = 'mismatch'; save(); return { ok: false, reason: 'amount' }; }
        creditWallet(p.wid, p.kobo, 'topup', 'ps:' + ref, 'Online top-up'); p.st = 'done'; p.done = clock(); save(); return { ok: true, wid: p.wid };
      },
      /* ---- founder console data */
      insights: function (days) {
        days = Math.max(7, Math.min(60, Math.round(+days) || 14)); var now = clock(), off = (db.settings.tzOffsetMin || 0) * MIN, today = Math.floor((now + off) / DAY), i;
        function z() { var a = []; for (var k = 0; k < days; k++) a.push(0); return a; }
        function put(arr, t) { var d = today - Math.floor((t + off) / DAY); if (d >= 0 && d < days) arr[days - 1 - d]++; }
        var ser = { students: z(), scans: z(), sos: z(), reports: z(), media: z() }, labels = [];
        for (i = days - 1; i >= 0; i--) labels.push(new Date((today - i) * DAY).toISOString().slice(5, 10));
        var active7 = 0, active1 = 0, devChg = 0, unreg = 0;
        Object.keys(db.students).forEach(function (m) { var st = db.students[m]; if (st.registeredAt) put(ser.students, st.registeredAt); if (st.lastSeen && st.lastSeen > now - 7 * DAY) active7++; if (st.lastSeen && st.lastSeen > now - DAY) active1++; if (st.deviceChanged) devChg++; if (st.unregistered) unreg++; });
        db.events.forEach(function (e) { if (e.t > now - days * DAY && (e.type === 'out' || e.type === 'in')) put(ser.scans, e.t); });
        db.sos.forEach(function (x) { put(ser.sos, x.t); }); db.reports.forEach(function (x) { put(ser.reports, x.t); }); Object.keys(db.media).forEach(function (k) { put(ser.media, db.media[k].t); });
        var openSos = db.sos.filter(function (x) { return x.status === 'open'; }).length, openRep = db.reports.filter(function (x) { return x.status === 'open'; }).length, flagged = Object.keys(db.integrity).length;
        return { days: days, labels: labels, series: ser, students: studentCount(), active1: active1, active7: active7, deviceChanged: devChg, unregistered: unreg, events: db.events.length, pings: db.pings.length,
          sos: { total: db.sos.length, open: openSos }, reports: { total: db.reports.length, open: openRep }, media: { files: Object.keys(db.media).length, bytes: db.mediaBytes || 0, on: db.settings.mediaOn !== false, days: db.settings.mediaDays, dayMB: db.settings.mediaDayMB, totalMB: db.settings.mediaTotalMB },
          officers: Object.keys(db.staff.accounts).length, flagged: flagged, school: db.settings.schoolName, notices: db.notices.length };
      },
      safety: function () {
        var now = clock(), waits = [], cats = {}, grid = {}, d30 = now - 30 * DAY, n30 = 0;
        db.sos.forEach(function (x) { if (x.t > d30) n30++; var c = db.claims['sos:' + x.id]; if (c && c.at >= x.t) waits.push(Math.round((c.at - x.t) / 1000)); if (x.lat != null && x.t > d30) { var k = x.lat.toFixed(3) + ',' + x.lng.toFixed(3); grid[k] = (grid[k] || 0) + 1; } });
        waits.sort(function (a, b) { return a - b; }); db.reports.forEach(function (r) { var k = r.cat || 'other'; cats[k] = (cats[k] || 0) + 1; if (r.lat != null && r.t > d30) { var g = r.lat.toFixed(3) + ',' + r.lng.toFixed(3); grid[g] = (grid[g] || 0) + 1; } });
        var integ = Object.keys(db.integrity).map(function (m) { var o = db.integrity[m], n = 0; Object.keys(o.n || {}).forEach(function (k) { n += o.n[k]; }); var st = db.students[m]; return { matric: m, name: st ? st.name : '', score: n }; }).sort(function (a, b) { return b.score - a.score; }).slice(0, 10);
        return { sos30: n30, answered: waits.length, medianWaitSec: waits.length ? waits[Math.floor(waits.length / 2)] : null, p90WaitSec: waits.length ? waits[Math.min(waits.length - 1, Math.floor(waits.length * 0.9))] : null, reportsByCat: cats,
          hotspots: Object.keys(grid).map(function (k) { return { at: k, n: grid[k] }; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 8), integrity: integ, hazards: (db.hazards || []).length, safePoints: (db.safePoints || []).length, places: (db.places || []).length };
      },
      people: function (q) {
        q = String(q || '').toLowerCase().trim().slice(0, 40); var out = [];
        Object.keys(db.students).some(function (m) { var st = db.students[m]; if (!q || m.toLowerCase().indexOf(q) >= 0 || String(st.name || '').toLowerCase().indexOf(q) >= 0 || String(st.phone || '').indexOf(q) >= 0) { var ig = db.integrity[m], n = 0; if (ig) Object.keys(ig.n || {}).forEach(function (k) { n += ig.n[k]; }); out.push({ matric: m, name: st.name, phone: st.phone, registeredAt: st.registeredAt || null, lastSeen: st.lastSeen || null, deviceChanged: !!st.deviceChanged, unregistered: !!st.unregistered, flags: n }); } return out.length >= 30; });
        return { total: studentCount(), items: out, officers: Object.keys(db.staff.accounts).map(function (k) { var x = db.staff.accounts[k]; return { name: x.name, role: x.role, active: x.active, lastLogin: x.lastLogin || null, locked: (x.until || 0) > clock() }; }) };
      },
      officerReset: function (name, pin) {
        var ac = acctOf(name); if (!ac) fail('not-found', 'No officer with that name'); if (!/^\d{6,12}$/.test(String(pin || ''))) fail('bad-pin', 'The PIN must be 6 to 12 digits');
        ac.salt = rnd(16); ac.hash = hashPin(String(pin), ac.salt); ac.fails = 0; ac.until = 0; ac.active = true; killSessions(ac.name);
        audit('operator_pin_reset', { officer: 'operator', target: ac.name, detail: 'PIN reset by the platform operator' }); save(); return { ok: true };
      },
      notice: function (a) {
        var title = str(a.title, 80), text = str(a.text, 400), now = clock(); if (title.length < 3) fail('bad-title', 'Give the notice a title');
        var hrs = Math.max(1, Math.min(720, Math.round(+a.hours) || 24));
        db.notices.push({ id: 'n_' + rnd(4), title: title, text: text, level: a.level === 'urgent' ? 'urgent' : 'info', t: now, exp: now + hrs * HOUR, by: 'Platform', acks: {} });
        if (a.level === 'urgent') Object.keys(db.push.students).forEach(function (m) { notify('student', m, { title: '📢 ' + title, body: text, tag: 'notice', url: '/', urgent: true }, true); });
        audit('post_notice', { officer: 'operator', detail: title }); save(); return { ok: true };
      },
      limits: function (p) {
        var s = db.settings; if ('mediaOn' in p) s.mediaOn = !!p.mediaOn;
        [['mediaDays', 1, 365], ['mediaDayMB', 1, 500], ['mediaTotalMB', 50, 500000]].forEach(function (r) { if (p[r[0]] != null) { var v = Math.round(+p[r[0]]); if (!(v >= r[1] && v <= r[2])) fail('bad-' + r[0], 'Out of range'); s[r[0]] = v; } });
        audit('operator_limits', { officer: 'operator', detail: JSON.stringify({ mediaOn: s.mediaOn, mediaDays: s.mediaDays, mediaDayMB: s.mediaDayMB, mediaTotalMB: s.mediaTotalMB }) }); save(); return { ok: true };
      },
      auditTail: function () { var v = verifyChain(); return { ok: v.ok, total: db.audit.length, items: db.audit.slice(-80).reverse() }; },
      exportAll: function () { var c = JSON.parse(JSON.stringify(db)); c.sessions = {}; return c; },
      price: function () { return db.billing.prices.sms.price; }
    };
    return { operator: operator, ictRun: ictRun, ictBootstrap: ictBootstrap, ictReset: ictReset, ictValid: function (t) { return !!ictLinkFor(t); }, rpc: rpc, tick: tick, dropSub: dropSub, db: db, _verifyGate: verifyGate, _tokenAt: tokenAt, _computeAlerts: computeAlerts, _statusOf: statusOf };
  }

  return {
    createServer: createServer, SGError: SGError, defaultConfig: defaultConfig, defaultPlaces: defaultPlaces, defaultSettings: defaultSettings,
    util: { parseHM: parseHM, rankSafe: rankSafe, lineHitsCircle: lineHitsCircle, HAZARD_KINDS: HAZARD_KINDS, refOf: refOf, bearing: bearing, nearestSafe: nearestSafe, triage: triage, haversine: haversine, localMinutes: localMinutes, parseHM: parseHM, inWindow: inWindow, trackExpected: trackExpected,
      nextLocalTime: nextLocalTime, parseGatePayload: parseGatePayload, fmtLocal: fmtLocal, sha256Hex: sha256Hex, hmacHex: hmacHex, rnd: rnd, vagueDest: vagueDest }
  };
});
