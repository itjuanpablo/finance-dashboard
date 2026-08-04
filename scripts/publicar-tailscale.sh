#!/usr/bin/env bash
# Publica o Fluxo na sua tailnet, para abrir no celular.
#
#   bash scripts/publicar-tailscale.sh
#
# ─── Por que este script existe ──────────────────────────────────────────────
# O Fluxo escuta SÓ em 127.0.0.1 (ver scripts/instalar-autostart.sh). Loopback
# não sai da máquina: o pacote do celular chega no Mac pela interface 100.x e
# não encontra ninguém ouvindo. O erro é "não abre", sem nenhuma pista.
#
# A saída NÃO é trocar o bind para 0.0.0.0. O app não tem login — o PIN é
# bloqueio de tela guardado no navegador, não autenticação: quem alcança a porta
# lê /api/transactions direto. Em 0.0.0.0, "quem alcança a porta" é qualquer
# aparelho no mesmo wifi, inclusive o do café.
#
# `tailscale serve` resolve sem abrir nada: o Tailscale recebe a conexão pela
# rede privada e repassa para o loopback. A porta continua fechada para a rede
# local, e só os SEUS aparelhos autenticados chegam nela.
#
# Efeito colateral bom: o `serve` entrega HTTPS de verdade, e service worker só
# roda em HTTPS ou localhost — então é por aqui que o app fica instalável na
# tela de início do iPhone e funciona offline.
#
# Detalhes e limitações: docs/tailscale.md
set -euo pipefail

PORTA=3210
ALVO="http://127.0.0.1:$PORTA"
LABEL="com.fluxo.dashboard"

echo "──────────────────────────────────────────────"
echo "  Fluxo — publicar na tailnet"
echo "──────────────────────────────────────────────"
echo

# ── 1. onde está o comando tailscale ─────────────────────────────────────────
# A versão da App Store não coloca a CLI no PATH; ela mora dentro do .app.
if command -v tailscale >/dev/null 2>&1; then
  TS=tailscale
elif [ -x /Applications/Tailscale.app/Contents/MacOS/Tailscale ]; then
  TS=/Applications/Tailscale.app/Contents/MacOS/Tailscale
  echo "→ Usando a CLI de dentro do Tailscale.app"
else
  echo "✗ Não encontrei o comando 'tailscale'."
  echo
  echo "  Se você instalou pela App Store, a CLI fica dentro do app. Rode:"
  echo "    /Applications/Tailscale.app/Contents/MacOS/Tailscale serve --bg $ALVO"
  echo
  echo "  Ou instale a versão com CLI:  brew install tailscale"
  exit 1
fi

# ── 2. o Tailscale está conectado? ───────────────────────────────────────────
if ! "$TS" status >/dev/null 2>&1; then
  echo "✗ O Tailscale não está conectado nesta máquina."
  echo "  Abra o app na barra de menu e entre na sua conta, depois rode de novo."
  exit 1
fi
echo "✓ Tailscale conectado"

# ── 3. o Fluxo está no ar? ───────────────────────────────────────────────────
# Publicar um endereço que devolve "conexão recusada" é pior que não publicar:
# a pessoa passa a culpar o Tailscale por um serviço que está parado.
# `|| echo 000` aqui seria bug: em falha de conexão o curl JÁ imprime "000" no
# -w e ainda sai com código != 0, então os dois se somavam em "000000" e a
# comparação com "000" não casava — o script anunciava "Fluxo respondendo" com
# o serviço parado. Um teste que mente sobre o que testou.
sonda() {
  local c
  c=$(curl -s -o /dev/null -w '%{http_code}' --max-time "${2:-4}" "$1" 2>/dev/null || true)
  [ -z "$c" ] && c=000
  printf '%s' "$c"
}

codigo=$(sonda "$ALVO")

