/* Hostile requests against the real server: path tricks, secret files, bad bodies. Run: node tests/abuse_test.js */
const net = require('net'), { spawn } = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sgab-')), P = 19950 + Math.floor(Math.random() * 40);
const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT: String(P), DATA_FILE: dir + '/db.json' }), stdio: 'ignore' });
let ok = 0; const t = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else ok++; };
const raw = (s, wait = 800) => new Promise((r) => { const c = net.connect(P, '127.0.0.1', () => c.write(s)); let d = ''; c.on('data', (x) => d += x); c.on('error', () => r('ERR')); c.on('close', () => r(d.split('\r\n')[0] || 'closed')); setTimeout(() => { c.destroy(); r(d.split('\r\n')[0] || 'open'); }, wait); });
const get = (p) => raw('GET ' + p + ' HTTP/1.1\r\nHost:x\r\n\r\n');
(async () => {
  await new Promise((r) => setTimeout(r, 1200));
  t(/ 400 /.test(await raw('POST /api/rpc HTTP/1.1\r\nHost:x\r\nContent-Length:5\r\nContent-Type:application/json\r\n\r\n{nope')), 'broken JSON gets 400');
  for (const p of ['/../server.js', '/%2e%2e/server.js', '/data/db.json', '/data/media/x', '/.env.example', '/mail.js', '/server.js', '/tests/run-all.js', '/package.json', '/deploy/vps-install.sh', '/%00', '/js/../server.js']) t(/ 40[034] /.test(await get(p)), 'not served: ' + p);
  for (const p of ['/%E0%A4%A', '/%', '/api/media/%ZZ']) t(/ 400 /.test(await get(p)), 'broken % in the address gets 400, not a hang: ' + p);
  t(/ 400 /.test(await raw('POST /api/media-up HTTP/1.1\r\nHost:x\r\nContent-Length:300\r\n\r\n')), 'media upload without a kind is refused');
  t(/ 413 /.test(await raw('POST /api/media-up HTTP/1.1\r\nHost:x\r\nX-SG-Kind:image\r\nTransfer-Encoding:chunked\r\n\r\n5\r\nhello\r\n0\r\n\r\n')), 'media upload without a length is refused');
  t(/ 413 /.test(await raw('POST /api/media-up HTTP/1.1\r\nHost:x\r\nX-SG-Kind:image\r\nContent-Length:99999999\r\n\r\n')), 'oversized media refused before reading it');
  t(/ 404 /.test(await raw('POST /api/operator HTTP/1.1\r\nHost:x\r\nContent-Length:2\r\n\r\n{}')), 'operator page is invisible without the key');
  t(/ 405 /.test(await raw('TRACE / HTTP/1.1\r\nHost:x\r\n\r\n')), 'TRACE refused');
  t(/ 200 /.test(await get('/api/health')), 'health works');
  t(/ 403 /.test(await get('/api/media/abcdefgh1234?e=9999999999999&s=00')), 'media without a valid signature refused');
  console.log(ok + ' abuse checks passed'); srv.kill(); await new Promise((r) => setTimeout(r, 300)); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
})();
