#!/usr/bin/env bash
# Reconstrói o app e reinicia o serviço — rode após atualizar o código.
set -euo pipefail

LABEL="com.fluxo.dashboard"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

cd "$PROJECT_DIR"
npm install --no-audit --no-fund
npm run build
launchctl kickstart -k "gui/$(id -u)/$LABEL"
echo "✅ Fluxo atualizado e reiniciado — http://127.0.0.1:3210"

# Este script NÃO reescreve o plist: só reinicia o que já está instalado. Logo,
# quem instalou o serviço antes da correção do `-H` continua com um serviço
# escutando em 0.0.0.0 mesmo depois de atualizar o código — o buraco de rede
# sobreviveria a um `git pull`. Por isso o aviso abaixo, em vez de silêncio.
if [ -f "$PLIST" ] && ! grep -q "127.0.0.1" "$PLIST"; then
  echo ""
  echo "⚠️  ATENÇÃO: o serviço instalado escuta em TODAS as interfaces (0.0.0.0)."
  echo "   Qualquer aparelho no mesmo wifi abre suas finanças sem senha."
  echo "   Corrija reinstalando o serviço (é idempotente, não perde dado nenhum):"
  echo ""
  echo "     bash scripts/instalar-autostart.sh"
  echo ""
fi
