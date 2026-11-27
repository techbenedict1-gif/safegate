/* SafeGate SMS sender: Termii, Africa's Talking, Twilio, or any HTTP webhook. Node built-ins only (server side).
 * Credentials come from environment variables or sms.json beside the data file. They are never stored in the database.
 *   SMS_PROVIDER = termii | africastalking | twilio | webhook      SMS_SENDER = sender id / number
 *   termii:  SMS_API_KEY, SMS_CHANNEL (generic|dnd, default dnd)      africastalking: SMS_API_KEY, SMS_USERNAME
 *   twilio:  SMS_SID, SMS_TOKEN                                       webhook: SMS_URL, optional SMS_API_KEY (sent as Bearer)
 *   SMS_BASE overrides the provider address (tests, proxies). */
'use strict';
const https = require('https');
const http = require('http');
const fs = require('fs');

function loadConfig(file) {
  let f = {}; try { f = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) {}
  const e = process.env, pick = (k, ek) => e[ek] || f[k] || '';
  const c = { provider: (pick('provider', 'SMS_PROVIDER') || '').toLowerCase(), sender: pick('sender', 'SMS_SENDER'), apiKey: pick('apiKey', 'SMS_API_KEY'),
    username: pick('username', 'SMS_USERNAME'), sid: pick('sid', 'SMS_SID'), token: pick('token', 'SMS_TOKEN'), url: pick('url', 'SMS_URL'),
    channel: pick('channel', 'SMS_CHANNEL') || 'dnd', base: pick('base', 'SMS_BASE') };
  c.configured = !!({ termii: c.apiKey && c.sender, africastalking: c.apiKey && c.username, twilio: c.sid && c.token && c.sender, webhook: c.url })[c.provider];
  return c;
}
function request(urlStr, opt, body) {
  return new Promise((resolve) => {
    let u; try { u = new URL(urlStr); } catch (e) { return resolve({ status: 0, error: 'bad-url' }); }
    const lib = u.protocol === 'http:' ? http : https;
    const req = lib.request(u, Object.assign({ method: 'POST', timeout: 12000 }, opt), (res) => {
      const ch = []; res.on('data', (d) => ch.push(d)); res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(ch).toString('utf8') }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (e) => resolve({ status: 0, error: e.message }));
    req.end(body);
  });
}
const form = (o) => Object.keys(o).filter((k) => o[k] != null && o[k] !== '').map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(o[k])).join('&');
const json = (t) => { try { return JSON.parse(t); } catch (_) { return {}; } };

/* to: digits only, international, no plus (e.g. 2348031234567) */
async function sendOnce(c, to, text) {
  let r;
  if (c.provider === 'termii') {
    const body = JSON.stringify({ to, from: c.sender, sms: text, type: 'plain', channel: c.channel, api_key: c.apiKey });
    r = await request((c.base || 'https://api.ng.termii.com') + '/api/sms/send', { headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, body);
    const j = json(r.text);
    return r.status >= 200 && r.status < 300 && (j.message_id || /success/i.test(j.message || '')) ? { ok: true, id: String(j.message_id || '') } : { ok: false, error: 'termii ' + r.status + ' ' + (j.message || r.error || '').slice(0, 80), retry: r.status === 0 || r.status >= 500 };
  }
  if (c.provider === 'africastalking') {
    const body = form({ username: c.username, to: '+' + to, message: text, from: c.sender });
    r = await request((c.base || 'https://api.africastalking.com') + '/version1/messaging', { headers: { apiKey: c.apiKey, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) } }, body);
    const rec = (((json(r.text).SMSMessageData || {}).Recipients) || [])[0];
    return r.status >= 200 && r.status < 300 && rec && rec.statusCode === 101 ? { ok: true, id: rec.messageId || '' } : { ok: false, error: 'africastalking ' + r.status + ' ' + (rec ? rec.status : r.error || '').slice(0, 60), retry: r.status === 0 || r.status >= 500 };
  }
  if (c.provider === 'twilio') {
    const body = form({ To: '+' + to, From: c.sender.startsWith('MG') ? undefined : c.sender, MessagingServiceSid: c.sender.startsWith('MG') ? c.sender : undefined, Body: text });
    r = await request((c.base || 'https://api.twilio.com') + '/2010-04-01/Accounts/' + encodeURIComponent(c.sid) + '/Messages.json',
      { headers: { Authorization: 'Basic ' + Buffer.from(c.sid + ':' + c.token).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) } }, body);
    const j = json(r.text);
    return r.status === 201 || r.status === 200 ? { ok: true, id: j.sid || '' } : { ok: false, error: 'twilio ' + r.status + ' ' + String(j.message || r.error || '').slice(0, 80), retry: r.status === 0 || r.status >= 500 };
  }
  if (c.provider === 'webhook') {
    const body = JSON.stringify({ to: '+' + to, text, from: c.sender || undefined });
    const h = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }; if (c.apiKey) h.Authorization = 'Bearer ' + c.apiKey;
    r = await request(c.url, { headers: h }, body);
    return r.status >= 200 && r.status < 300 ? { ok: true, id: '' } : { ok: false, error: 'webhook ' + r.status + ' ' + (r.error || ''), retry: r.status === 0 || r.status >= 500 };
  }
  return { ok: false, error: 'no-provider' };
}
async function send(c, to, text) {
  if (!c || !c.configured) return { ok: false, error: 'not-configured' };
  let r = await sendOnce(c, to, text);
  if (!r.ok && r.retry) { await new Promise((s) => setTimeout(s, 1500)); r = await sendOnce(c, to, text); }
  return r;
}
module.exports = { loadConfig, send };
