/* Web Push for SafeGate: VAPID (RFC 8292) + message encryption aes128gcm (RFC 8291 / 8188). Node built-ins only. */
'use strict';
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const fs = require('fs');

const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function generateVapid() {
  const e = crypto.createECDH('prime256v1'); e.generateKeys();
  return { publicKey: b64u(e.getPublicKey()), privateKey: b64u(e.getPrivateKey()) };
}
function loadVapid(file) {
  try { const v = JSON.parse(fs.readFileSync(file, 'utf8')); if (v.publicKey && v.privateKey) return v; } catch (_) {}
  const v = generateVapid();
  try { fs.writeFileSync(file, JSON.stringify(v), { mode: 0o600 }); } catch (e) { console.error('Could not save VAPID keys:', e.message); }
  return v;
}
function privKeyObject(v) {
  const pub = unb64u(v.publicKey);
  return crypto.createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: v.privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }, format: 'jwk' });
}
function vapidHeader(vapid, endpoint, subject, now) {
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64u(JSON.stringify({ aud, exp: Math.floor((now || Date.now()) / 1000) + 12 * 3600, sub: subject || 'mailto:admin@example.com' }));
  const sig = crypto.sign('sha256', Buffer.from(head + '.' + body), { key: privKeyObject(vapid), dsaEncoding: 'ieee-p1363' });
  return 'vapid t=' + head + '.' + body + '.' + b64u(sig) + ', k=' + vapid.publicKey;
}
/* RFC 8291 section 3 + RFC 8188: one record, padding delimiter 0x02 */
function encrypt(payload, uaPublicB64, authB64, opt) {
  opt = opt || {};
  const ua = unb64u(uaPublicB64), auth = unb64u(authB64);
  if (ua.length !== 65 || ua[0] !== 4 || auth.length < 8) throw new Error('bad-subscription-keys');
  const ecdh = crypto.createECDH('prime256v1');
  if (opt.asPrivate) ecdh.setPrivateKey(unb64u(opt.asPrivate)); else ecdh.generateKeys();
  const asPub = ecdh.getPublicKey();
  const secret = ecdh.computeSecret(ua);
  const salt = opt.salt ? unb64u(opt.salt) : crypto.randomBytes(16);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), ua, asPub]);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', secret, auth, keyInfo, 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const plain = Buffer.concat([Buffer.from(payload), Buffer.from([2])]);
  if (plain.length > 4096 - 17 - 16) throw new Error('payload-too-large');
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ct = Buffer.concat([c.update(plain), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([65]), asPub, ct]);
}
/* receiver side (used by tests to prove the round trip) */
function decrypt(body, uaPrivateB64, uaPublicB64, authB64) {
  const salt = body.subarray(0, 16), idlen = body[20], asPub = body.subarray(21, 21 + idlen), ct = body.subarray(21 + idlen);
  const ecdh = crypto.createECDH('prime256v1'); ecdh.setPrivateKey(unb64u(uaPrivateB64));
  const secret = ecdh.computeSecret(asPub), ua = unb64u(uaPublicB64);
  const ikm = Buffer.from(crypto.hkdfSync('sha256', secret, unb64u(authB64), Buffer.concat([Buffer.from('WebPush: info\0'), ua, asPub]), 32));
  const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce); d.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  let i = plain.length - 1; while (i > 0 && plain[i] === 0) i--;
  return plain.subarray(0, i);
}
/* Send one push. Resolves {status, gone}. gone=true means the subscription is dead and must be deleted. */
function send(sub, payload, o) {
  o = o || {};
  return new Promise((resolve) => {
    let body, url;
    try {
      url = new URL(sub.endpoint);
      body = encrypt(JSON.stringify(payload), sub.keys.p256dh, sub.keys.auth);
    } catch (e) { return resolve({ status: 0, error: e.message, gone: e.message === 'bad-subscription-keys' }); }
    const lib = url.protocol === 'http:' ? http : https;
    const req = lib.request(url, {
      method: 'POST', timeout: 10000,
      headers: {
        Authorization: vapidHeader(o.vapid, sub.endpoint, o.subject), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream',
        'Content-Length': body.length, TTL: String(o.ttl || 3600), Urgency: o.urgent ? 'high' : 'normal'
      }
    }, (res) => { res.resume(); res.on('end', () => resolve({ status: res.statusCode, gone: res.statusCode === 404 || res.statusCode === 410 })); });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (e) => resolve({ status: 0, error: e.message }));
    req.end(body);
  });
}
module.exports = { generateVapid, loadVapid, vapidHeader, encrypt, decrypt, send, b64u, unb64u };
