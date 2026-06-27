#!/bin/zsh
set -euo pipefail

PLIST="$HOME/Library/LaunchAgents/com.adamholter.phone-charge-guardian.plist"

/bin/launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
rm -f "$PLIST"

echo "Uninstalled com.adamholter.phone-charge-guardian"
