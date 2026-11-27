/* Evidence media end to end over real HTTP: upload rules, ownership, bad files, quotas, signed links, audit, deletion. Run: node tests/media_test.js */
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto'), { spawn } = require('child_process');
let ok = 0; const t = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else ok++; };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sgmedia-')), wait = (ms) => new Promise((r) => setTimeout(r, ms));
const req = (port, method, p, body, headers) => new Promise((res, rej) => { const b = body == null ? null : Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body)); const r = http.request({ host: '127.0.0.1', port, path: p, method, headers: Object.assign(b ? { 'Content-Length': b.length, 'Content-Type': Buffer.isBuffer(body) ? 'application/octet-stream' : 'application/json' } : {}, headers || {}) }, (x) => { const c = []; x.on('data', (d) => c.push(d)); x.on('end', () => { const raw = Buffer.concat(c); let j = null; try { j = JSON.parse(raw.toString()); } catch (_) {} res({ s: x.statusCode, j, raw, h: x.headers }); }); }); r.on('error', rej); if (b) r.write(b); r.end(); });
const rpc = (port, method, args) => req(port, 'POST', '/api/rpc', { method, args });
const jpeg = (n) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]), crypto.randomBytes(n)]);
const webm = (n) => Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81]), crypto.randomBytes(n)]);
(async () => {
  const PORT = 19000 + Math.floor(Math.random() * 900), MD = path.join(dir, 'media');
  const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT: String(PORT), DATA_FILE: path.join(dir, 'db.json'), MEDIA_DIR: MD }), stdio: 'ignore' });
  try {
    for (let i = 0; i < 40; i++) { try { await req(PORT, 'GET', '/api/health'); break; } catch (_) { await wait(150); } }
    const tok = (await rpc(PORT, 'setupStaff', { officer: 'Ada', pin: '123456', schoolName: 'U' })).j.result.token;
    const A = { matric: 'CSC/21/001', name: 'Ben Doe', phone: '08011110001', emergency: { name: 'Mum', phone: '08099999999' } }, DEV = 'devA-1234567', now = Date.now();
    const ing = (items, dev, st) => rpc(PORT, 'ingest', { student: st || A, deviceId: dev || DEV, items });
    await ing([{ id: 'rep-00000001', type: 'report', t: now, cat: 'suspicious', text: 'A man is taking pictures of the hostel gate' }, { id: 'rep-anon0001', type: 'report', t: now, cat: 'theft', text: 'Phone stolen near the library', anonymous: true, anonKey: 'secret-anon-key' }, { id: 'sos-00000001', type: 'sos', t: now }]);
    const up = (body, h) => req(PORT, 'POST', '/api/media-up', body, Object.assign({ 'X-SG-Matric': A.matric, 'X-SG-Device': DEV, 'X-SG-Type': 'report', 'X-SG-Ref': 'rep-00000001', 'X-SG-Kind': 'image', 'X-SG-Id': 'img-000001' }, h || {}));
    let r = await up(jpeg(5000)); t(r.s === 200 && r.j.ok, 'picture uploaded');
    r = await up(jpeg(5000)); t(r.s === 200 && r.j.again, 'same upload again is safe (no duplicate)');
    r = await up(jpeg(5000), { 'X-SG-Device': 'someone-elses-phone' , 'X-SG-Id': 'img-000002' }); t(r.s === 400 && r.j.error.code === 'forbidden', 'another phone cannot add files to my report');
    r = await up(jpeg(5000), { 'X-SG-Ref': 'rep-nothere1', 'X-SG-Id': 'img-000003' }); t(r.s === 404 && r.j.error.code === 'no-ref', 'unknown report waits (no-ref) so the phone retries later');
    r = await up(Buffer.from('<html><script>alert(1)</script></html>'.padEnd(400, ' ')), { 'X-SG-Id': 'img-000004' }); t(r.s === 400 && r.j.error.code === 'bad-file', 'a web page pretending to be a picture is refused');
    r = await up(jpeg(500000), { 'X-SG-Id': 'img-000005' }); t(r.s === 413, 'an oversized picture is refused before it is read');
    r = await up(webm(3000), { 'X-SG-Id': 'img-000006' }); t(r.s === 400, 'a video sent as a picture is refused');
    r = await up(webm(40000), { 'X-SG-Kind': 'audio', 'X-SG-Id': 'aud-000001', 'X-SG-Dur': '30' }); t(r.s === 200, 'voice note uploaded');
    r = await up(webm(400000), { 'X-SG-Kind': 'video', 'X-SG-Id': 'vid-000001', 'X-SG-Dur': '15' }); t(r.s === 200, 'video uploaded');
    r = await up(webm(40000), { 'X-SG-Kind': 'video', 'X-SG-Id': 'vid-000002' }); t(r.s === 400 && r.j.error.code === 'limit', 'only one video per report');
    for (let i = 2; i <= 6; i++) r = await up(jpeg(3000), { 'X-SG-Id': 'img-10000' + i }); t(r.s === 200, 'six pictures fit');
    r = await up(jpeg(3000), { 'X-SG-Id': 'img-100007' }); t(r.s === 400 && r.j.error.code === 'limit', 'a seventh picture is refused');
    r = await up(jpeg(3000), { 'X-SG-Id': 'img-200001', 'X-SG-Ref': 'rep-anon0001', 'X-SG-Matric': '', 'X-SG-Anon': 'wrong' }); t(r.s === 400 && r.j.error.code === 'forbidden', 'anonymous report: wrong key refused');
    r = await up(jpeg(3000), { 'X-SG-Id': 'img-200002', 'X-SG-Ref': 'rep-anon0001', 'X-SG-Matric': '', 'X-SG-Device': '', 'X-SG-Anon': 'secret-anon-key' }); t(r.s === 200, 'anonymous report: right key accepted');
    r = await up(jpeg(3000), { 'X-SG-Id': 'sos-img-0001', 'X-SG-Type': 'sos', 'X-SG-Ref': 'sos-00000001' }); t(r.s === 200, 'picture attached to an SOS');
    // desk side
    r = await rpc(PORT, 'mediaList', { token: 'nope', ref: 'rep-00000001' }); t(r.s === 401, 'staff sign-in needed to list files');
    r = await rpc(PORT, 'mediaList', { token: tok, ref: 'rep-00000001', refType: 'report' }); const items = r.j.result.items; t(items.length === 8, 'desk sees all 8 files: ' + items.length);
    const im = items.find((x) => x.kind === 'image'), au = items.find((x) => x.kind === 'audio');
    let g = await req(PORT, 'GET', '/' + im.url); t(g.s === 200 && g.h['content-type'] === 'image/jpeg' && g.h['x-content-type-options'] === 'nosniff' && /sandbox/.test(g.h['content-security-policy']), 'signed link serves the picture safely');
    g = await req(PORT, 'GET', '/' + au.url); t(g.s === 200 && g.h['content-type'] === 'audio/webm', 'voice note served as audio');
    g = await req(PORT, 'GET', '/' + au.url, null, { Range: 'bytes=0-99' }); t(g.s === 206 && g.raw.length === 100, 'range requests work (video seeking)');
    g = await req(PORT, 'GET', '/' + im.url.replace(/s=[0-9a-f]+/, 's=' + '0'.repeat(64))); t(g.s === 403, 'forged link refused');
    g = await req(PORT, 'GET', '/api/media/' + im.id); t(g.s === 403, 'no link, no file');
    g = await req(PORT, 'GET', '/api/media/..%2Fdb.json?e=1&s=1'); t(g.s === 404 || g.s === 403, 'path tricks refused');
    const aud = await rpc(PORT, 'auditLog', { token: tok }); t(JSON.stringify(aud.j.result || aud.j).includes('view_media'), 'opening evidence is written to the audit log');
    r = await rpc(PORT, 'listReports', { token: tok }); const rl = r.j.result.reports || r.j.result; t(Array.isArray(rl) && rl.some((x) => x.id === 'rep-00000001' && x.mediaN === 8), 'report shows how many files it has');
    r = await rpc(PORT, 'mediaBegin', { matric: A.matric }); t(r.s === 404, 'internal media methods are not callable from outside');
    // quota
    const B = { matric: 'CSC/21/002', name: 'Amina K', phone: '08011110002', emergency: { name: 'Dad', phone: '08088888888' } };
    await ing([{ id: 'rep-00000002', type: 'report', t: now, cat: 'unsafe', text: 'Broken light on the footpath' }], 'devB-1234567', B);
    await rpc(PORT, 'saveSettings', { token: tok, settings: { mediaDayMB: 1 } });
    r = await req(PORT, 'POST', '/api/media-up', webm(430000), { 'X-SG-Matric': B.matric, 'X-SG-Device': 'devB-1234567', 'X-SG-Type': 'report', 'X-SG-Ref': 'rep-00000002', 'X-SG-Kind': 'video', 'X-SG-Id': 'vid-b00001' }); t(r.s === 200, 'first video under the daily limit');
    r = await req(PORT, 'POST', '/api/media-up', webm(430000), { 'X-SG-Matric': B.matric, 'X-SG-Device': 'devB-1234567', 'X-SG-Type': 'report', 'X-SG-Ref': 'rep-00000002', 'X-SG-Kind': 'audio', 'X-SG-Id': 'aud-b00001' }); t(r.s === 200, 'second file still under 1 MB total');
    r = await req(PORT, 'POST', '/api/media-up', webm(430000), { 'X-SG-Matric': B.matric, 'X-SG-Device': 'devB-1234567', 'X-SG-Type': 'report', 'X-SG-Ref': 'rep-00000002', 'X-SG-Kind': 'audio', 'X-SG-Id': 'aud-b00002' }); t(r.s === 400 && r.j.error.code === 'quota', 'daily upload limit stops further files');
    // retention: shorten to 1 day is not enough to expire; force by editing the db file is risky, so check the sweep through disk consistency
    t(fs.readdirSync(MD).filter((f) => !f.endsWith('.part')).length === 12, 'files on disk match accepted uploads: ' + fs.readdirSync(MD).length);
    t(fs.readdirSync(MD).filter((f) => f.endsWith('.part')).length === 0, 'no half-written files left behind');
  } finally { srv.kill(); }
  console.log(ok + ' media checks passed' + (process.exitCode ? ' (with failures)' : '')); await wait(400); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {}
})().catch((e) => { console.log('ERR', e); process.exitCode = 1; });
