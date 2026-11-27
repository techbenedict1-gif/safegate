'use strict';
/* Minimal SMTP sender (Node built-ins only) used to email product feedback to the developer.
 * Env: SMTP_HOST, SMTP_PORT (465), SMTP_USER, SMTP_PASS, SMTP_FROM (defaults to SMTP_USER), FEEDBACK_TO.
 * For Gmail: SMTP_HOST=smtp.gmail.com SMTP_PORT=465 SMTP_USER=you@gmail.com and SMTP_PASS = a Google "App password" (needs 2-Step Verification).
 * SMTP_SECURE=0 means plain text (for tests on localhost only). */
const net = require('net');
const tls = require('tls');
const crypto = require('crypto');

function cfg() {
  return { host: process.env.SMTP_HOST || '', port: +process.env.SMTP_PORT || 465, user: process.env.SMTP_USER || '', pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || process.env.SMTP_USER || '', secure: process.env.SMTP_SECURE !== '0', to: process.env.FEEDBACK_TO || 'techbenedict1@gmail.com' };
}
function configured() { const c = cfg(); return !!(c.host && c.user && c.pass && c.from); }
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const oneLine = (s) => String(s == null ? '' : s).replace(/[\r\n\u2028\u2029]+/g, ' ').trim();
const addr = (s) => { s = oneLine(s); return /^[^\s<>"'(),;:\\]+@[^\s<>"'(),;:\\]+\.[^\s<>"'(),;:\\]+$/.test(s) ? s : ''; };
function encodeHeader(s) {
  s = oneLine(s); if (/^[\x20-\x7e]*$/.test(s) && s.length < 70) return s;
  const parts = []; let cur = '';
  for (const ch of Array.from(s)) { if (Buffer.byteLength(cur + ch) > 42) { parts.push(cur); cur = ''; } cur += ch; }
  if (cur) parts.push(cur);
  return parts.map((p) => '=?UTF-8?B?' + b64(p) + '?=').join('\r\n ');
}
function build(m, from) {
  const body = (b64(m.text).match(/.{1,76}/g) || ['']).join('\r\n');
  const h = ['From: SafeGate <' + addr(from) + '>', 'To: ' + addr(m.to), 'Subject: ' + encodeHeader(m.subject), 'Date: ' + new Date().toUTCString().replace('GMT', '+0000'),
    'Message-ID: <' + crypto.randomBytes(12).toString('hex') + '@safegate>', 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64'];
  if (addr(m.replyTo)) h.push('Reply-To: ' + addr(m.replyTo));
  return h.join('\r\n') + '\r\n\r\n' + body + '\r\n';
}
function send(m) {
  const c = cfg();
  return new Promise((resolve, reject) => {
    if (!configured()) return reject(new Error('mail-not-configured'));
    if (!addr(m.to)) return reject(new Error('bad-recipient'));
    let sock, buf = '', step = 0, done = false, timer;
    const fail = (e) => { if (done) return; done = true; clearTimeout(timer); try { sock.destroy(); } catch (_) {} reject(e instanceof Error ? e : new Error(String(e))); };
    const ok = () => { if (done) return; done = true; clearTimeout(timer); try { sock.end(); } catch (_) {} resolve(true); };
    timer = setTimeout(() => fail(new Error('smtp-timeout')), 25000);
    const data = build(m, c.from).replace(/^\./gm, '..');
    const script = [
      { send: () => 'EHLO safegate.local', expect: 250 },
      { send: () => 'AUTH LOGIN', expect: 334 },
      { send: () => b64(c.user), expect: 334 },
      { send: () => b64(c.pass), expect: 235 },
      { send: () => 'MAIL FROM:<' + addr(c.from) + '>', expect: 250 },
      { send: () => 'RCPT TO:<' + addr(m.to) + '>', expect: [250, 251] },
      { send: () => 'DATA', expect: 354 },
      { send: () => data + '.', expect: 250 },
      { send: () => 'QUIT', expect: 221, last: true }
    ];
    const onLine = (line) => {
      const code = +line.slice(0, 3); if (line[3] === '-') return;
      if (step === 0) { if (code !== 220) return fail(new Error('smtp-greeting ' + line.slice(0, 60))); }
      else { const want = [].concat(script[step - 1].expect); if (want.indexOf(code) < 0) return fail(new Error('smtp-' + code + ' ' + line.slice(4, 70))); if (script[step - 1].last) return ok(); }
      if (step < script.length) { const s = script[step++]; sock.write(s.send() + '\r\n'); }
    };
    const onData = (d) => { buf += d.toString('utf8'); let i; while ((i = buf.indexOf('\r\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 2); onLine(l); } };
    const onErr = (e) => fail(e);
    sock = c.secure ? tls.connect({ host: c.host, port: c.port, servername: c.host }) : net.connect({ host: c.host, port: c.port });
    sock.on('data', onData); sock.on('error', onErr); sock.on('close', () => fail(new Error('smtp-closed')));
  });
}
module.exports = { cfg, configured, send, build, encodeHeader, addr };
