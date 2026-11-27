#!/data/data/com.termux/files/usr/bin/bash
# Puts SafeGate on GitHub (private) so Render can run it 24 hours a day. Your data and keys are NOT uploaded.
# Run:  bash ~/safegate-live/deploy/termux-render.sh
LIVE="${LIVE:-$HOME/safegate-live}"
command -v git >/dev/null 2>&1 || pkg install -y git >/dev/null 2>&1
echo; echo "SAFEGATE > GITHUB > RENDER"; echo "--------------------------"
echo "You need a GitHub account (free). Make a token: GitHub > your picture > Settings > Developer settings >"
echo "Personal access tokens > Tokens (classic) > Generate new token > tick 'repo' > copy it."; echo
[ -n "$GU" ] || { printf "GitHub username: "; read -r GU < /dev/tty; }
[ -n "$GT" ] || { printf "GitHub token (paste, then Enter): "; read -r GT < /dev/tty; }
GT="$(echo "$GT" | tr -d '\r\n ')"
[ -n "$RN" ] || { printf "Repository name [safegate]: "; read -r RN < /dev/tty; }; RN="${RN:-safegate}"
[ -n "$GU" ] && [ ${#GT} -ge 20 ] || { echo "Missing username or token. Nothing was changed."; exit 1; }
W="$HOME/.sg-render"; rm -rf "$W"; mkdir -p "$W"
( cd "$LIVE" && tar --exclude=./data --exclude=./node_modules --exclude='./*.log' -cf - . ) | ( cd "$W" && tar -xf - )
[ -f "$W/render.yaml" ] || { echo "render.yaml is missing. Install the newest safegate.zip first."; exit 1; }
R=$(curl -s -m 60 -X POST -H "Authorization: token $GT" -H "Accept: application/vnd.github+json" https://api.github.com/user/repos -d "{\"name\":\"$RN\",\"private\":true}")
echo "$R" | grep -q '"full_name"' && echo "Created private repository $GU/$RN" || echo "(repository may already exist: $(echo "$R" | grep -o '"message":"[^"]*"' | head -1))"
cd "$W" && git init -q -b main && git config user.email "safegate@local" && git config user.name "SafeGate" && git add -A && git commit -qm "SafeGate" 
if git push -q -f "https://$GU:$GT@github.com/$GU/$RN.git" main >/dev/null 2>&1; then echo "Uploaded."; else echo "Upload failed. Check the username, token and repository name."; exit 1; fi
rm -rf "$W/.git"
[ -n "$PUBLIC" ] && { curl -s -m 30 -X PATCH -H "Authorization: token $GT" -H "Accept: application/vnd.github+json" "https://api.github.com/repos/$GU/$RN" -d '{"private":false}' >/dev/null && echo "Repository set to public (it holds code only: no data, no keys), so Render can read it without a GitHub link."; }
KEY="$(head -c 64 /dev/urandom | base64 | tr -dc 'a-z0-9' | head -c 20)"
IKEY="$(head -c 64 /dev/urandom | base64 | tr -dc 'a-z0-9' | head -c 20)"
BKEY="$(cat "$HOME/.sg_render_backup_key" 2>/dev/null)"; [ -n "$BKEY" ] || { BKEY="$(head -c 96 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 32)"; echo "$BKEY" > "$HOME/.sg_render_backup_key"; chmod 600 "$HOME/.sg_render_backup_key"; }
if [ "$PLAN" = "free" ]; then
  curl -s -m 60 -X POST -H "Authorization: token $GT" -H "Accept: application/vnd.github+json" https://api.github.com/user/repos -d "{\"name\":\"$RN-data\",\"private\":true}" >/dev/null
  echo "Private data-copy repository: $GU/$RN-data  (your data is saved there, encrypted, so a restart never loses it)"
fi
echo "$KEY" > "$HOME/.sg_render_operator_key"; echo "$IKEY" > "$HOME/.sg_render_ict_key"
DONE=""
if [ -n "$RENDER_API_KEY" ]; then
  echo; echo "Creating the service on Render..."
  RA() { curl -s -m 60 -H "Authorization: Bearer $RENDER_API_KEY" -H "Accept: application/json" -H "Content-Type: application/json" "$@"; }
  OWN=$(RA https://api.render.com/v1/owners | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const a=JSON.parse(s);console.log((a[0].owner||a[0]).id)}catch(e){}})')
  if [ -n "$OWN" ]; then
    BODY=$(node -e 'const [o,r,k,i,u,b,t]=process.argv.slice(1);const F=process.env.PLAN==="free";const sd={runtime:"node",plan:F?"free":"starter",healthCheckPath:"/api/health",envSpecificDetails:{buildCommand:"node -v",startCommand:F?"node deploy/render-start.js":"node server.js"}};if(!F)sd.disk={name:"safegate-data",mountPath:"/var/data",sizeGB:1};const ev=[{key:"TRUST_PROXY",value:"1"},{key:"NODE_ENV",value:"production"},{key:"OPERATOR_KEY",value:k},{key:"ICT_KEY",value:i}];if(!F)ev.push({key:"DATA_FILE",value:"/var/data/db.json"});else ev.push({key:"BACKUP_REPO",value:u+"-data"},{key:"BACKUP_KEY",value:b},{key:"BACKUP_TOKEN",value:t});console.log(JSON.stringify({type:"web_service",name:"safegate",ownerId:o,repo:"https://github.com/"+r,branch:"main",autoDeploy:"yes",serviceDetails:sd,envVars:ev}))' "$OWN" "$GU/$RN" "$KEY" "$IKEY" "$GU/$RN" "$BKEY" "$GT")
    OUT=$(RA -X POST https://api.render.com/v1/services -d "$BODY")
    URL=$(echo "$OUT" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);const x=j.service||j;console.log((x.serviceDetails&&x.serviceDetails.url)||"")}catch(e){}})')
    if [ -n "$URL" ]; then DONE=1; echo "Render accepted it. It is building now (a few minutes)."; echo "$URL" > "$HOME/.sg_render_url"
      echo; echo "=============================================="
      echo " YOUR RENDER ADDRESS (works once the build says Live):"
      echo "  STUDENTS         $URL/"; echo "  SECURITY DESK    $URL/desk"; echo "  INSTALL PAGE     $URL/get"; echo "  PARENTS          $URL/guardian.html"; echo "  PRIVACY NOTICE   $URL/privacy"
      echo "  OPERATOR (YOU)   $URL/op/$KEY"
      [ "$PLAN" = "free" ] && { echo; echo "  FREE PLAN NOTES:"; echo "   - It sleeps after 15 minutes without visitors. Keep it awake: at uptimerobot.com (free, no card) add a monitor for $URL/api/health every 5 minutes."; echo "   - Your data is saved (encrypted) in the private repo $GU/$RN-data every 2 minutes and on shutdown, and restored on start."; echo "   - Keep this key safe, it opens that copy: $BKEY"; echo "   - Photos, voice notes and videos are not kept on the free plan."; }
      echo "  ICT CONSOLE      $URL/ict/$IKEY"
      echo "=============================================="
    else echo "Render did not accept the request (a paid Render service needs a card on the account: https://dashboard.render.com/billing): $(echo "$OUT" | grep -o '"message":"[^"]*"' | head -1). Use the browser steps below."; fi
  else echo "Render did not accept the API key (it must be the real key from Render > Account Settings > API Keys, starting with rnd_). Use the browser steps below."; fi
fi
if [ -z "$DONE" ]; then
echo; echo "=============================================="
echo " NOW ON RENDER (about 3 minutes, in your browser):"
echo "  1. https://dashboard.render.com  >  New +  >  Blueprint"
echo "  2. Connect GitHub, choose  $GU/$RN,  then Apply"
echo "  3. When it asks, type exactly:   OPERATOR_KEY = $KEY    and    ICT_KEY = $IKEY"
echo "     (leave the SMTP boxes empty for now)"
echo "  4. Wait until it says Live. It must be the Starter plan: the free plan sleeps and erases data."
echo "  5. Your links, after your Render address (like https://safegate-xxxx.onrender.com):"
echo "       ICT console      /ict/$IKEY"
echo "       Operator (you)   /op/$KEY"
echo "=============================================="
fi
