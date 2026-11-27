#!/usr/bin/env bash
# SafeGate on a real server (Ubuntu or Debian VPS, run as root). Gives you: HTTPS on your own domain, auto-restart,
# daily backups, a firewall, and one command to update.
#
#   First install:  sudo bash vps-install.sh safegate.myschool.edu.ng you@email.com  [path/to/safegate.zip]
#   Update later :  sudo bash vps-install.sh --update [path/to/safegate.zip]
#
# Before you start: point your domain's DNS "A" record to this server's IP address.
set -e
[ "$(id -u)" = "0" ] || { echo "Run with sudo."; exit 1; }
APP=/opt/safegate/app; DATA=/var/lib/safegate; ENVF=/etc/safegate.env
UPDATE=""; [ "$1" = "--update" ] && { UPDATE=1; shift; }
if [ -z "$UPDATE" ]; then DOMAIN="$1"; EMAIL="$2"; shift 2 || true; [ -z "$DOMAIN" ] && { echo "Usage: sudo bash vps-install.sh your.domain.com you@email.com [safegate.zip]"; exit 1; }; fi
ZIP="${1:-./safegate.zip}"; [ -f "$ZIP" ] || { echo "Cannot find $ZIP. Put safegate.zip next to this script or pass its path."; exit 1; }

put_app() {
  TMP=$(mktemp -d); unzip -oq "$ZIP" -d "$TMP"; SRC="$TMP/safegate"; [ -d "$SRC" ] || SRC="$TMP"
  mkdir -p "$APP"; rsync -a --delete --exclude data "$SRC"/ "$APP"/ 2>/dev/null || { rm -rf "$APP"/*; cp -r "$SRC"/. "$APP"/; }
  chown -R safegate:safegate /opt/safegate; rm -rf "$TMP"
}

if [ -z "$UPDATE" ]; then
  echo "== 1/6 Installing software"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y; apt-get install -y curl unzip rsync ufw ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https
  command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 18 ] || { curl -fsSL https://deb.nodesource.com/setup_22.x | bash -; apt-get install -y nodejs; }
  if ! command -v caddy >/dev/null; then
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -y; apt-get install -y caddy
  fi
  echo "== 2/6 Creating the SafeGate user and folders"
  id safegate >/dev/null 2>&1 || useradd -r -m -d /opt/safegate -s /usr/sbin/nologin safegate
  mkdir -p "$DATA"; chown safegate:safegate "$DATA"; chmod 700 "$DATA"
  put_app
  echo "== 3/6 Settings"
  if [ ! -f "$ENVF" ]; then
    KEY=$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 28)
    cat > "$ENVF" <<ENV
PORT=8080
DATA_FILE=$DATA/db.json
PUBLIC_URL=https://$DOMAIN
TRUST_PROXY=1
OPERATOR_KEY=$KEY
# Feedback email (Gmail App password): uncomment and fill, then: systemctl restart safegate
#SMTP_HOST=smtp.gmail.com
#SMTP_PORT=465
#SMTP_USER=you@gmail.com
#SMTP_PASS=
#FEEDBACK_TO=techbenedict1@gmail.com
ENV
    chmod 600 "$ENVF"
  fi
  echo "== 4/6 Starting SafeGate (restarts by itself if it ever stops, and after a reboot)"
  cat > /etc/systemd/system/safegate.service <<UNIT
[Unit]
Description=SafeGate
After=network-online.target
Wants=network-online.target
[Service]
User=safegate
WorkingDirectory=$APP
EnvironmentFile=$ENVF
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=2
LimitNOFILE=65535
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=$DATA
[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload; systemctl enable safegate >/dev/null
  echo "== 5/6 HTTPS on $DOMAIN and the firewall"
  cat > /etc/caddy/Caddyfile <<CADDY
{
  email ${EMAIL:-admin@$DOMAIN}
}
$DOMAIN {
  encode gzip
  reverse_proxy 127.0.0.1:8080
}
CADDY
  systemctl restart caddy
  ufw allow 22/tcp >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw --force enable >/dev/null
  echo "== 6/6 Daily backup copy"
  cat > /etc/cron.daily/safegate-backup <<'CRON'
#!/bin/sh
D=/var/backups/safegate/$(date +%Y%m%d); mkdir -p "$D"; rsync -a --exclude media /var/lib/safegate/ "$D"/; [ -d /var/lib/safegate/media ] && rsync -a --delete /var/lib/safegate/media/ /var/backups/safegate-media/; find /var/backups/safegate -mindepth 1 -maxdepth 1 -mtime +14 -exec rm -rf {} +
CRON
  chmod +x /etc/cron.daily/safegate-backup
else
  echo "== Updating (your data is not touched)"
  [ -d "$DATA" ] && rsync -a --exclude media "$DATA"/ "/var/backups/safegate-before-update-$(date +%Y%m%d-%H%M%S)"/ 2>/dev/null || true
  put_app
fi
systemctl restart safegate; sleep 3
. "$ENVF"
if curl -fsS "http://127.0.0.1:${PORT:-8080}/api/health" | grep -q '"ok":true'; then
  echo; echo "=============================================="
  echo " SafeGate is running."
  [ -z "$UPDATE" ] && { echo " STUDENT LINK : https://$DOMAIN/"; echo " DESK LINK    : https://$DOMAIN/desk"; echo " ICT CONSOLE  : https://$DOMAIN/ict/$(tr -d '\r\n ' < /var/lib/safegate/ict-link.txt 2>/dev/null)"; echo " OPERATOR PAGE: https://$DOMAIN/operator.html"; echo " Operator key : $OPERATOR_KEY   (also in $ENVF)"; echo " Next: open the desk link, create the administrator, then Settings -> Public address."; }
  echo "=============================================="
else
  echo "SafeGate did not start. See: journalctl -u safegate -n 40"; exit 1
fi
