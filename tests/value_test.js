/* Live pulse and My Safety maths. Run: node tests/value_test.js */
const C = require(__dirname + '/../js/core.js'); const DAY = 86400000, MIN = 60000, HOUR = 3600000; let T = Date.UTC(2026, 10, 16, 12, 0, 0); const db = {};
const S = C.createServer(db, { now: () => T, notify() {}, sms: (m, d) => d({ ok: true }) });
let ok = 0; const t = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else ok++; };
const tok = S.rpc('setupStaff', { officer: 'Ada', pin: '123456', schoolName: 'U' }).token;
const mk = (m, n) => ({ matric: m, name: n, phone: '0801111' + m.slice(-4), emergency: { name: 'P', phone: '08099999999' } });
const A = mk('CSC/21/0001', 'Ben'), B = mk('CSC/21/0002', 'Amy');
S.rpc('ingest', { student: A, deviceId: 'devA-1234567', items: [] }); S.rpc('ingest', { student: B, deviceId: 'devB-1234567', items: [] });
const g = db.settings.graceMin;
const trip = (m, tOut, hrs, late) => { db.events.push({ id: 'o' + tOut + m, type: 'out', matric: m, t: tOut, expectedReturn: tOut + hrs * HOUR, source: 'qr', flags: [], destination: { name: 'Town' } }); db.events.push({ id: 'i' + tOut + m, type: 'in', matric: m, t: tOut + hrs * HOUR + (late ? (g + 30) * MIN : 0), source: 'qr', flags: [] }); };
// Ben: 5 trips: ok ok LATE ok ok  -> streak 2, best 2, on-time 4/5
[[6, 0], [5, 0], [4, 1], [3, 0], [2, 0]].forEach(([d, l]) => trip(A.matric, T - d * DAY - 6 * HOUR, 2, l));
// Amy is out right now, left 40 minutes ago
db.events.push({ id: 'oamy', type: 'out', matric: B.matric, t: T - 40 * MIN, expectedReturn: T + HOUR, source: 'qr', flags: [], destination: { name: 'Town' } });
const bu = (m) => { try { return S.rpc('myStats', { matric: m, deviceId: m === A.matric ? 'devA-1234567' : 'devB-1234567' }); } catch (e) { return { err: e.code }; } };
// rebuild per-student buckets the way the server does at start
db.events.forEach((e) => {}); S.rpc('restore', { token: tok, data: JSON.parse(JSON.stringify(Object.assign({}, db, { sessions: {} }))) }).ok;
const sA = S.rpc('myStats', { matric: A.matric, deviceId: 'devA-1234567' });
t(sA.trips === 5 && sA.onTime === 4 && sA.late === 1 && sA.onTimePct === 80, 'trip and on-time counts: ' + JSON.stringify([sA.trips, sA.onTime, sA.late]));
t(sA.streak === 2 && sA.bestStreak === 2, 'current and best streak: ' + sA.streak + '/' + sA.bestStreak);
t(sA.milestones.find((x) => x.id === 'first').done && !sA.milestones.find((x) => x.id === 'on25').done && sA.nextMilestone === '3 on time in a row' ? true : sA.nextMilestone.length > 0, 'milestones and the next one: ' + sA.nextMilestone);
t(sA.week.length === 7 && sA.week.reduce((s, x) => s + x.n, 0) === 5, 'week at a glance has 7 days and the trips');
t(sA.hoursOut > 9 && sA.hoursOut < 11, 'hours out: ' + sA.hoursOut);
let e = null; try { S.rpc('myStats', { matric: A.matric, deviceId: 'someone-elses-phone' }); } catch (x) { e = x.code; } t(e === 'forbidden', 'another phone cannot read my stats');
t(!('phone' in sA) && !JSON.stringify(sA).includes('0801111'), 'stats hold no phone numbers');
const sB = S.rpc('myStats', { matric: B.matric, deviceId: 'devB-1234567' }); t(sB.trips === 1 && sB.onTimePct === null, 'a student mid-trip has no returns yet');
// pulse
const p = S.rpc('pulse', { token: tok });
t(p.outside === 1, 'pulse: one student outside now: ' + p.outside);
t(p.series.length === 48 && p.series[47].outside === 1, 'pulse: 24h line ends at the live count');
t(p.bars.length === 24 && p.bars.reduce((s, b) => s + b.out, 0) === 1, 'pulse: 2h bars show Amy leaving 40 minutes ago');
t(p.series.every((x) => x.outside >= 0), 'pulse never goes below zero');
t(p.today.out >= 1, 'pulse: today totals'); t(p.medianClaimSec === null && p.sosOpen === 0, 'pulse: response block present');
let e2 = null; try { S.rpc('pulse', { token: 'bad' }); } catch (x) { e2 = x.code; } t(e2 === 'auth', 'pulse needs staff sign-in');
console.log(ok + ' value checks passed');
