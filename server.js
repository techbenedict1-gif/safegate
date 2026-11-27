#!/usr/bin/env node
/* SafeGate server — zero dependencies. Run:  node server.js
 * Env: PORT (default 8080), DATA_FILE (default ./data/db.json), HOST (default 0.0.0.0) */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const Core = require('./js/core.js');
const WebPush = require('./webpush.js');
const Sms = require('./sms.js');
const Fcm = require('./fcm.js');
const Mail = require('./mail.js');
let VERSION = 'dev'; try { VERSION = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8')).version; } catch (_) {}
const crypto = require('crypto');

const PORT = +process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;
const DATA_FILE = process.env.DATA_FILE || path.join(ROOT, 'data', 'db.json');
fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });

let db = {};
try { db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
catch (e) {
  db = {};
  if (e.code !== 'ENOENT') {
    const bad = DATA_FILE + '.corrupt-' + Date.now();
    try { fs.copyFileSync(DATA_FILE, bad); console.error('Data file unreadable, copied to', bad); } catch (_) {}
    // fall back to the newest readable automatic backup instead of starting empty
    const bdir = process.env.BACKUP_DIR || path.join(path.dirname(DATA_FILE), 'backups');
    let files = []; try { files = fs.readdirSync(bdir).filter((f) => /^db-.*\.json$/.test(f)).sort().reverse(); } catch (_) {}
    for (const f of files) { try { db = require('./backupcrypt').open(fs.readFileSync(path.join(bdir, f), 'utf8'), require('./backupcrypt').keyFor(DATA_FILE)); console.error('Recovered from backup', f); break; } catch (_) {} }
  }
}

// ---- debounced atomic persistence
let dirty = false, writing = false, timer = null, lastSave = Date.now(), lastCost = 0;
function flush() {
  if (!dirty || writing) return;
  writing = true; dirty = false;
  const tmp = DATA_FILE + '.tmp';
  const t0 = Date.now(), body = JSON.stringify(db); lastCost = Date.now() - t0;
  fs.writeFile(tmp, body, (err) => {
    if (err) { console.error('save failed', err.message); dirty = true; writing = false; return; }
    fs.rename(tmp, DATA_FILE, (err2) => {
      if (!err2) lastSave = Date.now();
      if (err2) { console.error('rename failed', err2.message); dirty = true; }
      writing = false;
      if (dirty) schedule();
    });
  });
}
/* Saving the whole database blocks the server while it is turned into text. Wait longer between saves as the school grows, so saving never takes more than about a fifth of the time (cap 15 s). */
function schedule() { if (timer) return; timer = setTimeout(() => { timer = null; flush(); }, Math.min(15000, Math.max(400, lastCost * 4))); }
function save() { dirty = true; schedule(); }

const vapid = WebPush.loadVapid(path.join(path.dirname(DATA_FILE), 'vapid.json'));
const PUSH_SUBJECT = process.env.PUSH_SUBJECT || 'mailto:security@school.example';
const pushStat = { sent: 0, failed: 0, gone: 0, last: 0, lastError: '' };
const fcmCfg = Fcm.load(path.join(path.dirname(DATA_FILE), 'fcm.json'));
const smsCfg = Sms.loadConfig(path.join(path.dirname(DATA_FILE), 'sms.json'));
const smsStat = { sent: 0, failed: 0 };
let inboundKey = process.env.SMS_INBOUND_SECRET || '';
if (!inboundKey) { const kf = path.join(path.dirname(DATA_FILE), 'sms-inbound.key'); try { inboundKey = fs.readFileSync(kf, 'utf8').trim(); } catch (_) {} if (!inboundKey) { inboundKey = crypto.randomBytes(18).toString('hex'); try { fs.writeFileSync(kf, inboundKey, { mode: 0o600 }); } catch (_) {} } }
function sendSms(msg, done) { Sms.send(smsCfg, msg.to, msg.text).then((r) => { if (r.ok) smsStat.sent++; else smsStat.failed++; done(r); }); }
function deliver(ev, subs) {
  subs.forEach((sub) => {
    if (sub.fcm) {
      Fcm.send(fcmCfg, sub.fcm, ev.payload).then((r) => {
        pushStat.last = Date.now();
        if (r.gone) { pushStat.gone++; server.dropSub(sub.fcm); save(); } else if (r.status >= 200 && r.status < 300) pushStat.sent++; else { pushStat.failed++; pushStat.lastError = 'fcm ' + r.status + ' ' + (r.error || ''); }
      });
      return;
    }
    WebPush.send(sub, ev.payload, { vapid, subject: PUSH_SUBJECT, urgent: ev.urgent, ttl: ev.urgent ? 7200 : 1800 }).then((r) => {
      pushStat.last = Date.now();
      if (r.gone) { pushStat.gone++; server.dropSub(sub.endpoint); save(); }
      else if (r.status >= 200 && r.status < 300) pushStat.sent++;
      else { pushStat.failed++; pushStat.lastError = r.status + (r.error ? ' ' + r.error : ''); }
    });
  });
}
// ---- automatic rotating backups (copy of the data file; keeps the newest BACKUP_KEEP)
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(path.dirname(DATA_FILE), 'backups');
const BACKUP_KEEP = +process.env.BACKUP_KEEP || 30, BACKUP_HOURS = +process.env.BACKUP_HOURS || 6;
function listBackups() {
  try { return fs.readdirSync(BACKUP_DIR).filter((f) => /^db-.*\.json$/.test(f)).sort().reverse().map((f) => { const st = fs.statSync(path.join(BACKUP_DIR, f)); return { name: f, bytes: st.size, t: st.mtimeMs }; }); }
  catch (_) { return []; }
}
function backupNow() {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');
    const dest = path.join(BACKUP_DIR, 'db-' + stamp + '.json'), tmp = dest + '.tmp';
    const BC = require('./backupcrypt'); fs.writeFileSync(tmp, BC.seal(JSON.stringify(db), BC.keyFor(DATA_FILE)), { mode: 0o600 }); fs.renameSync(tmp, dest);
    listBackups().slice(BACKUP_KEEP).forEach((b) => { try { fs.unlinkSync(path.join(BACKUP_DIR, b.name)); } catch (_) {} });
    return { ok: true, name: path.basename(dest) };
  } catch (e) { console.error('backup failed', e.message); return { ok: false, error: e.message }; }
}
setInterval(() => { const l = listBackups(); if (!l.length || Date.now() - l[0].t > BACKUP_HOURS * 3600e3) backupNow(); }, 10 * 60e3).unref();
const startedAt = Date.now();
function sysinfo() {
  const mem = process.memoryUsage(); let bytes = 0; try { bytes = fs.statSync(DATA_FILE).size; } catch (_) {}
  return { uptimeSec: Math.round((Date.now() - startedAt) / 1000), node: process.version, rssMB: Math.round(mem.rss / 1048576), dataBytes: bytes, dataFile: path.basename(DATA_FILE),
    backups: listBackups().slice(0, 8), backupEveryHours: BACKUP_HOURS, push: Object.assign({}, pushStat), fcm: !!fcmCfg, sms: { provider: smsCfg.provider, configured: smsCfg.configured, sent: smsStat.sent, failed: smsStat.failed }, persistOk: !dirty && !writing || Date.now() - lastSave < 60000 };
}
const Pay = require('./pay.js');
/* Methods only the server itself may call (they are protected by their own secret, not by a sign-in). */
const INTERNAL_ONLY = { smsInbound: 1, mediaBegin: 1, mediaDone: 1, mediaSweep: 1, mediaCheck: 1 };

