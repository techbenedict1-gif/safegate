# Privacy and compliance checklist (Nigeria)

This is practical guidance, not legal advice. Have the school's lawyer or data protection officer check it. It follows the Nigeria Data Protection Act 2023 (NDPA) as summarised by the [Future of Privacy Forum](https://fpf.org/blog/nigerias-new-data-protection-act-explained/). Rules and thresholds are set by the Nigeria Data Protection Commission ([ndpc.gov.ng](https://ndpc.gov.ng)), so check there for the latest.

## Who is responsible
The **school is the data controller**. You (the builder) are the processor. Put this in a short written agreement with the school. The school's name and a real privacy contact go in ICT > Settings, and appear on the public `/privacy` page.

## What SafeGate does for you
| Rule | What SafeGate does |
|---|---|
| Consent must be explicit. No pre-ticked boxes | Location sharing is **off until the student ticks it**. It is as easy to switch off as on |
| Proof of consent | Every consent change is saved with time and version, shown to the student (Me & privacy) and included in their data download |
| Children (under 18) need a parent or guardian | Student says "I am under 18". Location stays **off and nothing is stored** until staff record the parent's or guardian's agreement |
| Data minimisation | Location only if turned on, only in the evening outside the gate; officers must give a reason; no coordinates shown to ICT; health card only in the student's own emergency |
| Transparency | Public `/privacy` page: what, why, how long, rights, contact. Every officer look at a location is shown to the student |
| Access and portability | "Download my data" in the app |
| Erasure | "Erase my location history", and "Delete my whole account" (safety records stay but are anonymised, because schools can have a legal duty to keep incident records) |
| Retention | Location 30 days, gate records 365 days, media 30 days (all adjustable), automatic deletion. Staff deletions sit 30 days in a bin, then are gone |
| Security | Capability-link ICT access, hashed tokens, tamper-evident activity log, encrypted backups (AES-256-GCM) |
| Never sold | No ads, no data sharing, no advertising use of location |

## What the school still has to do
1. **Do a Data Protection Impact Assessment before going live.** Tracking students' location is high-risk processing. Write one page: what you collect, why, the risks, what you do about them. Keep it.
2. **Check whether it must register with the NDPC** as a "data controller of major importance" (the Commission sets the thresholds), and appoint a Data Protection Officer if so.
3. **Parent or guardian consent for under-18s.** Collect it on paper or by phone and record it in the student's profile. Do not tick it for them.
4. **Breach plan.** If personal data is lost or stolen in a way that risks students, the controller must tell the NDPC **within 72 hours** and tell the affected students without undue delay. Decide today who does that and how.
5. **Hosting abroad.** If the server or tunnel is outside Nigeria, personal data crosses a border. Record the basis and prefer a host with adequate protection. A Cloudflare tunnel carries traffic through their network; a VPS in a country you can document is cleaner.
6. **Staff training and access.** Give officer and ICT access only to people who need it, and remove it when they leave. ICT links can be revoked.
7. **Keep the privacy contact real.** Someone must answer deletion and correction requests.

## When a student changes or loses a phone
- The student's data lives **on the server**, not on the phone. A new phone sees the same account.
- **Old phone available:** Me & privacy > Move to a new phone makes a one-time code.
- **Old phone lost or broken:** the student asks security or ICT, who release the old phone after checking them. Nobody else can take over the account.
- Things stored only on a phone are lost with it: unsent drafts, anonymous report reference numbers and app settings.

## Penalties, so the stakes are clear
Under the NDPA, fines for controllers of major importance go up to the higher of 10 million naira or 2% of annual gross revenue. Other controllers face the higher of 2 million naira or 2% of revenue. Complying is cheaper.
