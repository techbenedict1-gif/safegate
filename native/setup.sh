#!/usr/bin/env bash
# Usage: ./setup.sh https://gate.yourschool.edu edu.yourschool.safegate
# Needs: Node 18+, Android Studio (for the Android build). Run it on a computer with internet.
set -e
URL="${1:?Give your SafeGate https address, e.g. https://gate.yourschool.edu}"
APPID="${2:-edu.yourschool.safegate}"
HOST="$(echo "$URL" | sed -E 's#https?://([^/]+).*#\1#')"
cd "$(dirname "$0")"
node -e "const f='capacitor.config.json',c=require('./'+f);c.server.url='$URL';c.server.allowNavigation=['$HOST'];c.appId='$APPID';require('fs').writeFileSync(f,JSON.stringify(c,null,2))"
npm install
[ -d android ] || npx cap add android
if [ -f google-services.json ]; then cp google-services.json android/app/google-services.json; else echo "!! Put google-services.json (from Firebase) in this folder, then run this script again, or phone alerts will not work."; fi
npx cap sync android
./brand.sh
echo "Done. Now: npx cap open android   (then Build > Generate Signed Bundle / APK)"
