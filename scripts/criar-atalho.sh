#!/usr/bin/env bash
# Cria o atalho "Fluxo.command" na Área de Trabalho.
#
# Roda UMA VEZ, na máquina de quem vai usar o app. Depois disso a pessoa só dá
# dois cliques no ícone da Área de Trabalho: ele busca a última versão no
# GitHub, atualiza se houver novidade, e abre o Fluxo no navegador.
#
#   bash scripts/criar-atalho.sh
#
# POR QUE O ATALHO É CRIADO AQUI E NÃO ENVIADO PRONTO
#
# Arquivo .command que chega por AirDrop vem com a marca de quarentena do
# macOS, e o Gatekeeper bloqueia com "não foi possível abrir porque é de um
# desenvolvedor não identificado". Criado localmente, não tem quarentena e abre
# no primeiro clique — que é a diferença entre funcionar e virar suporte por
# telefone.
#
# POR QUE O ATALHO É AUTOSSUFICIENTE
#
# Ele NÃO fica dentro da pasta do app. O bash lê o script conforme executa: se o
# atualizador estivesse dentro da pasta que ele mesmo sobrescreve, a atualização
# corromperia a execução no meio. Fora da pasta, isso não acontece.
set -euo pipefail

REPO="itjuanpablo/finance-dashboard"
APP_DIR="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
ATALHO="$HOME/Desktop/Fluxo.command"

if [ ! -f "$APP_DIR/package.json" ]; then
  echo "✗ Não encontrei o Fluxo em: $APP_DIR"
  echo "  Rode assim, apontando a pasta:  bash scripts/criar-atalho.sh /caminho/da/pasta"
  exit 1
fi

echo "→ Pasta do Fluxo: $APP_DIR"
echo "→ Criando atalho: $ATALHO"

cat > "$ATALHO" <<ATALHO_FIM
#!/usr/bin/env bash
# Fluxo — atualizar e abrir. Criado por scripts/criar-atalho.sh.
# Para mudar a pasta do app, edite a linha APP_DIR abaixo.
APP_DIR="$APP_DIR"
REPO="$REPO"
ATALHO_FIM

# O corpo do atualizador é anexado ao atalho. Aspas simples no delimitador:
# nada aqui pode ser expandido agora — tem de ser expandido na hora do clique.
cat >> "$ATALHO" <<'ATALHO_FIM'
PORTA=3210

cd "$APP_DIR" 2>/dev/null || { echo "✗ Pasta do Fluxo não encontrada: $APP_DIR"; read -n1 -p "Enter para fechar"; exit 1; }
clear
echo "──────────────────────────────────────────────"
echo "  Fluxo — finanças pessoais"
echo "──────────────────────────────────────────────"
echo

pausar() { echo; read -n 1 -s -r -p "Aperte qualquer tecla para fechar esta janela."; echo; }

# ── Node instalado? ──────────────────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
  echo "✗ O Node.js não está instalado nesta máquina."
  echo "  Baixe a versão LTS em https://nodejs.org (arquivo .pkg),"
  echo "  instale, feche esta janela e clique no Fluxo de novo."
  pausar; exit 1
fi

LOCAL=$(node -p "require('./package.json').version" 2>/dev/null || echo "0.0.0")
echo "  Versão instalada: v$LOCAL"

# ── Tem versão nova no GitHub? ───────────────────────────────────────────────
echo "  Procurando atualização…"
INFO=$(curl -fsSL --max-time 20 "https://api.github.com/repos/$REPO/releases/latest" 2>/dev/null || true)

if [ -z "$INFO" ]; then
  echo "  (sem internet ou GitHub fora do ar — vou abrir a versão que já está aqui)"
  REMOTA=""
else
  REMOTA=$(echo "$INFO" | sed -n 's/.*"tag_name": *"v\{0,1\}\([^"]*\)".*/\1/p' | head -1)
fi

