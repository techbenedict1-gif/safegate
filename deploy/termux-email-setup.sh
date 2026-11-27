#!/data/data/com.termux/files/usr/bin/bash
# One-time: lets SafeGate email every feedback message to you (default techbenedict1@gmail.com) through Gmail.
# You need a Google "App password" (NOT your normal password):
#   1) Google Account -> Security -> turn on 2-Step Verification
#   2) open https://myaccount.google.com/apppasswords , create one named SafeGate, copy the 16 letters
echo "Gmail address that sends the emails (it can be the same one you read them in):"
read -r U
echo "Paste the 16-letter App password (you will not see it as you paste), then press Enter:"
read -rs PW; echo
PW=$(echo "$PW" | tr -d ' ')
[ -z "$U" ] || [ -z "$PW" ] && { echo "Nothing saved. Run this again."; exit 1; }
umask 077
cat > "$HOME/.sg_mail" <<EOF
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=$U
SMTP_PASS=$PW
FEEDBACK_TO=techbenedict1@gmail.com
EOF
echo "Saved. Sending you a test email..."
( set -a; . "$HOME/.sg_mail"; set +a; node "${LIVE:-$HOME/safegate-live}/tools/mail-test.js" )
echo "Restarting SafeGate so it takes effect..."
bash "${LIVE:-$HOME/safegate-live}/deploy/termux-update.sh"
