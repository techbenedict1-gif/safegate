#!/data/data/com.termux/files/usr/bin/bash
# Shows EVERY SafeGate link, on every address, with a check of which ones work right now. Copy the line you want.
# Run any time:  sglinks      (or: bash ~/safegate-live/deploy/termux-links.sh)
LIVE="${LIVE:-$HOME/safegate-live}"; PORT="${PORT:-8080}"
SITE="$(cat "$HOME/.sg_site_name" 2>/dev/null)"; SITE="${SITE:-safegate-live-2026}"
SCHOOL="$(cat "$HOME/.sg_school" 2>/dev/null)"; SCHOOL="${SCHOOL:-your school}"
OPK="$(tr -d '\r\n ' < "$HOME/.sg_operator_key" 2>/dev/null)"
TOK="$(tr -d '\r\n ' < "$LIVE/data/ict-link.txt" 2>/dev/null)"
BK="$(cat "$LIVE/data/backup.key" 2>/dev/null)"; [ -n "$BK" ] || BK="(made the first time a backup is saved)"
DL="$HOME/storage/downloads"; [ -d "$DL" ] || DL="$HOME"
F="$DL/SafeGate-links.txt"
NET="https://$SITE.netlify.app"; TUN="$(cat "$HOME/.sg_tunnel_url" 2>/dev/null)"; LOC="http://127.0.0.1:$PORT"
LAN="$(ip -4 route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \([0-9.]*\).*/\1/p' | head -1)"; [ -n "$LAN" ] || LAN="$(ifconfig 2>/dev/null | sed -n 's/.*inet \(192\.168\.[0-9.]*\|10\.[0-9.]*\).*/\1/p' | head -1)"
up() { curl -fsS -m 8 "$1/api/health" >/dev/null 2>&1 && echo yes || echo no; }
SRV="$(up "$LOC")"
declare -a NAMES BASES STAT
add() { [ -n "$2" ] && { NAMES+=("$1"); BASES+=("$2"); STAT+=("$3"); }; }
[ -n "$TUN" ] && add "DIRECT INTERNET LINK (Cloudflare tunnel)" "$TUN" "$(up "$TUN")"
add "NETLIFY ADDRESS" "$NET" "$( [ -f "$HOME/.sg_netlify_blocked" ] && echo blocked || up "$NET")"
[ -n "$LAN" ] && add "SAME WI-FI (phones on the same network as this phone)" "http://$LAN:$PORT" "$(up "http://$LAN:$PORT")"
add "THIS PHONE ONLY" "$LOC" "$SRV"
emit() {   # $1 = base
  local B="$1"
  echo "  STUDENTS (everyone)        $B/"
  echo "  INSTALL PAGE               $B/get"
  echo "  SECURITY DESK              $B/desk"
  echo "  ICT CONSOLE (secret)       ${TOK:+$B/ict/$TOK}"
  echo "  PARENTS / GUARDIANS        $B/guardian.html"
  echo "  PRIVACY NOTICE             $B/privacy"
  echo "  OPERATOR (YOU ONLY)        $B/op/$OPK"
  echo "  OPERATOR (old, key typed)  $B/operator.html"
}
report() {
  echo "SafeGate for $SCHOOL"; echo
  echo "Server on this phone: $([ "$SRV" = yes ] && echo RUNNING || echo NOT RUNNING. Run the install command again)"
  local i w=0
  for i in "${!BASES[@]}"; do
    if [ "${STAT[$i]}" = yes ]; then
      [ $w = 0 ] && { echo; echo "######## WORKING RIGHT NOW. Use these. ########"; w=1; }
      echo; echo "[ WORKS ]  ${NAMES[$i]}"; emit "${BASES[$i]}"
    fi
  done
  [ $w = 0 ] && { echo; echo "######## NO ADDRESS ANSWERED YET. Wait a minute, then type: sglinks ########"; }
  echo; echo "######## OTHER ADDRESSES (not answering right now) ########"
  for i in "${!BASES[@]}"; do
    if [ "${STAT[$i]}" != yes ]; then
      echo; echo "[ $( [ "${STAT[$i]}" = blocked ] && echo 'BLOCKED: no Netlify credits' || echo 'NOT ANSWERING' ) ]  ${NAMES[$i]}"; emit "${BASES[$i]}"
    fi
  done
  echo; echo "######## SECRETS (developer only, never share) ########"
  echo "  Operator key   $OPK"; echo "  ICT key        $TOK"; echo "  Backup key     $BK  (keep a copy somewhere safe)"; echo "  Data folder    $LIVE/data"
  echo; echo "  Gate poster: open the ICT console, then System > Gate poster."
  echo "  The direct link changes whenever Termux restarts. Type sglinks to get the new one."
}
report > "$F" 2>/dev/null
if [ "$1" != "quiet" ]; then echo; echo "=============================================="; report; echo "=============================================="; echo " Saved to: $F  (open it in Files to copy or share)"; fi
# one-word shortcut + Termux:Widget button
grep -q "alias sglinks" "$HOME/.bashrc" 2>/dev/null || echo "alias sglinks='bash $LIVE/deploy/termux-links.sh'" >> "$HOME/.bashrc"
mkdir -p "$HOME/.shortcuts" 2>/dev/null && printf '#!/data/data/com.termux/files/usr/bin/bash\nbash %s/deploy/termux-links.sh\nread -r -p "Press Enter" _\n' "$LIVE" > "$HOME/.shortcuts/SafeGate-links" && chmod +x "$HOME/.shortcuts/SafeGate-links"

grep -q "alias sgup" "$HOME/.bashrc" 2>/dev/null || echo "alias sgup='bash $LIVE/deploy/termux-up.sh'" >> "$HOME/.bashrc"
# ---- Self-healing: SafeGate starts again by itself after the phone was off ----
grep -q "alias sgstart" "$HOME/.bashrc" 2>/dev/null || echo "alias sgstart='bash $LIVE/deploy/termux-update.sh'" >> "$HOME/.bashrc"
if ! grep -q "SafeGate auto-start" "$HOME/.bashrc" 2>/dev/null; then cat >> "$HOME/.bashrc" <<RC
# SafeGate auto-start: opening Termux brings SafeGate back if it is not running
if ! curl -fsS -m 3 http://127.0.0.1:\${PORT:-8080}/api/health >/dev/null 2>&1 && ! pgrep -f termux-update.sh >/dev/null 2>&1; then
  echo "SafeGate was not running. Starting it now (about a minute). Type sglinks after to see the links."
  ( nohup bash $LIVE/deploy/termux-update.sh >> \$HOME/sg-autostart.log 2>&1 & )
fi
RC
fi
# If the Termux:Boot app is installed, the phone starts SafeGate by itself after it is switched on
mkdir -p "$HOME/.termux/boot" 2>/dev/null && cat > "$HOME/.termux/boot/safegate.sh" <<BOOT
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock
sleep 20
bash $LIVE/deploy/termux-update.sh >> \$HOME/sg-boot.log 2>&1
BOOT
chmod +x "$HOME/.termux/boot/safegate.sh" 2>/dev/null
