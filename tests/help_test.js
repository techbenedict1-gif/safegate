/* Help requests: a student asks ICT with the phone's check results; ICT answers; the student sees the answer. Run: node tests/help_test.js */
const C = require(__dirname + '/../js/core.js'); let T = Date.UTC(2026, 10, 21, 9, 0, 0); const db = {};
const S = C.createServer(db, { now: () => T, notify() {} });
let ok = 0; const t = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else ok++; };
const code = (f) => { try { f(); return null; } catch (e) { return e.code || e.message; } };
const tok = S.ictBootstrap(), run = (m, a) => S.ictRun({ token: tok, method: m, args: a || {}, ctx: () => ({}) });
run('staffSetup', { name: 'Chief Ada' });
const stu = { matric: 'CSC/21/0001', name: 'Ben Doe', phone: '08012340001', emergency: { name: 'P', phone: '08099999999' } };
S.rpc('ingest', { student: stu, deviceId: 'dev-registered-1', items: [] });
const diag = { ver: '13.9.0', online: false, loc: 'denied', notif: 'granted', pending: 4, oldestMin: 200, skewSec: 900, battery: 9, charging: false, standalone: false, persist: false, evil: '<script>', ua: 'x'.repeat(500) };
const r1 = S.rpc('helpAsk', { deviceId: 'dev-registered-1', matric: stu.matric, message: 'Gate scan says my code is wrong', diag, contact: '08055550000' });
t(r1.ok && r1.id, 'a registered student can ask ICT for help');
t(code(() => S.rpc('helpAsk', { deviceId: 'dev-registered-1', matric: stu.matric, message: 'short' })) === 'too-short', 'a one-word request is refused');
t(code(() => S.rpc('helpAsk', { deviceId: 'x', matric: stu.matric, message: 'message long enough' })) === 'bad-device', 'a missing device is refused');
let list = run('helpList');
t(list.openCount === 1 && list.items[0].verified === true && list.items[0].name === 'Ben Doe', 'ICT sees it, verified by the registered phone');
const it = list.items[0]; t(!('evil' in it.diag) && it.diag.ua.length <= 140 && it.diag.skewSec === 900, 'only known check results are kept and they are clipped');
const hs = it.hints.map((h) => h.text).join('|'); t(/clock is wrong/.test(hs) && /Location is blocked/.test(hs) && /stuck on the phone/.test(hs) && /Battery was almost empty/.test(hs), 'ICT gets plain likely causes from the phone check');
t(run('overview').open.help === 1, 'overview counts waiting help requests');
// locked-out phone
S.rpc('helpAsk', { deviceId: 'dev-new-phone-2', matric: stu.matric, message: 'I changed phone and it says not recognised' });
list = run('helpList'); const un = list.items.find((x) => !x.verified); t(un && /not the registered one/.test(un.hints.map((h) => h.text).join('|')), 'a request from another phone is flagged, with a hint to check ID');
// mine
let mine = S.rpc('helpMine', { deviceId: 'dev-registered-1' }); t(mine.items.length === 1 && mine.items[0].status === 'open', 'the student sees their own request');
t(S.rpc('helpMine', { deviceId: 'dev-someone-else' }).items.length === 0, 'nobody sees another phone\'s requests');
t(!('diag' in mine.items[0]) && !('dev' in mine.items[0]), 'the student view does not leak internals');
// reply
t(code(() => run('helpReply', { id: r1.id, text: '' })) === 'too-short', 'an empty answer is refused');
run('helpReply', { id: r1.id, text: 'Turn on Set time automatically in phone settings, then try again.' });
mine = S.rpc('helpMine', { deviceId: 'dev-registered-1' }); t(mine.items[0].status === 'answered' && mine.items[0].unread === true && /Set time automatically/.test(mine.items[0].replies[0].text), 'the student sees the answer, marked unread');
S.rpc('helpSeen', { deviceId: 'dev-registered-1', id: r1.id }); t(S.rpc('helpMine', { deviceId: 'dev-registered-1' }).items[0].unread === false, 'reading it clears the badge');
run('helpReply', { id: r1.id, text: 'Glad it worked', close: true }); t(run('helpList').openCount === 1, 'closing removes it from the waiting list');
t(run('helpList', { status: 'all' }).items.length === 2, 'Everything still lists closed requests');
// limits
for (let i = 0; i < 3; i++) { try { S.rpc('helpAsk', { deviceId: 'dev-spam-00001', message: 'spam spam spam ' + i }); } catch (e) { } }
t(code(() => S.rpc('helpAsk', { deviceId: 'dev-spam-00001', message: 'one more please' })) === 'too-many', 'a phone cannot hold more than 3 open requests');
// stale warning
T += 26 * 3600e3; const ck = run('checkup').checks.find((c) => c.id === 'help'); t(ck && ck.level === 'warn' && /waited over a day/.test(ck.title), 'the check-up warns when students wait over a day');
t(S.rpc('verifyAudit', { token: S.rpc('login', { officer: 'Chief Ada', pin: run('staffReset', { name: 'Chief Ada' }).pin }).token }).ok, 'audit chain still valid');
console.log('help: ' + ok + ' checks passed' + (process.exitCode ? ' WITH FAILURES' : ''));
