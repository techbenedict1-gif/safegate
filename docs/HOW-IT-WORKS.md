# How people use SafeGate

## Is it web or mobile?

Both, and it is one system. SafeGate is a **web app that installs like a mobile app** (a "PWA"). Nobody has to find it in an app store.

| Who | What they open | How |
|---|---|---|
| **Student** | The student app, on their phone | Scan the poster QR or tap the school link, then "Install SafeGate" |
| **Gate guard** | The guard screen (`/desk`, guard login) on a phone, tablet or the gate computer | Bookmark or install it the same way |
| **Security officers / admin** | The desk (`/desk`) on a computer or phone | Same link, sign in with name and PIN |
| **Parent** | A private family link the student shares | Opens in any browser, nothing to install |

## The one link to share: `/get`

Give everyone the same short address: **your-school-address/get** (for example `safegate.school.edu/get`). It works on any phone:

- **Android:** one big **Install SafeGate** button.
- **iPhone:** three clear steps with the Share button.
- **Opened inside Facebook, Instagram or TikTok** (these cannot install apps): it shows **Open in Chrome** or "Open in Safari" and a Copy link button, so students don't get stuck.
- **On a computer:** a QR code to scan with the phone.
- **Anyone who doesn't want to install:** a link to use it in the browser.

Print the **Install poster** from the desk (Gate QR tab, "Install poster") for the gate, hostel notice boards and lecture halls. Students can also tap **Invite a friend** in the app, which opens WhatsApp or the phone's share sheet with the link.

## What a student actually does

1. **Day one:** scan the QR poster at the gate (or tap the link a friend or the school sends). The page opens in the browser. Fill in name, matric number, phone, emergency contact. About one minute.
2. **Install:** the first screen offers **Install SafeGate**. On Android it is one tap. On iPhone: Share, then **Add to Home Screen** (the app shows the steps). An icon appears with the other apps.
3. **Every day after:** tap the icon. It opens full screen, like any app. At the gate: tap **Scan**, point at the gate QR, done. Coming back: scan again. No internet at the gate? It saves and sends later.
4. **Phone dead or forgotten?** The ID card QR (printed from the desk) or the paper log still works. The guard scans the card.

## Does it need the internet?

Only to send and receive. The app opens and records without internet, and syncs when the signal returns.

## Does it work on every phone?

- **Android (Chrome):** everything works, including alerts and install.
- **iPhone (Safari):** everything works, but alerts only arrive **after** the app is added to the Home Screen (iOS 16.4 or later). That is Apple's rule, not ours. The app shows this to the student.
- **Old or low-end phones:** the app is small and plain on purpose, and the paper log is always the fallback.
- **Camera and location need HTTPS.** The school's server must have a proper web address with a padlock (see `DEPLOY.md`).

## "I want it in the Play Store"

Possible, later. The `native/` folder wraps the same app as a real Android/iOS app (better background location and louder emergency alerts). It is written but **not yet built and tested on a real phone**, and the stores have fees and review times. Start with the installable web app. Add the store app after the pilot shows you need it.

## How people hear about it

- A **poster at the gate** with the QR code (print from the desk, Gate QR tab).
- An **announcement from the Dean or Security**: the school tells students to use it.
- **Parents** ask their children to install it so they can get texts.
- The guards: they tell every student who walks up, for the first two weeks.
