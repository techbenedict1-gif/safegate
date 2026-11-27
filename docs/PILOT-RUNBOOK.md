# Pilot runbook: your first four weeks

Follow this in order. Do not skip the first week; most failures come from setup, not code.

## Before day 1 (about 2 hours)

1. Put SafeGate on a real server with HTTPS (`DEPLOY.md`). Phones need HTTPS for camera and location.
2. Open `/desk`, create the admin account and school name. Write down the PIN somewhere safe.
3. Settings: set the security phone number, the tracking hour (5:30 PM), and **turn on "Require students to be on the school list"** once you have the roster. Upload the roster under Students.
4. Add one officer account per person on shift, and one guard account per gate. Guards only see what they need at the gate.
5. Open **System** and check every line is green. Take a backup.
6. Print the gate QR poster and the paper log. The paper log stays, always.
7. Run a **drill** (Live tab). Time how long staff take to respond. Do this before any student uses it.

## Week 1: staff only (3 to 5 people)

- Staff use it for real, including walking in and out with the QR code.
- Fix wording and anything confusing. Keep a list of every question people ask; those are your help pages.
- Test the three emergencies: SOS, safe-walk that does not end, and a roll call.

## Week 2: one hostel or one gate

- Announce it with the Dean's written approval. Tell students what is collected and why (the privacy text in Settings), and that location is **only on if they turn it on**.
- Stand at the gate for the first three evenings. Help every student install it (the Me page shows their ID code and a printable ID card QR for people with a dead phone).
- Check the **Analytics** tab daily: how many scans, how many on paper, how many late returns.

## Week 3: add parents

- Turn on **Let parents get text updates** only after you have a real SMS provider and a successful test text. Keep the starter texts at 10.
- Billing stays **off** until the school agrees. Leave the Operator console alone until week 4.
- Watch the SMS log (System tab) for failed texts.

## Week 4: measure and report

Collect, from the app itself:

- Number of students registered, scans per day, paper entries per day.
- Late returns and how long each took to resolve (Analytics).
- Drill response times.
- Student and guard feedback: five questions, on paper.

Then use `docs/PILOT-PROPOSAL.md` section 6 to report to the school. Decide with the school: continue, change, or stop.

## Rules that keep it safe

- Never share the admin PIN. Never use one officer account for two people.
- Location trail needs a written reason every time. The audit log records it. Review it weekly.
- A duress alert is silent on purpose. Do not call the student openly. Send two officers; one to the last location, one to the emergency contact in person.
- Back up before every change. Restore a backup once in the pilot so you know it works.
- If the server is down, use paper. Nothing about SafeGate should stop the gate.

## When something goes wrong

| Problem | First thing to check |
|---|---|
| Phone says offline | Normal. It saves and syncs later. Check the queue count on the home screen |
| Students can't scan | Is the poster current? Open `/desk`, Gate QR tab, reprint |
| Texts not arriving | System tab, SMS log, status column. Check provider balance |
| A student lost their phone | Students tab, open the student, reissue the ID card, print it |
| Student registered on the wrong phone | Transfers inbox: approve a transfer, or ask for the student's transfer code |
