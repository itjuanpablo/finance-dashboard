#!/usr/bin/env bash
# Instala o Fluxo como serviço do macOS (launchd):
# sobe sozinho no login, reinicia se cair, e fica sempre em http://127.0.0.1:3210
#
# O serviço escuta SÓ no loopback (-H 127.0.0.1). Sem isso, `next start` abre em
# 0.0.0.0 — todas as interfaces — e qualquer aparelho no mesmo wifi (de casa, do
# café, do aeroporto) abre as finanças da pessoa sem nenhuma senha: o app não tem
# login, e o PIN é bloqueio de tela, não autenticação. Para acesso remoto use
# Tailscale (ver docs/tailscale.md e a mensagem no fim deste script).
set -euo pipefail

LABEL="com.fluxo.dashboard"
PORT=3210
HOST="127.0.0.1"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs"

if [ "$(uname)" != "Darwin" ]; then
  echo "Este script é para macOS (launchd). Em Linux, use systemd ou pm2."
  exit 1
fi

NODE_BIN="$(command -v node || true)"
NPM_BIN="$(command -v npm || true)"
if [ -z "$NODE_BIN" ] || [ -z "$NPM_BIN" ]; then
  echo "node/npm não encontrados no PATH. Instale o Node.js 22+ primeiro."
  exit 1
fi

echo "→ Projeto: $PROJECT_DIR"
echo "→ Node:    $NODE_BIN ($($NODE_BIN -v))"

echo "→ Instalando dependências e gerando o build de produção…"
cd "$PROJECT_DIR"
"$NPM_BIN" install --no-audit --no-fund
"$NPM_BIN" run build

echo "→ Criando o serviço launchd…"
mkdir -p "$HOME/Library/LaunchAgents" "$LOG_DIR"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$PROJECT_DIR/node_modules/next/dist/bin/next</string>
    <string>start</string>
    <string>-H</string>
    <string>$HOST</string>
    <string>-p</string>
    <string>$PORT</string>
  </array>
  <key>WorkingDirectory</key><string>$PROJECT_DIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG_DIR/fluxo.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/fluxo.log</string>
</dict>
</plist>
EOF

# recarrega o serviço (idempotente: pode rodar quantas vezes quiser)
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"

echo "→ Aguardando o servidor subir…"
for i in $(seq 1 20); do
  if curl -s -o /dev/null "http://$HOST:$PORT"; then break; fi
  sleep 1
done

echo ""
echo "✅ Fluxo instalado como serviço."
echo "   • Sempre disponível em:  http://$HOST:$PORT"
echo "   • Sobe sozinho no login e reinicia se cair."
echo "   • Logs:                  $LOG_DIR/fluxo.log"
echo "   • Após atualizar o código: ./scripts/atualizar.sh"
echo "   • Para remover:            ./scripts/desinstalar-autostart.sh"
echo ""
echo "🔒 O serviço escuta APENAS em $HOST (loopback)."
echo "   Antes desta versão ele abria em 0.0.0.0: qualquer aparelho no mesmo wifi"
echo "   — inclusive o de um café — alcançava suas finanças sem senha nenhuma."
echo ""
echo "📱 Para abrir no celular, publique pelo Tailscale em vez de expor a porta:"
echo ""
echo "     bash scripts/publicar-tailscale.sh"
echo ""
echo "   Depois abra https://<seu-mac>.<sua-tailnet>.ts.net no celular."
echo "   Por que é melhor: a porta continua fechada para a rede local, o tráfego"
echo "   é criptografado ponto a ponto e só os SEUS aparelhos autenticados na"
echo "   tailnet chegam nele. Detalhes e limitações: docs/tailscale.md"
echo "   Para desfazer:  tailscale serve --https=443 off"
echo ""
open "http://$HOST:$PORT" || true
