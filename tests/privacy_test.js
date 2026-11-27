/* Privacy: opt-in location, consent proof, minors, delete-my-account, free mode. Run: node tests/privacy_test.js */
const C = require(__dirname + '/../js/core.js'); let T = Date.UTC(2026, 10, 22, 9, 0, 0); const db = {};
const S = C.createServer(db, { now: () => T, notify() {} });
let ok = 0; const t = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else ok++; };
const tok = S.ictBootstrap(), run = (m, a) => S.ictRun({ token: tok, method: m, args: a || {}, ctx: () => ({}) });
run('staffSetup', { name: 'Chief Ada' });
const stu = (o) => Object.assign({ matric: 'CSC/21/0001', name: 'Ben Doe', phone: '08012340001', emergency: { name: 'P', phone: '08099999999' }, consentLoc: false }, o || {});
const ing = (st, items) => S.rpc('ingest', { student: st, deviceId: 'devA-1234567', items: items || [] });
// free by default
let pi = S.rpc('privacyInfo', {}); t(pi.free === true && pi.retention.locationDays > 0 && !!pi.text, 'public privacy notice says free and shows retention');
let pl = S.rpc('plansInfo', {}); t(pl.free && !pl.plus.on && !pl.adsOn, 'nothing is for sale to students by default');
let r = ing(stu()); t(r.free === true && !r.monet.ad, 'sync tells the app it is free; no ads');
// consent log
ing(stu({ consentLoc: true })); ing(stu({ consentLoc: false }));
let d = S.rpc('myData', { matric: 'CSC/21/0001', deviceId: 'devA-1234567' }); t(d.consentHistory.length === 2 && d.consentHistory[0].on && !d.consentHistory[1].on, 'every consent change is recorded with a time');
// minors
const kid = { matric: 'CSC/21/0002', name: 'Tola Young', phone: '08012340002', minor: true, consentLoc: true };
const ingK = (items) => S.rpc('ingest', { student: stu(kid), deviceId: 'devK-1234567', items });
ingK([]); t(db.students['CSC/21/0002'].consentLoc === false, 'an under-18 cannot switch location on by themselves');
ingK([{ id: 'ping-0000001', type: 'ping', t: T, lat: 6.5, lng: 5.5, acc: 10 }]); t(!db.pings.some((p) => p.matric === 'CSC/21/0002'), 'no location is stored for an under-18 without a parent\'s agreement');
run('guardianConsent', { matric: 'CSC/21/0002', ok: true }); ingK([]); t(db.students['CSC/21/0002'].consentLoc === true, 'once a parent has agreed, location can be used');
ingK([{ id: 'ping-0000002', type: 'ping', t: T, lat: 6.5, lng: 5.5, acc: 10 }]); t(db.pings.some((p) => p.matric === 'CSC/21/0002'), 'then it is stored');
// delete my account
ing(stu({ consentLoc: true }), [{ id: 'ping-0000003', type: 'ping', t: T, lat: 6.5, lng: 5.5, acc: 10 }, { id: 'rep-00000001', type: 'report', t: T, cat: 'theft', text: 'bag taken' }]);
let e1 = false; try { S.rpc('eraseMyAccount', { matric: 'CSC/21/0001', deviceId: 'devA-1234567', confirm: 'wrong' }); } catch (x) { e1 = true; } t(e1, 'deleting needs the matric typed in');
let e2 = false; try { S.rpc('eraseMyAccount', { matric: 'CSC/21/0001', deviceId: 'other-device-1', confirm: 'CSC/21/0001' }); } catch (x) { e2 = true; } t(e2, 'only the student\'s own phone can delete the account');
t(S.rpc('eraseMyAccount', { matric: 'CSC/21/0001', deviceId: 'devA-1234567', confirm: 'csc/21/0001' }).ok, 'the student can delete their account');
const j = JSON.stringify(db); t(!j.includes('Ben Doe') && !j.includes('08012340001') && !db.students['CSC/21/0001'], 'no name or phone of the student remains anywhere');
t(db.reports.length === 1 && db.reports[0].erased && db.reports[0].matric !== 'CSC/21/0001', 'the safety report is kept but no longer points to them');
t(!db.pings.some((p) => p.matric === 'CSC/21/0001') && !db.consentLog.some((x) => x.m === 'CSC/21/0001'), 'location points and consent log of the student are gone');
t(!!db.audit.filter((x) => x.action === 'student_account_erased').length, 'the deletion itself is logged (without personal details)');
// can come back fresh on the same phone
r = ing(stu()); t(!!db.students['CSC/21/0001'], 'they can register again later');
console.log('privacy: ' + ok + ' checks passed' + (process.exitCode ? ' WITH FAILURES' : ''));
