/**
 * ai.js — Assistente financeiro com IA (Claude)
 * Finanças Pessoais — Juan Pablo Ladeira
 *
 * CONFIGURAÇÃO:
 *   1. Acesse https://console.anthropic.com/settings/keys
 *   2. Crie uma chave de API
 *   3. Cole na aba "✦ Assistente IA" da plataforma
 *   A chave fica salva no localStorage do navegador.
 */

const AI_MODEL   = 'claude-sonnet-4-6';
const AI_API_URL = 'https://api.anthropic.com/v1/messages';

let aiApiKey     = load('jpfin_ia_key', '');
let chatHistory  = [];
let pendingTx    = null;

// ─── Init ─────────────────────────────────────────────────────────────────────

(function initAI() {
  if (aiApiKey) {
    const el = document.getElementById('apiKey');
    if (el) el.value = aiApiKey;
    setKeyStatus(aiApiKey);
  }
})();

// ─── Chave de API ─────────────────────────────────────────────────────────────

function saveKey(val) {
  aiApiKey = val.trim();
  save('jpfin_ia_key', aiApiKey);
  setKeyStatus(aiApiKey);
}

function setKeyStatus(key) {
  const el = document.getElementById('keyStatus');
  if (!el) return;
  const ok = key.startsWith('sk-ant-');
  el.className = 'ai-status ' + (ok ? 'ok' : (key ? 'err' : ''));
  el.textContent = ok ? '✓ chave salva' : (key ? 'formato inválido' : '');
}

// ─── Welcome ──────────────────────────────────────────────────────────────────

function addWelcome() {
  addMsg('ai',
    `Olá, Juan Pablo! 👋 Sou seu assistente financeiro.\n\n` +
    `Pode me falar em linguagem natural:\n` +
    `• <b>"gastei R$50 no mercado hoje"</b>\n` +
    `• <b>"recebi R$3.000 de salário"</b>\n` +
    `• <b>"paguei R$120 na farmácia ontem"</b>\n` +
    `• <b>"quanto gastei esse mês?"</b>\n` +
    `• <b>"estou dentro das minhas metas?"</b>\n\n` +
    `Como posso ajudar?`
  );
}

// ─── Chat UI ─────────────────────────────────────────────────────────────────

function addMsg(role, text, time) {
  const box = document.getElementById('chatMessages');
  const isUser = role === 'user';
  const t = time || new Date().toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });

  const div = document.createElement('div');
  div.className = 'msg ' + (isUser ? 'user' : 'ai');
  div.innerHTML = `
    ${!isUser ? `<div class="msg-avatar ai">✦</div>` : ''}
    <div class="msg-bubble">
      <p>${text.replace(/\n/g, '<br>')}</p>
      <div class="msg-time">${t}</div>
    </div>
    ${isUser ? `<div class="msg-avatar user">JP</div>` : ''}
  `;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
  return div;
}

function addTyping() {
  const box = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = 'msg ai';
  div.id = 'typing-indicator';
  div.innerHTML = `
    <div class="msg-avatar ai">✦</div>
    <div class="msg-bubble">
      <div class="typing">
        <span class="dot"></span>
        <span class="dot"></span>
        <span class="dot"></span>
      </div>
    </div>`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function removeTyping() {
  const el = document.getElementById('typing-indicator');
  if (el) el.remove();
}

function fillChip(el) {
  const inp = document.getElementById('chatInput');
  inp.value = el.textContent.trim();
  inp.focus();
}

function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
}

// ─── Confirmation card ────────────────────────────────────────────────────────

function showConfirmCard(tx, msgEl) {
  const c = getCat(tx.cat);
  const card = document.createElement('div');
  card.className = 'tx-confirm';
  const ds = new Date(tx.date + 'T12:00:00').toLocaleDateString('pt-BR');
  card.innerHTML = `
    <div class="tx-confirm-row"><span>Descrição</span><span>${tx.desc}</span></div>
    <div class="tx-confirm-row">
      <span>Valor</span>
      <span style="color:${tx.type === 'expense' ? 'var(--red)' : 'var(--green)'};">
        ${tx.type === 'expense' ? '-' : '+'} ${fmt(tx.amount)}
      </span>
    </div>
    <div class="tx-confirm-row">
      <span>Categoria</span>
      <span><span class="cat-badge" style="background:${c.bg};color:${c.text};">${tx.cat}</span></span>
    </div>
    <div class="tx-confirm-row"><span>Data</span><span>${ds}</span></div>
    <div class="tx-confirm-row"><span>Tipo</span><span>${tx.type === 'expense' ? 'Gasto' : 'Receita'}</span></div>
    <div class="tx-confirm-btns">
      <button class="btn-confirm" onclick="confirmTx()">✓ Confirmar lançamento</button>
      <button class="btn-cancel"  onclick="cancelTx()">Cancelar</button>
    </div>
  `;
  msgEl.querySelector('.msg-bubble').appendChild(card);
  document.getElementById('chatMessages').scrollTop = 99999;
  pendingTx = tx;
}

function confirmTx() {
  if (!pendingTx) return;
  transactions.unshift({ ...pendingTx, id: nextId++, fromAI: true });
  save('jpfin_tx', transactions);
  const d = new Date(pendingTx.date + 'T12:00:00');
  viewYear = d.getFullYear(); viewMonth = d.getMonth();
  pendingTx = null;
  document.querySelectorAll('.tx-confirm-btns').forEach(b => b.remove());
  addMsg('ai', '✅ Lançado com sucesso! Você pode ver no <b>Dashboard</b> ou em <b>Lançamentos</b>.');
  render();
}

