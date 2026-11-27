# SafeGate against the full product vision

Honest status of each section of the vision document. "Built" means it exists in the software and has automated tests. "Partly" says what is missing. "Not built" means it is not in this version.

| # | Vision section | Status | Notes |
|---|---|---|---|
| 1 | Student safety and protection | Built | Student identity by matric number plus the phone (identity lock). SOS, reports in 15 categories, escort request, safe walk timer, notices, emergency numbers, safety tips for places. Safety education guides: only the "Know before you go" place tips. |
| 2 | Emergency SOS | Built | Hold button, GPS every 20 seconds, trusted contacts and security texted, kind (danger, medical, followed, accident), cancel with duress option, offline queue plus SMS fallback. Responder claim and status are tracked. Real SMS and push delivery are untested here, see HOW-IT-WORKS. |
| 3 | Parent dashboard | Partly | Family link (no account, 30 days), out/back updates, SOS texts, roll-call results. Parents never see location. No parent login or consent dashboard. |
| 4 | School administration | Partly | One school per server: students, staff, roles, notices, settings, reports, analytics, roster import. No school-onboarding with documents. |
| 5 | Security personnel | Built | Live board, inbox, claim/assign, duty roster, cases, escalation, shift log, audit. Evidence on reports is photos only. |
| 6 | Anonymous reporting | Built (v12) | 15 categories, reference number that works offline, status check without login, public replies only, photo with hidden details removed, location blurred to about 200 m for anonymous reports. |
| 7 | GPS and location | Built (v12) | Consent-based, only in the tracking window, per-person access needs a recorded reason, safe points, risk areas with time windows, live map. Location history is purged on a schedule. |
| 8 | AI-powered intelligence | Partly | Rule-based, explainable: report triage with reasons, duplicate detection, personal norms, concern scores, hotspot clustering with advice. No machine learning, no translation, no chat assistant. |
| 9 | Missing student and welfare | Built | Cases, welfare checks, overdue escalation, roll call, trace sheet. |
| 10 | School transport | Not built | |
| 11 | Communication | Partly | Push, in-app notices, SMS, roll call. No email. Delivery tracking for texts only. |
| 12 | Medical support | Partly | Medical SOS kind, health card with strict access, clinics as safe points. No first-aid roster. |
| 13 | Evidence and case management | Partly | Cases, notes, audit with hash chain, photo evidence. No video or audio. |
| 14 | Analytics and reports | Built | Daily report, analytics tab, hotspots (v12). |
| 15 | Security and privacy | Partly | PIN login with lockout, roles, rate limits, hash-chained audit, retention, data export and erase, NDPA-minded wording. No two-factor login, no password reset by email, no encryption at rest in the data file. |
| 16 | Accessibility and languages | Partly | Mobile first, offline, low data. English only. No text-size control yet. |
| 17 | School onboarding and verification | Not built | Each school runs its own server. |
| 18 | Super administrator | Partly | The operator console covers billing only. |
| 19 | Advanced | Partly | Digital ID card with QR, drills and headcount: built. Smartwatch, CCTV, multi-school network: not built. |

## How "escape" works (v12)
There is no live internet map. The phone draws its own map from the campus position, the safe points your school marks, and the phone's GPS (which works without data). It shows the nearest safe place, distance, walking minutes, a compass arrow, and a risk-area warning. The Directions button opens Google Maps when there is internet.
