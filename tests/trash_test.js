/* Security delete powers + recycle bin + ICT help-a-person tools. Run: node tests/trash_test.js */
const C = require(__dirname + '/../js/core.js'); let T = Date.UTC(2026, 10, 20, 9, 0, 0); const db = {};
const S = C.createServer(db, { now: () => T, notify() {}, sms: (m, d) => d({ ok: true }) });
let ok = 0; const t = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else ok++; };
const code = (f) => { try { f(); return null; } catch (e) { return e.code || e.message; } };
const tok = S.ictBootstrap(), run = (m, a) => S.ictRun({ token: tok, method: m, args: a || {}, ctx: () => ({}) });
const adm = run('staffSetup', { name: 'Chief Ada' }); const A = S.rpc('login', { officer: 'Chief Ada', pin: adm.pin }).token;
const off = run('staffAdd', { name: 'Officer Ose', role: 'officer' }); const O = S.rpc('login', { officer: 'Officer Ose', pin: off.pin }).token;
let O2; const gd = run('staffAdd', { name: 'Guard Gbenga', role: 'guard' }); const G = S.rpc('login', { officer: 'Guard Gbenga', pin: gd.pin }).token;
const mk = (m, n) => ({ matric: m, name: n, phone: '0801234' + m.slice(-4), emergency: { name: 'P', phone: '08099999999' } });
const item = { id: 'rep-00000001', type: 'report', t: T, cat: 'theft', text: 'my bag was taken' };
const ing = (items) => S.rpc('ingest', { student: mk('CSC/21/0001', 'Ben Doe'), deviceId: 'devA-1234567', items });
ing([item, { id: 'sos-00000001', type: 'sos', t: T, lat: 6.1, lng: 5.1 }, { id: 'ping-0000001', type: 'ping', t: T, lat: 6.1, lng: 5.1 }]);

// reports
t(S.rpc('listReports', { token: O }).length === 1, 'officer sees the report');
t(code(() => S.rpc('deleteReport', { token: G, id: 'rep-00000001', reason: 'test' })) === 'forbidden' || code(() => S.rpc('deleteReport', { token: G, id: 'rep-00000001', reason: 'test' })) === 'no-method', 'a gate guard cannot delete reports');
t(code(() => S.rpc('deleteReport', { token: O, id: 'rep-00000001', reason: '' })) === 'no-reason', 'deleting needs a reason');
const d1 = S.rpc('deleteReport', { token: O, id: 'rep-00000001', reason: 'duplicate of another' }); t(d1.ok && S.rpc('listReports', { token: O }).length === 0, 'officer can delete a report');
ing([item]); t(S.rpc('listReports', { token: O }).length === 0, 'a phone re-sending a deleted report does not bring it back');
t(S.rpc('listTrash', { token: O }).items.some((x) => x.kind === 'report' && x.reason === 'duplicate of another'), 'deleted report is in the recycle bin with its reason');
S.rpc('restoreTrash', { token: O, id: d1.trashId }); t(S.rpc('listReports', { token: O }).length === 1, 'the report can be restored');
t(code(() => S.rpc('restoreTrash', { token: O, id: d1.trashId })) === 'not-found', 'a restored item leaves the bin');
// sos
const sid = db.sos[0].id;
t(code(() => S.rpc('deleteSos', { token: O, id: sid, reason: 'test only' })) === 'sos-open', 'an open emergency cannot be deleted');
S.rpc('resolveAlert', { token: O, key: 'sos:' + sid, note: 'ok' }); 
const ds = S.rpc('deleteSos', { token: O, id: sid, reason: 'was a test press' }); t(ds.ok && db.sos.length === 0, 'a closed emergency can be deleted');
t(code(() => ing([{ id: 'sos-00000001', type: 'sos', t: T, lat: 6.1, lng: 5.1 }])) === null && db.sos.length === 0, 'a re-sent deleted emergency stays deleted');
S.rpc('restoreTrash', { token: O, id: ds.trashId }); t(db.sos.length === 1, 'emergency restored');
// location
const dl = S.rpc('deleteLocationHistory', { token: O, matric: 'CSC/21/0001', reason: 'student asked' }); t(dl.ok && db.pings.filter((p) => p.matric === 'CSC/21/0001').length === 0, 'location history deleted');
S.rpc('restoreTrash', { token: O, id: dl.trashId }); t(db.pings.length >= 1, 'location history restored');
// student: admin only
t(code(() => S.rpc('deleteStudent', { token: O, matric: 'CSC/21/0001', reason: 'left school' })) === 'forbidden', 'only an administrator deletes a student');

