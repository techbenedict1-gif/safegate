# Changelog

## 13.12.1
- Operator console now opens from its own secret link `/op/<20 characters>` with no password. Starting SafeGate prints every link (students, install page, security desk, ICT, parents, privacy, operator) and the developer secrets; `sglinks` shows them again.

## 13.12.0
- Money: SafeGate Plus (students), SafeGate Family (parents, 60 texts a month), a school licence, and local sponsor ads on the Home screen. Operator console > Plans & ads: prices, licence, ads with views and taps, record a payment, earnings calculator. Safety stays free and ad-free; sponsors see totals only. See docs/MONETIZATION.md for prices and the rollout plan.

## 13.11.0
- Students now see their report and SOS move: sent, received, seen by security, being handled, help on the way, resolved, with a notification at each step. Security has "I am on it" and "Help is on the way" buttons.
- Gate poster (ICT > System > Gate poster): print-ready A4 poster, constant code, exact gate spot, tight distance check, fresh-location check, retire-a-leaked-poster in one tap (old poster works 14 days, flagged). Nobody is ever blocked; cheats only leave clues. Gate policy Relaxed/Balanced/Strict and an ID rule the school chooses (default: no ID needed).
- Encrypted backups (AES-256-GCM, key in data/backup.key), restore helper tools/backup-open.js, email test tools/mail-test.js and a test email sent at email setup.

## 13.10.0
- **Help requests.** When something does not work on a student's phone, Check my phone (and the "phone not recognised" screen) can send the problem to ICT with the phone's own results attached: clock, location permission, internet, records stuck waiting, battery, installed or not, app version. ICT sees the request in People, Help requests with plain likely causes ("clock is 15 minutes wrong", "sent from a phone that is not the registered one"), answers in a line, and the student sees the answer in the app with a banner on Home. The ICT check-up warns when a request has waited over a day. Limits: 3 open requests per phone, 4 per hour.
- **Share the student app.** Access shows the student app address with Copy message, Share on WhatsApp and a QR code for a gate poster, so a changed address can be re-sent in seconds.

## 13.9.0
- **ICT console redesigned** to match the student and security look: friendly Home with a greeting and summary, side menu on desktop and bottom menu on phones, cards, chips, empty states and charts.
- **ICT sees what people need.** Voices (reports and emergency alerts, read only, anonymous stays anonymous), Insights (what is reported most, response times, ratings, common words, ideas, loved features, and plain tips) and Feedback. Opening them is written to the activity log. Live locations, coordinates and photo, voice and video evidence stay with security.
- **ICT help-a-person tools.** Open any student to see their full picture and fix it: edit name, phone, hostel, level, guardian; release a phone; remove family links; mark as back on campus after a sync mistake; correct a mistyped matric number everywhere; add a student to the school list. Staff: change role, unlock, new code.
- **Security can delete data, safely.** Reports, closed emergency records, a student's location history, and (administrator only) a whole student. A reason is required and logged. Nothing is destroyed at once: items wait 30 days in the **Recycle bin** (security desk and ICT) and can be restored. An open emergency cannot be deleted. A phone re-sending a deleted item does not bring it back. Only an administrator or ICT can erase for good.

## 13.8.0
- **ICT console.** A separate console for the school's ICT team at `/ict/<20 letters and numbers>`. Opening the link opens the console straight away: no password, no login screen. Sections: Overview, Check-up, Students (release a phone, approve new phones, fix names, erase one student's location history), Staff (create accounts, new random sign-in codes, switch on/off, sign everyone out), Student list import, Backups (back up now, restore with an automatic safety copy), CSV exports, Activity log with tamper check, Notices, Messages, technical Settings, Access links, Diagnostics and a Help runbook.
- The link is the key: 103 bits of randomness, only a hash is stored, wrong guesses are rate limited, pages are never cached or indexed. Each ICT person can have their own named link; links can be replaced or cancelled, and the last working link cannot be cancelled. Every action is written to the activity log under the link's name.
- ICT cannot see live locations, evidence files, cannot download the whole database and cannot change curfew, tracking or campus settings.
- `tools/ict-link.js` shows the saved link, or with `--new` makes a fresh one (stop the server first). The Termux and VPS scripts print the ICT link.
- ResultFlow branding removed from the operator console and the server service name (the console is now called Operator console).

## 13.7.3
- `deploy/termux-newsite.sh NAME`: use a new Netlify account. Creates the site (tries other names if taken), remembers it, deploys and prints the new links.
- The update script no longer redeploys when Netlify already points at the same tunnel and answers (saves Netlify credits).

