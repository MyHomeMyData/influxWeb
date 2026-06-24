#!/usr/bin/env bash
# Installed by install.sh as /usr/local/bin/influxweb-uninstall - stops and
# completely removes influxWeb (service, install directory incl. .env, the
# dedicated system user, and the influxweb-upgrade/influxweb-uninstall
# commands themselves), after an explicit confirmation prompt.
set -euo pipefail

INSTALL_DIR="/opt/influxweb"
SERVICE_USER="influxweb"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this as root, e.g.: sudo influxweb-uninstall" >&2
  exit 1
fi

echo "This will remove:"
echo "  - the influxweb systemd service (stopped and disabled)"
echo "  - $INSTALL_DIR, including its .env config"
echo "  - the '$SERVICE_USER' system user"
echo "  - the influxweb-upgrade / influxweb-uninstall commands"
read -rp "Type 'yes' to continue: " confirm
if [[ "$confirm" != "yes" ]]; then
  echo "Aborted, nothing was removed."
  exit 1
fi

systemctl disable --now influxweb 2>/dev/null || true
rm -f /etc/systemd/system/influxweb.service
systemctl daemon-reload

rm -rf "$INSTALL_DIR"

id -u "$SERVICE_USER" >/dev/null 2>&1 && userdel "$SERVICE_USER"

rm -f /usr/local/bin/influxweb-upgrade /usr/local/bin/influxweb-uninstall

echo "influxWeb has been uninstalled."
