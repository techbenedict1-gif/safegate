/* Starts SafeGate on a host whose disk is wiped on every restart (Render's free plan). It keeps an ENCRYPTED copy of your data in a private
   GitHub repository: it restores that copy before starting, saves a fresh one every 2 minutes when something changed, and once more on shutdown.
   Needs: BACKUP_REPO (owner/name), BACKUP_TOKEN (GitHub token), BACKUP_KEY (the secret that locks the copy). Photos, voice notes and videos are not kept. */
'use strict';
const https = require('https'), http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const BC = require('../backupcrypt.js');
const REPO = process.env.BACKUP_REPO, TOKEN = process.env.BACKUP_TOKEN, API = process.env.GH_API || 'https://api.github.com', FILE = 'safegate-data.enc';
const DATA = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'db.json');
function gh(method, p, body) {
  return new Promise((resolve) => {
    const u = new URL(API + p), lib = u.protocol === 'http:' ? http : https, data = body ? JSON.stringify(body) : null;
    const req = lib.request({ method, hostname: u.hostname, port: u.port || undefined, path: u.pathname + u.search, headers: Object.assign({ 'User-Agent': 'safegate', Accept: 'application/vnd.github+json', Authorization: 'token ' + TOKEN }, data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}) }, (res) => {
      let b = ''; res.on('data', (d) => b += d); res.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (_) { } resolve({ status: res.statusCode, json: j }); });
    });
    req.setTimeout(30000, () => req.destroy()); req.on('error', () => resolve({ status: 0, json: null })); if (data) req.write(data); req.end();
  });
}
let sha = null, lastHash = '';
async function restore() {
  if (!REPO || !TOKEN) return console.log('[backup] BACKUP_REPO / BACKUP_TOKEN not set: running without off-site copies');
  const r = await gh('GET', '/repos/' + REPO + '/contents/' + FILE);
  if (r.status === 200 && r.json && r.json.content) {
    try {
      const text = Buffer.from(r.json.content, 'base64').toString('utf8'), db = BC.open(text, BC.keyFor(DATA));
      fs.mkdirSync(path.dirname(DATA), { recursive: true }); fs.writeFileSync(DATA, JSON.stringify(db), { mode: 0o600 }); sha = r.json.sha;
      lastHash = crypto.createHash('sha256').update(fs.readFileSync(DATA)).digest('hex'); console.log('[backup] restored your data from the private copy');
    } catch (e) { console.log('[backup] COULD NOT OPEN the saved copy (wrong BACKUP_KEY?): ' + e.message); process.exit(1); }   // never start empty and overwrite good data
  } else if (r.status === 404) console.log('[backup] no saved copy yet: starting fresh');
  else console.log('[backup] could not reach GitHub (status ' + r.status + '): starting with whatever is on disk');
}
let busy = false;
async function push(why) {
  if (!REPO || !TOKEN || busy) return; let buf; try { buf = fs.readFileSync(DATA); } catch (_) { return; }
  const h = crypto.createHash('sha256').update(buf).digest('hex'); if (h === lastHash) return; busy = true;
  try {
    const sealed = BC.seal(buf.toString('utf8'), BC.keyFor(DATA));
    let r = await gh('PUT', '/repos/' + REPO + '/contents/' + FILE, Object.assign({ message: 'safegate data ' + new Date().toISOString(), content: Buffer.from(sealed).toString('base64') }, sha ? { sha } : {}));
    if (r.status === 409 || r.status === 422) { const g = await gh('GET', '/repos/' + REPO + '/contents/' + FILE); if (g.json && g.json.sha) { sha = g.json.sha; r = await gh('PUT', '/repos/' + REPO + '/contents/' + FILE, { message: 'safegate data', content: Buffer.from(sealed).toString('base64'), sha }); } }
    if (r.status === 200 || r.status === 201) { sha = r.json.content.sha; lastHash = h; if (why) console.log('[backup] saved (' + why + ')'); } else console.log('[backup] save failed, status ' + r.status);
  } finally { busy = false; }
}
(async () => {
  await restore();
  require('../server.js');
  setInterval(() => push(''), 120000).unref();
  // SafeGate's own shutdown writes the data file and exits at once. Take it over: let it write, then upload, then exit.
  const own = process.listeners('SIGTERM').concat(process.listeners('SIGINT')); process.removeAllListeners('SIGTERM'); process.removeAllListeners('SIGINT');
  const bye = async () => { const ex = process.exit; process.exit = () => { }; try { own.forEach((f) => f()); } catch (_) { } process.exit = ex; try { await push('shutdown'); } catch (_) { } process.exit(0); };
  process.on('SIGTERM', bye); process.on('SIGINT', bye);
})();
