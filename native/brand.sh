#!/usr/bin/env bash
# Puts the SafeGate icon on the Android app and adds the permissions it needs. Safe to run twice.
set -e
cd "$(dirname "$0")"
RES=android/app/src/main/res; MAN=android/app/src/main/AndroidManifest.xml
[ -d "$RES" ] || { echo "run after 'cap add android'"; exit 0; }
if command -v convert >/dev/null 2>&1 && [ -f ../icon-512.png ]; then
  rm -rf "$RES"/mipmap-anydpi-v26
  for d in mdpi:48 hdpi:72 xhdpi:96 xxhdpi:144 xxxhdpi:192; do
    n=${d%%:*}; s=${d##*:}; mkdir -p "$RES/mipmap-$n"
    for f in ic_launcher ic_launcher_round ic_launcher_foreground; do convert ../icon-512.png -resize ${s}x${s} "$RES/mipmap-$n/$f.png"; done
  done
  echo "icon applied"
else echo "ImageMagick not found: keeping the default icon"; fi
if [ -f "$MAN" ]; then
  for p in ACCESS_COARSE_LOCATION ACCESS_FINE_LOCATION ACCESS_BACKGROUND_LOCATION FOREGROUND_SERVICE FOREGROUND_SERVICE_LOCATION POST_NOTIFICATIONS CAMERA VIBRATE; do
    grep -q "android.permission.$p\"" "$MAN" || sed -i "s#</manifest>#    <uses-permission android:name=\"android.permission.$p\" />\n</manifest>#" "$MAN"
  done
  grep -q 'android.hardware.camera' "$MAN" || sed -i 's#</manifest>#    <uses-feature android:name="android.hardware.camera" android:required="false" />\n</manifest>#' "$MAN"
  echo "permissions added"
fi
