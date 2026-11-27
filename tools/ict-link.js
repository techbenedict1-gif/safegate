#!/usr/bin/env node
/* Show or recreate the ICT console link.
 *   node tools/ict-link.js          show the saved link (path part)
 *   node tools/ict-link.js --new    cancel ALL old ICT links and make a fresh one (stop the server first)
 * Env: DATA_FILE (default ./data/db.json), BASE (e.g. https://school.example.com) */
const fs = require('fs'), path = require('path');
const DATA = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'db.json'), FILE = path.join(path.dirname(DATA), 'ict-link.txt'), BASE = (process.env.BASE || '').replace(/\/$/, '');
if (process.argv.includes('--new')) {
  const Core = require('../js/core.js'); let db; try { db = JSON.parse(fs.readFileSync(DATA, 'utf8')); } catch (e) { console.error('Cannot read', DATA, '(' + e.message + ')'); process.exit(1); }
  const srv = Core.createServer(db, {}); const tok = srv.ictReset();
  const tmp = DATA + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(srv.db)); fs.renameSync(tmp, DATA);
  fs.writeFileSync(FILE, tok + '\n', { mode: 0o600 }); console.log('New ICT link made. All older ICT links are cancelled.\n  ' + BASE + '/ict/' + tok);
  console.log('Start the server again for it to work.');
} else if (fs.existsSync(FILE)) console.log(BASE + '/ict/' + fs.readFileSync(FILE, 'utf8').trim());
else { console.error('No saved link yet. Start the server once, or run with --new.'); process.exit(1); }
