#!/usr/bin/env bash
set -euo pipefail

systemctl --user disable --now phone-charge-guardian.service >/dev/null 2>&1 || true
rm -f "$HOME/.config/systemd/user/phone-charge-guardian.service"
systemctl --user daemon-reload >/dev/null 2>&1 || true

echo "Uninstalled phone-charge-guardian.service"
