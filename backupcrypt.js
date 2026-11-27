/* Encrypted backups (AES-256-GCM). The key lives in data/backup.key (private, 0600) or BACKUP_KEY. Keep a copy of the key somewhere else: without it a backup cannot be opened. */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
function keyFor(dataFile) {
  if (process.env.BACKUP_KEY) return crypto.createHash('sha256').update(process.env.BACKUP_KEY).digest();
  const f = path.join(path.dirname(dataFile), 'backup.key');
  try { return Buffer.from(fs.readFileSync(f, 'utf8').trim(), 'hex'); } catch (_) { }
  const k = crypto.randomBytes(32); try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, k.toString('hex'), { mode: 0o600 }); } catch (_) { }
  return k;
}
function seal(text, key) { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv), d = Buffer.concat([c.update(text, 'utf8'), c.final()]); return JSON.stringify({ enc: 'aes-256-gcm', iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: d.toString('base64') }); }
function open(text, key) {
  const o = JSON.parse(text); if (!o || o.enc !== 'aes-256-gcm') return o;     // older plain backups still open
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(o.iv, 'base64')); d.setAuthTag(Buffer.from(o.tag, 'base64'));
  return JSON.parse(Buffer.concat([d.update(Buffer.from(o.data, 'base64')), d.final()]).toString('utf8'));
}
module.exports = { keyFor, seal, open };
