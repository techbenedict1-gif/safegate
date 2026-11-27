'use strict';
/* Paystack (card, bank transfer, USSD). Only the secret key stays on the server. A top-up is credited only after the server asks Paystack
   to confirm it (or a correctly signed webhook arrives), and only once per reference. */
const https = require('https'), http = require('http'), crypto = require('crypto');
function cfg() {
  const base = process.env.PAYSTACK_BASE || 'https://api.paystack.co', secret = process.env.PAYSTACK_SECRET || '';
  return { base, secret, enabled: !!secret, email: process.env.PAY_EMAIL || 'payments@safegate.app' };
}
function call(c, method, path, body) {
  return new Promise((resolve) => {
    const u = new URL(c.base + path), lib = u.protocol === 'http:' ? http : https, data = body ? JSON.stringify(body) : null;
    const req = lib.request({ method, hostname: u.hostname, port: u.port || undefined, path: u.pathname + u.search, timeout: 15000,
      headers: Object.assign({ Authorization: 'Bearer ' + c.secret, Accept: 'application/json' }, data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) }, (res) => {
      const ch = []; res.on('data', (d) => ch.push(d)); res.on('end', () => { let j = null; try { j = JSON.parse(Buffer.concat(ch).toString()); } catch (_) {} resolve({ status: res.statusCode, json: j }); });
    });
    req.on('error', () => resolve({ status: 0, json: null })); req.on('timeout', () => { req.destroy(); resolve({ status: 0, json: null }); });
    if (data) req.write(data); req.end();
  });
}
async function init(ref, kobo, callback) {
  const c = cfg(); const r = await call(c, 'POST', '/transaction/initialize', { email: c.email, amount: kobo, reference: ref, callback_url: callback, currency: 'NGN' });
  if (r.json && r.json.status && r.json.data && r.json.data.authorization_url) return { ok: true, url: r.json.data.authorization_url };
  return { ok: false, error: 'provider' };
}
async function verify(ref) {
  const c = cfg(); const r = await call(c, 'GET', '/transaction/verify/' + encodeURIComponent(ref));
  const d = r.json && r.json.data;
  if (r.status === 200 && d && d.reference === ref) return { ok: d.status === 'success', paid: d.status === 'success' ? d.amount : 0, status: d.status, currency: d.currency };
  return { ok: false, paid: 0, status: 'unknown' };
}
function signatureOk(raw, sig) {
  const c = cfg(); if (!c.secret || !sig) return false;
  const h = crypto.createHmac('sha512', c.secret).update(raw).digest('hex');
  return h.length === String(sig).length && crypto.timingSafeEqual(Buffer.from(h), Buffer.from(String(sig)));
}
module.exports = { cfg, init, verify, signatureOk };
