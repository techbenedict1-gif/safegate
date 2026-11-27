#!/data/data/com.termux/files/usr/bin/bash
# SafeGate FRESH START: removes every old version, all students, reports and settings, then installs the newest zip clean.
# Kept on purpose: your Gmail setup (~/.sg_mail). The old Netlify site name and login are removed so the old link is never used again.
LIVE="${LIVE:-$HOME/safegate-live}"
echo
echo "This will DELETE all SafeGate data on this phone: students, reports, scans, settings and old versions."
echo "It cannot be undone."
if [ -z "$SG_YES" ]; then
  printf "Type RESET and press Enter to continue: "; read -r A < /dev/tty
  [ "$A" = "RESET" ] || { echo "Nothing was changed."; exit 0; }
fi
pkill -f "node server.js" 2>/dev/null; pkill cloudflared 2>/dev/null; sleep 1
rm -rf "$LIVE" "$HOME/.sg-unpack" "$HOME/safegate" "$HOME/safegate-old"* "$HOME/server.log" "$HOME/tunnel.log" \
       "$HOME/.sg_site_name" "$HOME/.config/netlify" "$HOME/.sg_tunnel_url" "$HOME/.sg_deployed_tunnel" "$HOME/.sg_operator_key" 2>/dev/null
echo "Old data and versions removed."
if [ -f "$HOME/sg-install.sh" ]; then exec bash "$HOME/sg-install.sh"; fi
echo "Now install the new version: run the install command again."