/* Founder console support: the last problems the server logged, and simple counters. */
const LOGS = [], STAT = { rpc: 0, rpcErr: 0, up: 0, upBytes: 0, opFail: 0 }, opFails = new Map();
['error', 'warn'].forEach((lv) => { const orig = console[lv].bind(console); console[lv] = (...a) => { try { LOGS.push({ t: Date.now(), lv, msg: a.map((x) => (x && x.stack) || (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(' ').slice(0, 400) }); if (LOGS.length > 150) LOGS.shift(); } catch (_) {} orig(...a); }; });
function opHealth() {
  const os = require('os'), si = sysinfo(); let disk = null; try { const f = fs.statfsSync(path.dirname(DATA_FILE)); disk = { freeMB: Math.round(f.bavail * f.bsize / 1048576), totalMB: Math.round(f.blocks * f.bsize / 1048576) }; } catch (_) {}
  let mediaFiles = 0; try { mediaFiles = fs.readdirSync(MEDIA_DIR).length; } catch (_) {}
  return Object.assign({}, si, { version: VERSION, load: os.loadavg().map((x) => Math.round(x * 100) / 100), freeMemMB: Math.round(os.freemem() / 1048576), totalMemMB: Math.round(os.totalmem() / 1048576), disk, cpus: os.cpus().length, platform: os.platform() + ' ' + os.arch(),
    mediaFilesOnDisk: mediaFiles, publicUrl: process.env.PUBLIC_URL || '', stat: STAT, mail: { configured: Mail.configured(), to: Mail.cfg().to }, dbMB: Math.round((si.dataBytes || 0) / 1048576 * 10) / 10 });
}
/* A safety service must stay up. Log the problem and keep serving instead of dying on one bad request. */
process.on('uncaughtException', (e) => { console.error('uncaught:', e && e.stack || e); });
process.on('unhandledRejection', (e) => { console.error('unhandled rejection:', e && e.stack || e); });
const OPERATOR_KEY = process.env.OPERATOR_KEY || '';
const server = Core.createServer(db, { save, notify: deliver, sms: sendSms, smsInfo: () => ({ provider: smsCfg.provider, configured: smsCfg.configured, inbound: '/api/sms-in?key=' + inboundKey }), sysinfo, backupNow, pushKey: vapid.publicKey, pushAllowLocal: process.env.PUSH_ALLOW_LOCAL === '1', payEnabled: Pay.cfg().enabled });
if (process.env.SCHOOL_NAME && (!server.db.settings.schoolName || server.db.settings.schoolName === 'University')) { server.db.settings.schoolName = String(process.env.SCHOOL_NAME).slice(0, 80); try { save(); } catch (_) { } }   // first start: use the school's name from the installer
setTimeout(() => { const l = listBackups(); if (!l.length || Date.now() - l[0].t > BACKUP_HOURS * 3600e3) backupNow(); }, 5000).unref();
setTimeout(() => { try { ictBootstrapFile(); } catch (e) { console.error('ICT bootstrap', e.message); } }, 300);
setInterval(() => { try { server.tick(); } catch (e) { console.error('tick', e.message); } }, 30000).unref();
save();
function shutdown() {
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(db)); } catch (e) { console.error(e.message); }
  process.exit(0);
}
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);

// ---- rate limiting (per IP, per minute)
const hits = new Map();
/* A whole campus often shares ONE public address (campus Wi-Fi / mobile carrier NAT), so the per-address ceiling is high (RATE_PER_MIN, default 3000) and only stops floods.
   Real abuse control is per phone (a device may call 150 times a minute) and per login (20 a minute plus the account lock-out in core.js). */
