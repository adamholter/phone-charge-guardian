#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="${PHONE_CHARGE_GUARDIAN_NODE:-$(command -v node)}"
UNIT_DIR="$HOME/.config/systemd/user"
UNIT_PATH="$UNIT_DIR/phone-charge-guardian.service"

mkdir -p "$UNIT_DIR"

cat > "$UNIT_PATH" <<UNIT
[Unit]
Description=Phone Charge Guardian

[Service]
Type=simple
WorkingDirectory=$ROOT_DIR
ExecStart=$NODE_BIN $ROOT_DIR/src/server.js
Restart=on-failure
RestartSec=5
Environment=PHONE_CHARGE_GUARDIAN_PORT=3769

[Install]
WantedBy=default.target
UNIT

systemctl --user daemon-reload
systemctl --user enable --now phone-charge-guardian.service

echo "Installed phone-charge-guardian.service"
echo "Open http://127.0.0.1:3769"
