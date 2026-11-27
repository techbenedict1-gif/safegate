# SafeGate phone app (Android first, iOS possible)

## The easiest way to get the Android app (no Android Studio, no computer setup)

**Route A: build it in the cloud with GitHub (recommended).**
1. Create a free GitHub account and a new private repository. Upload this whole SafeGate folder to it (on a phone: GitHub website > Add file > Upload files, or use the zip with GitHub Desktop).
2. Open the repository's **Actions** tab, pick **Build Android app**, press **Run workflow**, type your deployed https address, press the green button.
3. After about 8 minutes, open the finished run and download **safegate-apk**. Send the APK to students on WhatsApp or from a link. They tap it and install (Android asks them to allow installs from that source once).
4. Optional, for phone alerts when the app is closed: add your Firebase `google-services.json` text as a repository secret named `GOOGLE_SERVICES_JSON` before running.

**Route B: PWABuilder (no GitHub).** Go to pwabuilder.com, paste your deployed address, choose Android, download the package. This gives a plain app that opens your site. It does **not** include the screen-off location service, so Route A is better for tracking.

**Route C: your own computer** with Node 18+ and Android Studio, see "Build the Android app" below.

Until the app is installed, students can already use the web version: open your link and tap Install.

The app is a thin shell around your own SafeGate server. All rules, screens and updates stay on the server, so you never rebuild the app for a normal change. The shell adds two things a browser cannot do:

1. **Location with the screen off.** While a student is outside with sharing on (after the tracking time), a foreground service keeps sending location, with a visible "SafeGate is on" notification. It stops when they scan back in. During an emergency it runs regardless and sends every 15 seconds.
2. **Phone alerts when the app is closed**, through Firebase Cloud Messaging (FCM). Works on every Android phone with Google services.

## What you need
- A computer with **Node 18+** and **Android Studio**.
- Your SafeGate server on **HTTPS**, running (see `../DEPLOY.md`).
- A free **Firebase** project (console.firebase.google.com):
  1. Add an Android app with the same package name as `appId` (default `edu.yourschool.safegate`). Download `google-services.json` into this folder.
  2. Project settings → Service accounts → *Generate new private key*. Save that file as **`fcm.json`** beside your server's data file (`DATA_FILE` folder), or set `FCM_SERVICE_ACCOUNT=/path/to/file.json`. Restart the server. The System tab then shows native alerts as ready.

## Build the Android app
```bash
cd native
./setup.sh https://gate.yourschool.edu edu.yourschool.safegate
npx cap open android        # Android Studio: Build > Generate Signed Bundle / APK
```
Give students the APK file (install from a link or WhatsApp) or publish on Google Play.

## Play Store rules (read before publishing)
- Background location needs a **declaration form** and a short video in Play Console. Describe it truthfully: "student safety while off campus, only after the evening tracking time and only when the student turns sharing on".
- The privacy policy must say what is collected. The in-app privacy notice and `README.md` have the wording.
- Installing the APK directly (no Play Store) avoids this review.

## Android settings students must accept
- Location: **Allow all the time** (Android shows this in settings, not in the first pop-up). The app offers to open the settings page.
- Battery: set SafeGate to **Unrestricted** on phones with aggressive battery savers (Tecno, Infinix, Xiaomi, Samsung). This is the most common reason tracking stops.

## iOS
Same shell works (`npx cap add ios`), but you need a Mac, an Apple Developer account, and an APNs key uploaded to Firebase. Apple may reject apps that only wrap a website; Android is the practical route for most schools. iPhones can still use the web app with the Home Screen option and web alerts.

## Honest status
The cloud build workflow (`.github/workflows/android.yml`) and `brand.sh` (icon + permissions) were written and syntax-checked here, but the Android build itself could not be run here (no Android SDK or internet). Expect to fix a small thing on the first run, and read the build log if it fails.

This shell was written against the plugin documentation and tested with a **simulated** Capacitor bridge (location callbacks, token registration, thinning of pings). It has **not** been built or run on a real phone here. Test on 2-3 real phones, with the screen off for 30 minutes, before relying on it.
