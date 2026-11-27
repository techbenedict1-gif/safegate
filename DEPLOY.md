# Putting SafeGate online (HTTPS is required for camera, location, offline and phone alerts)

## Option A: Docker + automatic HTTPS (recommended)
1. Rent any small server (1 GB RAM is plenty) and point a domain such as `gate.yourschool.edu` at it.
2. Install Docker, copy this folder to the server.
3. `DOMAIN=gate.yourschool.edu docker compose up -d`
4. Open `https://gate.yourschool.edu/desk` and create the desk. In Settings set the **Public address** to the same https address.

## Option B: plain Linux with systemd
1. Install Node 18+. Copy this folder to `/opt/safegate`. Create user: `sudo useradd -r safegate`.
2. Copy `deploy/safegate.service` to `/etc/systemd/system/`, edit `PUSH_SUBJECT`, then `sudo systemctl enable --now safegate`.
3. Put any HTTPS reverse proxy in front (Caddy: see `deploy/Caddyfile`, or Nginx + certbot) pointing at port 8080.

## Option C: quick test from a PC at school
`node server.js` then `cloudflared tunnel --url http://localhost:8080` for a temporary https address.

## Things to know
- **Data** lives in one file (`DATA_FILE`). **Backups** are copied automatically every 6 hours into the `backups` folder beside it (newest 30 kept). Settings: `BACKUP_HOURS`, `BACKUP_KEEP`, `BACKUP_DIR`. Copy that folder off the server now and then (another disk or cloud storage), because a backup on the same disk does not survive a dead disk.
- **Phone alerts** use keys in `vapid.json` next to the data file. Keep that file: if it is lost, every phone must switch alerts on again.
- Behind a proxy (Caddy/Nginx) set `TRUST_PROXY=1` so rate limits use the real visitor address. The Docker and systemd files already do. Without a proxy leave it unset, otherwise visitors could fake their address.
- Check **System** in the desk after setup: it lists anything not configured yet.
- Restore: Settings → Restore backup (admin), or stop the server and replace the data file with a copy from `backups`.

## Text messages (SMS)
SafeGate texts officers on call when a student presses the emergency button, texts again when an alert is not answered, and can text the student's emergency contact. It never needs a text provider to run: without one, everything else still works.

1. Choose a provider and create an account: **Termii** (Nigeria, register a sender ID; use the `dnd` channel so messages reach numbers on Do-Not-Disturb), **Africa's Talking**, **Twilio**, or **webhook** (your own gateway or a spare Android phone running an SMS-gateway app).
2. Give the server the keys, either as environment variables or in `sms.json` beside the data file:
   ```json
   { "provider": "termii", "apiKey": "...", "sender": "SafeGate", "channel": "dnd" }
   ```
   Africa's Talking: `{ "provider": "africastalking", "apiKey": "...", "username": "...", "sender": "" }`
   Twilio: `{ "provider": "twilio", "sid": "AC...", "token": "...", "sender": "+1..." }` (or a `MG...` messaging-service id)
   Webhook: `{ "provider": "webhook", "url": "https://...", "apiKey": "optional bearer" }` (receives `{to, text}`)
3. Restart. In the desk: Settings → switch on **Send text messages**, add officers' phone numbers (Settings → Officers → Edit) and let each officer press **My duty → I am on call**.
4. Check **System → Text messages**: it shows the provider status, who would be texted, the last texts, and a **test text** button.

**Texting in when there is no internet.** A student with no data can text `SAFEGATE SOS` (the app prefills it, with matric number and location) to your security number. Set your provider's *incoming message* webhook to `https://YOUR-ADDRESS/api/sms-in?key=SECRET` (the exact link is shown on the System tab). The server then raises a normal emergency alert for that student. Requires a provider number that can receive SMS (Twilio, Africa's Talking shortcode/long number, or a webhook gateway).

Costs: each text is billed by your provider. `Most texts per day` in Settings caps routine texts; emergencies are never blocked.

## Phone app (Android) and its alerts
See `native/README-NATIVE.md`. Put the Firebase service-account file beside the data file as `fcm.json`.


## Your link (important)

Set `PUBLIC_URL=https://your-real-address` (and `TRUST_PROXY=1` behind a proxy/host like Render, Railway or Nginx). This makes the WhatsApp/Facebook preview picture and the QR in story images point at your real link. Then post the link in a WhatsApp group and check the card appears.


## Render (always on, no phone needed)
Run `bash ~/safegate-live/deploy/termux-render.sh` in Termux: it uploads SafeGate (never your data or keys) to a private GitHub repo and tells you the Render steps. `render.yaml` sets up a **Starter** web service with a 1 GB disk at `/var/data`. The free plan is not safe for SafeGate: it sleeps after 15 minutes and loses its files on every restart. Your ICT and operator paths are printed in the Render log as `[owner]` lines.
