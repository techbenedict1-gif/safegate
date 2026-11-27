#!/data/data/com.termux/files/usr/bin/bash
# Watches SafeGate. If the live address stops answering for a few checks in a row, it restarts everything
# (server, tunnel, Netlify front door) by running termux-update.sh. A cooldown stops it from redeploying too often.
LIVE="${LIVE:-$HOME/safegate-live}"
SITE_NAME="${SITE_NAME:-$(cat "$HOME/.sg_site_name" 2>/dev/null)}"; SITE_NAME="${SITE_NAME:-safegate-live-2026}"
PORT="${PORT:-8080}"
HEALTH_URL="${HEALTH_URL:-https://$SITE_NAME.netlify.app/api/health}"
INTERVAL="${INTERVAL:-60}"; FAILS="${FAILS:-3}"; COOLDOWN="${COOLDOWN:-1200}"
STAMP="$HOME/.sg_last_heal"; bad=0
log() { echo "$(date '+%F %T') $*"; }
log "keeper started: watching $HEALTH_URL every ${INTERVAL}s"
while true; do
  sleep "$INTERVAL"
  # When Netlify is blocked the direct tunnel link is the public address, so watch that one instead.
  if { [ -f "$HOME/.sg_netlify_blocked" ] || [ -f "$HOME/.sg_no_deploy" ]; } && [ -s "$HOME/.sg_tunnel_url" ]; then HEALTH_URL="$(cat "$HOME/.sg_tunnel_url")/api/health"; else HEALTH_URL="https://$SITE_NAME.netlify.app/api/health"; fi
  if curl -fsS -m 15 "$HEALTH_URL" 2>/dev/null | grep -q '"ok":true'; then bad=0; continue; fi
  bad=$((bad+1)); log "no answer ($bad/$FAILS)"
  [ "$bad" -lt "$FAILS" ] && continue
  now=$(date +%s); last=$(cat "$STAMP" 2>/dev/null || echo 0)
  if [ $((now-last)) -lt "$COOLDOWN" ]; then log "waiting for cooldown before repairing again"; continue; fi
  echo "$now" > "$STAMP"; bad=0; log "repairing"
  NO_KEEPER=1 bash "$LIVE/deploy/termux-update.sh" >> "$HOME/keeper-repair.log" 2>&1 && log "repair finished" || log "repair failed (see ~/keeper-repair.log)"
done