if [ "$codigo" = "000" ]; then
  echo "✗ Nada respondendo em $ALVO — o Fluxo está parado."
  echo

  if [ -f "$HOME/Library/LaunchAgents/$LABEL.plist" ]; then
    printf "  Tentar reiniciar o serviço agora? [S/n]: "
    read -r RESP || RESP=s
    case "${RESP:-s}" in
      [Nn]*) echo "  Ok. Rode você mesmo:  launchctl kickstart -k gui/\$(id -u)/$LABEL"; exit 1 ;;
    esac
    launchctl kickstart -k "gui/$(id -u)/$LABEL" || true
    echo "  Aguardando o serviço subir…"
    for _ in $(seq 1 20); do
      sleep 1
      codigo=$(sonda "$ALVO" 2)
      [ "$codigo" != "000" ] && break
    done
    if [ "$codigo" = "000" ]; then
      echo "  ✗ Continua sem responder. Veja o motivo em:"
      echo "      tail -30 ~/Library/Logs/fluxo.log"
      exit 1
    fi
  else
    echo "  O Fluxo não está instalado como serviço. Instale com:"
    echo "      bash scripts/instalar-autostart.sh"
    echo
    echo "  (ou deixe o atalho Fluxo.command aberto — mas aí o celular só"
    echo "   funciona enquanto aquela janela estiver de pé)"
    exit 1
  fi
fi
echo "✓ Fluxo respondendo em $ALVO (HTTP $codigo)"

# ── 4. publicar ──────────────────────────────────────────────────────────────
echo
echo "→ Publicando…"

# ─── Duas armadilhas aqui, e as duas custaram uma tela travada ───────────────
#
# 1. `saida=$(tailscale serve ...)` NÃO serve. `$(...)` espera a saída FECHAR,
#    não o processo terminar — e a forma sem `--bg` fica em primeiro plano
#    depois de publicar, esperando Ctrl+C. Resultado: "Publicando…" para sempre,
#    com a mensagem do Tailscale engolida pela captura.
#
# 2. `--bg` não é conveniência, é REQUISITO. A forma sem ele é EFÊMERA: a
#    publicação existe enquanto aquele processo viver e é DESFEITA quando ele
#    morre. Um script que a usasse em segundo plano e depois matasse o processo
#    para "destravar" despublicaria o que acabou de publicar — e ainda diria que
#    deu certo. Por isso, sem `--bg`, este script recusa em vez de improvisar.
#
# Quem decide se funcionou é o ESTADO (`serve status`), não o código de retorno.
# É a mesma regra do resto do projeto: confere o resultado, não a intenção.

if ! "$TS" serve --help 2>&1 | grep -q -- '--bg'; then
  echo "✗ Sua versão do Tailscale não tem 'serve --bg'."
  echo
  echo "  Sem essa opção, a publicação só dura enquanto o comando estiver aberto"
  echo "  numa janela — some no momento em que você fechar. Não vale a pena."
  echo
  echo "  Atualize o Tailscale (ou instale a versão completa da CLI):"
  echo "      brew install tailscale"
  exit 1
fi

LOG=$(mktemp)
"$TS" serve --bg "$ALVO" >"$LOG" 2>&1 &
PID=$!

# Espera pelo ESTADO, não pelo relógio: assim que a publicação aparece, segue.
# O limite existe para o primeiro uso, quando o Tailscale precisa emitir um
# certificado — e é justamente aí que a espera parecia travamento.
#
# `FLUXO_ESPERA` existe para que o caminho de FALHA seja testável sem esperar um
# minuto por rodada. Caminho de erro que ninguém consegue exercitar é caminho de
# erro que ninguém testa.
ESPERA=${FLUXO_ESPERA:-60}
publicado=0
avisado=0
i=0