atualizar() {
  local versao="$1"
  local tmp; tmp=$(mktemp -d)
  echo
  echo "  ⬇ Baixando a v$versao…"
  if ! curl -fsSL --max-time 120 \
       "https://api.github.com/repos/$REPO/tarball/v$versao" -o "$tmp/fluxo.tar.gz"; then
    echo "  ✗ Não consegui baixar. Vou abrir a versão atual."
    rm -rf "$tmp"; return 1
  fi

  # Cópia do banco ANTES de mexer em qualquer coisa. A atualização não toca em
  # data/ (não vem no pacote), mas cópia antes de mudar código é barata e a
  # alternativa é irreversível.
  if [ -f "$APP_DIR/data/fluxo.db" ]; then
    mkdir -p "$APP_DIR/data/backups"
    cp "$APP_DIR/data/fluxo.db" "$APP_DIR/data/backups/fluxo-pre-update-$(date +%Y%m%d%H%M%S).db"
    echo "  ✓ Cópia de segurança dos seus dados feita"
  fi

  mkdir -p "$tmp/novo"
  tar xzf "$tmp/fluxo.tar.gz" -C "$tmp/novo"

  # ACHA a pasta que contém o package.json em vez de PRESUMIR o nível.
  #
  # O pacote do GitHub vem dentro de uma pasta com hash no nome
  # (itjuanpablo-finance-dashboard-a1b2c3d/), e o caminho óbvio seria
  # `--strip-components=1`. Só que, se o número de níveis mudar, o conteúdo é
  # despejado numa subpasta, nada é atualizado — e o script diria "pronto" do
  # mesmo jeito. Atualização que finge ter funcionado é pior que erro.
  local raiz
  raiz=$(dirname "$(find "$tmp/novo" -maxdepth 3 -name package.json -not -path '*/node_modules/*' | head -1)")
  if [ ! -f "$raiz/package.json" ]; then
    echo "  ✗ O pacote baixado veio com formato inesperado. Nada foi alterado."
    rm -rf "$tmp"; return 1
  fi

  # Copia por cima. data/ e .env.local não estão no pacote (ficam de fora pelo
  # .gitignore), então não há como a atualização apagar dado nem configuração.
  (cd "$raiz" && tar cf - .) | (cd "$APP_DIR" && tar xf -)
  rm -rf "$tmp"

  # Confere que a versão MUDOU de verdade. Sem isto, um pacote antigo ou uma
  # cópia que falhou pela metade passariam por atualização bem-sucedida.
  local agora
  agora=$(node -p "require('$APP_DIR/package.json').version" 2>/dev/null || echo "?")
  if [ "$agora" != "$versao" ]; then
    echo "  ✗ A atualização não completou (esperava v$versao, está em v$agora)."
    echo "    Seus dados estão intactos. Avise o Juan Pablo."
    return 1
  fi

  echo "  ⚙ Instalando o que mudou…"
  npm ci --no-audit --no-fund --silent 2>/dev/null || npm install --no-audit --no-fund --silent
  echo "  ✓ Atualizado para a v$versao"
  return 0
}

if [ -n "$REMOTA" ] && [ "$REMOTA" != "$LOCAL" ]; then
  echo "  ✨ Existe uma versão nova: v$REMOTA"
  atualizar "$REMOTA" || true
  LOCAL=$(node -p "require('./package.json').version" 2>/dev/null || echo "$LOCAL")
elif [ -n "$REMOTA" ]; then
  echo "  ✓ Você já está na última versão"
fi

# ── Abrir ────────────────────────────────────────────────────────────────────
echo
if curl -s -o /dev/null --max-time 2 "http://localhost:$PORTA"; then
  echo "  O Fluxo já está rodando. Abrindo no navegador…"
  open "http://localhost:$PORTA"
  echo "  Pronto. Pode fechar esta janela."
  pausar; exit 0
fi

# O build demora (30s a 2 min na primeira vez). Sem avisar, a pessoa acha que
# travou e fecha a janela no meio — que é o pior momento possível.
echo "  ⏳ Preparando o app… isto demora até 2 minutos na primeira vez."
echo "     Não feche esta janela."
if ! npm run build >/tmp/fluxo-build.log 2>&1; then
  echo
  echo "  ✗ Não consegui preparar o app."
  echo "    O detalhe está em /tmp/fluxo-build.log — mande esse arquivo para o Juan Pablo."
  pausar; exit 1
fi

echo
echo "  ▶ Fluxo aberto em http://localhost:$PORTA"
echo
echo "  IMPORTANTE: deixe esta janela ABERTA enquanto usar o app."
echo "  Fechar aqui desliga o Fluxo."
echo
(sleep 4 && open "http://localhost:$PORTA") &
npx next start -p "$PORTA" -H 127.0.0.1
ATALHO_FIM

chmod +x "$ATALHO"

echo
echo "✅ Pronto!"
echo
echo "   Na Área de Trabalho apareceu o ícone  Fluxo"
echo "   Dois cliques nele: ele se atualiza sozinho e abre o app."
echo
