#!/data/data/com.termux/files/usr/bin/bash
# SafeGate: back up, restart, open a tunnel and publish the stable Netlify address in front of it.
# Safe to run any time. Your data is never touched except for a backup copy.
SITE_NAME="${SITE_NAME:-$(cat "$HOME/.sg_site_name" 2>/dev/null)}"; SITE_NAME="${SITE_NAME:-safegate-live-2026}"
NETLIFY_URL="https://$SITE_NAME.netlify.app"
LIVE="${LIVE:-$HOME/safegate-live}"
PORT="${PORT:-8080}"; export PORT
OUT="${OUT:-$HOME/sg-netlify}"
say() { echo; echo "== $*"; }
# Restart-only mode: while ~/.sg_no_deploy exists, nothing is published to Netlify (no credits used).
[ -f "$HOME/.sg_no_deploy" ] && export NO_NETLIFY=1
# If the tunnel from before still answers, keep it, so the link does not change.
if [ -z "$TUNNEL_URL" ] && [ -s "$HOME/.sg_tunnel_url" ] && pgrep cloudflared >/dev/null 2>&1 && curl -fsS -m 8 "$(cat "$HOME/.sg_tunnel_url")/api/health" 2>/dev/null | grep -q '"ok":true'; then export TUNNEL_URL="$(cat "$HOME/.sg_tunnel_url")"; echo "   (the existing public link is still working, so it is kept)"; fi
termux-wake-lock 2>/dev/null
[ -s "$HOME/.sg_school" ] && export SCHOOL_NAME="$(cat "$HOME/.sg_school")"
cd "$LIVE" || { echo "Cannot find $LIVE"; exit 1; }

