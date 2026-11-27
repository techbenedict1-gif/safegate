# SafeGate

_Powered by **ResultFlow**_

# SafeGate – Student Security & Movement System

Replaces the paper gate register with a QR scan. Works offline, records where students say they are going, can share location after 5:30 PM (with consent), and has an emergency (SOS) button, a safe-walk timer, check-in requests, risk-ranked live board, analytics and tamper-evident audit. Pure HTML / CSS / JavaScript on the front end, one dependency-free Node file on the back end.

## Run it (2 minutes)

```bash
node server.js          # needs Node 18+   (or double-click start.bat on Windows, ./start.sh on Mac/Linux)
```

One application, one address:
- **Start page** (choose Student or Security): `http://localhost:8080/start`
- Student app: `http://localhost:8080/`
- Security desk: `http://localhost:8080/desk`

Both parts read and write the same records, and each links to the other.

First visit to `/desk` creates the **administrator** account (school name, your name, your own PIN of 6+ characters). Add other officers in **Settings → Officers**; each has their own name and PIN. Officers can run the live board, gate, paper log, records, students and analytics; only administrators can change places/settings, export CSV, read the audit log, manage officers and back up / restore.
Then in **Settings** set:
1. **Public address** (the https:// address students' phones use). It goes into the gate QR.
2. **Security phone** (shown to students as Call / SMS in an emergency).
3. **Campus position** (stand at the gate, press "Use this device's location").
4. Tracking window (default 17:30 → 06:00), curfew, time zone (Nigeria = 60).

Then open **Gate QR** on a screen at the gate. Rotating mode changes the code every 60 s, so a photo of it will not work later.

Try without a server: open `desk.html` and `index.html` straight from the folder. They run in **demo mode** (data kept in that browser only) so you can click through everything.

## Put it on the internet (needed for real phones)

Camera, location and offline mode only work on **HTTPS** (localhost is exempt).

- Quick: run `node server.js` on a PC at the school and use a tunnel such as `cloudflared tunnel --url http://localhost:8080` to get an https address.
- Proper: see **DEPLOY.md** (Docker with automatic HTTPS in one command, or systemd). Any Node host with a **persistent disk** works; set `PORT` and `DATA_FILE`.
- Backups: the server copies the data file every 6 hours into a `backups` folder (newest 30 kept). Copy that folder off the machine now and then.

## How it works

| Situation | What happens |
|---|---|
| Student leaves | Scans gate QR, picks destination from list (each place shows a safety tip), purpose, return time, location on/off. Saved on the phone first, sent when online. |
| Student returns | Scans again. Time-out is calculated. Late returns are noticed. |
| No internet | Everything is stored on the phone and synced automatically later, in order, without duplicates. |
| Phone dead / no phone | Sign the paper register. The officer types it in under **Paper log** so the record stays complete. |
| After 5:30 PM | If the student allowed it, the app sends location every 2 min while open. |
| Student does not return | Alerts: overdue, out after curfew, no signal for 20 min. |
| Safe walk | Student starts a timer (10–90 min). If they do not tap "I have arrived" in time, a critical alert (with last location) is raised **by the server**, so it fires even if the phone dies. |
| Check on a student | Officer sends "Are you OK?". The phone shows I am OK / I need help (help = SOS). No reply in the set time raises an alert. |
| Smart alerts | Not near the stated destination, low battery, scanned far from the gate (shared QR), plus a 0-100 risk score that sorts the board. |
| Exit pass | Student asks to go home or away for longer (where, back by when, why). An officer approves or denies in **Inbox**. While approved, late and curfew alerts are paused; they resume when the pass ends. |
| Concern report | Student reports being followed, theft, an unsafe place, etc. (optionally with location, optionally hiding their name). It appears in the Inbox and as an alert; officers add notes and close it. |
| Notices | Officers send a notice (e.g. gate closes at 9 PM). Students see it on the home screen and tap Got it; the desk shows how many have read it. |
| Danger zones | Mark a place as a danger zone in **Places**. Trips there are flagged and officers are alerted if a student is inside it. |
| Family link | A student creates a link for a parent. It shows only on campus / out, destination and return time, **never location**. 30 days, can be stopped any time. |
| Escalation | An emergency nobody has claimed after 5 minutes (changeable) is marked ESCALATED. |
| Shift log and reports | Handover notes between officers, plus a printable daily report and roll call (who is still outside, with phone and emergency contact). |
| Escort request | A student afraid to walk alone asks for an escort (with their location). It becomes urgent if nobody takes it within 10 minutes. Officers tap \"I am escorting\" and the student sees who is coming. |
| Visitors | Gate staff sign visitors in and out (name, phone, ID type and last 4 characters, purpose, who they are visiting, badge). A visitor still inside after the limit raises an alert; a student being visited is told. |
| Privacy notice | Students read and accept the privacy notice. Editing it asks everyone to accept again. Students can download all their data or erase their location history from the app. |
| Important numbers | The school's emergency numbers (clinic, fire service, ...) appear in every student's app with one-tap calling. |
| School student list | Upload a CSV of students. Optionally only students on the list can register (matric and name are checked), guardian numbers fill in automatically, and the desk shows who has not registered yet. |
| Missing-person case | Open a case for a student nobody can reach. It freezes the last known facts (last scan, destination, companions, last location, battery), gives call and WhatsApp buttons for the student, emergency contact and guardian, keeps a timeline of notes and automatic events, prints an information sheet for family and police, and ends with an outcome. The Cases tab also lists students who have been out unusually long. |
| Gate guard role | A restricted account for the gate post: live board, gate QR, paper log, records and visitors only. No student profiles, locations or settings. |
| Safety hotspots | Analytics shows where emergencies, concern reports and escort requests cluster, so the school can add lighting or patrols. |
| Responding | An officer taps "I am responding" on an alert; the alarm stops for everyone and the log records who took it. |
| Emergency | Hold the red button 1.5 s. Desk gets a loud alarm, the student's live location, phone and emergency contact. Works offline (saved, sent as soon as there is signal) and offers Call / SMS buttons. |

### Accuracy and trust

- Every scan is checked on the server against the gate secret **and the time**. Codes older than ~3 minutes, wrong codes or "I cannot scan" entries are saved but **flagged** (shown in red/amber on the desk) – never silently accepted.
- Phone clock is corrected using the server clock; a phone clock set into the future is flagged.
- A matric number re-registered from a different phone is flagged ("New device").
- Uploads are idempotent (each record has a unique id) so retries never double-count.

### Privacy

- Location is **hidden by default**. An officer must choose a reason, access lasts 30 min, and it is written to an audit log **and shown to the student** (Me & privacy).
- During an SOS the live location is shown immediately (by design).
- Location points auto-delete after 30 days, movement records after 365 (changeable).
- The board shows only a coarse place category (at campus / at destination / elsewhere), never coordinates.
- Officer PINs are salted + hashed, 5 wrong tries lock an account for 5 minutes, sessions expire after 12 h.
- The audit log is hash-chained: **Audit → Check log integrity** detects any edited or deleted entry.
- **Settings → Backup** downloads everything as one JSON file (contains student data, keep it private); **Restore** replaces all data from such a file.

## New in v5

- **One phone per matric number.** Nobody can register as another student from a different phone. A new phone either needs a 6-digit **transfer code** made on the old phone (Me & privacy → Move to a new phone, valid 10 minutes, 5 tries), or **approval by an officer** in Inbox → Phone change requests (the officer sees the number on record to call and check). Can be switched off in Settings → Identity.
- **Phone alerts that work with the app closed** (Web Push, no third-party service, no dependencies). Officers get emergency, escort and serious alerts; students get "Security is checking on you", exit-pass decisions, urgent notices, escort updates and an overdue nudge. Switch on "Alarm notifications" on the desk and "Alert me on this phone" in the student app. Keys are created automatically (`vapid.json` beside the data file). The encryption was checked against the official test vector in RFC 8291.
- **System tab** (administrators): a checklist of what is not set up yet, audit-log integrity, backups, disk saving, alert delivery, "Back up now" and "Send a test alert".
- **Deploy kit**: `Dockerfile`, `docker-compose.yml`, `deploy/Caddyfile`, `deploy/safegate.service`, `DEPLOY.md`.

## v10.3: get it in 30 seconds

- **`/get` page**: one big button that adapts to the phone: one-tap install on Android, Share steps on iPhone, "Open in Chrome/Safari" when the link was opened inside Facebook, Instagram or TikTok, a QR code on a computer, and an always-visible "use it in the browser" option.
- **Install poster** (desk, Gate QR tab): printable A4 poster with the QR, three steps and the school name. It refuses to print while the public address is "localhost", because students' phones could not open that.
- **Invite a friend** (student app, Me): opens the phone's share sheet or WhatsApp with the link.

## v10.2: installs like an app

The student app now offers **Install SafeGate** on the home screen: a real one-tap install on Android, and clear Share, Add to Home Screen steps on iPhone. It hides itself once installed and can be dismissed for a week. See `docs/HOW-IT-WORKS.md` for how students, guards, officers and parents each use it.

## v10.1: hardening after a review

- **Fixed a real hole:** the text-message handler (`smsInbound`) could be called by anyone through the public API, which bypassed its secret key. A stranger who knew a student's phone number could have raised a fake emergency, opted a parent out, or answered a roll call for them. It is now reachable only through the secret-protected `/api/sms-in` route.
- The server now logs and keeps running if an unexpected error happens, instead of stopping (a safety service should stay up).
- A hard limit of 100,000 registered students stops a flood of fake registrations from filling the disk. Also turn on "Require students to be on the school list" in Settings once your roster is uploaded.
- Checked and found safe: static file access (no path tricks), CSV export formulas, page injection (names, destinations, notes, roll-call titles all rendered safely in the desk, student phone, family page and trace sheet), and role checks (a guard or officer cannot reach admin-only functions; one student cannot act for another).
- `tests/` now contains the logic tests (`node tests/v8_test.js` etc.) and a fuzz test.
- New: `docs/PILOT-RUNBOOK.md`, a four-week plan for the first pilot.

## New in v10: it learns what is normal for each student

- **Personal norms.** After a student has 4 completed trips, SafeGate knows how long their trips usually take and whether they normally go out at night. An overdue alert then explains itself in the concern score: "Much longer than their usual trips (usually about 1 h, now 6 h)" or "Does not normally go out at night". Students with fewer than 4 trips get no such claims. It never uses gender, religion, tribe or home area.
- **Heads-up before the deadline.** 15 minutes before the return time the student gets a push: "Due back at 6:00 PM. Need more time? Tap Extend." Fewer false overdue alerts and less guard fatigue; extending resets it for the new time.

## New in v9: the "Afama" fix

- **Specific destinations.** If a student writes something general ("Afama", "market", "town"), the app asks: *if you did not come back, could security tell where to look?* and suggests adding the shop, street or landmark. They can still continue with "That is all I know", so nobody is stuck, but staff see a **Vague destination** flag.
- **Same as before.** The last four places a student typed come back as one-tap chips, filling in the place, companions and contact.
- **Who are you meeting?** An optional name and phone number. If the student is overdue, the alert says who they were meeting and who they went with.
- **Trace sheet** (student file, Print trace sheet): one page for the police and family: who, phone, emergency contact, last gate scan, where they said they were going, who with, who they were meeting, last known location, recent movements and a box for actions taken. Location points appear only while the officer has an active, reasoned location grant; printing is recorded in the audit log.

## New in v8: care, not just records

- **Campus roll call** (desk, Roll call tab): for a fire, flood, security threat or storm, staff send one urgent alert to every student phone. Students tap **I am safe** or **I need help** (help becomes an emergency with location). Students who do not answer get a text after 5 minutes and can reply SAFE. The desk shows safe / needs help / not answered, outside students first, with phone numbers, and refreshes by itself.
- **Silent duress code** (Me, Safety codes): when ending a safe-walk or cancelling an alert the app asks for a code. A second **duress code** looks identical to the person watching but quietly keeps the alert open for security, with location, marked SILENT DURESS. Parents and emergency contacts are deliberately **not** texted. Three wrong tries count as duress.
- **Emergency health card** (Me): optional allergies, conditions, medicines, blood group. Responders see it only on an active emergency, only if the student agreed, and the student can remove it any time.
- **Free starter texts**: each new parent gets the first texts free (default 10, set in Settings), and the family page talks about "texts left", not naira. Parents are never asked for money before they see the value.

Honest limits: duress and roll call were tested in a browser and in logic tests, not with real phones or a real push service; the quiet location trail after a duress cancel works only while the phone browser is allowed to run (a phone-app install does this better). Safety codes live on the phone, so a student who forgets both has to reset them from Me.

## New in v7: the business engine

- **Parent text updates.** A parent opens the student's family link, proves their phone with a code, and is texted when the student leaves (with destination), returns, is late, or presses emergency. Never location. STOP by text opts out; the student can see and remove every watcher.
- **Prepaid wallets** (like electricity). Parents pay per text from a wallet tied to their phone; the school has its own wallet for staff texts. Integer kobo, full ledger, failed texts refunded automatically, emergencies never blocked.
- **Paystack top-ups** (`pay.js`): the server confirms every payment with Paystack and checks the amount before crediting, once per reference. Set `PAYSTACK_SECRET`.
- **Wallet tab** on the desk (admin): balance, spend, days left, top-up, history.
- **Operator console** `/operator.html` (needs `OPERATOR_KEY`): revenue, cost, margin, prices, price calculator, add credit or sponsor money, ledger CSV, billing on/off. Billing is **off** until you switch it on.
- **Docs:** `BUSINESS.md` (model, pricing formula, unit economics, risks, law) and `docs/PILOT-PROPOSAL.md` (one page for the school).

New environment variables: `PAYSTACK_SECRET`, `PAYSTACK_BASE` (tests only), `PAY_EMAIL`, `PUBLIC_URL`, `OPERATOR_KEY`.

**Not proven with real providers:** real SMS delivery, real Paystack payments and webhooks, and a real phone build were tested only against mocks. Do a small live test (one ₦500 top-up, one real text) before any pilot. Billing is only enforceable on a server you run.

## New in v6

- **Real text messages (SMS).** Termii, Africa's Talking, Twilio or any webhook gateway. Emergencies are texted at once to officers **on call** (each officer sets their phone and "I am on call" under *My duty*) and to the security phone, and optionally to the student's emergency contact with a map link. Setup in `DEPLOY.md`.
- **Escalation ladder.** An urgent alert nobody takes in 5 minutes (setting) is pushed and texted to on-call officers; if still untouched after double that time it is texted to every administrator. Claiming an alert stops the ladder.
- **Emergency by text when there is no internet.** The app prefills `SAFEGATE SOS <matric> geo:lat,lng`. Point your provider's incoming-SMS webhook at `/api/sms-in?key=...` (link shown on the System tab) and the server raises a normal emergency for that student, or for an unknown number.
- **Phone app (Android/iOS shell)** in `native/`: location keeps working with the screen off (foreground service with a visible notification), and Firebase push alerts reach closed apps. See `native/README-NATIVE.md`.
- **Delivery log** on the System tab: every text with its result, daily limit, test-text button.

## v5 (earlier)

- One phone per matric number (transfer code or officer approval), web push alerts, System tab, automatic backups, deploy kit.

## Honest limits (please read)

1. **A web page cannot track in the background.** Only the phone app in `native/` can (Android: "Allow all the time" location and battery set to Unrestricted). The shell was tested with a **simulated** bridge, not yet built and run on a real phone. Test on 2-3 real phones with the screen off for 30 minutes first.
2. **In-app QR scanning works on all phones**: it uses the browser's detector when present and otherwise the bundled decoder (`js/qrscan.js`). The normal Camera app and the typed **6-digit code** also work. The camera path was tested with a simulated camera stream, not yet on a range of real phones, so try it on yours first.
3. A rotating QR proves the student had the code **recently**, not that they are standing at the gate. Compare with the location ping taken at scan time on the trail map.
4. **Phone alerts** were tested end to end against a local stand-in for the push service (encryption, signing, delivery, removal of dead phones), not yet against Google, Apple or Mozilla's real servers. Needs HTTPS. iPhones only receive them after the student adds the app to the Home Screen (iOS 16.4+). Test with "Send a test alert" on the System tab before relying on them. Texts and phone-app alerts add two more channels, but keep the desk open at the security post.
5. The phone lock stops impersonation by someone with another phone. It cannot stop a student handing over their own unlocked phone. Turn on **Only students on the school list** so invented matric numbers are refused.
6. **Texts were tested against stand-in servers** that mimic Termii, Africa's Talking, Twilio and a webhook (request format, retries, caps, escalation). Not yet against the real providers: send a **test text** from the System tab before relying on it. Each provider's exact fields can change; check their current documentation if a send fails (the System tab shows the error). The same applies to Firebase.
7. One server instance, one JSON file. Fine for thousands of students; move to a database if you outgrow it.

## Files

```
server.js            HTTP + storage + backups (no dependencies)
webpush.js, fcm.js, sms.js   Web push, Android push (Firebase), text messages (server only)
native/              Android/iOS app shell (Capacitor) + build guide
js/native.js         Bridge used only inside that app
DEPLOY.md, Dockerfile, docker-compose.yml, deploy/   Put it online
start.html           Start page (choose Student or Security)
start.sh / start.bat One-click start
js/core.js           All rules: verification, alerts, risk, accounts, audit (also runs in demo mode)
js/qrscan.js         QR decoder so scanning works on every phone
js/guardian.js       Family status page  guardian.html
js/student.js        Student app     index.html
js/desk.js           Security desk   desk.html
js/ui.js, css/app.css, lib/qrcode.js (QR encoder, MIT), sw.js (offline), manifests, icons
```

## v11: share previews, a welcoming first screen, install without stress

**The link is the product.** Students never see a store or a file. They tap your link and it opens like an app.

- **Link previews.** When the link is pasted into WhatsApp, Facebook, Telegram, X, LinkedIn or Slack, it shows a 1200x630 picture, a title ("SafeGate: sign out at the gate in one tap") and a short description. The tags are written into the page by the server on every request, with absolute URLs, because those apps do not run JavaScript when they build a preview. Also set up for `/get`, `/start` and the family link (`guardian.html`, no title leak and `noindex`).
- **Set `PUBLIC_URL`** to your real address (e.g. `PUBLIC_URL=https://gate.yourschool.edu.ng`). Without it the server uses the Host header, which is safe but can be wrong behind some proxies. Behind a proxy also set `TRUST_PROXY=1` so https is detected.
- **Refresh stale previews** after changing the picture: Facebook Sharing Debugger ("Scrape again"); WhatsApp caches for a while, so add `?v=2` to the link when testing.
- **TikTok and Instagram do not show link cards.** For those, Me > "Invite friends" has **Save story picture**: a 1080x1920 image with the headline and a QR code to the same link, ready to post as a story or status.
- **Share buttons** use the phone's own share sheet (WhatsApp, Status, Facebook and so on), falling back to WhatsApp, and a Copy link button.
- **First screen** now says what SafeGate is in one line, and on a desktop shows a QR code so the student can open it on their phone.
- **Install.** Android shows a real Install button; iPhone shows the Share > Add to Home Screen steps. Long-press menu shortcuts: Scan, Emergency, Safe walk (`/?go=scan|sos|walk`). Manifest has maskable icon and screenshots.
- **Regenerate pictures:** `node tools/make-share-images.js` (og-image) and `node tools/make-icons.js`. To rebrand, edit `tools/og.html`.
- Service worker is `sg-v14`; family and install pages are never cached as the student page.

Not verified on real platforms: previews were checked as served HTML, not inside live WhatsApp or Facebook.

## v11.1: picture slides and the Android app

- **Slides:** the first screen opens with six illustrated slides (gate scan, family, SOS, safe walk, offline, privacy). They swipe, auto-advance, have tap dots, respect "reduce motion", and are drawn as SVG so they are sharp and work offline (`js/slides.js`).
- **Story pictures:** Me > Invite friends shows the six pictures. Tap one and it becomes a 1080x1920 story or status image with a QR code to your link.
- **Android app:** see `native/README-NATIVE.md`. New: a GitHub Actions workflow builds the APK in the cloud, `native/brand.sh` puts the SafeGate icon on it and adds the camera, location and notification permissions.
- Service worker is `sg-v15`.

## v12: safety map, safe points, risk areas, better reports

- **Safety map (student):** Home > Safety map, or the "Show me the nearest safe place" button on the emergency screen, or the `?go=map` shortcut. Works offline.
- **Admin sets the map:** Desk > Map. Click the map, then "+ Safe point here" (security post, gate, clinic, police, fire, safe place, assembly point) or "+ Risk area here" (radius, reason, optional hours such as 18:00-05:00). Students keep a copy on their phones.
- **Risk areas:** a student inside one sees a warning and the way out. While out, entering one adds a quiet note to their record, once per trip.
- **Live map for staff:** emergencies with a location, open reports, escorts, hotspots. It does not show every student. Finding one student still needs a recorded reason.
- **Trail map:** the trail window now draws the route on the same map, with safe points and risk areas.
- **Hotspots:** repeated reports and emergencies in one ~150 m area, with how many were after dark and a one-click "Mark as risk area".
- **Reports:** 15 categories (bullying, threats, violence, sexual harassment, abuse, drugs, discrimination, staff misconduct and more), a transparent triage score and reason tags, duplicate detection, optional picture (hidden details removed on the phone), reference number, status check by reference, public replies.
- **Emergency type:** medical, followed, accident, danger.
- Coverage of the whole vision is in `docs/BLUEPRINT-COVERAGE.md`, including what is not built.
- Service worker `sg-v16`. Tests: `tests/v12_test.js`.

## v12.1: the map lives inside the app

- **In-app map** (student "Safety map", security "Map" tab): campus, safe points, risk areas (with time windows), hazards, places, your position with accuracy and compass heading, scale bar and north arrow. Pictures come from OpenStreetMap-style tiles aligned with Web Mercator; if tiles can't load, a plain grid is shown and everything still works.
- **Settings → Map**: `mapTiles` (https, must contain `{z}/{x}/{y}`) and `routeUrl` (OSRM-compatible). The server builds its Content-Security-Policy from these two addresses only. *The free OpenStreetMap server is for light use; a school at scale should set its own tile provider.*
- **Save campus map offline**: prefetches up to 320 tiles (zoom 14-18) into the `sg-tiles` service-worker cache (max 900, kept across app updates).
- **Safest route ranking**: nearest safe points are ranked by walking distance, with a penalty for crossing an active risk area or a hazard. "Follow the road" (OSRM) is opt-in per tap because it sends the position to the route service; otherwise a straight line is shown.
- **Hazards**: students report blocked road, flood, construction, dark area, dogs, crowd, accident. A hazard becomes visible to all when staff verify it, or 2 different students report the same kind within 120 m. Hazards expire; 6 reports per student per day; reporters are never shown.
- **Find a student** (security Map tab): search, give a reason, press Locate. The reason is recorded in the audit log; trail reads need a valid grant.
- **Fix**: the desk sidebar now scrolls on short screens (Places, Settings and Audit were unreachable below ~800 px tall).

Tested here: core suites (`tests/`), HTTP and browser suites, and a crawl of every student view and desk tab, with a mock tile/route server. Not tested: real OSM tiles or OSRM (no internet in the build sandbox), real phones, SMS, Paystack, push, or the Android APK build.

## v12.2: a map students use every day

- **Where to?** Search any place by name or type ("library", "hostel") and the map points the way, with distance, walking time, direction arrow, and the same risky-area and hazard warnings as for safe places.
- **Step-by-step directions** (after tapping "Show the walking road"): turn-by-turn list from the OSRM-compatible route service. Still opt-in per tap because it sends the position to that service.
- **Drop a pin**: tap anywhere on the map, then "Report a problem here" (hazard placed at the pin, not at your GPS), or "Go here".
- **Arrival detection**: within 25 m of the destination the app says "You have arrived" and vibrates.
- **Night map**: dims the street picture; the choice is remembered.
- **Place types** (hostel/house, lecture hall, library, food, market, worship, sports, transport): set in the desk Places form; each type has its own map icon.
- Tests: `v122_ui.js` style browser checks were run with a mock tile/route server (search, steps, pin hazard, arrival, night, desk type list). Real OSM/OSRM, real GPS walking and real phones remain untested.

### v12.2: Google Maps links
Google Maps can't be embedded without a paid API key, so SafeGate redirects to it with plain links (no key, no cost, opens the Google Maps app on phones): student "Open in Google Maps" (walking directions to the safest place), "See the campus in Google Maps", dropped-pin directions; desk "Open in Google Maps" and driving directions to a located student, and a Google Maps link on every selected marker (SOS, report, student, safe point, hazard, place, escort). The in-app map stays for offline use and risk-aware ranking.

### v12.3: smart destinations, trips, community places
- **Search that forgives typos** ("libary" finds Library). It searches school places, community-added places and safe points, nearest first.
- **Search the wider map** (opt-in per tap; Settings → Map → Place search service, Nominatim-compatible; empty turns it off). Sends the typed words to that service. CSP is extended to that origin only. The public Nominatim server has a usage policy (identify your app, light use); a big school should use its own.
- **Recent places, Home, and "Take me back to where I started"**, all saved on the phone only.
- **Start trip**: from a chosen destination, shows the ETA and starts a safe walk (ETA + 10 min) with the destination name, so security is alerted if the student does not arrive. A warning appears if the walk would end after dark.
- **Add a place**: students add missing places at a pin or their position. Security approves or rejects (Map tab), or two different students adding the same name within 150 m makes it public. Max 5 per student per day. Approvals are audited.
- Tests: `tests/v8_test.js` and `tests/bill_test.js` now advance the clock between emergency presses (the 10-minute repeat-press rule).

## v13: integrity watch and a front door that cannot lie
- **Integrity watch** (desk → Students): counts of clues that someone may be faking: a gate QR scanned far from campus (photographed or relayed code), a scan with no location, one phone registered for several matric numbers, a location that jumps faster than 130 km/h, impossibly exact GPS readings, an emergency cancelled within 45 seconds. Clues for a person to review, never automatic punishment. Existing protections stay: rotating gate QR, one matric locked to one phone, clock-ahead flag, no-scan flag, audit log. *A web app cannot see "mock location" settings, so GPS faking is caught only by its effects (jumps, identical readings, far-from-gate scans).*
- **No more silent offline on the wrong address**: if a student opens a link that has no SafeGate server behind it (a plain static site), a full-screen "This link is not connected to SafeGate" appears instead of an app that saves scans on the phone only. The desk says the same.
- **`deploy/termux-update.sh`**: one script for Termux: backup data, restart server, open a Cloudflare tunnel, build a Netlify front door (static files plus `/api/*` proxied to the tunnel, so the Netlify address stays the same while the tunnel address changes), publish, check `/api/health` on the live address. Tested here with stubs and a simulated Netlify; the real Cloudflare tunnel and Netlify deploy are untested.
- Netlify free plans may limit the number of deploys per month; each run of the script deploys once.

### v13.1: fixes and self-repair
- **Accessibility**: every desk and app label is now linked to its field (screen readers announce it; tapping the label focuses the field); map text is at least 11 px; unnamed selects and date fields named. Audit across all student views and all desk tabs at phone width: no sideways scrolling, no unlabeled fields.
- **Keeper** (`deploy/termux-keeper.sh`, started by `termux-update.sh`): checks the live address every minute. After 3 misses in a row it restarts the server, tunnel and Netlify front door, at most once every 20 minutes (to protect Netlify deploy limits). Log: `~/keeper.log`. Tested here by killing the server; the real tunnel and Netlify deploy are untested.
- Removed an unused "invite" handler. Data backups: one every 6 hours, last 5 kept.

## v13.2: feedback that reaches Benedict
- **Everyone can send feedback**: students (home → 💬 Feedback) and security staff (desk → Feedback). Type (love / fix / idea / broken / other), optional 1-5 stars, which part of the app, a message (10-2000 letters), optional contact, and a tick box to include name and matric (default anonymous). Location is never sent. The school's security desk cannot read it.
- **Saved first, then emailed**: `POST /api/feedback` writes the message to `data/feedback.jsonl` before anything else, then emails it to `techbenedict1@gmail.com` (change with `FEEDBACK_TO`). With no internet the phone keeps the message and sends it later, exactly once (client id). Unsent emails are retried every 5 minutes and from the operator page.
- **Email needs a Gmail App password** (Google Account → Security → 2-Step Verification → App passwords). On Termux run `bash ~/safegate-live/deploy/termux-email-setup.sh` once. Without it, messages are still saved and readable.
- **Where to read it**: your email; the operator page `/operator.html` (needs the operator key printed by `termux-update.sh`, stored in `~/.sg_operator_key`); or in Termux `bash ~/safegate-live/deploy/termux-feedback.sh`.
- **Protection**: hidden bot field, 8 messages per phone per day, 30 per connection per hour, header-injection-safe email, messages shown as plain text everywhere.
- Tests: `tests/feedback_test.js` (starts a fake mail server; 22 checks). The real Gmail connection is untested.

## v13.3: standards
- `npm test` runs every Node test (`tests/run-all.js`); `npm run test:browser` runs the Playwright suites in `tests/browser/` on a fresh server each (needs `npm i playwright`); `npm run doctor` checks files, syntax, the service-worker file list and reminds you of missing settings; `.env.example` lists every setting; `CHANGELOG.md` tracks versions; `/api/health` shows the running version.
- "Powered by ResultFlow" appears in the apps, desk, install pages, operator page and feedback emails.

## v13.4: ready for a real server
See `docs/SCALING.md` (measured capacity, setup advice) and `deploy/vps-install.sh`. Fixed a slowdown that grew with every registered student, shared the desk board between officers, and made saves adapt to database size.

## v13.5: pictures, voice notes and videos for security
Students can attach up to 6 pictures, one voice note (90 s) and one short video (20 s) to a report, or send them from the SOS screen. They are shrunk on the phone (about 100-300 KB per picture, roughly 3 KB per second of voice, 55 KB per second of video), wait in an offline queue and upload by themselves when the signal returns.
Files sit in `data/media/` (set `MEDIA_DIR` to move them). Only signed in staff can open them, through links that last 10 minutes; each opening is in the audit log. Files are deleted after the retention days set in Desk > Settings (default 30).
**Backups:** to save space the automatic backups copy the database but not the media files. On the VPS one mirror of the media folder is kept in `/var/backups/safegate-media`. On Termux copy `data/media` yourself if you need to keep evidence.
**Honest limits:** a phone-hosted Termux server stops when the phone is off or sleeps, so evidence cannot arrive then; students' phones keep it queued and send it later. For "works when my phone is off" use an always-on server (deploy/vps-install.sh).

## v13.6: founder console
Open the operator link `/op/<20 characters>` (printed by `sglinks`; no password). The old page `/operator.html` still asks for the key (the `OPERATOR_KEY` the server was started with; Termux keeps it in `~/.sg_operator_key`). Tabs: Overview, People, Safety, Evidence, Money, Feedback, Broadcast, Health, Audit & logs. Use a long password; five wrong tries lock the connection for 15 minutes.

## v13.6: Safety Brief
Desk > Analytics > **Safety Brief** makes a one-page summary for the principal or board (7 to 30 days, compared with the period before, no student names). Press Print and choose Save as PDF. It is the easiest way to show the school what SafeGate is doing for them.

## v13.7: live pulse and My safety
The desk Live board now has a live graph. Students get a private **My safety** card (streak, on-time %, safe walks, milestones). It is built only from their own scans, and the graph is estimated from gate activity.

## v13.8: ICT console
The ICT team has their own console at `/ict/<20 characters>`. The link opens it by itself: no password. The first link is created when the server first starts, printed in the update output and saved in `data/ict-link.txt` (VPS: `/var/lib/safegate/ict-link.txt`). Show it again with `node tools/ict-link.js`; make a new one (cancelling all old ones, server stopped) with `node tools/ict-link.js --new`.
Treat the link like a master key. Give each ICT person their own named link from **Access links**, and cancel it when they leave. ICT can create staff accounts, so keep the link out of group chats. ICT can read reports, emergency alerts and feedback (read only, logged) to learn what students need, and can fix accounts. ICT does not see live locations or evidence files and cannot download the whole database. Security deletes go to a 30-day Recycle bin that security and ICT can restore from.

## One-step Termux install or update
Download `safegate.zip` to your phone, open Termux and paste:

    pkg install -y unzip >/dev/null 2>&1; unzip -p "$(ls -t ~/storage/downloads/safegate*.zip | head -1)" safegate/deploy/termux-install.sh > ~/sg-install.sh && bash ~/sg-install.sh

It installs what is missing, keeps your data, puts the new version in `~/safegate-live`, restarts the server, opens the tunnel and publishes your Netlify address. Run it again for every new version.

## New Netlify account
`netlify logout; netlify login` (sign in with the new account), then `bash ~/safegate-live/deploy/termux-newsite.sh your-name`. Your new link is `https://your-name.netlify.app`.
