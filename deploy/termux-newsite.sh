#!/data/data/com.termux/files/usr/bin/bash
# Use a NEW Netlify account: creates the site under the account you are logged in with, remembers its name,
# then deploys SafeGate to it and prints the new links.
# Usage:  bash ~/safegate-live/deploy/termux-newsite.sh my-site-name "My School Name"
LIVE="${LIVE:-$HOME/safegate-live}"
rm -f "$HOME/.sg_no_deploy"   # publishing to the new site is wanted
say() { echo; echo "== $*"; }
RAW="${1:-safegate-$(date +%y%m)}"
[ -n "$2" ] && echo "$2" > "$HOME/.sg_school"
NAME=$(echo "$RAW" | tr 'A-Z' 'a-z' | tr -c 'a-z0-9\n-' '-' | sed 's/^-*//; s/-*$//' | cut -c1-40)
[ -n "$NAME" ] || NAME="safegate-$RANDOM"
NTOKEN="${NETLIFY_AUTH_TOKEN:-$(cat "$HOME/.sg_netlify_token" 2>/dev/null)}"; NTOKEN="$(echo "$NTOKEN" | tr -d '\r\n ')"
if [ -n "$NTOKEN" ]; then
  say "1/2 Creating your site with your Netlify token"
  SID=""; SNAME=""
  for TRY in $NAME $NAME-app $NAME-cun $NAME-ng $NAME-$RANDOM; do
    OUT=$(curl -s --retry 3 --retry-delay 2 -m 60 -X POST -H "Authorization: Bearer $NTOKEN" -H "Content-Type: application/json" -d "{\"name\":\"$TRY\"}" ${NTL_API:-https://api.netlify.com/api/v1}/sites)
    R=$(echo "$OUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);console.log(j.id&&j.name?j.id+" "+j.name:"")}catch(e){}})')
    [ -n "$R" ] && { SID=${R%% *}; SNAME=${R#* }; break; }
    echo "   '$TRY' is not available ($(echo "$OUT" | grep -o '"message":"[^"]*"\|"errors":{[^}]*}' | head -1 | cut -c1-90))"
    echo "$OUT" | grep -qi "unauthorized\|access token" && { echo "   Your token was not accepted. Make a new one and save it again."; exit 1; }
  done
  [ -n "$SID" ] || { echo "Could not create a site. Check the internet and the token, then run this again."; exit 1; }
  echo "   created: $SNAME"
  echo "$SNAME" > "$HOME/.sg_site_name"; rm -f "$HOME/.sg_netlify_blocked" "$HOME/.sg_deployed_tunnel"
  say "2/2 Deploying SafeGate to https://$SNAME.netlify.app"
  SG_NETLIFY_ID="$SID" SITE_NAME="$SNAME" LIVE="$LIVE" bash "$LIVE/deploy/termux-update.sh"
  exit $?
fi
command -v netlify >/dev/null 2>&1 || { echo "installing the Netlify tool..."; npm i -g netlify-cli >/dev/null 2>&1; }
say "1/3 Checking which Netlify account this phone is logged in to"
ST=$(netlify status 2>&1); echo "$ST" | grep -E "Name:|Email:|Teams:|  - " | head -5
echo "$ST" | grep -q "Email:" || { echo
  echo "Not logged in. Run:  netlify login   (open the link it shows, sign in with the NEW account, tap Authorize)"
  echo "Then run this again."; exit 1; }
say "2/3 Creating your site"
ID=""
CANDS="$NAME $NAME-app $NAME-cun $NAME-ng $NAME-$RANDOM"
for TRY in $CANDS; do
  OUT=$(netlify api createSite --data "{\"body\":{\"name\":\"$TRY\"}}" 2>&1)
  ID=$(echo "$OUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);console.log(j.id&&j.name?j.id+" "+j.name:"")}catch(e){}})')
  [ -n "$ID" ] && break
  echo "   '$TRY' is not available ($(echo "$OUT" | grep -oiE 'subdomain[^"]*|already[^"]*|Forbidden|credit[^"]*' | head -1))"
done
[ -n "$ID" ] || { echo "Could not create a site. Last answer from Netlify:"; echo "$OUT" | tail -5; exit 1; }
SID=${ID%% *}; SNAME=${ID#* }
echo "   created: $SNAME"
echo "$SNAME" > "$HOME/.sg_site_name"; rm -f "$HOME/.sg_netlify_blocked" "$HOME/.sg_deployed_tunnel"
say "3/3 Deploying SafeGate to https://$SNAME.netlify.app"
SG_NETLIFY_ID="$SID" SITE_NAME="$SNAME" LIVE="$LIVE" bash "$LIVE/deploy/termux-update.sh"
