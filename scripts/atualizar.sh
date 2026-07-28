#!/usr/bin/env bash
# Reconstrói o app e reinicia o serviço — rode após atualizar o código.
set -euo pipefail

LABEL="com.fluxo.dashboard"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$PROJECT_DIR"
npm install --no-audit --no-fund
npm run build
launchctl kickstart -k "gui/$(id -u)/$LABEL"
echo "✅ Fluxo atualizado e reiniciado — http://localhost:3210"
