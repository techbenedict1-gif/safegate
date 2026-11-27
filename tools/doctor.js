#!/usr/bin/env node
/* SafeGate self-check: node tools/doctor.js . Looks for broken files and risky settings before you go live. */
const fs = require('fs'), path = require('path'), cp = require('child_process'), root = path.join(__dirname, '..');
let bad = 0, warn = 0; const ok = (m) => console.log('  ok   ' + m), no = (m) => { bad++; console.log('  FAIL ' + m); }, w = (m) => { warn++; console.log('  warn ' + m); };
console.log('SafeGate doctor');
parseInt(process.versions.node) >= 18 ? ok('Node ' + process.versions.node) : no('Node 18 or newer is needed (you have ' + process.versions.node + ')');
['server.js', 'mail.js', 'sms.js', 'pay.js', 'webpush.js', 'fcm.js', 'index.html', 'desk.html', 'ict.html', 'js/ict.js', 'tools/ict-link.js', 'sw.js', 'manifest.webmanifest', 'js/core.js', 'js/student.js', 'js/desk.js', 'js/ui.js', 'js/map.js', 'js/feedback.js', 'css/app.css'].forEach((f) => fs.existsSync(path.join(root, f)) ? 0 : no('missing file ' + f));
let n = 0; (function walk(d) { fs.readdirSync(d).forEach((f) => { const p = path.join(d, f); if (/node_modules|\.git|^data$/.test(f)) return; const st = fs.statSync(p); if (st.isDirectory()) return walk(p); if (/\.js$/.test(f) && !/native|lib/.test(p.replace(root, ''))) { n++; try { new (require('vm').Script)(fs.readFileSync(p, 'utf8').replace(/^#!.*/, ''), { filename: p }); } catch (e) { no('syntax error in ' + p.replace(root + '/', '') + ': ' + e.message); } } }); })(root);
ok(n + ' JavaScript files parse');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), shell = (sw.match(/const SHELL = \[([^\]]*)\]/) || [, ''])[1].match(/'([^']+)'/g) || [];
shell.map((s) => s.slice(1, -1)).filter((f) => f !== './').forEach((f) => fs.existsSync(path.join(root, f)) || no('service worker caches a missing file: ' + f));
ok('service worker file list checked (' + shell.length + ' files)');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8'); (html.match(/src="(js\/[^"]+)"/g) || []).forEach((m) => { const f = m.slice(5, -1); fs.existsSync(path.join(root, f)) || no('index.html loads missing ' + f); });
if (!process.env.OPERATOR_KEY) w('OPERATOR_KEY is not set: the operator page (billing, feedback) is switched off');
if (!process.env.PUBLIC_URL) w('PUBLIC_URL is not set: share links and QR codes use whatever address the first visitor used');
if (!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)) w('SMTP is not set: feedback is saved but not emailed');
console.log(bad ? '\n' + bad + ' problem(s) found.' : '\nAll good' + (warn ? ' (' + warn + ' reminder' + (warn > 1 ? 's' : '') + ').' : '.')); process.exit(bad ? 1 : 0);
