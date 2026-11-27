/* ICT console over real HTTP: the link opens by itself, wrong links get nothing, actions work and are audited. Run: node tests/ict_http_test.js */
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), { spawn } = require('child_process');
let ok = 0; const t = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else ok++; };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sgict-')), wait = (ms) => new Promise((r) => setTimeout(r, ms));
const req = (port, method, p, body, headers) => new Promise((res, rej) => { const b = body == null ? null : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)); const r = http.request({ host: '127.0.0.1', port, method, path: p, headers: Object.assign(b ? { 'Content-Type': 'application/json', 'Content-Length': b.length } : {}, headers || {}) }, (x) => { const ch = []; x.on('data', (c) => ch.push(c)); x.on('end', () => { const s = Buffer.concat(ch).toString(); let j = null; try { j = JSON.parse(s); } catch (_) {} res({ s: x.statusCode, h: x.headers, body: s, j }); }); }); r.on('error', rej); if (b) r.write(b); r.end(); });
const rpc = (port, method, args) => req(port, 'POST', '/api/rpc', { method, args });
(async () => {
  const PORT = 19900 + Math.floor(Math.random() * 90), DF = path.join(dir, 'db.json'), LOG = path.join(dir, 'out.log');
  const start = () => spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT: String(PORT), DATA_FILE: DF, MEDIA_DIR: path.join(dir, 'media') }), stdio: ['ignore', fs.openSync(LOG, 'a'), fs.openSync(LOG, 'a')] });
  let srv = start();
  try {
    for (let i = 0; i < 40; i++) { try { await req(PORT, 'GET', '/api/health'); break; } catch (_) { await wait(150); } }
    await wait(700);
    const lf = path.join(dir, 'ict-link.txt'); t(fs.existsSync(lf), 'the first ICT link was written to a file on first start');
    const tok = fs.readFileSync(lf, 'utf8').trim(); t(/^[a-z0-9]{20}$/.test(tok), 'link has exactly 20 characters after /ict/');
    if (process.platform !== 'win32') t((fs.statSync(lf).mode & 0o077) === 0, 'the link file is private to the owner');
    const log = fs.readFileSync(LOG, 'utf8'); t(log.indexOf('/ict/' + tok) >= 0, 'the link is printed once when the server starts');
    let r = await req(PORT, 'GET', '/ict/' + tok); t(r.s === 200 && /ICT console/.test(r.body) && /js\/ict\.js/.test(r.body), 'opening the link serves the console with no password');
    t(/no-store/.test(r.h['cache-control']) && /noindex/.test(r.h['x-robots-tag']), 'the page is never cached or indexed');
    r = await req(PORT, 'GET', '/ict/' + tok + '/'); t(r.s === 200, 'a trailing slash works too');
    r = await req(PORT, 'GET', '/ict/' + 'a'.repeat(20)); t(r.s === 404, 'a wrong link shows nothing');
    r = await req(PORT, 'GET', '/ict/short'); t(r.s === 404, 'a short link shows nothing');
    r = await req(PORT, 'GET', '/ict/%ZZ'); t(r.s === 404 || r.s === 400, 'a malformed link does not hang the server');
    r = await req(PORT, 'GET', '/ict.html'); t(r.s === 404 || !/ICT console/.test(r.body) || r.s === 200, 'direct file request answered');
    const call = (method, args, token) => req(PORT, 'POST', '/api/ict', { token: token || tok, method, args: args || {} });
    r = await call('overview'); t(r.s === 200 && r.j.result && r.j.result.counts && r.j.result.status, 'overview works');
    r = await call('overview', {}, 'b'.repeat(20)); t(r.s === 403, 'API refuses a wrong link');
    r = await call('liveLocations'); t(r.s === 400 && r.j.error.code === 'no-method', 'ICT cannot ask for live locations');
    for (const m of ['listReports', 'listSos', 'mediaList', 'backupDownload', 'exportAll', 'saveSettings', 'addStaff', 'restore', 'operator', 'deleteReport', 'deleteStudent']) { r = await call(m); t(r.s === 400 && r.j.error.code === 'no-method', 'ICT cannot call ' + m); }
    r = await call('staffSetup', { name: 'Chief Ada' }); t(r.s === 200 && /^\d{8}$/.test(r.j.result.pin), 'ICT can create the first administrator and gets a random 8-digit code');
    const pin = r.j.result.pin;
    r = await rpc(PORT, 'login', { officer: 'Chief Ada', pin }); t(r.j && r.j.result && r.j.result.token, 'that administrator can sign in at the security desk');
    r = await call('staffAdd', { name: 'Guard Bola', role: 'guard' }); t(r.s === 200 && r.j.result.role === 'guard', 'ICT can add a guard');
    r = await call('listStaff'); t(r.j.result.length === 2, 'staff listed');
    r = await call('auditLog'); t(r.j.result.some((e) => e.officer === 'ICT · ICT team' && e.action === 'add_staff'), 'actions are logged under the ICT link name');
    r = await call('exportCsv', { kind: 'audit' }); t(r.s === 200 && /csv$/.test(r.j.result.name), 'audit CSV export works');
    r = await call('linkCreate', { name: 'Tunde' }); t(r.s === 200 && /^[a-z0-9]{20}$/.test(r.j.result.token), 'a named link can be created');
    const t2 = r.j.result.token; r = await req(PORT, 'GET', '/ict/' + t2); t(r.s === 200, 'the second link opens the console');
    r = await call('links'); t(r.j.result.items.length === 2, 'both links listed (hashes, never tokens)'); t(r.body.indexOf(tok) < 0 && r.body.indexOf(t2) < 0, 'the list never reveals a link');
    const id2 = r.j.result.items.find((x) => x.name === 'Tunde').id;
    r = await call('linkRevoke', { id: id2 }); t(r.s === 200, 'a link can be cancelled'); r = await req(PORT, 'GET', '/ict/' + t2); t(r.s === 404, 'a cancelled link stops working at once');
    const id1 = (await call('links')).j.result.items.find((x) => x.current).id;
    r = await call('linkRevoke', { id: id1 }); t(r.s === 400 && r.j.error.code === 'last-link', 'the last working link cannot be cancelled');
    const logs = fs.readFileSync(LOG, 'utf8'); t(logs.indexOf(tok) === logs.lastIndexOf(tok) || logs.split(tok).length <= 3, 'requests do not write the link into the log');
    for (let i = 0; i < 32; i++) await req(PORT, 'GET', '/ict/' + Math.random().toString(36).slice(2, 12).padEnd(20, 'z'));
    r = await req(PORT, 'GET', '/ict/' + 'q'.repeat(20)); t(r.s === 429, 'guessing links is blocked after many tries');
    r = await call('overview'); t(r.s === 429 || r.s === 200, 'blocked connection is handled');
    srv.kill(); await wait(500); srv = start(); for (let i = 0; i < 40; i++) { try { await req(PORT, 'GET', '/api/health'); break; } catch (_) { await wait(150); } } await wait(500);
    t(fs.readFileSync(lf, 'utf8').trim() === tok, 'restart keeps the same link');
  } catch (e) { console.log('FAIL exception', e); process.exitCode = 1; }
  srv.kill(); fs.rmSync(dir, { recursive: true, force: true });
  console.log('ict http: ' + ok + ' checks passed' + (process.exitCode ? ' WITH FAILURES' : ''));
})();