const dst = S.rpc('deleteStudent', { token: A, matric: 'CSC/21/0001', reason: 'withdrew from school' }); t(dst.ok && !db.students['CSC/21/0001'], 'administrator can delete a student');
S.rpc('restoreTrash', { token: A, id: dst.trashId }); t(!!db.students['CSC/21/0001'] && db.pings.length >= 1, 'student and history restored');
// audit
const au = db.audit.map((e) => e.action + ':' + e.officer).join('|'); t(/delete_report:Officer Ose/.test(au) && /delete_student:Chief Ada/.test(au) && /restore_trash/.test(au), 'deletes and restores are in the audit trail');
t(S.rpc('verifyAudit', { token: A }).ok, 'audit chain still valid');
// retention: bin empties after 30 days; purge only by admin
const d2 = S.rpc('deleteReport', { token: O, id: 'rep-00000001', reason: 'again' }); t(code(() => S.rpc('purgeTrash', { token: O, id: d2.trashId })) === 'forbidden', 'officer cannot permanently erase');
T += 31 * 864e5; const A2 = S.rpc('login', { officer: 'Chief Ada', pin: adm.pin }).token; O2 = S.rpc('login', { officer: 'Officer Ose', pin: off.pin }).token; t(S.rpc('listTrash', { token: A2 }).items.length === 0, 'items vanish from the bin after 30 days');
// ICT tools
ing([{ id: 'rep-00000002', type: 'report', t: T, cat: 'theft', text: 'second report here' }]); const d3 = S.rpc('deleteReport', { token: O2, id: 'rep-00000002', reason: 'clean up' }); t(code(() => run('deleteReport', { id: 'x' })) === 'no-method', 'ICT cannot delete reports'); 
const rid = run('listTrash').items[0]; run('restoreTrash', { id: rid.id }) ; t(db.reports.length === 1, 'ICT can restore from the bin');
run('studentCreate', { matric: 'CSC/21/0002', name: 'Tola Ade', hostel: 'Hall A', phone: '08011112222' }); t(!!db.roster['CSC/21/0002'], 'ICT can add a student to the list');
t(code(() => run('studentCreate', { matric: 'CSC/21/0002', name: 'Tola Ade' })) === 'exists', 'no duplicates');
run('studentUpdate', { matric: 'CSC/21/0001', phone: '08033334444', guardianPhone: '08055556666', residence: 'Hall B' }); const st = db.students['CSC/21/0001']; t(st.phone === '08033334444' && st.emergency.phone === '08055556666' && st.residence === 'Hall B', 'ICT can fix phone, guardian and residence');
const pr = run('studentProfile', { matric: 'CSC/21/0001' }); t(pr.registered && pr.counts.reports === 1 && pr.phone === '08033334444', 'student profile shows the whole picture');
t(!/"lat"/.test(JSON.stringify(pr)), 'profile has no coordinates');
const mf = run('matricFix', { from: 'CSC/21/0001', to: 'CSC/21/0009' }); t(mf.matric === 'CSC/21/0009' && !db.students['CSC/21/0001'] && db.students['CSC/21/0009'].matric === 'CSC/21/0009' && db.reports[0].matric === 'CSC/21/0009' && db.pings.every((p) => p.matric === 'CSC/21/0009'), 'a mistyped matric can be corrected everywhere');
t(code(() => run('matricFix', { from: 'CSC/21/0009', to: 'CSC/21/0002' })) === 'exists', 'cannot correct into another student\'s number');
run('staffUpdate', { name: 'Officer Ose', role: 'guard' }); t(db.staff.accounts['officer ose'].role === 'guard', 'ICT can change a staff role');
t(code(() => run('staffUpdate', { name: 'Chief Ada', role: 'officer' })) === 'last-admin', 'cannot demote the only administrator');
S.rpc('ingest', { student: mk('CSC/21/0009', 'Ben Doe'), deviceId: 'devA-1234567', items: [{ id: 'out-0000001', type: 'out', t: T, destination: { name: 'Market' } }] });
run('fixStatus', { matric: 'CSC/21/0009', note: 'stuck after sync' }); t(true, 'fixStatus runs');
console.log('trash/help: ' + ok + ' checks passed' + (process.exitCode ? ' WITH FAILURES' : ''));
