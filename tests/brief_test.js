/* Safety Brief maths with hand-built history. Run: node tests/brief_test.js */
const C = require(__dirname + '/../js/core.js'); const DAY = 86400000, MIN = 60000; let T = Date.UTC(2026, 10, 16, 12, 0, 0); const db = {};
const S = C.createServer(db, { now: () => T, notify() {}, sms: (m, d) => d({ ok: true }) });
let ok = 0; const t = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else ok++; };
const tok = S.rpc('setupStaff', { officer: 'Ada', pin: '123456', schoolName: 'Test College' }).token;
const g = db.settings.graceMin;
const trip = (m, tOut, hrs, late, src) => { db.events.push({ type: 'out', matric: m, t: tOut, expectedReturn: tOut + hrs * 3600000, source: src || 'qr', flags: [] }); db.events.push({ type: 'in', matric: m, t: tOut + hrs * 3600000 + (late ? (g + 30) * MIN : 0), source: 'qr', flags: [] }); };
// this week: 4 trips, 3 on time, 1 late, 1 unverified; last week: 2 trips both on time
trip('A', T - 1 * DAY, 3, false); trip('B', T - 2 * DAY, 3, false); trip('C', T - 3 * DAY, 3, true); trip('A', T - 4 * DAY, 2, false, 'no-scan');
trip('A', T - 9 * DAY, 3, false); trip('B', T - 10 * DAY, 3, false);
db.sos.push({ id: 's1', matric: 'A', t: T - 2 * DAY, lat: 6.1234, lng: 5.1234, status: 'open' }); db.claims['sos:s1'] = { by: 'Ada', at: T - 2 * DAY + 90000 };
db.sos.push({ id: 's2', matric: 'B', t: T - 3 * DAY, lat: 6.1232, lng: 5.1232, status: 'open' });   // never claimed
db.reports.push({ id: 'r1', matric: 'A', cat: 'theft', t: T - 5 * DAY, status: 'closed', notes: [{ t: T - 5 * DAY + 20 * MIN, by: 'Ada', text: 'On it' }], lat: 6.1233, lng: 5.1233 });
db.reports.push({ id: 'r2', matric: 'B', cat: 'unsafe', t: T - 4 * DAY, status: 'open', notes: [] });
const b = S.rpc('safetyBrief', { token: tok, days: 7 });
t(b.school === 'Test College' && b.days === 7, 'names the school and period');
t(b.cur.trips === 4 && b.prev.trips === 2, 'trips this period and the one before: ' + b.cur.trips + '/' + b.prev.trips);
t(b.cur.students === 3, 'counts different students');
t(b.cur.onTime === 3 && b.cur.late === 1 && b.cur.onTimePct === 75 && b.prev.onTimePct === 100, 'on-time share 75% vs 100% before: ' + b.cur.onTimePct);
t(b.cur.unverified === 1, 'unverified exits counted');
t(b.cur.sos === 2 && b.cur.sosClaimed === 1 && b.cur.sosUnclaimed === 1 && b.cur.medianClaimSec === 90, 'SOS counts and 90 s response');
t(b.cur.reports === 2 && b.cur.reportsClosed === 1 && b.cur.medianReplyMin === 20, 'reports closed share and first reply time');
t(b.staleOpen === 1, 'an open report older than 2 days is flagged');
t(b.cur.hotspots[0].n === 3, 'three alerts/reports in one spot make a hotspot: ' + JSON.stringify(b.cur.hotspots[0]));
t(b.attention.some((x) => /never claimed/.test(x)) && b.attention.some((x) => /open for more than 2 days/.test(x)) && b.attention.some((x) => /75%/.test(x)) && b.attention.some((x) => /one spot/.test(x)), 'attention list: ' + b.attention.length + ' items');
t(!JSON.stringify(b).match(/"matric"|"name"/), 'brief contains no student identity fields');
let e = null; try { S.rpc('safetyBrief', { token: 'bad' }); } catch (x) { e = x.code; } t(e === 'auth', 'needs staff sign-in');
S.rpc('updateReport', { token: tok, id: 'r2', status: 'closed' }); t(db.reports[1].closedAt === T, 'closing a report records the time');
const e30 = S.rpc('safetyBrief', { token: tok, days: 500 }); t(e30.days === 90, 'period limited to 90 days');
console.log(ok + ' brief checks passed');
