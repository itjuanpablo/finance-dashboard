#!/usr/bin/env bash
# Instalação do Fluxo numa máquina nova (macOS ou Linux).
#
#   git clone <repo> ~/Fluxo && cd ~/Fluxo && bash scripts/instalar.sh
#
# O que faz: confere o Node, instala as dependências travadas no lock, cria o
# .env.local se não existir, roda a suíte de testes e sobe o app. Não instala
# nada fora da pasta do projeto e não toca em banco existente.
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "→ Projeto: $(pwd)"
echo

# ── 1. Node ──────────────────────────────────────────────────────────────────
# O app usa o SQLite embutido do Node (node:sqlite), disponível a partir da
# 22.13. É isso que dispensa instalar banco de dados e compilar módulo nativo —
# e é a única exigência real de versão.
if ! command -v node >/dev/null 2>&1; then
  echo "✗ Node.js não encontrado."
  echo "  Instale a versão LTS em https://nodejs.org e rode este script de novo."
  echo "  (No macOS, prefira o instalador .pkg — mais simples que Homebrew.)"
  exit 1
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
NODE_MINOR=$(node -p "process.versions.node.split('.')[1]")
if [ "$NODE_MAJOR" -lt 22 ] || { [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -lt 13 ]; }; then
  echo "✗ Node $(node -v) é antigo. O Fluxo precisa de 22.13 ou superior"
  echo "  (usa o SQLite embutido, que só existe a partir dessa versão)."
  echo "  Atualize em https://nodejs.org — e ABRA UM TERMINAL NOVO depois,"
  echo "  senão o PATH continua apontando para o Node velho."
  exit 1
fi
echo "✓ Node $(node -v)"

# ── 2. Dependências ──────────────────────────────────────────────────────────
# `npm ci`, não `npm install`: instala exatamente as versões do
# package-lock.json. O `install` resolveria os ranges de novo e poderia trazer
# uma versão diferente da testada — bug que só aparece nesta máquina.
if [ -f package-lock.json ]; then
  echo "→ Instalando dependências (npm ci)…"
  npm ci --no-audit --no-fund
else
  echo "→ package-lock.json ausente; usando npm install"
  npm install --no-audit --no-fund
fi

# ── 3. Idioma inicial ────────────────────────────────────────────────────────
# O padrão é NÃO escrever nada: sem .env.local, o app segue o idioma do
# navegador na primeira abertura e a pessoa nem precisa saber que existe uma
# configuração. Fixar aqui só faz sentido para quem quer o idioma travado
# independentemente de quem abre — porque `.env` vence a detecção.
#
# Um .env.local que já exista nunca é sobrescrito.
if [ ! -f .env.local ]; then
  echo
  echo "Idioma (dá para trocar a qualquer momento na tela, no botão 🌐):"
  echo "  1) Detectar pelo navegador   — recomendado"
  echo "  2) Sempre português (Brasil)"
  echo "  3) Siempre español (Argentina)"
  printf "Escolha [1]: "
  read -r ESCOLHA || ESCOLHA=1
  case "${ESCOLHA:-1}" in
    2) printf 'NEXT_PUBLIC_FLUXO_LOCALE=pt-BR\n' > .env.local
       echo "✓ idioma fixado em português" ;;
    3) printf 'NEXT_PUBLIC_FLUXO_LOCALE=es-AR\n' > .env.local
       echo "✓ idioma fixado em espanhol" ;;
    *) echo "✓ o app vai abrir no idioma do navegador" ;;
  esac
fi

# ── 4. Testes ────────────────────────────────────────────────────────────────
# Rodar a suíte na instalação não é zelo excessivo: pega Node incompatível,
# dependência que veio quebrada e arquivo corrompido no clone — tudo ANTES de a
# pessoa importar o primeiro extrato e desconfiar do resultado.
#
# O pacote de release não traz os testes (ver .gitattributes → export-ignore),
# então esta etapa só roda em quem clonou o repositório. Quando não há teste, o
# script DIZ que não conferiu, em vez de imprimir um silêncio que passa por
# aprovação.
echo
echo "→ Conferindo a instalação…"
FALHOU=0
RODOU=0
for T in testar-parsers testar-importacao testar-api-categorias testar-idioma verificar-i18n; do
  if [ -f "scripts/$T.mjs" ]; then
    RODOU=1
    if node "scripts/$T.mjs" >/tmp/fluxo-$T.log 2>&1; then
      printf "  ✓ %s\n" "$T"
    else
      printf "  ✗ %s — veja /tmp/fluxo-%s.log\n" "$T" "$T"
      FALHOU=1
    fi
  fi
done
if [ "$RODOU" = "0" ]; then
  echo "  · pacote de instalação (sem a suíte de testes) — nada a conferir aqui."
  echo "    O build acima é a garantia: se o código viesse corrompido, ele falharia."
fi
if [ "$FALHOU" = "1" ]; then
  echo
  echo "✗ Algum teste falhou. NÃO importe seus extratos ainda —"
  echo "  um app de finanças que não passa nos próprios testes pode mostrar"
  echo "  número errado sem avisar. Mande o log para quem mantém o projeto."
  exit 1
fi

# ── 5. Pronto ────────────────────────────────────────────────────────────────
cat <<'FIM'

✅ Instalado.

  Rodar agora:            npm run dev        → http://localhost:3000
  Rodar sempre (macOS):   bash scripts/instalar-autostart.sh
                          → http://localhost:3210, sobe no login

  Atualizar depois:       git pull && bash scripts/atualizar.sh

Seus dados ficam em data/fluxo.db, só nesta máquina. Backup é copiar esse
arquivo. O app faz cópias automáticas em data/backups/ a cada importação.

FIM
