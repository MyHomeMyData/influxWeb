#!/usr/bin/env bash
# Quick install: clones influxWeb into a dedicated system user's directory and
# sets it up as a systemd service. Intended to be run as root, e.g.:
#   curl -sLf https://raw.githubusercontent.com/MyHomeMyData/influxWeb/main/deploy/install.sh | sudo bash -
set -euo pipefail

INSTALL_DIR="/opt/influxweb"
REPO_URL="https://github.com/MyHomeMyData/influxWeb.git"
SERVICE_USER="influxweb"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this as root, e.g.: curl -sLf <url> | sudo bash -" >&2
  exit 1
fi

if [[ -d "$INSTALL_DIR" ]]; then
  echo "$INSTALL_DIR already exists - this looks like an existing install." >&2
  echo "Use 'influxweb-upgrade' to update it instead of re-running install.sh." >&2
  exit 1
fi

for cmd in git python3; do
  command -v "$cmd" >/dev/null || { echo "$cmd is required but not installed." >&2; exit 1; }
done

git clone "$REPO_URL" "$INSTALL_DIR"

id -u "$SERVICE_USER" >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"

sudo -u "$SERVICE_USER" python3 -m venv "$INSTALL_DIR/.venv"
sudo -u "$SERVICE_USER" "$INSTALL_DIR/.venv/bin/pip" install -r "$INSTALL_DIR/requirements.txt"
sudo -u "$SERVICE_USER" cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env"

cp "$INSTALL_DIR/deploy/influxweb.service" /etc/systemd/system/influxweb.service
systemctl daemon-reload

install -m 755 "$INSTALL_DIR/deploy/upgrade.sh" /usr/local/bin/influxweb-upgrade
install -m 755 "$INSTALL_DIR/deploy/uninstall.sh" /usr/local/bin/influxweb-uninstall

cat <<EOF

influxWeb installed into $INSTALL_DIR.

Next steps:
  1. Fill in InfluxDB access:
       sudo -u $SERVICE_USER nano $INSTALL_DIR/.env
  2. Start the service:
       sudo systemctl enable --now influxweb
  3. Open http://<this-host>:8085/ from another machine on your LAN.

To upgrade later, run: sudo influxweb-upgrade
To remove influxWeb again, run: sudo influxweb-uninstall
EOF
