#!/data/data/com.termux/files/usr/bin/bash
# START-ONLY: gets SafeGate running again (server + tunnel + watcher) and prints the working links.
# It never publishes to Netlify, so no Netlify credits are used. Your data is not touched.
# Run any time:  sgup      (or: bash ~/safegate-live/deploy/termux-up.sh)
LIVE="${LIVE:-$HOME/safegate-live}"
touch "$HOME/.sg_no_deploy"      # keeps the watcher and every restart in start-only mode. To publish to Netlify again: rm ~/.sg_no_deploy
# Starts by itself after the phone restarts, if the free Termux:Boot app is installed (F-Droid).
mkdir -p "$HOME/.termux/boot" && cat > "$HOME/.termux/boot/start-safegate.sh" <<B
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock
sleep 20
bash $LIVE/deploy/termux-up.sh >> \$HOME/boot-safegate.log 2>&1
B
chmod +x "$HOME/.termux/boot/start-safegate.sh" 2>/dev/null
[ -f "$LIVE/deploy/termux-update.sh" ] || { echo "SafeGate is not installed in $LIVE. Run the install command once."; exit 1; }
NO_NETLIFY=1 bash "$LIVE/deploy/termux-update.sh"
