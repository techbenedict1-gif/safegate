/* Browser tests (need Playwright: npm i playwright && npx playwright install chromium).  Run: node tests/browser/run.js [name...]
 * Each suite gets a fresh server on port 8099 and an empty database; a fake map/route/search server runs on 8097. */
const { spawn, spawnSync } = require('child_process'), path = require('path'), fs = require('fs'), os = require('os'), http = require('http');
const root = path.join(__dirname, '..', '..'), want = process.argv.slice(2);
const SUITES = [['http_test', 'ui_test'], ['crawl'], ['audit'], ['fb_ui'], ['nav_ui'], ['media_ui'], ['brief_ui'], ['value_ui'], ['ict_ui'], ['help_ui'], ['monet_ui'], ['trash_ui'], ['founder_ui'], ['gm_ui'], ['v121_ui'], ['v8_ui'], ['v9_ui'], ['xss']];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const mock = spawn('node', [path.join(__dirname, 'mock.js')], { stdio: 'ignore' }); await wait(500); let bad = 0;
  for (const group of SUITES) {
    if (want.length && !group.some((g) => want.includes(g))) continue;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sgb-')), srv = spawn('node', [path.join(root, 'server.js')], { env: Object.assign({}, process.env, { PORT: '8099', DATA_FILE: path.join(dir, 'db.json'), OPERATOR_KEY: 'k-op' }), stdio: 'ignore' }); await wait(1300);
    for (const s of group) {
      const r = spawnSync('node', [path.join(__dirname, s + '.js')], { encoding: 'utf8', timeout: 180000, env: Object.assign({}, process.env, { SG_DATA_DIR: dir }) }), out = (r.stdout || '') + (r.stderr || '');
      const fails = out.split('\n').filter((l) => /^(FAIL|ISSUE|ERR)|XSS fired on desk: [1-9]/.test(l)); const tail = out.trim().split('\n').pop().slice(0, 100);
      if (r.status !== 0 && !fails.length) fails.push('exit ' + r.status);
      if (fails.length) { bad++; console.log('FAIL ' + s + '\n  ' + fails.slice(0, 4).join('\n  ')); } else console.log('ok   ' + s + '  ' + tail);
    }
    srv.kill();
  }
  mock.kill(); console.log(bad ? '\n' + bad + ' suite(s) failed' : '\nAll browser suites passed'); process.exit(bad ? 1 : 0);
})();
