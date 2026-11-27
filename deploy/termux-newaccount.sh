#!/data/data/com.termux/files/usr/bin/bash
# Move SafeGate to a NEW Netlify account and a NEW link. Your students, reports and settings are kept.
# The old link is simply left behind. Run:  bash ~/safegate-live/deploy/termux-newaccount.sh
LIVE="${LIVE:-$HOME/safegate-live}"
echo
echo "NEW NETLIFY ACCOUNT FOR SAFEGATE"
echo "--------------------------------"
echo "1) Make the new account at https://app.netlify.com/signup (use a different email)."
echo "2) In it: your picture (top right) > User settings > Applications > Personal access tokens > New access token."
echo "   Name it SafeGate, copy the long code it shows (you only see it once)."
echo
printf "Paste the new token here and press Enter: "; read -r T < /dev/tty
T="$(echo "$T" | tr -d '\r\n ')"
[ ${#T} -ge 20 ] || { echo "That does not look like a token. Nothing was changed."; exit 1; }
printf "Pick a name for the new link, for example mycampus-safe (letters, numbers, dashes): "; read -r N < /dev/tty
[ -n "$(echo "$N" | tr -d ' ')" ] || N="safegate-$(date +%y%m)"
printf "School name (shown to students) [Enter to keep the current one]: "; read -r S < /dev/tty
# Old account out, new account in
cp "$HOME/.sg_site_name" "$HOME/.sg_site_name.old" 2>/dev/null
rm -rf "$HOME/.config/netlify" "$HOME/.sg_netlify_blocked" "$HOME/.sg_deployed_tunnel" "$HOME/.sg_site_name" 2>/dev/null
echo -n "$T" > "$HOME/.sg_netlify_token"; chmod 600 "$HOME/.sg_netlify_token"
export NETLIFY_AUTH_TOKEN="$T"
bash "$LIVE/deploy/termux-newsite.sh" "$N" "$S"
