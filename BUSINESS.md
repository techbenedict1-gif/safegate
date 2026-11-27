# SafeGate: business plan and pricing worksheet

All naira figures here are **examples**. Get real quotes from your SMS provider and Paystack, then enter the real numbers in the Operator console (`/operator.html`). Nothing in this file is a promise of income.

## 1. The idea in one paragraph

Students use SafeGate **free**. The school gets a **free pilot**. Money comes from people who *want* a service and are used to paying for it in small amounts: **parents, who pay per text, like prepaid electricity**. Nobody pays a monthly or yearly fee. Heavy users pay more because they use more; light users pay almost nothing. Emergencies are never charged and never blocked.

This works because the **payer is not the user**. Students ignore things they have to pay for. Schools resist paying for something that looks free on paper. Parents already pay for airtime and worry about their children, and a text saying "Ben left campus for Afama, back by 6pm" is worth far more to them than ₦7.

## 2. What is free, what is metered, who pays

| Service | Who uses it | Who pays | How |
|---|---|---|---|
| QR gate, ID-card scan, records, offline sync | Student, guard | School (free pilot) | Included |
| SOS, safe-walk, escort, reports, drills | Student | Nobody. Never metered | Always works, even at zero balance |
| Emergency text to parent / emergency contact / on-call officers | Parent, staff | School reserve | Never blocked, up to the reserve and beyond |
| Parent text updates (leaves, returns, late) | Parent | **Parent** (default) or school | Prepaid wallet per parent phone |
| Verification code and welcome text | Parent | School | Small cost of acquiring a paying parent |
| Staff alert texts, escalation | Staff | School wallet | Prepaid, with a low-balance warning |

Switch "Who pays for routine parent texts" in **Settings** to *school* if a school prefers to fund it for everyone.

## 3. How the money flows in the software

- Every wallet is an integer number of **kobo**. Every change is a line in a **ledger** (download as CSV from the Operator console).
- A text is **held** when sent, **final** when the provider confirms, and **refunded automatically** if it fails or nothing is confirmed within 15 minutes. You never charge for a text that did not go.
- Duplicate events cannot charge twice (every text has a dedupe key; every top-up has a unique reference).
- The school wallet may go below zero by the **emergency reserve** for essential texts, so a flat balance can never silence an emergency.
- Top-ups go through Paystack. The server credits a wallet only after **asking Paystack to confirm the payment and checking the amount**, once per reference. A forged webhook (wrong signature) is rejected.
- Billing is **off** until you switch it on in the Operator console. While off, everything is free.

## 4. Pricing formula

    Price = Cost × (1 + Markup) ÷ (1 − Leakage)

Leakage covers failed payments, chargebacks, free verification texts and emergency texts you absorb. The Operator console has this calculator built in.

Example (not real quotes): provider cost ₦5, markup 40%, leakage 5% gives ₦7.37, round to ₦7.50. At ₦7 the margin is ₦2 per text (28.6% of price).

## 5. Unit economics (worked example, all numbers assumed)

A campus of 3,000 students. 30% of them have a parent who signs up (900 parents). Each parent gets about 8 texts a week.

| | Per month |
|---|---|
| Texts | 900 × 8 × 4 = 28,800 |
| Revenue at ₦7 | ₦201,600 |
| Provider cost at ₦5 | ₦144,000 |
| Gross margin | ₦57,600 (28.6%) |
| Minus payment fees (check Paystack's current rates) | a few percent of top-ups |

Be honest with yourself about what this shows. **Reselling texts alone is a thin-margin business.** It pays for hosting and some profit on one campus, but it will not make you rich. The big margins come from three other things:

1. **Volume**: 10 campuses is ten times this, with almost no extra work from you.
2. **Higher-margin services**: a school that wants guaranteed hosting, backups, support and training pays a negotiated annual fee. That is mostly profit. Charge it only once the school has seen the value.
3. **Sponsors**: a telecom, bank or alumni group funds "SafeGate Campus Safety Fund" credit for students. You can add sponsor money in the Operator console ("Sponsor money" box) and it appears in the ledger.

Also remember: every SMS has a real cost, so a parent who never tops up costs you ~₦5 per welcome or verification text. That is why those are limited (3 codes per hour per link, 3 phones per student).

## 6. How to make students (and parents) want it

Do not make it a game. Make it save time and remove fear.

- **No queue at the gate**: scan, walk. No pen, no register.
- **Exit-pass approval** on the phone, no hunting for an officer.
- **A lost or dead phone is covered**: the printed ID-card QR and the paper log still work, so nobody is stranded.
- **Escort and safe-walk at night**, the feature students tell each other about.
- **Parents are the pull**: they ask their child to install it so *they* get the texts.
- **The school makes the gate use SafeGate** (an instruction from the Dean of Students or Security). Adoption by choice alone will be slow; adoption by instruction plus real benefits is fast.

## 7. Winning the school

Do not ask for money first. Ask for a **pilot** (see `docs/PILOT-PROPOSAL.md`): one gate or one hostel, one term, written permission, a named contact, and agreed measures of success (time at the gate, number of unreturned students traced, response time in drills). After the pilot, the school decides about an ongoing arrangement with evidence in hand. The software already produces the numbers: Analytics, drill response times, and the ledger.

## 8. Risks you must manage

| Risk | What to do |
|---|---|
| School refuses | Start with one hostel or one department; keep the pilot free; use parent payments to cover SMS costs |
| Parents do not top up | Make the first text valuable; low-balance text tells them before it stops; keep ₦500 as the smallest button |
| SMS cost rises | Change the price in the Operator console; no code change |
| Network and DND routes block texts | Use a provider with a DND/corporate route; failed texts are refunded, never charged |
| Someone copies the software and bypasses billing | Billing is only enforceable on the server **you** run. Run the school's server yourself (or by contract) and keep `OPERATOR_KEY` secret |
| Privacy and law | See section 9 |

## 9. Consent and the law (Nigeria)

This is practical guidance, **not legal advice**. Speak to a lawyer before launch.

- Student and parent data is personal data under the **Nigeria Data Protection Act 2023**. The school is usually the data controller and you are its processor. Sign a short written agreement saying so.
- Get **written permission** from the school to collect data and to use the system for real security decisions.
- Location is shown only with the student's consent and only outside, from the tracking hour. Texts to parents never contain location. The privacy notice in Settings must say what is collected, why, and for how long; edit it to match what your school agrees.
- Parents opt in by proving their phone with a code and can stop any time by texting STOP. The student can also see and remove every phone that gets texts about them.
- Keep the operator key and the server's data file safe; they contain students' details.

## 10. Launch checklist

1. Get a real SMS provider account and quotes; set it up (`DEPLOY.md`).
2. Create a Paystack account; set `PAYSTACK_SECRET`; add the webhook URL `https://YOUR-DOMAIN/api/pay/webhook` in the Paystack dashboard.
3. Set `OPERATOR_KEY` (a long random phrase). Open `/operator.html`, enter your real cost and price, leave billing **off**.
4. Run the pilot for a few weeks with billing off, **Settings → Let parents get text updates** on, paid by the school wallet. Look at the numbers.
5. Switch billing on only when the school and parents have been told in advance.