const RATE_IP = +process.env.RATE_PER_MIN || 3000, RATE_DEV = +process.env.RATE_PER_DEVICE || 150;
function bump(key, login) {
  const now = Date.now();
  let h = hits.get(key);
  if (!h || now - h.t > 60000) h = { t: now, n: 0, login: 0 };
  h.n++; if (login) h.login++;
  hits.set(key, h);
  return h;
}
function limited(ip, method, args) {
  const login = method === 'login' || method === 'setupStaff';
  const h = bump(ip, login);
  if (h.n > RATE_IP || h.login > 20) return true;
  const dev = args && typeof args.deviceId === 'string' && args.deviceId.length <= 64 ? args.deviceId : '';
  return dev ? bump('dev:' + dev, false).n > RATE_DEV : false;
}
setInterval(() => { const now = Date.now(); hits.forEach((v, k) => { if (now - v.t > 120000) hits.delete(k); }); }, 60000).unref();

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
const PUBLIC = new Set(['index.html', 'desk.html', 'guardian.html', 'operator.html', 'start.html', 'get.html', 'privacy.html', 'sw.js', 'manifest.webmanifest', 'desk.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'og-image.jpg', 'icon-maskable-512.png', 'apple-touch-icon.png', 'shot-home.png', 'shot-leave.png']);
const PUBLIC_DIRS = ['css/', 'js/', 'lib/'];

/* The visitor address is read from X-Forwarded-For only when TRUST_PROXY=1 (you run behind Caddy/Nginx). Otherwise anyone could forge it to dodge the rate limits. */
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
function clientIp(req) {
  const x = TRUST_PROXY && req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',').pop().trim() : '';
  return x || req.socket.remoteAddress || 'unknown';
}
/* The map draws pictures (tiles) from the tile address the school set, and asks the route service only when a student taps for a road route. The page may talk to those two origins and nothing else. */
function originOnly(u) { try { const x = new URL(String(u).replace(/\{[zxy]\}/g, '0')); return /^https?:$/.test(x.protocol) ? x.origin : ''; } catch (_) { return ''; } }
function cspHeader() {
  const st = (typeof server !== 'undefined' && server && server.db && server.db.settings) || {};
  const tiles = originOnly(st.mapTiles), route = originOnly(st.routeUrl), srch = originOnly(st.searchUrl);
  return "default-src 'self'; img-src 'self' data: blob:" + (tiles ? ' ' + tiles : '') + "; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'" + (route ? ' ' + route : '') + (srch && srch !== route ? ' ' + srch : '') + "; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";
}
function headers(extra) {
  return Object.assign({
    'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'geolocation=(self), camera=(self)',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Content-Security-Policy': cspHeader()
  }, extra || {});
}

/* The address people type is not known until you deploy. Link previews (WhatsApp, Facebook, X, Telegram...) need ABSOLUTE addresses, so the pages carry placeholders that are filled in here. Set PUBLIC_URL=https://your-domain to be exact; otherwise it is read from the request. */
function originOf(req) {
  const fixed = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');
  if (/^https?:\/\/[a-z0-9.\-]+(:\d+)?$/i.test(fixed)) return fixed;
  const host = String(req.headers.host || 'localhost').toLowerCase();
  const proto = TRUST_PROXY && req.headers['x-forwarded-proto'] === 'https' ? 'https' : (req.socket.encrypted ? 'https' : 'http');
  return proto + '://' + (/^[a-z0-9.\-]+(:\d+)?$/.test(host) ? host : 'localhost');
}
function htmlEsc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function fillPlaceholders(html, req, pathname) {
  const origin = originOf(req), school = server && server.db && server.db.settings ? String(server.db.settings.schoolName || '').slice(0, 60) : '';
  const title = 'SafeGate: sign out at the gate in one tap';
  const desc = (school ? school + ' students: ' : '') + 'scan at the gate, let your family know you are safe, and get help with one button. Free for students. Works without internet.';
  const url = origin + (pathname === '/' || pathname === '/index.html' ? '/' : pathname);
  return html.split('__ORIGIN__').join(origin).split('__URL__').join(htmlEsc(url)).split('__TITLE__').join(htmlEsc(title)).split('__DESC__').join(htmlEsc(desc));
}
function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.replace(/^\/+/, ''));
  if (pathname === '/desk') rel = 'desk.html';
  if (pathname === '/start' || pathname === '/app') rel = 'start.html';
  if (pathname === '/get' || pathname === '/install') rel = 'get.html';
  if (pathname === '/privacy') rel = 'privacy.html';
  if (rel.indexOf('\0') >= 0 || rel.indexOf('..') >= 0) { res.writeHead(400, headers()); return res.end('Bad request'); }
  if (!PUBLIC.has(rel) && !PUBLIC_DIRS.some((d) => rel.startsWith(d))) { res.writeHead(404, headers()); return res.end('Not found'); }
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) { res.writeHead(400, headers()); return res.end('Bad request'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, headers()); return res.end('Not found'); }
    const ext = path.extname(file);
    const cache = rel === 'sw.js' || ext === '.html' ? 'no-cache' : (rel === 'og-image.jpg' ? 'public, max-age=86400' : 'public, max-age=3600');
    let out = buf;
    if (ext === '.html') { const t = buf.toString('utf8'); if (t.indexOf('__ORIGIN__') >= 0) out = Buffer.from(fillPlaceholders(t, req, pathname), 'utf8'); }
    res.writeHead(200, headers({ 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': cache, 'Content-Length': out.length,
      'Service-Worker-Allowed': '/' }));
    res.end(out);
  });
}

