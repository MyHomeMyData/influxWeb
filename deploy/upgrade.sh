#!/usr/bin/env bash
# Installed by install.sh as /usr/local/bin/influxweb-upgrade - pulls the latest
# code, updates dependencies, refreshes the systemd unit, and restarts the service.
set -euo pipefail

INSTALL_DIR="/opt/influxweb"
SERVICE_USER="influxweb"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this as root, e.g.: sudo influxweb-upgrade" >&2
  exit 1
fi

if [[ ! -d "$INSTALL_DIR" ]]; then
  echo "$INSTALL_DIR not found - is influxWeb installed? See install.sh." >&2
  exit 1
fi

sudo -u "$SERVICE_USER" git -C "$INSTALL_DIR" pull
sudo -u "$SERVICE_USER" "$INSTALL_DIR/.venv/bin/pip" install -r "$INSTALL_DIR/requirements.txt"

cp "$INSTALL_DIR/deploy/influxweb.service" /etc/systemd/system/influxweb.service
# Re-install these helper scripts too, in case a future version changes their logic.
install -m 755 "$INSTALL_DIR/deploy/upgrade.sh" /usr/local/bin/influxweb-upgrade
install -m 755 "$INSTALL_DIR/deploy/uninstall.sh" /usr/local/bin/influxweb-uninstall

systemctl daemon-reload
systemctl restart influxweb

echo "influxWeb upgraded and restarted. Check the Changelog in README.md for anything version-specific."
