/* Feedback: saved first, emailed through SMTP (a fake mail server is started here), spam and repeat protection, operator reading. Run: node tests/feedback_test.js */
const net = require('net'), http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), { spawn } = require('child_process');
let ok = 0; const t = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else ok++; };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sgfb-')), mails = []; let smtpMode = 'ok';
const smtp = net.createServer((s) => {
  let inData = false, cur = { raw: '', rcpt: [] }, buf = '';
  s.write('220 fake ESMTP\r\n');
  s.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\r\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 2);
    if (inData) { if (l === '.') { inData = false; mails.push(cur); cur = { raw: '', rcpt: [] }; s.write('250 queued\r\n'); } else cur.raw += l + '\n'; continue; }
    if (l === 'QUIT') { s.write('221 bye\r\n'); s.end(); }
    else if (/^EHLO/.test(l)) s.write('250-fake\r\n250 AUTH LOGIN\r\n');
    else if (/^AUTH LOGIN/.test(l)) s.write('334 VXNlcm5hbWU6\r\n');
    else if (!cur.u) { cur.u = Buffer.from(l, 'base64').toString(); s.write('334 UGFzc3dvcmQ6\r\n'); }
    else if (!cur.p) { cur.p = Buffer.from(l, 'base64').toString(); s.write(smtpMode === 'badauth' ? '535 bad\r\n' : '235 ok\r\n'); }
    else if (/^MAIL FROM/.test(l)) s.write('250 ok\r\n');
    else if (/^RCPT TO:<(.*)>/.test(l)) { cur.rcpt.push(l.match(/<(.*)>/)[1]); s.write('250 ok\r\n'); }
    else if (l === 'DATA') { inData = true; s.write('354 go\r\n'); }
    } });
});
const post = (port, p, body, headers) => new Promise((res, rej) => { const d = JSON.stringify(body), r = http.request({ host: '127.0.0.1', port, path: p, method: 'POST', headers: Object.assign({ 'content-type': 'application/json', 'content-length': Buffer.byteLength(d) }, headers || {}) }, (x) => { let b = ''; x.on('data', (c) => b += c); x.on('end', () => res({ s: x.statusCode, j: JSON.parse(b || '{}') })); }); r.on('error', rej); r.end(d); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  await new Promise((r) => smtp.listen(0, '127.0.0.1', r)); const sp = smtp.address().port, PORT = 18000 + Math.floor(Math.random() * 1000);
  const srv = spawn('node', [path.join(__dirname, '..', 'server.js')], { env: Object.assign({}, process.env, { PORT: String(PORT), DATA_FILE: path.join(dir, 'db.json'), SMTP_HOST: '127.0.0.1', SMTP_PORT: String(sp), SMTP_SECURE: '0', SMTP_USER: 'bot@example.com', SMTP_PASS: 'app-pass-1', OPERATOR_KEY: 'op-secret' }), stdio: 'ignore' });
  for (let i = 0; i < 40; i++) { try { await post(PORT, '/api/feedback', {}); break; } catch (_) { await wait(150); } }
  const msg = { kind: 'fix', rating: 4, area: 'Safety map', message: 'The map is slow on my phone.\n.dot line should survive\nBcc: evil@x.com', role: 'student', contact: 'amina@example.com\r\nBcc: evil@x.com', cid: 'c1', deviceId: 'dev-1', page: 'map', ver: '13.2.0', who: { name: 'Amina K', matric: 'CSC/21/002' } };
  let r = await post(PORT, '/api/feedback', msg); t(r.s === 200 && /^FB-[0-9A-F]{6}$/.test(r.j.ref), 'feedback accepted with a reference');
  const ref = r.j.ref; await wait(700);
  t(mails.length === 1, 'one email sent'); const m = mails[0] || { raw: '', rcpt: [] };
  t(m.rcpt[0] === 'techbenedict1@gmail.com', 'goes to techbenedict1@gmail.com'); t(m.u === 'bot@example.com' && m.p === 'app-pass-1', 'SMTP login used');
  const head = m.raw.split('\n\n')[0], body = Buffer.from((m.raw.split('\n\n')[1] || '').replace(/\n/g, ''), 'base64').toString('utf8');
  t(!/^Bcc:/mi.test(head), 'no header injection through contact'); t(/Reply-To:/i.test(head) === false, 'unsafe reply address is dropped');
  t(/The map is slow on my phone/.test(body) && /Amina K \(CSC\/21\/002\)/.test(body) && /4\/5/.test(body) && /Safety map/.test(body) && new RegExp(ref).test(body), 'email body has message, rating, area, who and reference');
  t(/\.dot line should survive/.test(body), 'lines starting with a dot survive');
  // repeat of the same client id (offline retry) is not stored twice
  r = await post(PORT, '/api/feedback', msg); t(r.s === 200 && r.j.ref === ref && r.j.again, 'retry with the same id is not duplicated'); await wait(300); t(mails.length === 1, 'and not emailed again');
  // too short, bot field, bad json
  r = await post(PORT, '/api/feedback', { message: 'hi' }); t(r.s === 400 && r.j.error.code === 'short', 'too short rejected');
  const before = fs.readFileSync(path.join(dir, 'feedback.jsonl'), 'utf8').split('\n').filter(Boolean).length;
  r = await post(PORT, '/api/feedback', { message: 'this is a spam message from a bot', website: 'http://spam' }); t(r.s === 200, 'bot gets a calm answer'); t(fs.readFileSync(path.join(dir, 'feedback.jsonl'), 'utf8').split('\n').filter(Boolean).length === before, 'but the bot message is not saved');
  // anonymous, no who
  r = await post(PORT, '/api/feedback', { kind: 'love', rating: 5, message: 'I love the walk with me feature', role: 'student', deviceId: 'dev-2', cid: 'c2' }); await wait(600);
  const b2 = Buffer.from((mails[1].raw.split('\n\n')[1] || '').replace(/\n/g, ''), 'base64').toString('utf8'); t(/stayed anonymous/.test(b2), 'anonymous feedback says so and has no name');
  // per-device daily limit
  let lim = 0; for (let i = 0; i < 10; i++) { const x = await post(PORT, '/api/feedback', { message: 'message number ' + i + ' from one phone', deviceId: 'dev-flood' }); if (x.s === 429) lim++; } t(lim >= 2, 'one phone cannot flood (daily limit)');
  // operator can read; wrong key cannot
  let o = await post(PORT, '/api/operator', { key: 'wrong', op: 'feedback' }); t(o.s === 403, 'wrong operator key refused');
  o = await post(PORT, '/api/operator', { key: 'op-secret', op: 'feedback' }); t(o.s === 200 && o.j.result.items.length >= 3 && o.j.result.mail.configured && o.j.result.mail.to === 'techbenedict1@gmail.com', 'operator sees feedback and mail status');
  t(o.j.result.items.some((f) => f.id === ref && f.emailed), 'sent items are marked emailed');
  // saved even if mail is broken: restart with bad password, then fix and retry
  smtpMode = 'badauth'; r = await post(PORT, '/api/feedback', { message: 'saved even when email is down', deviceId: 'dev-3', cid: 'c3' }); await wait(600);
  o = await post(PORT, '/api/operator', { key: 'op-secret', op: 'feedback' }); const f3 = o.j.result.items.find((f) => f.id === r.j.ref); t(f3 && !f3.emailed && f3.lastErr, 'when email fails the message is still saved and marked unsent'); t(o.j.result.unsent >= 1, 'unsent count shown');
  smtpMode = 'ok'; o = await post(PORT, '/api/operator', { key: 'op-secret', op: 'feedbackRetry' }); t(o.j.result.sent >= 1 && o.j.result.left === 0, 'retry sends the waiting messages');
  t(fs.readFileSync(path.join(dir, 'feedback.jsonl'), 'utf8').includes('saved even when email is down'), 'everything is also in feedback.jsonl');
  srv.kill(); smtp.close(); console.log('ok ' + ok); process.exit(process.exitCode || 0);
})().catch((e) => { console.log('ERR', e.message); process.exit(1); });
