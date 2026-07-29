#!/usr/bin/env bash
# Gera o pacote do Fluxo para instalar em outra máquina, SEM dados pessoais.
#
# Rode no SEU Mac, de dentro da pasta do projeto:
#   bash ~/Downloads/empacotar-fluxo.sh
#
# Resultado: ~/Desktop/fluxo-<versão>.tar.gz — é isso que você leva por AirDrop.

set -euo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
VERSAO=$(node -p "require('./package.json').version" 2>/dev/null || echo "local")
DEST="$HOME/Desktop/fluxo-$VERSAO.tar.gz"

echo "→ Projeto: $(pwd)"
echo "→ Versão:  $VERSAO"
echo

# O que fica FORA e por quê:
#   data/          seu banco — é o dado financeiro inteiro
#   .env / .env.local  configuração da sua máquina
#   *.pdf *.ofx *.csv  extratos que possam estar soltos na pasta
#   node_modules/  1000× maior que o código; reinstalado com npm ci
#   .next/         build da sua máquina; gerado de novo lá
#   .git/          histórico não é necessário para usar
#   docs/          suas anotações de trabalho
tar --exclude='./node_modules' \
    --exclude='./.next' \
    --exclude='./data' \
    --exclude='./.git' \
    --exclude='./docs' \
    --exclude='./.env' \
    --exclude='./.env.local' \
    --exclude='./prototipo.html' \
    --exclude='*.pdf' --exclude='*.ofx' --exclude='*.csv' \
    --exclude='.DS_Store' \
    -czf "$DEST" .

echo "→ Auditoria do pacote (nada pessoal pode ter entrado):"
SUSPEITO=$(tar tzf "$DEST" | grep -iE 'fluxo\.db|\.pdf$|\.ofx$|\.csv$|^\./data/|^\./\.git/|\.env$|\.env\.local$' || true)
if [ -n "$SUSPEITO" ]; then
  echo "  ✗ ABORTADO — isto não deveria estar aí:"
  echo "$SUSPEITO" | sed 's/^/      /'
  rm -f "$DEST"
  exit 1
fi
echo "  ok  sem banco de dados"
echo "  ok  sem extrato (pdf/ofx/csv)"
echo "  ok  sem .env"
echo "  ok  $(tar tzf "$DEST" | grep -vc '/$') arquivos, $(du -h "$DEST" | cut -f1)"

echo
echo "✅ Pronto: $DEST"
echo "   Manda por AirDrop e segue o INSTALAR-NO-MAC-DELE.md"