# `while` e não `for i in $(seq 1 $ESPERA)`: o `seq` é avaliado UMA VEZ, na
# entrada do laço. Com `for`, estender o prazo lá dentro (quando o Tailscale
# pede um clique humano) não teria efeito nenhum — o script desistiria no meio
# do clique, dizendo que falhou algo que ia dar certo.
while [ "$i" -lt "$ESPERA" ]; do
  i=$(( i + 1 ))
  if "$TS" serve status 2>/dev/null | grep -qF "127.0.0.1:$PORTA"; then
    publicado=1; break
  fi

  # ─── O Tailscale não estava falhando: estava ESPERANDO você ────────────────
  # Quando um recurso está desligado na conta (Serve, Funnel), a CLI imprime um
  # link de habilitação e FICA PENDURADA, aguardando o clique — para então
  # seguir sozinha. Da primeira versão deste script isso parecia travamento, e
  # o link, que era a resposta exata, ficava preso no arquivo de log até o fim.
  #
  # Agora o link aparece no segundo em que o Tailscale o escreve, e a espera
  # passa a ter um propósito visível.
  if [ "$avisado" = "0" ] && grep -qE 'https://login\.tailscale\.com/\S+' "$LOG" 2>/dev/null; then
    URL=$(grep -oE 'https://login\.tailscale\.com/\S+' "$LOG" | head -1)
    echo
    echo "  ⚠ O Tailscale precisa que você LIGUE um recurso na sua conta."
    echo "    O endereço abaixo já vem com o identificador deste Mac:"
    echo
    echo "      $URL"
    echo
    echo "    Abra, habilite, e este script continua sozinho — ele está esperando."
    command -v open >/dev/null 2>&1 && open "$URL" >/dev/null 2>&1 &
    avisado=1
    # A espera agora é humana: quem está clicando merece mais que um minuto.
    [ "$ESPERA" -lt 300 ] && ESPERA=300
  fi

  if ! kill -0 "$PID" 2>/dev/null; then
    "$TS" serve status 2>/dev/null | grep -qF "127.0.0.1:$PORTA" && publicado=1
    break
  fi

  if [ "$avisado" = "0" ]; then
    case $i in
      5)  echo "  … ainda esperando. Na primeira vez o Tailscale emite um" ;;
      6)  echo "    certificado para o seu domínio, e isso leva alguns segundos." ;;
      20) echo "  … ${i}s. Continua tentando." ;;
      40) echo "  … ${i}s. Se passar de um minuto, algo está errado — o motivo" ;;
      41) echo "    aparece assim que eu desistir." ;;
    esac
  elif [ $(( i % 30 )) -eq 0 ]; then
    echo "  … esperando você habilitar (${i}s). Ctrl+C para sair."
  fi
  sleep 1
done

kill "$PID" 2>/dev/null || true      # com --bg a config é persistente: seguro
wait "$PID" 2>/dev/null || true

ESTADO=$("$TS" serve status 2>&1 || true)

if [ "$publicado" != "1" ]; then
  echo "✗ Não consegui publicar. O Tailscale disse:"
  echo
  sed 's/^/    /' "$LOG"
  [ -s "$LOG" ] || echo "    (não disse nada — ficou esperando sem responder)"
  echo
  # O Tailscale, quando sabe o que fazer, DIZ — com link e tudo. Da primeira
  # versão eu casava "not enabled" com uma regex frouxa e respondia com um
  # palpite genérico ("é o MagicDNS"), por cima de uma resposta exata que o
  # próprio programa tinha acabado de dar. O certo é amplificar quem sabe.
  URL=$(grep -oE 'https://login\.tailscale\.com/\S+' "$LOG" 2>/dev/null | head -1 || true)
  if [ -n "$URL" ]; then
    echo "  O próprio Tailscale disse onde resolver:"
    echo "      $URL"
    echo "    Abra, habilite o que ele pedir, e rode este script de novo."
  elif grep -qiE "cert|magicdns" "$LOG"; then
    echo "  Parece certificado/DNS. Confira em:"
    echo "      https://login.tailscale.com/admin/dns"
    echo "    MagicDNS e HTTPS Certificates precisam estar ligados."
  else
    echo "  Sem pista no que o Tailscale devolveu. Duas suspeitas, nesta ordem:"
    echo "    • recurso desligado na conta — veja https://login.tailscale.com/admin"
    echo "    • CLI limitada da versão da App Store — tente: brew install tailscale"
  fi
  rm -f "$LOG"
  exit 1
fi
rm -f "$LOG"

# ── 5. dizer o endereço ──────────────────────────────────────────────────────
echo "✓ Publicado"
echo
echo "── Estado atual ──────────────────────────────"
echo "$ESTADO"
echo "──────────────────────────────────────────────"
echo
echo "📱 No celular (com o Tailscale ligado), abra o endereço https://… acima."
echo "   No Safari: Compartilhar → 'Adicionar à Tela de Início' e o Fluxo vira"
echo "   um ícone, em tela cheia."
echo
echo "🔒 Só os aparelhos da SUA tailnet alcançam isto. Não use 'Share node' nem"
echo "   'Funnel' aqui: o app não tem login, então compartilhar o nó equivale a"
echo "   entregar o extrato."
echo
echo "   Para despublicar:  $TS serve --https=443 off"
