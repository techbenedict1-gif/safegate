#!/usr/bin/env node
/* Restore helper: node tools/backup-open.js <backup-file> [data/db.json]  (decrypts with data/backup.key or BACKUP_KEY) */
const fs = require('fs'), path = require('path'), BC = require('../backupcrypt.js');
const [src, dest] = process.argv.slice(2); if (!src) { console.log('Usage: node tools/backup-open.js <backup file> [output db.json]'); process.exit(1); }
const dataFile = path.resolve(dest || path.join(__dirname, '..', 'data', 'db.json'));
const db = BC.open(fs.readFileSync(src, 'utf8'), BC.keyFor(dataFile)); fs.writeFileSync(dataFile, JSON.stringify(db)); console.log('Restored to ' + dataFile + '. Restart SafeGate.');
