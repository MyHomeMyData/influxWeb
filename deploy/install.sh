#!/usr/bin/env bash
# Documented reference for installing influxWeb on the Pi. Review and run manually
# (not invoked automatically) - it creates a system user, a venv, and a systemd unit.
set -euo pipefail

INSTALL_DIR=/opt/influxweb
SERVICE_USER=influxweb

sudo useradd --system --no-create-home "$SERVICE_USER" || true
sudo mkdir -p "$INSTALL_DIR"
sudo rsync -a --exclude .venv --exclude .git ./ "$INSTALL_DIR/"
sudo python3 -m venv "$INSTALL_DIR/.venv"
sudo "$INSTALL_DIR/.venv/bin/pip" install -r "$INSTALL_DIR/requirements.txt"

echo "Now copy your real .local_data/config.env into $INSTALL_DIR/.local_data/config.env"
echo "Then: sudo chown -R $SERVICE_USER:$SERVICE_USER $INSTALL_DIR"
echo "      sudo cp deploy/influxweb.service /etc/systemd/system/"
echo "      sudo systemctl daemon-reload && sudo systemctl enable --now influxweb"