/* ---- Product feedback: saved first (never lost), then emailed to the developer. Readable in the operator console and in feedback.jsonl. ---- */
const FB_FILE = path.join(path.dirname(DATA_FILE), 'feedback.jsonl');
const FB_KINDS = { love: '❤ Love', fix: '🔧 Fix', idea: '💡 Idea', broke: '🐞 Broken', other: '💬 Other' };
let fbList = [];
try { fbList = fs.readFileSync(FB_FILE, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch (_) { return null; } }).filter(Boolean); } catch (_) {}
const fbCid = new Map(fbList.map((f) => [f.cid, f.id]).filter((x) => x[0]));
const fbIp = new Map(), fbDev = new Map();
function fbRewrite() { try { fs.mkdirSync(path.dirname(FB_FILE), { recursive: true }); const tmp = FB_FILE + '.tmp'; fs.writeFileSync(tmp, fbList.map((f) => JSON.stringify(f)).join('\n') + '\n'); fs.renameSync(tmp, FB_FILE); } catch (e) { console.error('feedback save', e.message); } }
function fbText(f) {
  const lines = [FB_KINDS[f.kind] || f.kind, f.rating ? 'Rating: ' + '★'.repeat(f.rating) + '☆'.repeat(5 - f.rating) + ' (' + f.rating + '/5)' : 'Rating: not given', 'Part of the app: ' + (f.area || 'not said'), '', f.message, '',
    '--- Who ---', 'Sent as: ' + f.role + (f.who ? ' — ' + (f.who.name || '') + (f.who.matric ? ' (' + f.who.matric + ')' : '') : ' (stayed anonymous)'), 'Contact: ' + (f.contact || 'none given'),
    '--- Details ---', 'Reference: ' + f.id, 'Time (Lagos): ' + new Date(f.t + 3600e3).toISOString().replace('T', ' ').slice(0, 19), 'School: ' + (f.school || ''), 'Page: ' + (f.page || ''), 'App version: ' + (f.ver || ''), 'Phone/browser: ' + (f.ua || ''), '', 'SafeGate v' + VERSION + ' · Powered by ResultFlow'];
  return lines.join('\n');
}
async function fbEmail(f) {
  if (f.emailed || !Mail.configured()) return false;
  f.tries = (f.tries || 0) + 1;
  try {
    await Mail.send({ to: Mail.cfg().to, replyTo: /@/.test(f.contact || '') ? f.contact : '', subject: '[SafeGate feedback] ' + (FB_KINDS[f.kind] || f.kind) + (f.rating ? ' · ' + f.rating + '/5' : '') + (f.area ? ' · ' + f.area : '') + ' · ' + f.role + ' · ' + f.id, text: fbText(f) });
    f.emailed = true; f.emailedAt = Date.now(); fbRewrite(); return true;
  } catch (e) { f.lastErr = String(e.message).slice(0, 100); fbRewrite(); console.error('feedback email', f.id, f.lastErr); return false; }
}
setInterval(() => { if (!Mail.configured()) return; const todo = fbList.filter((f) => !f.emailed && (f.tries || 0) < 12).slice(0, 5); (async () => { for (const f of todo) await fbEmail(f); })(); }, 5 * 60e3).unref();
function fbRate(map, key, max, windowMs) { const now = Date.now(), a = (map.get(key) || []).filter((t) => now - t < windowMs); if (a.length >= max) { map.set(key, a); return true; } a.push(now); map.set(key, a); return false; }
setInterval(() => { const now = Date.now(); [fbIp, fbDev].forEach((m) => m.forEach((v, k) => { if (!v.some((t) => now - t < 86400e3)) m.delete(k); })); }, 3600e3).unref();
const clip = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);
function handleFeedback(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method' });
  const ip = clientIp(req);
  if (fbRate(fbIp, ip, 30, 3600e3)) return json(res, 429, { error: { code: 'rate', message: 'Too many messages from this connection. Try again later.' } });
  return readBody(req, 16000, (raw) => {
    let m; try { m = JSON.parse(raw); } catch (_) { return json(res, 400, { error: { code: 'bad-json', message: 'Bad request' } }); }
    if (!m || typeof m !== 'object') return json(res, 400, { error: { code: 'bad-json', message: 'Bad request' } });
    if (m.website) return json(res, 200, { ok: true, ref: 'FB-00000' });           // hidden field only bots fill in: pretend success
    const message = clip(m.message, 2000); if (message.length < 10) return json(res, 400, { error: { code: 'short', message: 'Please write a little more (at least 10 letters).' } });
    const cid = clip(m.cid, 40); if (cid && fbCid.has(cid)) return json(res, 200, { ok: true, ref: fbCid.get(cid), again: true });
    const dev = clip(m.deviceId, 64) || ip; if (fbRate(fbDev, dev, 8, 86400e3)) return json(res, 429, { error: { code: 'rate', message: 'You have sent many messages today. Thank you! Please try again tomorrow.' } });
    const id = 'FB-' + crypto.randomBytes(3).toString('hex').toUpperCase();
    const who = m.who && typeof m.who === 'object' && (m.who.name || m.who.matric) ? { name: clip(m.who.name, 60), matric: clip(m.who.matric, 30) } : null;
    const f = { id: id, cid: cid || undefined, t: Date.now(), kind: FB_KINDS[m.kind] ? m.kind : 'other', rating: [1, 2, 3, 4, 5].indexOf(+m.rating) >= 0 ? +m.rating : 0, area: clip(m.area, 40), message: message,
      role: ['student', 'security', 'parent', 'visitor'].indexOf(m.role) >= 0 ? m.role : 'student', who: who, contact: clip(m.contact, 80), page: clip(m.page, 40), ver: clip(m.ver, 20), ua: clip(req.headers['user-agent'], 140),
      school: clip(server.db && server.db.settings && server.db.settings.schoolName, 80), emailed: false, tries: 0 };
    try { fs.mkdirSync(path.dirname(FB_FILE), { recursive: true }); fs.appendFileSync(FB_FILE, JSON.stringify(f) + '\n'); } catch (e) { console.error('feedback save', e.message); return json(res, 500, { error: { code: 'server', message: 'Could not save. Please try again.' } }); }
    fbList.push(f); if (f.cid) fbCid.set(f.cid, f.id); if (fbList.length > 5000) fbList = fbList.slice(-4000);
    json(res, 200, { ok: true, ref: id });
    fbEmail(f);
  });
}