## 13.7.2
- When Netlify refuses a deploy because the account's credits are used up, the update script now says so in plain words, switches share links and QR codes to the working direct address, shows the direct link as the main link, and the keeper watches the direct link instead of the blocked Netlify one (it no longer restarts everything every 20 minutes).

## 13.7.1
- New `deploy/termux-install.sh`: one paste installs missing tools, keeps your data, installs the newest downloaded zip and starts everything.
- Fixed: an address with a broken % sequence (for example /api/media/%ZZ) made the server hang without an answer. Every request now gets a reply.
- Fixed: slow phone uploads were cut off after 5 minutes; uploads now get 15 minutes, silent connections are dropped sooner.
- Faster evidence lookups at large scale (each report keeps its own file list).
- Tests: `tests/abuse_test.js` (23 hostile-request checks). All 141 server methods were also fuzzed with 8,400 garbage requests with no crashes.

## 13.7.0
- **Live pulse** on the desk Live board: a graph that updates by itself every ~10 seconds. Students outside over 24 hours (estimated from gate activity), departures and returns every 5 minutes for the last 2 hours, today's totals, and first-response time.
- **My safety** card on the student home screen: on-time streak, on-time %, trips, safe walks, a week-at-a-glance chart, milestones and the next one. Private to the student, cached so it shows offline.
- Tests: `tests/value_test.js` (15), `tests/browser/value_ui.js`.

## 13.6.0
- **Founder console** (`/operator.html`) rebuilt for the platform owner: overview with growth and activity charts, people search and officer PIN recovery, safety statistics (response times, trouble spots, integrity watch), evidence storage and rules, billing, feedback inbox, notices to every student, server health (memory, storage, uptime, error counters), backups and full export, audit log with tamper check, and a log of recent server problems.
- Founder password: 5 wrong tries lock that connection for 15 minutes; failures are counted.
- Netlify publishing: the site is looked up by name every time and stale links are ignored (fixes "Project not found"); prints the sites it can see if it cannot find yours.

## 13.6.0
- **Safety Brief**: Desk > Analytics > Safety Brief. One printable page (save as PDF) for the principal: trips, on-time returns, emergency count and first-response time, concern reports and how fast they get a reply, unverified exits, escort requests, hotspots, an automatic "needs attention" list, each compared with the previous period. No student names.
- Closing a report now records the time.
- Tests: `tests/brief_test.js` (14), `tests/browser/brief_ui.js`.

## 13.5.1
- Automatic backups no longer copy evidence files (they would fill the disk); VPS keeps one media mirror.
- Students see "files waiting to send"; retention deletion and storage-cap tests (`tests/media_core_test.js`); desk gallery browser test.

## 13.5.0
- **Evidence from students**: up to 6 pictures, a voice note (90 s) and a short video (20 s) can be attached to a report or an SOS. Everything is shrunk on the phone first (pictures 1280 px JPEG, voice 24 kbps, video 640 px / 450 kbps), queued offline and uploaded one at a time by itself.
- Stored as plain files (`data/media/`), checked by file signature, never run as web pages. Security opens them only through 10-minute signed links; every opening is written to the audit log.
- Cost controls: per-student daily limit (default 30 MB), school storage cap (default 3 GB), automatic deletion after N days (default 30), orphan clean-up, identical retry never stored twice.
- New settings (Desk > Settings > Privacy): delete evidence after days, daily upload limit.
- Tests: `tests/media_test.js` (31 checks), `tests/browser/media_ui.js` (fake camera and microphone, offline then online, SOS).

## 13.4.0
- **Big schools**: fixed a hidden slowdown where registering gets slower with every student (20,000 students: 700/s became ~40,000/s). The desk's live board is computed once per 2 seconds for all officers. Saving waits longer between saves as the database grows. Measured numbers: `docs/SCALING.md`, `npm run loadtest`.
- **Real server**: `deploy/vps-install.sh` (HTTPS on your own domain, auto-restart, firewall, daily backups, `--update`).

## 13.3.0
- "Powered by ResultFlow" on every screen (student app, desk, sign-in, install pages, operator, emails).
- Standard project files: `npm test`, `npm run test:browser`, `npm run doctor`, `.env.example`, this changelog, version shown in `/api/health`.
- Bigger tap targets (slide dots, tick boxes).

## 13.2.0
- Feedback to the developer: saved first, emailed (SMTP), operator page, Termux reader.

## 13.1.0
- Keeper that repairs the live address; accessibility label fixes; backups every 6 hours.

## 13.0.0
- Integrity watch (fake scans/locations); clear "not connected" screen on addresses with no server; Netlify front door + Termux updater.

## 12.x
- In-app map (tiles, hazards, risk areas, safest-route ranking, Google Maps links), smart search, trips, community places.
