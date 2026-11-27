/* Evidence retention and storage rules, with a controllable clock. Run: node tests/media_core_test.js */
const C = require(__dirname + '/../js/core.js'); let T = Date.UTC(2026, 10, 9, 12, 0, 0); const db = {};
const S = C.createServer(db, { now: () => T, notify() {}, sms: (m, d) => d({ ok: true }) });
let ok = 0; const t = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else ok++; };
const tok = S.rpc('setupStaff', { officer: 'Ada', pin: '123456', schoolName: 'U' }).token;
const A = { matric: 'CSC/21/001', name: 'Ben Doe', phone: '08011110001', emergency: { name: 'Mum', phone: '08099999999' } };
S.rpc('ingest', { student: A, deviceId: 'devA-1234567', items: [{ id: 'rep-00000001', type: 'report', t: T, cat: 'theft', text: 'Laptop stolen from the reading room' }, { id: 'sos-00000001', type: 'sos', t: T }] });
S.rpc('saveSettings', { token: tok, settings: { mediaDays: 2 } }); t(db.settings.mediaDays === 2, 'retention days can be set');
const add = (id, kind, ref, type, bytes) => { const b = S.rpc('mediaBegin', { matric: A.matric, deviceId: 'devA-1234567', refType: type, ref, kind, cid: id, bytes }); S.rpc('mediaDone', { id, ref, refType: type, owner: b.owner, kind, mime: 'image/jpeg', bytes, sha: 'x' }); };
add('img-000001', 'image', 'rep-00000001', 'report', 100000); add('aud-000001', 'audio', 'rep-00000001', 'report', 50000);
t(db.mediaBytes === 150000, 'storage counter tracks bytes');
T += 1 * 86400000; add('img-000002', 'image', 'rep-00000001', 'report', 20000);   // added a day later, expires later
let r = S.rpc('mediaSweep', {}); t(r.gone.length === 0, 'nothing is deleted before its time');
T += 1.5 * 86400000; r = S.rpc('mediaSweep', {});
t(r.gone.length === 2 && r.gone.indexOf('img-000001') >= 0 && r.gone.indexOf('aud-000001') >= 0, 'files older than the retention period are listed for deletion (2 days here)');
t(Object.keys(db.media).length === 1 && db.mediaBytes === 20000, 'counter shrinks when files are deleted');
t((db.reports[0].mediaN || 0) === 1, 'report file count follows deletions');
T += 2 * 86400000; r = S.rpc('mediaSweep', {}); t(r.gone.length === 1 && db.mediaBytes === 0, 'the last file goes too');
// total storage cap protects the disk, but SOS is exempt
db.settings.mediaTotalMB = 0.1; db.mediaBytes = 0;
let e1 = null; try { S.rpc('mediaBegin', { matric: A.matric, deviceId: 'devA-1234567', refType: 'report', ref: 'rep-00000001', kind: 'image', cid: 'img-000009', bytes: 200000 }); } catch (e) { e1 = e.code; }
t(e1 === 'full', 'full school storage refuses report files');
S.rpc('ingest', { student: A, deviceId: 'devA-1234567', items: [{ id: 'sos-00000002', type: 'sos', t: T }] });
let e2 = null; try { S.rpc('mediaBegin', { matric: A.matric, deviceId: 'devA-1234567', refType: 'sos', ref: 'sos-00000002', kind: 'image', cid: 'img-000010', bytes: 200000 }); } catch (e) { e2 = e.code; }
t(e2 === null, 'an SOS can still send a picture when storage is full');
db.settings.mediaOn = false;
let e3 = null; try { S.rpc('mediaBegin', { matric: A.matric, deviceId: 'devA-1234567', refType: 'sos', ref: 'sos-00000002', kind: 'image', cid: 'img-000011', bytes: 2000 }); } catch (e) { e3 = e.code; }
t(e3 === 'media-off', 'school can switch evidence off');
console.log(ok + ' media core checks passed');
