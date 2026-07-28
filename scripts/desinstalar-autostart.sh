#!/usr/bin/env bash
# Remove o serviço do Fluxo do launchd (o app e seus dados ficam intactos).
set -euo pipefail

LABEL="com.fluxo.dashboard"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
rm -f "$PLIST"
echo "✅ Serviço removido. Para rodar manualmente: npm run dev"
