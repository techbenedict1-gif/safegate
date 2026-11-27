/* Money: Plus, Family, licence, sponsor ads, and the promise that safety stays free. Run: node tests/monet_test.js */
const C = require(__dirname + '/../js/core.js'); let T = Date.UTC(2026, 10, 21, 9, 0, 0); const db = {};
const S = C.createServer(db, { now: () => T, notify() {}, sms: (m, d) => d({ ok: true }) });
let ok = 0; const t = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else ok++; };
const code = (f) => { try { f(); return null; } catch (e) { return e.code || e.message; } };
const op = S.operator;
const stu = { matric: 'CSC/21/0001', name: 'Ben Doe', phone: '08012340001', emergency: { name: 'P', phone: '08099999999' } };
const sync = () => S.rpc('ingest', { student: stu, deviceId: 'devA-1234567', items: [] });
sync();
t(sync().free === true && sync().monet.ad === null, 'free for students by default');
db.settings.freeForStudents = false;   // the school chose to allow sponsors
let r = sync(); t(r.monet && r.monet.ad === null && r.monet.ent === null, 'ads are OFF by default: nothing shows until you switch them on');
op.adSave({ sponsor: 'Mama Put Kitchen', title: 'Jollof + chicken ₦1,500', text: 'Behind Block C', url: 'https://wa.me/2348000000000', paid: 1000000 });
op.adSave({ sponsor: 'Quick Print', title: 'Print & bind', url: 'tel:+2348011111111' });
t(code(() => op.adSave({ sponsor: 'X', title: 'Y', url: 'javascript:alert(1)' })) === 'bad-url', 'a script link cannot be used as an ad');
t(code(() => op.adSave({ sponsor: 'X', title: 'Y', url: 'http://plain.example' })) === 'bad-url', 'only https or phone links');
t(sync().monet.ad === null, 'ads still off');
op.monetSave({ adsOn: true });
const a1 = sync().monet.ad; t(a1 && /wa\.me|tel:/.test(a1.url), 'with ads on, a free student sees a sponsor card');
S.rpc('adEvent', { matric: stu.matric, deviceId: 'devA-1234567', id: a1.id, kind: 'view' }); S.rpc('adEvent', { matric: stu.matric, deviceId: 'devA-1234567', id: a1.id, kind: 'view' }); S.rpc('adEvent', { matric: stu.matric, deviceId: 'devA-1234567', id: a1.id, kind: 'click' });
S.rpc('adEvent', { matric: stu.matric, deviceId: 'someone-else-1', id: a1.id, kind: 'click' });
let g = op.monetGet(); const row = g.ads.find((x) => x.id === a1.id); t(row.views === 1 && row.clicks === 1, 'repeat views are not double counted, and a stranger cannot inflate clicks');
t(!JSON.stringify(g.ads).includes(stu.matric), 'sponsors only get totals, never who saw the ad');
const a2 = sync().monet.ad; t(a2 && a2.id !== a1.id, 'ads rotate fairly');
// Plus
t(code(() => op.subGrant({ who: 'CSC/99/9999', plan: 'plus', months: 1 })) === 'not-found', 'cannot grant Plus to an unknown student');
op.subGrant({ who: stu.matric, plan: 'plus', months: 1, naira: 300, method: 'transfer' });
r = sync(); t(r.monet.ent && r.monet.ent.plan === 'plus' && r.monet.ad === null, 'a Plus student sees no ads');
T += 31 * 86400e3; r = sync(); t(r.monet.ent === null && r.monet.ad !== null, 'when Plus runs out the ads return, nothing else breaks');
// licence
op.monetSave({ licence: { on: true, until: T + 100 * 86400e3, students: 5000, perStudent: 100000, school: 'Uni' } });
r = sync(); t(r.monet.ent && r.monet.ent.plan === 'campus' && r.monet.ad === null, 'a school licence makes the whole campus ad-free');
g = op.monetGet(); t(g.licenceValue === 5000 * 100000, 'licence value = students x price');
// plans info
const pi = S.rpc('plansInfo', { matric: stu.matric, deviceId: 'devA-1234567' }); t(pi.plus.month === 30000 && /always free/.test(pi.promise) && pi.mine.plan === 'campus', 'students can read the plans and the safety promise');
t(S.rpc('plansInfo', { matric: stu.matric, deviceId: 'other-device-1' }).mine === null, 'another phone cannot read my plan');
// family
op.subGrant({ who: '08055550000', plan: 'family', months: 1, naira: 1500 });
g = op.monetGet(); t(g.active.family === 1 && g.sales.length === 2 && g.revenue30.family === 150000, 'a Family plan is active and its sale is recorded');
t(g.subs.some((x) => x.plan === 'family' && /\*\*\*\*/.test(x.id)), 'parent phone numbers are masked in the list');
t(code(() => op.monetSave({ plans: { plus: { month: -5 } } })) === 'bad-price', 'a negative price is refused');
op.subRevoke(g.subs.find((x) => x.plan === 'family').key); t(op.monetGet().active.family === 0, 'a plan can be cancelled');
console.log('monet: ' + ok + ' checks passed' + (process.exitCode ? ' WITH FAILURES' : ''));
