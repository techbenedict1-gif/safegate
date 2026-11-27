/* The Render free-plan wrapper: restores encrypted data from a (fake) GitHub, keeps it saved. Run: node tests/render_start_test.js */
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), { spawn } = require('child_process'), BC = require('../backupcrypt.js');
let ok = 0; const t = (c, m) => { if (!c) { console.log('FAIL', m); process.exitCode = 1; } else ok++; };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sgr-')), DATA = path.join(dir, 'db.json'); process.env.BACKUP_KEY = 'test-secret';
const key = BC.keyFor(DATA); let stored = { content: Buffer.from(BC.seal(JSON.stringify({ marker: 'restored-ok', settings: { schoolName: 'Restore U' } }), key)).toString('base64'), sha: 's1' }, puts = 0;
const gh = http.createServer((req, res) => { let b = ''; req.on('data', (d) => b += d); req.on('end', () => {
  if (req.method === 'GET') { res.writeHead(200); return res.end(JSON.stringify(stored)); }
  puts++; const j = JSON.parse(b); stored = { content: j.content, sha: 's' + (puts + 1) }; res.writeHead(200); res.end(JSON.stringify({ content: { sha: stored.sha } })); }); });
gh.listen(0, async () => {
  const env = Object.assign({}, process.env, { PORT: '8141', DATA_FILE: DATA, BACKUP_REPO: 'u/r', BACKUP_TOKEN: 'x', GH_API: 'http://127.0.0.1:' + gh.address().port });
  const p = spawn('node', [path.join(__dirname, '..', 'deploy', 'render-start.js')], { env }); let out = ''; p.stdout.on('data', (d) => out += d); p.stderr.on('data', (d) => out += d);
  await new Promise((r) => setTimeout(r, 2500));
  t(/restored your data/.test(out), 'data is restored from the private copy before starting');
  t(JSON.parse(fs.readFileSync(DATA, 'utf8')).marker === 'restored-ok' || fs.readFileSync(DATA, 'utf8').includes('Restore U'), 'the restored data is on disk (and SafeGate kept it)');
  const h = await new Promise((r) => http.get('http://127.0.0.1:8141/api/health', (x) => { let s = ''; x.on('data', (d) => s += d); x.on('end', () => r(s)); }).on('error', () => r('')));
  t(/"ok":true/.test(h), 'SafeGate is running');
  const cur = JSON.parse(fs.readFileSync(DATA, 'utf8')); cur.marker2 = 'new-student'; fs.writeFileSync(DATA, JSON.stringify(cur));   // pretend SafeGate saved something new
  p.kill('SIGTERM'); await new Promise((r) => setTimeout(r, 1500));
  t(puts >= 1 && !Buffer.from(stored.content, 'base64').toString().includes('Restore U'), 'on shutdown a fresh copy is saved, and it is encrypted');
  t(JSON.stringify(BC.open(Buffer.from(stored.content, 'base64').toString(), key)).includes('Restore U'), 'the saved copy opens with the key');
  if (process.exitCode) console.log('--- log ---\n' + out + 'puts=' + puts);
  gh.close(); fs.rmSync(dir, { recursive: true, force: true });
  console.log('render-start: ' + ok + ' checks passed' + (process.exitCode ? ' WITH FAILURES' : '')); process.exit(process.exitCode || 0);
});
