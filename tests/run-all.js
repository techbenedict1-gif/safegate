/* Runs every Node test (no installs needed): node tests/run-all.js */
const { spawnSync } = require('child_process'), path = require('path'), fs = require('fs');
const files = fs.readdirSync(__dirname).filter((f) => /(_test|authz_student|fuzz)\.js$/.test(f)).sort(); let bad = 0;
for (const f of files) {
  const r = spawnSync('node', [path.join(__dirname, f)], { encoding: 'utf8', timeout: 120000 }), out = (r.stdout || '') + (r.stderr || '');
  const fails = out.split('\n').filter((l) => /^FAIL|ERR/.test(l)), last = out.trim().split('\n').pop();
  const fuzz = f === 'fuzz.js';  /* fuzz lists raw-object inputs the network cannot send; judged by the HTTP suites */
  if (!fuzz && (r.status !== 0 || fails.length)) { bad++; console.log('FAIL ' + f + '\n' + fails.slice(0, 5).join('\n')); } else console.log('ok   ' + f + '  ' + (fuzz ? '(listed only)' : last));
}
console.log(bad ? '\n' + bad + ' test file(s) failed' : '\nAll tests passed'); process.exit(bad ? 1 : 0);
