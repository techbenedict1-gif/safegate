#!/data/data/com.termux/files/usr/bin/bash
# SafeGate one-step installer for Termux.
# Installs what is missing, puts the newest downloaded SafeGate zip in place (your data is kept),
# then restarts the server, opens the tunnel and publishes your Netlify address.
# Safe to run again and again.
LIVE="${LIVE:-$HOME/safegate-live}"
say() { echo; echo "== $*"; }
die() { echo; echo "STOPPED: $*"; exit 1; }
termux-wake-lock 2>/dev/null

say "1/5 Checking your phone is ready"
if command -v pkg >/dev/null 2>&1 && [ -z "$SKIP_PKG" ]; then
  MISSING=""
  for c in node unzip curl; do command -v "$c" >/dev/null 2>&1 || MISSING="$MISSING $c"; done
  command -v cloudflared >/dev/null 2>&1 || MISSING="$MISSING cloudflared"
  if [ -n "$MISSING" ]; then
    echo "   installing:$MISSING"
    yes | pkg update -y >/dev/null 2>&1
    for c in $MISSING; do case "$c" in node) P=nodejs;; *) P="$c";; esac; pkg install -y "$P" >/dev/null 2>&1 || echo "   (could not install $P; continuing)"; done
  fi
fi
for c in node unzip curl; do command -v "$c" >/dev/null 2>&1 || die "'$c' is missing. In Termux run: pkg install -y nodejs unzip curl"; done
command -v cloudflared >/dev/null 2>&1 || echo "   NOTE: cloudflared is not installed, so no public link can be made. Run: pkg install -y cloudflared"
echo "   node $(node -v)"

say "2/5 Finding the newest SafeGate zip"
DL="${DL:-$HOME/storage/downloads}"
if [ ! -d "$DL" ]; then command -v termux-setup-storage >/dev/null 2>&1 && termux-setup-storage; sleep 4; fi
ZIP="${ZIP:-$(ls -t "$DL"/safegate*.zip 2>/dev/null | head -1)}"
[ -n "$ZIP" ] && [ -f "$ZIP" ] || die "No safegate zip in your Downloads. Download safegate.zip again, then run this once more. (Looked in $DL)"
echo "   using $(basename "$ZIP")"
NEW="$HOME/.sg-unpack"; rm -rf "$NEW"; mkdir -p "$NEW"
unzip -oq "$ZIP" -d "$NEW" || die "The zip could not be opened. Download it again."
SRC="$NEW/safegate"; [ -f "$SRC/server.js" ] || SRC="$NEW"; [ -f "$SRC/server.js" ] || die "That zip does not look like SafeGate."
echo "   version $(grep -o '"version": *"[^"]*"' "$SRC/package.json" | head -1 | grep -o '[0-9][0-9.]*')"

say "3/5 Installing it (your students, reports and settings are kept)"
mkdir -p "$LIVE"
[ -d "$LIVE/data" ] && echo "   existing data found and kept"
cp -r "$SRC"/. "$LIVE"/ || die "Could not copy files into $LIVE"
rm -rf "$NEW" "$LIVE/undefined"
mkdir -p "$LIVE/data"; chmod +x "$LIVE"/deploy/*.sh 2>/dev/null
( cd "$LIVE" && node tools/doctor.js 2>&1 | sed 's/^/   /' | tail -9 )

say "4/5 Starting everything"
if [ -n "$SKIP_UPDATE" ]; then echo "   (skipped for testing)"; exit 0; fi
LIVE="$LIVE" bash "$LIVE/deploy/termux-update.sh"