function cancelTx() {
  pendingTx = null;
  document.querySelectorAll('.tx-confirm-btns').forEach(b => b.remove());
  addMsg('ai', 'Tudo bem, lançamento cancelado. Pode corrigir e tentar novamente se quiser.');
}

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt() {
  const monthTx    = getMonthTx();
  const expTotal   = monthTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const incTotal   = monthTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const catTotals  = {};
  monthTx.filter(t => t.type === 'expense').forEach(t => { catTotals[t.cat] = (catTotals[t.cat] || 0) + t.amount; });
  const catSummary = Object.entries(catTotals).sort((a,b) => b[1]-a[1]).map(([k,v]) => `${k}: ${fmt(v)}`).join(', ') || 'nenhum';
  const recentList = transactions.slice(0, 15).map(t => `${t.date} | ${t.desc} | ${t.type === 'expense' ? '-' : '+'}${fmt(t.amount)} | ${t.cat}`).join('\n') || 'nenhuma';
  const goalSummary = [
    ...Object.entries(goals.expense || {}).map(([k,v]) => {
      const spent = catTotals[k] || 0;
      return `${k}: gasto ${fmt(spent)} de ${fmt(v)} (${Math.round(spent/v*100)}%)`;
    }),
    ...Object.entries(goals.income || {}).filter(([,v]) => v > 0).map(([k,v]) => `Receita ${k}: meta ${fmt(v)}`)
  ].join(', ') || 'sem metas definidas';

  return `Você é um assistente financeiro pessoal do Juan Pablo Ladeira. Hoje é ${new Date().toLocaleDateString('pt-BR')} (${todayStr()}).

CATEGORIAS DISPONÍVEIS: ${catNames().join(', ')}.

RESUMO FINANCEIRO — ${MONTHS[viewMonth]}/${viewYear}:
- Total gasto: ${fmt(expTotal)}
- Total recebido: ${fmt(incTotal)}
- Saldo do mês: ${fmt(incTotal - expTotal)}
- Por categoria: ${catSummary}
- Metas: ${goalSummary}

ÚLTIMAS TRANSAÇÕES:
${recentList}

════════════════════════════════════════
REGRAS DE RESPOSTA — siga à risca:
════════════════════════════════════════

1. LANÇAMENTO DE TRANSAÇÃO
   Se o usuário descrever um gasto, despesa, compra, pagamento, receita, salário ou qualquer movimentação financeira,
   responda SOMENTE com este JSON (sem nenhum texto antes ou depois):
   {"action":"launch","tx":{"desc":"descrição curta","amount":123.45,"type":"expense","cat":"Categoria","date":"YYYY-MM-DD"}}

   - "type": use "expense" para gastos/despesas, "income" para receitas/salários/entradas.
   - "cat": escolha a categoria mais adequada dentre as disponíveis.
   - "date": se não mencionado use hoje (${todayStr()}). "ontem" = ${new Date(Date.now()-86400000).toISOString().split('T')[0]}.
   - "amount": extraia o valor numérico (ex: "cinquenta reais" = 50.00).
   - Se o valor não estiver claro, pergunte antes de gerar o JSON.

2. PERGUNTAS E ANÁLISES
   Para perguntas sobre gastos, resumos, conselhos financeiros ou dúvidas, responda em português de forma direta, clara e útil.
   Seja conciso. Use os dados reais do resumo acima. Não invente dados.

3. SAUDAÇÕES / FORA DO ESCOPO
   Responda brevemente e redirecione para finanças.`;
}

// ─── Send message ────────────────────────────────────────────────────────────

async function sendMessage() {
  const input = document.getElementById('chatInput');
  const text  = input.value.trim();
  if (!text) return;

  if (!aiApiKey || !aiApiKey.startsWith('sk-ant-')) {
    addMsg('ai', '⚠️ Configure sua chave de API Anthropic no campo acima para usar o assistente.\n\nObtana em <a href="https://console.anthropic.com/settings/keys" target="_blank" style="color:var(--blue);">console.anthropic.com</a>.');
    return;
  }

  input.value = '';
  document.getElementById('sendBtn').disabled = true;
  addMsg('user', text);
  addTyping();

  chatHistory.push({ role: 'user', content: text });

  // Mantém no máximo 20 turnos no histórico (controle de custo)
  if (chatHistory.length > 40) chatHistory = chatHistory.slice(-40);

  try {
    const res = await fetch(AI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': aiApiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model:      AI_MODEL,
        max_tokens: 600,
        system:     buildSystemPrompt(),
        messages:   chatHistory,
      }),
    });

    const data = await res.json();
    removeTyping();

    if (data.error) {
      addMsg('ai', `❌ Erro da API: ${data.error.message}`);
      chatHistory.pop();
      document.getElementById('sendBtn').disabled = false;
      return;
    }

    const reply = data.content[0].text.trim();
    chatHistory.push({ role: 'assistant', content: reply });

    // Tenta parsear JSON de lançamento
    let parsed = null;
    try {
      const match = reply.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    } catch (e) { /* não é JSON */ }

    if (parsed && parsed.action === 'launch' && parsed.tx && parsed.tx.amount > 0) {
      const tx = parsed.tx;
      const typeLabel = tx.type === 'expense' ? 'gasto' : 'receita';
      const msgEl = addMsg('ai', `Entendi! Encontrei ${typeLabel === 'gasto' ? 'um ' : 'uma '}${typeLabel}. Confirme os dados abaixo:`);
      showConfirmCard(tx, msgEl);
    } else {
      addMsg('ai', reply.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>'));
    }

  } catch (e) {
    removeTyping();
    addMsg('ai', '❌ Não foi possível conectar à API. Verifique sua chave e conexão com a internet.');
    chatHistory.pop();
  }

  document.getElementById('sendBtn').disabled = false;
}
