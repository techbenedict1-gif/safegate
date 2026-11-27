/* ICT console rules: private link, what it can and cannot do, audit. Run: node tests/ict_test.js */
const C = require(__dirname + '/../js/core.js'); let T = Date.UTC(2026, 10, 20, 9, 0, 0); const db = {};
const S = C.createServer(db, { now: () => T, notify() {}, sms: (m, d) => d({ ok: true }) });
let ok = 0; const t = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else ok++; };
const code = (f) => { try { f(); return null; } catch (e) { return e.code || e.message; } };
const tok = S.ictBootstrap();
t(/^[a-z0-9]{20}$/.test(tok), 'first link is exactly 20 letters and digits: ' + tok);
t(S.ictBootstrap() === null, 'a second start does not create another link');
t(!JSON.stringify(db).includes(tok), 'the link itself is never stored, only its hash');
const run = (method, args, ctx, token) => S.ictRun({ token: token || tok, method, args: args || {}, ctx });
t(code(() => run('overview', {}, null, 'a'.repeat(20))) === 'ict-link', 'a wrong 20-character link is refused');
t(code(() => run('overview', {}, null, 'short')) === 'ict-link', 'a malformed link is refused');
let o = run('overview'); t(o.setup === false && o.status === 'bad', 'before setup, overview warns there is no administrator');
const first = run('staffSetup', { name: 'Ada Admin' }); t(/^\d{8}$/.test(first.pin) && first.role === 'admin', 'ICT can create the first administrator with a generated PIN');
t(S.rpc('login', { officer: 'Ada Admin', pin: first.pin }).role === 'admin', 'that PIN really signs in to the desk');
t(code(() => run('staffSetup', { name: 'Eve' })) === 'already-setup', 'first-admin setup works only once');
// students
const mk = (m, n) => ({ matric: m, name: n, phone: '0801234' + m.slice(-4), emergency: { name: 'P', phone: '08099999999' } });
S.rpc('ingest', { student: mk('CSC/21/0001', 'Ben Doe'), deviceId: 'devA-1234567', items: [{ id: 'rep-00000001', type: 'report', t: T, cat: 'theft', text: 'private report text' }, { id: 'sos-00000001', type: 'sos', t: T, lat: 6.1, lng: 5.1 }] });
const L = run('students', { q: 'ben' }); const row = L.items[0];
t(L.items.length === 1 && row.phone === '080•••••001' || /•••/.test(row.phone) && !row.phone.includes('0801234'), 'student list masks phone numbers: ' + row.phone);
t(!('lat' in row) && !JSON.stringify(L).includes('private report') && !('outside' in row), 'student list shows no location, status or report text');
// ICT cannot reach privacy features
['trail', 'requestTrail', 'liveMap', 'listReports', 'reportEvidence', 'mediaList', 'studentDetail', 'traceSheet', 'board', 'caseDetail', 'exportAll', 'backup', 'restore', 'login'].forEach((m) => t(code(() => run(m, {})) === 'no-method', 'ICT cannot call ' + m));
// release device -> new phone can register
t(code(() => S.rpc('ingest', { student: mk('CSC/21/0001', 'Ben Doe'), deviceId: 'devB-7654321', items: [] })) === 'device-locked', 'a new phone is blocked while the old one is locked');
run('studentRelease', { matric: 'CSC/21/0001', note: 'lost phone' });
S.rpc('ingest', { student: mk('CSC/21/0001', 'Ben Doe'), deviceId: 'devB-7654321', items: [] });
t(db.students['CSC/21/0001'].deviceId === 'devB-7654321', 'after release, the student can register on the new phone');
run('studentEdit', { matric: 'CSC/21/0001', name: 'Benedict Doe', residence: 'Hall 2' }); t(db.students['CSC/21/0001'].name === 'Benedict Doe', 'ICT can fix a name');
t(code(() => run('studentEdit', { matric: 'CSC/21/0001', name: 'x' })) === 'bad-name', 'name too short refused');
// staff
const add = run('staffAdd', { name: 'Officer One', role: 'officer' }); t(S.rpc('login', { officer: 'Officer One', pin: add.pin }).role === 'officer', 'ICT adds an officer with a generated PIN that works');
t(code(() => run('staffAdd', { name: 'officer one' })) === 'exists', 'duplicate staff refused');
const rs = run('staffReset', { name: 'Officer One' }); t(rs.pin !== add.pin && code(() => S.rpc('login', { officer: 'Officer One', pin: add.pin })) === 'bad-login', 'reset PIN replaces the old one');
run('setStaffActive', { name: 'Officer One', active: false }); t(code(() => S.rpc('login', { officer: 'Officer One', pin: rs.pin })) === 'bad-login', 'a disabled officer cannot sign in');
t(code(() => run('setStaffActive', { name: 'Ada Admin', active: false })) === 'last-admin', 'the last administrator cannot be switched off');
// settings: only ICT-safe fields
const before = JSON.stringify([db.settings.trackFrom, db.settings.trackUntil, db.settings.pingIntervalSec, db.settings.campus]);
run('settingsSave', { settings: { graceMin: 45, mediaDays: 14, trackFrom: '00:00', pingIntervalSec: 30, campus: { lat: 1, lng: 1 }, policyText: 'x'.repeat(40) } });
t(db.settings.graceMin === 45 && db.settings.mediaDays === 14, 'ICT can change system settings');
t(JSON.stringify([db.settings.trackFrom, db.settings.trackUntil, db.settings.pingIntervalSec, db.settings.campus]) === before, 'ICT cannot widen location tracking or move the campus');
t(!('gateSecret' in run('settingsGet')) && !('cardSecret' in run('settingsGet')), 'secrets are never returned');
// exports
const ex = run('exportCsv', { kind: 'students' }); t(/matric,name/.test(ex.csv) && !ex.csv.includes('0801234') && /safegate-students/.test(ex.name), 'student export has masked phones');
db.students['CSC/21/0001'].name = '=HYPERLINK("x")'; t(run('exportCsv', { kind: 'students' }).csv.includes("'=HYPERLINK"), 'spreadsheet formula injection is neutralised');
t(code(() => run('exportCsv', { kind: 'pings' })) === 'bad-kind', 'cannot export location data');
// audit attribution
const au = run('auditLog'); t(au.some((e) => e.officer === 'ICT · ICT team' && e.action === 'ict_release_device'), 'actions are recorded under the link name');
// links
const l2 = run('linkCreate', { name: 'Chidi (ICT)' }); t(/^[a-z0-9]{20}$/.test(l2.token) && l2.token !== tok, 'a second named link can be created');
t(run('overview', {}, null, l2.token).link.name === 'Chidi (ICT)', 'the second link works and knows its name');
const ids = run('links').items; const id1 = ids.find((x) => x.name === 'ICT team').id;
const rot = run('linkRotate', { id: id1 }, null, l2.token); t(code(() => run('overview', {}, null, tok)) === 'ict-link' && /^[a-z0-9]{20}$/.test(rot.token), 'rotating a link kills the old one and gives a new one');
t(code(() => run('linkRevoke', { id: ids.find((x) => x.name === 'Chidi (ICT)').id }, null, rot.token)) === null, 'a link can be revoked while another works');
t(code(() => run('linkRevoke', { id: run('links', {}, null, rot.token).items.find((x) => !x.revoked).id }, null, rot.token)) === 'last-link', 'the last working link cannot be revoked (no lock-out)');
// restore keeps links
const snap = JSON.parse(JSON.stringify(Object.assign({}, db, { sessions: {} }))); delete snap.ict;
const rr = run('backupRestore', { name: 'db-20261120-090000.json' }, () => ({ readBackup: () => snap, backupNow: () => ({ ok: true }) }), rot.token);
t(rr.ok && code(() => run('overview', {}, null, rot.token)) === null, 'restoring a backup keeps the ICT link working');
t(code(() => run('backupRestore', { name: '../../etc/passwd' }, () => ({ readBackup: () => snap }), rot.token)) === 'bad-name', 'restore only accepts backup names from the list');
// checkup
const ck = run('checkup', { clientTime: T + 10 * 60000 }, () => ({ backups: [], disk: { freeMB: 100 }, publicUrl: 'http://x', mail: { configured: false }, errors1h: 2 }), rot.token).checks.map((x) => x.id + ':' + x.level).join(' ');
t(/backup:bad/.test(ck) && /disk:bad/.test(ck) && /url:warn/.test(ck) && /clock:warn/.test(ck) && /mail:warn/.test(ck) && /errs:warn/.test(ck), 'check-up finds missing backup, low disk, http address, clock drift, email off, server errors');
// voices and insights: read-only view of what students report
const R = (m, a, c) => run(m, a, c, rot.token); const vo = R('voices'); t(vo.reports.some((r) => /private report text/.test(r.text) && r.name === 'Ben Doe') && vo.sos.length >= 1, 'ICT can read reports and emergency alerts');
t(!/"(lat|lng|acc|evidence)"/.test(JSON.stringify(vo)), 'reports and alerts carry no coordinates or evidence to ICT');
t(R('auditLog').some((e) => e.action === 'ict_view_voices'), 'opening reports is recorded in the activity log');
const n1 = R('auditLog').length; R('voices', { quiet: true }); t(R('auditLog').length === n1, 'a refresh does not flood the log');
S.rpc('ingest', { student: mk('CSC/21/0002', 'Anon Doe'), deviceId: 'devB-1234567', items: [{ id: 'rep-00000002', type: 'report', t: T, cat: 'bullying', text: 'Hostel bullying keeps happening', anonymous: true }] });
const vo2 = R('voices', { quiet: true }); const an = vo2.reports.find((r) => r.id === 'rep-00000002'); t(an && an.anon && an.name === 'Anonymous' && !an.matric, 'anonymous reports stay anonymous for ICT');
const ins = R('insights', {}, () => ({ feedback: [{ t: T, kind: 'idea', rating: 4, message: 'Please add dark mode for night walks' }, { t: T, kind: 'love', rating: 5, message: 'Feels safe now' }] }));
t(ins.reports.total >= 2 && ins.reports.cats.length >= 1 && ins.sos.total >= 1 && ins.feedback.avg === 4.5 && ins.ideas.length === 1 && Array.isArray(ins.tips), 'insights summarise reports, alerts and feedback');
t(code(() => run('updateReport', { id: 'rep-00000001', status: 'closed' }, null, rot.token)) === 'no-method', 'ICT still cannot change or close a report');
console.log(ok + ' ICT checks passed');