/* ---- Evidence media: raw bytes go straight to disk (never through JSON), checked by magic bytes, served only by short-lived signed links. */
const MEDIA_DIR = process.env.MEDIA_DIR || path.join(path.dirname(DATA_FILE), 'media');
fs.mkdirSync(MEDIA_DIR, { recursive: true });
const MEDIA_MAX = { image: 450000, audio: 700000, video: 6000000 };
const mediaRate = new Map();
function sniff(b) {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { kind: 'image', mime: 'image/jpeg' };
  if (b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { kind: 'image', mime: 'image/png' };
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return { kind: 'image', mime: 'image/webp' };
  if (b.toString('latin1', 0, 4) === 'OggS') return { kind: 'audio', mime: 'audio/ogg' };
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WAVE') return { kind: 'audio', mime: 'audio/wav' };
  if (b.toString('latin1', 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return { kind: 'audio', mime: 'audio/mpeg' };
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { kind: 'webm', mime: 'video/webm' };   // audio or video: the client says which
  if (b.toString('latin1', 4, 8) === 'ftyp') return { kind: 'mp4', mime: 'video/mp4' };
  return null;
}
function handleMediaUp(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: { code: 'method', message: 'POST only' } });
  const ip = clientIp(req), h = req.headers, kind = String(h['x-sg-kind'] || ''), len = Number(h['content-length'] || 0);
  const fail = (c, code, message) => { req.resume(); return json(res, c, { error: { code, message } }); };
  if (!MEDIA_MAX[kind]) return fail(400, 'bad-kind', 'That kind of file is not accepted.');
  if (!(len > 200) || len > MEDIA_MAX[kind]) return fail(413, 'too-big', 'That file is too big. Pictures, voice notes and videos are shrunk on your phone first. Try a shorter one.');
  if (fbRate(mediaRate, ip, 120, 3600e3)) return fail(429, 'rate', 'Too many files from this connection. Wait a little.');
  const a = { matric: String(h['x-sg-matric'] || ''), deviceId: String(h['x-sg-device'] || ''), anonKey: String(h['x-sg-anon'] || ''), refType: h['x-sg-type'] === 'sos' ? 'sos' : 'report', ref: String(h['x-sg-ref'] || ''), kind, cid: String(h['x-sg-id'] || ''), bytes: len };
  let begin;
  try { begin = server.rpc('mediaBegin', a); } catch (e) { if (e instanceof Core.SGError) return fail(e.code === 'no-ref' ? 404 : 400, e.code, e.message); console.error('mediaBegin', e.message); return fail(500, 'server', 'Server error'); }
  if (begin.done) return json(res, 200, { ok: true, again: true, id: begin.id });
  const tmp = path.join(MEDIA_DIR, begin.id + '.part'), out = fs.createWriteStream(tmp), hash = crypto.createHash('sha256'); let n = 0, head = Buffer.alloc(0), dead = false;
  const bail = (c, code, msg) => { if (dead) return; dead = true; try { out.destroy(); } catch (_) {} fs.unlink(tmp, () => {}); json(res, c, { error: { code, message: msg } }); };
  req.on('data', (c) => { if (dead) return; n += c.length; if (n > len + 16 || n > MEDIA_MAX[kind]) { bail(413, 'too-big', 'File larger than it said'); return req.destroy(); } if (head.length < 16) head = Buffer.concat([head, c]).slice(0, 16); hash.update(c); if (!out.write(c)) { req.pause(); out.once('drain', () => req.resume()); } });
  req.on('error', () => bail(400, 'aborted', 'Upload was cut off'));
  req.on('aborted', () => bail(400, 'aborted', 'Upload was cut off'));
  req.on('end', () => {
    if (dead) return;
    out.end(() => {
      if (dead) return;
      const sn = sniff(head); const ok = sn && ((kind === 'image' && sn.kind === 'image') || (kind === 'audio' && (sn.kind === 'audio' || sn.kind === 'webm' || sn.kind === 'mp4')) || (kind === 'video' && (sn.kind === 'webm' || sn.kind === 'mp4')));
      if (!ok || n < 200) return bail(400, 'bad-file', 'That file is not a picture, voice note or video we can accept.');
      const mime = kind === 'audio' && sn.kind === 'webm' ? 'audio/webm' : kind === 'audio' && sn.kind === 'mp4' ? 'audio/mp4' : sn.mime;
      const sha = hash.digest('hex'), dest = path.join(MEDIA_DIR, begin.id);
      fs.rename(tmp, dest, (er) => {
        if (er) return bail(500, 'server', 'Could not save the file');
        try { server.rpc('mediaDone', { id: begin.id, ref: a.ref, refType: a.refType, owner: begin.owner, kind, mime, bytes: n, sha, dur: Math.min(600, Number(h['x-sg-dur']) || 0) }); }
        catch (e) { fs.unlink(dest, () => {}); return json(res, 500, { error: { code: 'server', message: 'Server error' } }); }
        dead = true; STAT.up++; STAT.upBytes += n; json(res, 200, { ok: true, id: begin.id });
      });
    });
  });
}
function serveMedia(req, res, url) {
  const id = decodeURIComponent(url.pathname.slice('/api/media/'.length));
  if (!/^[A-Za-z0-9-]{8,40}$/.test(id)) return json(res, 404, { error: 'not-found' });
  let m = null; try { m = server.rpc('mediaCheck', { id, e: url.searchParams.get('e'), s: url.searchParams.get('s') }); } catch (_) {}
  if (!m) return json(res, 403, { error: 'expired' });
  const file = path.join(MEDIA_DIR, id); let st; try { st = fs.statSync(file); } catch (_) { return json(res, 404, { error: 'gone' }); }
  const base = { 'Content-Type': m.mime, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=600', 'Content-Security-Policy': "sandbox; default-src 'none'", 'Accept-Ranges': 'bytes' };
  const rg = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (rg && (rg[1] || rg[2])) {                                     // phones need ranges to play and seek video
    let a = rg[1] === '' ? Math.max(0, st.size - Number(rg[2])) : Number(rg[1]), b = rg[1] === '' || rg[2] === '' ? st.size - 1 : Math.min(Number(rg[2]), st.size - 1);
    if (a > b || a >= st.size) { res.writeHead(416, headers(Object.assign({ 'Content-Range': 'bytes */' + st.size }, base))); return res.end(); }
    res.writeHead(206, headers(Object.assign({ 'Content-Range': 'bytes ' + a + '-' + b + '/' + st.size, 'Content-Length': b - a + 1 }, base)));
    return req.method === 'HEAD' ? res.end() : fs.createReadStream(file, { start: a, end: b }).pipe(res);
  }
  res.writeHead(200, headers(Object.assign({ 'Content-Length': st.size }, base)));
  return req.method === 'HEAD' ? res.end() : fs.createReadStream(file).pipe(res);
}
function mediaSweep() {
  try {
    const r = server.rpc('mediaSweep', {}); r.gone.forEach((id) => fs.unlink(path.join(MEDIA_DIR, id), () => {}));
    const live = server.db.media || {}, cut = Date.now() - 3600e3;          // files with no record (failed or cut-off uploads) are removed after an hour
    fs.readdir(MEDIA_DIR, (e, names) => { if (e) return; names.forEach((nm) => { if (live[nm]) return; const f = path.join(MEDIA_DIR, nm); fs.stat(f, (e2, s) => { if (!e2 && s.mtimeMs < cut) fs.unlink(f, () => {}); }); }); });
  } catch (e) { console.error('media sweep', e.message); }
}
setInterval(mediaSweep, 3600e3).unref(); setTimeout(mediaSweep, 20e3).unref();

/* ---- ICT console: one private link (20 random characters), no password. See js/core.js ICT section for the rules. */
const ICT_FILE = path.join(path.dirname(DATA_FILE), 'ict-link.txt');
const ictBadIp = new Map();
const ictBlocked = (ip) => { const now = Date.now(), a = (ictBadIp.get(ip) || []).filter((t) => now - t < 3600e3); ictBadIp.set(ip, a); return a.length >= 30; };
const ictFailed = (ip) => { const a = ictBadIp.get(ip) || []; a.push(Date.now()); ictBadIp.set(ip, a); };
setInterval(() => { const now = Date.now(); ictBadIp.forEach((v, k) => { if (!v.some((t) => now - t < 3600e3)) ictBadIp.delete(k); }); }, 3600e3).unref();
function ictCtx() {
  const now = Date.now();
  return Object.assign({}, opHealth(), {
    backups: listBackups().slice(0, 20), backupEveryHours: BACKUP_HOURS, backupNow,
    readBackup: (name) => { try { const BC = require('./backupcrypt'); return BC.open(fs.readFileSync(path.join(BACKUP_DIR, path.basename(String(name))), 'utf8'), BC.keyFor(DATA_FILE)); } catch (_) { return null; } },
    fbTotal: fbList.length, fbUnsent: fbList.filter((f) => !f.emailed).length, feedback: fbList.slice().reverse().slice(0, 100),
    logs: LOGS.slice().reverse().slice(0, 60), errors1h: LOGS.filter((l) => l.lv === 'error' && l.t > now - 3600e3).length
  });
}
function ictBootstrapFile() {
  const tok = server.ictBootstrap(process.env.ICT_KEY);   // ICT_KEY (20 letters/numbers) lets a hosted server start with a link you already know
  if (tok) {
    try { fs.mkdirSync(path.dirname(ICT_FILE), { recursive: true }); fs.writeFileSync(ICT_FILE, tok + '\n', { mode: 0o600 }); } catch (e) { console.error('could not save the ICT link file', e.message); }
    save(); console.log('\n  ICT console link created. Open:  /ict/' + tok + '\n  (saved in ' + ICT_FILE + ')\n');
  }
  // On a hosted server (Render, a VPS) there is no terminal to look in, so the owner's two secret paths are written to the log at every start.
  try { const t = fs.readFileSync(ICT_FILE, 'utf8').trim(); if (t) console.log('  [owner] ICT console path:      /ict/' + t); } catch (_) { }
  if (process.env.OPERATOR_KEY) console.log('  [owner] Operator console path: /op/' + process.env.OPERATOR_KEY + '\n');
}
function ictPage(req, res, tok) {
  const noStore = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive' };
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, headers(noStore)); return res.end(); }
  const ip = clientIp(req);
  if (!server.ictValid(tok)) {
    if (ictBlocked(ip)) { res.writeHead(429, headers(noStore)); return res.end('Too many tries'); }
    ictFailed(ip);
    res.writeHead(404, headers(Object.assign({ 'Content-Type': 'text/html; charset=utf-8' }, noStore)));
    return res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link not valid</title><body style="font-family:system-ui;max-width:30rem;margin:12vh auto;padding:0 1.2rem"><h1>This link is not valid</h1><p>It may have been replaced or switched off. Ask the ICT lead for the current link.</p></body>');
  }
  fs.readFile(path.join(ROOT, 'ict.html'), (err, buf) => {
    if (err) { res.writeHead(404, headers(noStore)); return res.end('Not found'); }
    res.writeHead(200, headers(Object.assign({ 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': buf.length }, noStore)));
    res.end(req.method === 'HEAD' ? undefined : buf);
  });
}
function operatorPage(req, res, tok) {            // the owner's console opens from its own secret link, no password to type
  const noStore = { 'Cache-Control': 'no-store' };
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, headers(noStore)); return res.end(); }
  const ip = clientIp(req);
  if (!OPERATOR_KEY || !safeEq(tok || '', OPERATOR_KEY)) {
    if (ictBlocked(ip)) { res.writeHead(429, headers(noStore)); return res.end('Too many tries'); }
    ictFailed(ip);
    res.writeHead(404, headers(Object.assign({ 'Content-Type': 'text/html; charset=utf-8' }, noStore)));
    return res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link not valid</title><body style="font-family:system-ui;max-width:30rem;margin:12vh auto;padding:0 1.2rem"><h1>This link is not valid</h1><p>Ask the person who runs SafeGate for the right link.</p></body>');
  }
  fs.readFile(path.join(ROOT, 'operator.html'), (err, buf) => {
    if (err) { res.writeHead(404, headers(noStore)); return res.end('Not found'); }
    res.writeHead(200, headers(Object.assign({ 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': buf.length }, noStore)));
    res.end(req.method === 'HEAD' ? undefined : buf);
  });
}
function handleIct(req, res) {
  const noStore = { 'Cache-Control': 'no-store' };
  if (req.method !== 'POST') return json(res, 405, { error: { code: 'method', message: 'POST only' } });
  const ip = clientIp(req);
  if (ictBlocked(ip)) return json(res, 429, { error: { code: 'rate', message: 'Too many wrong links from this connection. Wait an hour.' } });
  return readBody(req, 8e6, (raw) => {
    let m; try { m = JSON.parse(raw); } catch (_) { return json(res, 400, { error: { code: 'bad-json', message: 'Bad request' } }); }
    if (!m || !server.ictValid(String(m.token || ''))) { ictFailed(ip); return json(res, 403, { error: { code: 'ict-link', message: 'This link is not valid.' } }); }
    const done = (r) => json(res, 200, { result: r });
    const fail = (e) => { if (e instanceof Core.SGError) return json(res, 400, { error: { code: e.code, message: e.message } }); console.error('ict', e && e.stack || e); return json(res, 500, { error: { code: 'server', message: 'Server error' } }); };
    if (m.method === 'feedbackRetry') {
      const todo = fbList.filter((f) => !f.emailed).slice(0, 20);
      return (async () => { let sent = 0; for (const f of todo) { f.tries = 0; if (await fbEmail(f)) sent++; } done({ sent, left: fbList.filter((f) => !f.emailed).length, mail: Mail.configured() }); })().catch(fail);
    }
    try { return done(server.ictRun({ token: String(m.token), method: String(m.method || ''), args: m.args, ctx: ictCtx })); } catch (e) { return fail(e); }
  });
}

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) }));
  res.end(body);
}

function readBody(req, cap, cb) {
  const ch = []; let n = 0, dead = false;
  req.on('data', (c) => { n += c.length; if (n > cap) { dead = true; req.destroy(); } else ch.push(c); });
  req.on('error', () => {}); req.on('end', () => { if (!dead) cb(Buffer.concat(ch).toString('utf8')); });
}
function origin(req) { return process.env.PUBLIC_URL || ((req.headers['x-forwarded-proto'] || 'http') + '://' + (req.headers.host || 'localhost')); }
function safeEq(a, b) { a = Buffer.from(String(a)); b = Buffer.from(String(b)); return a.length === b.length && crypto.timingSafeEqual(a, b); }
async function creditFromProvider(ref) {
  const p = server.operator.pending(ref); if (!p) return { ok: false, reason: 'unknown' };
  if (p.st === 'done') return { ok: true, already: true };
  const v = await Pay.verify(ref); if (!v.ok || v.currency !== 'NGN') return { ok: false, reason: v.status };
  return server.operator.settle(ref, v.paid);
}
function payOrOperator(req, res, url) {
  const ip = clientIp(req);
  if (url.pathname === '/api/operator') {
    if (!OPERATOR_KEY) return json(res, 404, { error: 'off' });
    if (req.method !== 'POST') return json(res, 405, { error: 'method' });
    if (limited(ip, 'operator')) return json(res, 429, { error: 'rate' });          // guessing is stopped by the lockout below, not by this general limit
    const lk = opFails.get(ip); if (lk && lk.until > Date.now()) return json(res, 429, { error: 'locked' });
    return readBody(req, 20000, (raw) => {
      let m; try { m = JSON.parse(raw); } catch (_) { return json(res, 400, { error: 'bad-json' }); }
      if (!m || !safeEq(m.key || '', OPERATOR_KEY)) { const f = opFails.get(ip) || { n: 0, until: 0 }; f.n++; STAT.opFail++; if (f.n >= 5) { f.until = Date.now() + 15 * 60e3; f.n = 0; console.warn('operator login locked for', ip); } opFails.set(ip, f); return json(res, 403, { error: 'forbidden' }); }
      opFails.delete(ip);
      const op = server.operator, a = m.args || {};
      try {
        if (m.op === 'insights') return json(res, 200, { result: op.insights(a.days) });
        if (m.op === 'safety') return json(res, 200, { result: op.safety() });
        if (m.op === 'people') return json(res, 200, { result: op.people(a.q) });
        if (m.op === 'officerReset') return json(res, 200, { result: op.officerReset(String(a.name || ''), String(a.pin || '')) });
        if (m.op === 'notice') return json(res, 200, { result: op.notice(a) });
        if (m.op === 'limits') return json(res, 200, { result: op.limits(a) });
        if (m.op === 'auditTail') return json(res, 200, { result: op.auditTail() });
        if (m.op === 'health') return json(res, 200, { result: opHealth() });
        if (m.op === 'logs') return json(res, 200, { result: { items: LOGS.slice().reverse(), fails: Array.from(opFails.entries()).filter((e) => e[1].until > Date.now()).length } });
        if (m.op === 'backupNow') return json(res, 200, { result: backupNow() });
        if (m.op === 'mediaSweep') { mediaSweep(); return json(res, 200, { result: { ok: true } }); }
        if (m.op === 'export') { const body = JSON.stringify(op.exportAll()); res.writeHead(200, headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) })); return res.end(body); }
        if (m.op === 'monetGet') return json(res, 200, { result: op.monetGet() });
        if (m.op === 'monetSave') return json(res, 200, { result: op.monetSave(a) });
        if (m.op === 'adSave') return json(res, 200, { result: op.adSave(a) });
        if (m.op === 'adDelete') return json(res, 200, { result: op.adDelete(a.id) });
        if (m.op === 'subGrant') return json(res, 200, { result: op.subGrant(a) });
        if (m.op === 'subRevoke') return json(res, 200, { result: op.subRevoke(a.id) });
        if (m.op === 'overview') return json(res, 200, { result: op.overview() });
        if (m.op === 'configure') return json(res, 200, { result: op.configure(a) });
        if (m.op === 'feedback') return json(res, 200, { result: { items: fbList.slice().reverse().slice(0, 300), total: fbList.length, unsent: fbList.filter((f) => !f.emailed).length, mail: { configured: Mail.configured(), to: Mail.cfg().to } } });
        if (m.op === 'feedbackRetry') { const todo = fbList.filter((f) => !f.emailed).slice(0, 20); return (async () => { let sent = 0; for (const f of todo) { f.tries = 0; if (await fbEmail(f)) sent++; } json(res, 200, { result: { sent: sent, left: fbList.filter((f) => !f.emailed).length, mail: Mail.configured() } }); })(); }
        if (m.op === 'credit') {
          const kobo = Math.round(Number(a.naira) * 100), wid = a.wallet === 'school' ? 'school' : op.parentWallet(a.wallet);
          const e = op.credit(wid, kobo, 'op:' + crypto.randomBytes(6).toString('hex'), String(a.note || 'Operator credit').slice(0, 60), a.sponsor ? 'sponsor' : 'topup');
          return json(res, 200, { result: { ok: true, bal: e.bal } });
        }
        if (m.op === 'ledger') { const body = op.ledgerCsv(); res.writeHead(200, headers({ 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) })); return res.end(body); }
        return json(res, 400, { error: 'bad-op' });
      } catch (e) { if (e instanceof Core.SGError) return json(res, 400, { error: e.code }); console.error('operator', e.message); return json(res, 500, { error: 'server' }); }
    });
  }
  if (!Pay.cfg().enabled) return json(res, 404, { error: 'off' });
  if (url.pathname === '/api/pay/init') {
    if (req.method !== 'POST') return json(res, 405, { error: 'method' });
    if (limited(ip, 'pay')) return json(res, 429, { error: { code: 'rate', message: 'Too many requests. Wait a minute.' } });
    return readBody(req, 5000, async (raw) => {
      let a; try { a = JSON.parse(raw); } catch (_) { return json(res, 400, { error: { code: 'bad-json', message: 'Bad request' } }); }
      try {
        const p = server.rpc('payPrepare', a || {});
        const r = await Pay.init(p.ref, p.kobo, origin(req) + '/api/pay/return?ref=' + p.ref);
        if (!r.ok) return json(res, 502, { error: { code: 'provider', message: 'Payment service is not reachable. Try again.' } });
        return json(res, 200, { result: { url: r.url, ref: p.ref } });
      } catch (e) { if (e instanceof Core.SGError) return json(res, 400, { error: { code: e.code, message: e.message } }); console.error('pay init', e.message); return json(res, 500, { error: { code: 'server', message: 'Server error' } }); }
    });
  }
  if (url.pathname === '/api/pay/return') {
    const ref = String(url.searchParams.get('ref') || '').slice(0, 40);
    return creditFromProvider(ref).then((r) => {
      const p = server.operator.pending(ref), school = p && p.wid === 'school';
      const msg = r.ok ? 'Payment received. Your balance has been topped up.' : 'We have not received this payment yet. If you were charged, your balance will update within a few minutes.';
      const body = '<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>SafeGate payment</title><body style="font:16px system-ui;max-width:420px;margin:12vh auto;padding:0 20px"><h2>' + (r.ok ? '✓ Thank you' : 'Payment pending') + '</h2><p>' + msg + '</p>' + (school ? '<p><a href="/desk.html">Back to the desk</a></p>' : '<p>You can close this page and go back to the family page.</p>');
      res.writeHead(200, headers({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })); res.end(body);
    });
  }
  // webhook
  return readBody(req, 100000, async (raw) => {
    if (!Pay.signatureOk(raw, req.headers['x-paystack-signature'])) return json(res, 401, { error: 'sig' });
    let ev; try { ev = JSON.parse(raw); } catch (_) { return json(res, 400, { error: 'bad-json' }); }
    if (ev && ev.event === 'charge.success' && ev.data && typeof ev.data.reference === 'string') { try { await creditFromProvider(ev.data.reference); } catch (e) { console.error('webhook', e.message); } }
    return json(res, 200, { ok: true });
  });
}

