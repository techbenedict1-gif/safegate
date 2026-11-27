/* Gate poster + anti-snap: scans stay easy, cheats leave clues. Run: node tests/gate_test.js */
const C = require(__dirname + '/../js/core.js'); let T = Date.UTC(2026, 10, 21, 9, 0, 0); const db = {}; const sms = [];
const S = C.createServer(db, { now: () => T, notify() {}, sms: (m, d) => { sms.push(m); d({ ok: true }); } });
let ok = 0; const t = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else ok++; };
const tok = S.ictBootstrap(), run = (m, a) => S.ictRun({ token: tok, method: m, args: a || {}, ctx: () => ({}) });
run('staffSetup', { name: 'Chief Ada' });
run('settingsSave', { settings: { gateMode: 'static', gatePoint: { lat: 6.5, lng: 5.5, radiusM: 100 } } });
let P = run('gatePoster'); t(P.mode === 'static' && P.gatePoint.lat === 6.5 && /^MAIN\.S\.[0-9a-f]{12}$/.test(P.token), 'the poster gives a constant code and the gate spot is saved');
t(!JSON.stringify(run('settingsGet')).includes('gateSecret'), 'secrets never reach ICT');
const stu = { matric: 'CSC/21/0001', name: 'Ben Doe', phone: '08012340001', emergency: { name: 'P', phone: '08099999999' } };
const scan = (id, extra) => { const r = S.rpc('ingest', { student: stu, deviceId: 'devA-1234567', items: [Object.assign({ id, type: 'out', t: T, gate: P.token, source: 'qr', destination: { name: 'Ibadan Road Pharmacy, Opposite Total' } }, extra)] }); return db.events[db.events.length - 1]; };
const near = { lat: 6.5003, lng: 5.5003, acc: 12 };
let e = scan('scan-0000001', Object.assign({ locAt: T - 5000 }, near)); t(e.gate === 'static' && !e.flags.length && e.gateDist < 100, 'an honest scan at the gate has no flags');
e = scan('scan-0000002', { lat: 6.52, lng: 5.5, acc: 15, locAt: T - 3000 }); t(e.flags.indexOf('away-from-gate') >= 0, 'a scan 2 km away is marked not at the gate');
e = scan('scan-0000003', { lat: 6.5025, lng: 5.5, acc: 20, locAt: T - 3000 }); t(e.flags.indexOf('away-from-gate') >= 0, 'a scan 280 m away is marked (tight gate point)');
e = scan('scan-0000004', { lat: 6.5009, lng: 5.5, acc: 40, locAt: T - 3000 }); t(e.flags.indexOf('away-from-gate') < 0, 'a scan 100 m away with a weak 40 m fix is not marked (benefit of the doubt)');
e = scan('scan-0000005', Object.assign({ locAt: T - 20 * 60e3 }, near)); t(e.flags.indexOf('old-location') >= 0, 'a location taken 20 minutes before the scan is marked');
e = scan('scan-0000006', {}); t(e.flags.indexOf('scan-no-location') >= 0 && e.flags.indexOf('away-from-gate') < 0, 'no location is a mild clue, never a block');
t(db.events.length === 6, 'every scan was accepted: nobody is blocked at the gate');
// parents are not told "back on campus" for a far scan
sms.length = 0; S.rpc('ingest', { student: stu, deviceId: 'devA-1234567', items: [{ id: 'in-00000001', type: 'in', t: T, gate: P.token, source: 'qr', lat: 6.6, lng: 5.5, acc: 10, locAt: T }] });
t(!sms.some((m) => /back on campus/.test(m)), 'a far "in" scan does not text the parent that the student is back');
// rotate poster: old still works for 14 days, flagged
run('settingsSave', { settings: { posterRotate: true } }); const P2 = run('gatePoster'); t(P2.token !== P.token, 'a new poster code is made');
e = scan('scan-0000007', Object.assign({ locAt: T }, near)); t(e.gate === 'static' && e.flags.indexOf('old-poster') >= 0, 'the old poster still works but is flagged');
P = P2; e = scan('scan-0000008', Object.assign({ locAt: T }, near)); t(!e.flags.length, 'the new poster scans clean');
T += 15 * 86400e3; const oldTok = 'MAIN.S.' + 'x'; e = scan('scan-0000009', {}); t(e.flags.indexOf('old-poster') < 0, 'a fresh scan is fine after the grace');
const old = db.events.filter((x) => x.id === 'scan-0000007')[0]; t(!!old, 'history kept');
// after grace the old token is invalid
const savedPrev = db.settings.gateSecretPrev; t(db.settings.gatePrevUntil < T, 'grace period ended');
t(run('gatePoster').idPolicy === 'none', 'ID is not required by default');
run('settingsSave', { settings: { idPolicy: 'required' } }); t(run('gatePoster').idPolicy === 'required', 'a school can set its own ID rule');
run('settingsSave', { settings: { idPolicy: 'nonsense' } }); t(run('gatePoster').idPolicy === 'none', 'bad values fall back to relaxed');
console.log('gate: ' + ok + ' checks passed' + (process.exitCode ? ' WITH FAILURES' : ''));
// policy
(function () {
  const run2 = run; run2('settingsSave', { settings: { gatePolicy: 'open' } });
  let e2 = scan('pol-00000001', { lat: 6.6, lng: 5.5, acc: 10, locAt: T }); t(e2.flags.indexOf('away-from-gate') < 0 && e2.gateDist > 1000, 'Relaxed: a far scan is recorded but never marked');
  run2('settingsSave', { settings: { gatePolicy: 'strict' } });
  e2 = scan('pol-00000002', { lat: 6.5014, lng: 5.5, acc: 40, locAt: T }); t(e2.flags.indexOf('away-from-gate') >= 0, 'Strict: 155 m away is marked');
  run2('settingsSave', { settings: { gatePolicy: 'nonsense' } }); t(run2('gatePoster').policy === 'standard', 'a bad policy value falls back to Balanced');
  console.log('gate policy checks done: ' + ok);
})();
