# Tests

Run any of these with `node tests/NAME.js` (no installs needed). Each prints `ok N` or `FAIL ...`.

- `v8_test.js` roll call, duress, health card, starter texts
- `v9_test.js` vague destinations, who-you-are-meeting, trace sheet
- `v10_test.js` personal norms, heads-up before return time
- `v12_test.js` safe points, risk areas, map data, report triage, reference tracking, evidence, hotspots
- `bill_test.js` wallets, refunds, parent updates, STOP
- `run-all.js` runs all of these
- `fuzz.js` throws junk at every method and lists any that crash with a raw JavaScript error. The only entries expected are ones where an object with no prototype is passed, which cannot arrive over HTTP.

The browser tests (Playwright) and the payment and operator tests are not included because they need extra tools; ask for them if you want them.
- `authz_student.js` one student cannot act as another
- `v12_test.js` reports, triage, hazards, risk zones, safest-route ranking, map settings validation
- `feedback_test.js` feedback saving, emailing through a fake SMTP server, spam limits, operator reading