function handleRequest(req, res) {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/health') return json(res, 200, { ok: true, version: VERSION, time: Date.now(), uptime: Math.round(process.uptime()) });
  if (url.pathname === '/api/sms-in') {                       // provider webhook: a student texted SOS to the security number
    const ip0 = clientIp(req);
    if (limited(ip0, 'sms-in')) return json(res, 429, { error: 'rate' });
    const key = url.searchParams.get('key') || '', ok = key.length === inboundKey.length && crypto.timingSafeEqual(Buffer.from(key), Buffer.from(inboundKey));
    if (!ok) return json(res, 403, { error: 'forbidden' });
    const chunks0 = []; let n0 = 0;
    req.on('data', (c) => { n0 += c.length; if (n0 > 20000) req.destroy(); else chunks0.push(c); });
    req.on('error', () => {});
    req.on('end', () => {
      const raw = Buffer.concat(chunks0).toString('utf8'); let f = {};
      try { f = JSON.parse(raw); } catch (_) { try { f = Object.fromEntries(new URLSearchParams(raw)); } catch (_2) {} }
      url.searchParams.forEach((v, k) => { if (!(k in f)) f[k] = v; });
      const from = f.from || f.From || f.sender || f.msisdn || f.phone || '', text = f.text || f.Body || f.message || f.sms || f.body || '';
      try { return json(res, 200, server.rpc('smsInbound', { from: String(from), text: String(text) })); }
      catch (e) { console.error('sms-in', e.message); return json(res, 500, { error: 'server' }); }
    });
    return;
  }
  const im = /^\/ict\/([^/]*)\/?$/.exec(url.pathname); if (im) return ictPage(req, res, im[1]);
  const om = /^\/op\/([^/]*)\/?$/.exec(url.pathname); if (om) return operatorPage(req, res, om[1]);
  if (url.pathname === '/api/ict') return handleIct(req, res);
  if (url.pathname === '/api/feedback') return handleFeedback(req, res);
  if (url.pathname === '/api/media-up') return handleMediaUp(req, res);
  if (url.pathname.startsWith('/api/media/') && (req.method === 'GET' || req.method === 'HEAD')) return serveMedia(req, res, url);
  if (url.pathname === '/api/pay/init' || url.pathname === '/api/pay/webhook' || url.pathname === '/api/pay/return' || url.pathname === '/api/operator') return payOrOperator(req, res, url);
  if (url.pathname === '/api/rpc') {
    if (req.method !== 'POST') return json(res, 405, { error: { code: 'method', message: 'POST only' } });
    const ip = clientIp(req);
    let size = 0; const chunks = [];
    let cap = 1.5e6;
    req.on('data', (c) => {
      if (!size && /^\s*\{\s*"method"\s*:\s*"restore"/.test(c.toString('utf8', 0, 60))) cap = 64e6; // only restore may be large
      size += c.length; if (size > cap) { req.destroy(); } else chunks.push(c);
    });
    req.on('error', () => {});
    req.on('end', () => {
      let msg;
      try { msg = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { return json(res, 400, { error: { code: 'bad-json', message: 'Bad request' } }); }
      if (!msg || typeof msg.method !== 'string') return json(res, 400, { error: { code: 'bad-request', message: 'Bad request' } });
      if (INTERNAL_ONLY[msg.method]) return json(res, 404, { error: { code: 'no-method', message: 'Unknown method' } });
      if (limited(ip, msg.method, msg.args)) return json(res, 429, { error: { code: 'rate', message: 'Too many requests. Wait a minute.' } });
      STAT.rpc++; try { return json(res, 200, { result: server.rpc(msg.method, msg.args) }); }
      catch (e) {
        if (e instanceof Core.SGError) return json(res, e.code === 'auth' ? 401 : 400, { error: { code: e.code, message: e.message } });
        STAT.rpcErr++; console.error('rpc error', msg.method, e && e.stack || e);
        return json(res, 500, { error: { code: 'server', message: 'Server error' } });
      }
    });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, headers()); return res.end(); }
  serveStatic(req, res, url.pathname);
}
/* a request that throws (for example a broken %-sequence in the address) must always get an answer, never hang */
const httpServer = http.createServer((req, res) => {
  try { handleRequest(req, res); }
  catch (e) { if (!res.headersSent) { try { res.writeHead(400, headers()); res.end(); } catch (_) {} } else { try { res.end(); } catch (_) {} } }
});

httpServer.headersTimeout = 30e3; httpServer.requestTimeout = 15 * 60e3; httpServer.keepAliveTimeout = 15e3;   // slow mobile uploads get 15 minutes, silent connections do not linger
httpServer.listen(PORT, HOST, () => {
  const nets = require('os').networkInterfaces(), ips = [];
  Object.keys(nets).forEach((k) => nets[k].forEach((n) => { if (n.family === 'IPv4' && !n.internal) ips.push(n.address); }));
  console.log('\n  SafeGate is running\n');
  console.log('  Student app :  http://localhost:' + PORT + '/');
  console.log('  Security desk: http://localhost:' + PORT + '/desk');
  ips.forEach((ip) => console.log('  On your network: http://' + ip + ':' + PORT + '/'));
  console.log('\n  Camera, location and offline mode need HTTPS on real phones (localhost is exempt).');
  console.log('  Data file: ' + DATA_FILE + '\n');
});