say "1/5 Backing up your data"
mkdir -p "$HOME/safegate-backups"
LASTB=$(ls -dt "$HOME"/safegate-backups/data-* 2>/dev/null | head -1)
if [ -d data ] && { [ -z "$LASTB" ] || [ -z "$(find "$LASTB" -maxdepth 0 -mmin -360 2>/dev/null)" ]; }; then B="$HOME/safegate-backups/data-$(date +%Y%m%d-%H%M%S)"; mkdir -p "$B"; for f in data/* data/.[!.]*; do [ -e "$f" ] && [ "$(basename "$f")" != media ] && cp -r "$f" "$B"/; done; fi
ls -dt "$HOME"/safegate-backups/data-* 2>/dev/null | tail -n +6 | xargs -r rm -rf
echo "   backups kept in ~/safegate-backups (last 5, one every 6 hours)"

say "2/5 Starting the SafeGate server"
pkill -f "node server.js" 2>/dev/null; [ -z "$TUNNEL_URL" ] && pkill cloudflared 2>/dev/null; sleep 1
# Operator key (opens the operator page where you read feedback). Created once, kept in ~/.sg_operator_key.
# The operator console opens from its own secret link (/op/ + 20 characters), so there is no password to type.
grep -Eq '^[a-z0-9]{20}$' "$HOME/.sg_operator_key" 2>/dev/null || { head -c 64 /dev/urandom | base64 | tr -dc 'a-z0-9' | head -c 20 > "$HOME/.sg_operator_key"; chmod 600 "$HOME/.sg_operator_key"; }
OPERATOR_KEY="$(cat "$HOME/.sg_operator_key")"; export OPERATOR_KEY
# Email for feedback: ~/.sg_mail is written by deploy/termux-email-setup.sh
if [ -s "$HOME/.sg_mail" ]; then set -a; . "$HOME/.sg_mail"; set +a; echo "   feedback email: ON ($SMTP_USER -> ${FEEDBACK_TO:-techbenedict1@gmail.com})"; else echo "   feedback email: OFF (run: bash ~/safegate-live/deploy/termux-email-setup.sh)"; fi
PUBLIC_URL="$NETLIFY_URL" TRUST_PROXY=1 PORT="$PORT" nohup node server.js > server.log 2>&1 &
OK=""
for i in $(seq 1 25); do curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && OK=1 && break; sleep 1; done
[ -z "$OK" ] && { echo "   SERVER DID NOT START. Last lines:"; tail -8 server.log; exit 1; }
echo "   server is running"

say "3/5 Opening the public tunnel"
if [ -n "$TUNNEL_URL" ]; then U="$TUNNEL_URL"; else
  U=""
  for TRYN in 1 2 3 4; do      # a weak network often needs more than one try
    pkill cloudflared 2>/dev/null; : > "$HOME/tunnel.log"
    nohup cloudflared tunnel --url "http://127.0.0.1:$PORT" > "$HOME/tunnel.log" 2>&1 &
    for i in $(seq 1 45); do
      U=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$HOME/tunnel.log" | grep -v '^https://api\.' | head -1)
      [ -n "$U" ] && break; grep -q "failed to request quick Tunnel" "$HOME/tunnel.log" && break; sleep 1
    done
    [ -n "$U" ] && break; echo "   tunnel try $TRYN did not work (network slow). Trying again..."; sleep 3
  done
fi
[ -z "$U" ] && { echo "   TUNNEL DID NOT START. Last lines:"; tail -8 "$HOME/tunnel.log"; exit 1; }
echo "   tunnel: $U"
echo "$U" > "$HOME/.sg_tunnel_url"

say "4/5 Building the Netlify front door"
rm -rf "$OUT"; mkdir -p "$OUT/lib"
cp -r css js "$OUT/"; cp lib/qrcode.js "$OUT/lib/"
for f in sw.js manifest.webmanifest desk.webmanifest icon.svg icon-192.png icon-512.png icon-maskable-512.png apple-touch-icon.png og-image.jpg shot-home.png shot-leave.png guardian.html operator.html ict.html; do [ -f "$f" ] && cp "$f" "$OUT/"; done
curl -fsS "http://127.0.0.1:$PORT/"      > "$OUT/index.html" || exit 1
curl -fsS "http://127.0.0.1:$PORT/desk"  > "$OUT/desk.html"  || exit 1
curl -fsS "http://127.0.0.1:$PORT/start" > "$OUT/start.html" || exit 1
curl -fsS "http://127.0.0.1:$PORT/get"   > "$OUT/get.html"   || exit 1
cat > "$OUT/_redirects" <<R
/api/*   $U/api/:splat   200!
/desk    /desk.html      200
/start   /start.html     200
/app     /start.html     200
/get     /get.html       200
/install /get.html       200
/ict/*   /ict.html       200
/op/*    /operator.html  200
/privacy /privacy.html   200
R
cat > "$OUT/_headers" <<H
/
  Cache-Control: no-cache
/*.html
  Cache-Control: no-cache
/sw.js
  Cache-Control: no-cache
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Frame-Options: DENY
H
echo "   ready: $(find "$OUT" -type f | wc -l) files"

say "5/5 Publishing to $NETLIFY_URL"
NTOKEN="${NETLIFY_AUTH_TOKEN:-$(cat "$HOME/.sg_netlify_token" 2>/dev/null)}"; NTOKEN="$(echo "$NTOKEN" | tr -d '\r\n ')"
if [ -n "$NTOKEN" ] && [ -z "$NO_NETLIFY" ]; then
  # Token mode: talks to Netlify directly (no Netlify tool, no browser login). This is the reliable way on Termux.
  SKIP_CLI=1
  napi() { curl -s --retry 3 --retry-delay 2 -m 120 -H "Authorization: Bearer $NTOKEN" "$@"; }
  ID="$SG_NETLIFY_ID"
  if [ -z "$ID" ]; then
    SITES=$(napi "${NTL_API:-https://api.netlify.com/api/v1}/sites?filter=all&per_page=100")
    ID=$(echo "$SITES" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const a=JSON.parse(s);const n=process.argv[1];const x=a.find(x=>x.name===n);console.log(x?x.id:"")}catch(e){console.log("")}})' "$SITE_NAME")
  fi
  if [ -z "$ID" ]; then
    echo "   Could not find the Netlify site '$SITE_NAME' with your token."
    echo "   Sites your token can see:"; echo "$SITES" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{JSON.parse(s).forEach(x=>console.log("     - "+x.name))}catch(e){console.log("     (none: the token may be wrong, or there is no internet)")}})'
    echo "   Create it with: bash ~/safegate-live/deploy/termux-newsite.sh $SITE_NAME \"Your School\""
    echo "   Your direct link works meanwhile: $U/"; exit 1
  fi
  echo "   Netlify site found: $SITE_NAME"
  if [ "$U" = "$(cat "$HOME/.sg_deployed_tunnel" 2>/dev/null)" ] && curl -fsS -m 15 "$NETLIFY_URL/api/health" 2>/dev/null | grep -q '"ok":true'; then
    echo "   Netlify already points at this tunnel and answers, so no new deploy is needed."
  else
    command -v zip >/dev/null 2>&1 || { echo "   installing zip..."; pkg install -y zip >/dev/null 2>&1; }
    rm -f "$HOME/sgfront.zip"; ( cd "$OUT" && zip -qr "$HOME/sgfront.zip" . )
    WHY=$(napi -X POST -H "Content-Type: application/zip" --data-binary @"$HOME/sgfront.zip" "${NTL_API:-https://api.netlify.com/api/v1}/sites/$ID/deploys")
    if echo "$WHY" | grep -q '"state"'; then echo "   Uploaded to Netlify."; rm -f "$HOME/.sg_netlify_blocked"
    else
      echo "   NETLIFY REFUSED THE UPLOAD: $(echo "$WHY" | grep -o '"message":"[^"]*"\|"error":"[^"]*"' | head -1 | cut -c1-120)"
      echo "   (A wrong token, no internet, or used-up free credits. Your direct link works meanwhile.)"
      date +%F > "$HOME/.sg_netlify_blocked"; BLOCKED=1
      pkill -f "node server.js" 2>/dev/null; sleep 1
      ( cd "$LIVE" && PUBLIC_URL="$U" TRUST_PROXY=1 PORT="$PORT" nohup node server.js > server.log 2>&1 & )
      for i in $(seq 1 25); do curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && break; sleep 1; done
    fi
  fi
  if [ -z "$BLOCKED" ]; then echo "   checking the live address..."; for i in $(seq 1 25); do curl -fsS "$NETLIFY_URL/api/health" 2>/dev/null | grep -q '"ok":true' && GOOD=1 && break; sleep 2; done
  [ -n "$GOOD" ] && { echo "$U" > "$HOME/.sg_deployed_tunnel"; echo "   live: $NETLIFY_URL"; }
  [ -z "$GOOD" ] && echo "   The Netlify address did not answer yet. Wait a minute and open it. Direct link: $U/"; fi
fi
if [ -n "$NO_NETLIFY" ]; then echo "   (skipped)"; elif [ -n "$SKIP_CLI" ]; then :; else
  command -v netlify >/dev/null 2>&1 || { echo "   installing the Netlify tool..."; npm i -g netlify-cli >/dev/null 2>&1; }
  # The site ID is looked up by name every time. A stale NETLIFY_SITE_ID or an old .netlify link is the usual cause of "Project not found", so both are ignored.
  unset NETLIFY_SITE_ID; rm -rf "$LIVE/.netlify" "$OUT/.netlify" 2>/dev/null
  ID="$SG_NETLIFY_ID"
  if [ -z "$ID" ]; then
    SITES=$(netlify api listSites --data '{"filter":"all"}' 2>/dev/null)
    ID=$(echo "$SITES" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const a=JSON.parse(s);const n=process.argv[1];const x=a.find(x=>x.name===n)||a.find(x=>(x.url||"").indexOf(n)>=0||(x.ssl_url||"").indexOf(n)>=0||(x.default_domain||"").indexOf(n)>=0);console.log(x?x.id:"")}catch(e){console.log("")}})' "$SITE_NAME")
  fi
  if [ -z "$ID" ]; then
    echo "   COULD NOT FIND THE NETLIFY SITE '$SITE_NAME' in this Netlify login."
    echo "   Sites this login can see:"; echo "$SITES" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{JSON.parse(s).forEach(x=>console.log("     - "+x.name+"  ("+x.id+")"))}catch(e){console.log("     (none, or you are not logged in)")}})'
    echo "   Fix: run  netlify logout ; netlify login  with the account that owns $SITE_NAME, then run this again."
    echo "   Your direct link works meanwhile: $U/"; exit 1
  fi
  echo "   Netlify site found: $SITE_NAME ($ID)"
  if [ "$U" = "$(cat "$HOME/.sg_deployed_tunnel" 2>/dev/null)" ] && curl -fsS -m 15 "$NETLIFY_URL/api/health" 2>/dev/null | grep -q '"ok":true'; then
    echo "   Netlify already points at this tunnel and answers, so no new deploy is needed (this saves your Netlify credits)."; SKIPDEPLOY=1; DOUT=""
  else
  DOUT=$(netlify deploy --prod --dir "$OUT" --site "$ID" 2>&1); echo "$DOUT" | tail -6
  fi
  if echo "$DOUT" | grep -qi "forbidden"; then
    # The tool hides the reason. Ask Netlify directly so you can see it in plain words.
    TOKEN=$(node -e "try{const c=require(require('os').homedir()+'/.config/netlify/config.json');console.log(Object.values(c.users||{})[0].auth.token)}catch(e){}" 2>/dev/null)
    WHY=""; if [ -n "$TOKEN" ] && command -v zip >/dev/null 2>&1; then rm -f "$HOME/sgfront.zip"; ( cd "$OUT" && zip -qr "$HOME/sgfront.zip" . ); WHY=$(curl -s -m 90 -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/zip" --data-binary @"$HOME/sgfront.zip" "https://api.netlify.com/api/v1/sites/$ID/deploys" 2>/dev/null); fi
    if echo "$WHY" | grep -q '"state"'; then echo "   Published with the direct upload instead."; rm -f "$HOME/.sg_netlify_blocked"
    else
      echo "   NETLIFY REFUSED THE UPLOAD: $(echo "$WHY" | grep -o '"error":"[^"]*"' | head -1 | cut -c10- | tr -d '"')"
      echo "   (Netlify blocks new deploys when the free credits are used up. They return next billing cycle, or add credits at app.netlify.com.)"
      date +%F > "$HOME/.sg_netlify_blocked"; BLOCKED=1
      # Share links and QR codes must use the working direct address, not the blocked one.
      pkill -f "node server.js" 2>/dev/null; sleep 1
      ( cd "$LIVE" && PUBLIC_URL="$U" TRUST_PROXY=1 PORT="$PORT" nohup node server.js > server.log 2>&1 & )
      for i in $(seq 1 25); do curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && break; sleep 1; done
      echo "   share links and QR codes now use the direct address"
    fi
  else rm -f "$HOME/.sg_netlify_blocked"; fi
  if echo "$DOUT" | grep -qi "not found"; then
    echo "   Trying again with the site name..."; DOUT=$(netlify deploy --prod --dir "$OUT" --site "$SITE_NAME" 2>&1); echo "$DOUT" | tail -6
    echo "$DOUT" | grep -qi "not found" && { echo "   Netlify still cannot find the site with this login. Run:  netlify logout ; netlify login   (use the account that owns $SITE_NAME), then run this script again."; echo "   Your direct link works meanwhile: $U/"; }
  fi
  if [ -z "$BLOCKED" ]; then echo "   checking the live address..."; for i in $(seq 1 20); do curl -fsS "$NETLIFY_URL/api/health" 2>/dev/null | grep -q '"ok":true' && GOOD=1 && break; sleep 2; done
  [ -n "$GOOD" ] && echo "$U" > "$HOME/.sg_deployed_tunnel"
  [ -z "$GOOD" ] && { echo "   The Netlify address did not answer yet. Wait a minute and open it. Direct link: $U/"; }; fi
fi

# The keeper watches the live address and repairs it by itself (see deploy/termux-keeper.sh).
if [ -z "$NO_KEEPER" ]; then pkill -f termux-keeper.sh 2>/dev/null; nohup bash "$LIVE/deploy/termux-keeper.sh" >> "$HOME/keeper.log" 2>&1 & echo "   keeper is watching (log: ~/keeper.log)"; fi
ICTTOK=""; for i in 1 2 3 4 5; do [ -s "$LIVE/data/ict-link.txt" ] && { ICTTOK="$(tr -d '\r\n ' < "$LIVE/data/ict-link.txt")"; break; }; sleep 1; done
bash "$LIVE/deploy/termux-links.sh" quiet 2>/dev/null
SHOWALL() { echo; bash "$LIVE/deploy/termux-links.sh"; }
echo
if [ -n "$BLOCKED" ]; then echo " Netlify has no credits, so the direct link below is used (it changes if Termux restarts: run sglinks to get the new ones)."; fi
echo " In the desk: Settings -> Public address -> $( [ -n "$NO_NETLIFY" ] && echo "$U" || echo "${NETLIFY_URL:-$U}" )"
echo " Keep Termux open and the phone charged and online."
SHOWALL
