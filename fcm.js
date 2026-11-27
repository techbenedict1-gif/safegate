/* Firebase Cloud Messaging (HTTP v1) sender for the SafeGate Android/iOS app. Node built-ins only.
 * Service-account JSON: env FCM_SERVICE_ACCOUNT (path) or fcm.json beside the data file.
 * FCM_BASE / token_uri overrides allow tests. */
'use strict';
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const fs = require('fs');

const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function load(file) {
  try {
    const p = process.env.FCM_SERVICE_ACCOUNT || file, j = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (j.project_id && j.client_email && j.private_key) return { project: j.project_id, email: j.client_email, key: j.private_key, tokenUri: j.token_uri || 'https://oauth2.googleapis.com/token', base: process.env.FCM_BASE || 'https://fcm.googleapis.com' };
  } catch (_) {}
  return null;
}
function post(urlStr, headers, body) {
  return new Promise((resolve) => {
    let u; try { u = new URL(urlStr); } catch (e) { return resolve({ status: 0, error: 'bad-url' }); }
    const req = (u.protocol === 'http:' ? http : https).request(u, { method: 'POST', headers: Object.assign({ 'Content-Length': Buffer.byteLength(body) }, headers), timeout: 12000 }, (res) => {
      const ch = []; res.on('data', (d) => ch.push(d)); res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(ch).toString('utf8') }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (e) => resolve({ status: 0, error: e.message }));
    req.end(body);
  });
}
let cache = { tok: '', exp: 0 };
async function accessToken(cfg) {
  if (cache.tok && Date.now() < cache.exp - 60000) return cache.tok;
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64u(JSON.stringify({ iss: cfg.email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: cfg.tokenUri, iat: now, exp: now + 3600 }));
  const sig = b64u(crypto.sign('RSA-SHA256', Buffer.from(head + '.' + claim), cfg.key));
  const body = 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + head + '.' + claim + '.' + sig;
  const r = await post(cfg.tokenUri, { 'Content-Type': 'application/x-www-form-urlencoded' }, body);
  let j = {}; try { j = JSON.parse(r.text); } catch (_) {}
  if (!j.access_token) throw new Error('oauth ' + r.status + ' ' + (r.error || j.error || ''));
  cache = { tok: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return cache.tok;
}
function message(token, p) {
  const data = {}; ['tag', 'url', 'title', 'body'].forEach((k) => { if (p[k] != null) data[k] = String(p[k]); }); data.urgent = p.urgent ? '1' : '0';
  return { message: { token, notification: { title: String(p.title || 'SafeGate'), body: String(p.body || '') }, data,
    android: { priority: p.urgent ? 'HIGH' : 'NORMAL', ttl: p.urgent ? '7200s' : '1800s', notification: { channel_id: p.urgent ? 'sg_alerts' : 'sg_info', tag: p.tag || undefined, sound: 'default' } },
    apns: { headers: { 'apns-priority': p.urgent ? '10' : '5' }, payload: { aps: { sound: 'default', 'interruption-level': p.urgent ? 'time-sensitive' : 'active' } } } } };
}
/* resolves {status, gone} ; gone=true means the device token is dead */
async function send(cfg, token, payload) {
  if (!cfg) return { status: 0, error: 'fcm-not-configured' };
  try {
    const at = await accessToken(cfg);
    let r = await post(cfg.base + '/v1/projects/' + encodeURIComponent(cfg.project) + '/messages:send', { Authorization: 'Bearer ' + at, 'Content-Type': 'application/json' }, JSON.stringify(message(token, payload)));
    if (r.status === 401) { cache = { tok: '', exp: 0 }; }
    let j = {}; try { j = JSON.parse(r.text); } catch (_) {}
    const code = (j.error && (j.error.status || '')) + ' ' + JSON.stringify((j.error && j.error.details) || '');
    const gone = r.status === 404 || /UNREGISTERED/.test(code) || (r.status === 400 && /INVALID_ARGUMENT/.test(code) && /token/i.test(JSON.stringify(j.error)));
    return { status: r.status, gone, error: r.status >= 300 ? (j.error && j.error.message || r.error || '') : '' };
  } catch (e) { return { status: 0, error: e.message }; }
}
module.exports = { load, send, message };
