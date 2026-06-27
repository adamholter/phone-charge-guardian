#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/com.adamholter.phone-charge-guardian.plist"
LOG_DIR="$HOME/Library/Logs/phone-charge-guardian"
NODE_BIN="${PHONE_CHARGE_GUARDIAN_NODE:-/opt/homebrew/bin/node}"

mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"

/bin/launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
rm -f "$PLIST"

/usr/bin/plutil -create xml1 "$PLIST"
/usr/bin/plutil -insert Label -string com.adamholter.phone-charge-guardian "$PLIST"
/usr/bin/plutil -insert ProgramArguments -xml "<array><string>$NODE_BIN</string><string>$ROOT_DIR/src/server.js</string></array>" "$PLIST"
/usr/bin/plutil -insert WorkingDirectory -string "$ROOT_DIR" "$PLIST"
/usr/bin/plutil -insert RunAtLoad -bool YES "$PLIST"
/usr/bin/plutil -insert KeepAlive -bool NO "$PLIST"
/usr/bin/plutil -insert StandardOutPath -string "$LOG_DIR/out.log" "$PLIST"
/usr/bin/plutil -insert StandardErrorPath -string "$LOG_DIR/error.log" "$PLIST"
/usr/bin/plutil -insert EnvironmentVariables -xml "<dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string><key>PHONE_CHARGE_GUARDIAN_PORT</key><string>3769</string></dict>" "$PLIST"

/bin/launchctl bootstrap "gui/$(id -u)" "$PLIST"
/bin/launchctl kickstart -k "gui/$(id -u)/com.adamholter.phone-charge-guardian"

echo "Installed com.adamholter.phone-charge-guardian"
echo "Open http://127.0.0.1:3769"
