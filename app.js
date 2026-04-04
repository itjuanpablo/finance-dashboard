/**
 * app.js — lógica principal da plataforma financeira
 * Finanças Pessoais — Juan Pablo Ladeira
 */

// ─── Estado de view ──────────────────────────────────────────────────────────

let viewYear   = new Date().getFullYear();
let viewMonth  = new Date().getMonth();
let currentTab  = 'all';
let currentPage = 'dashboard';

// ─── Navegação ───────────────────────────────────────────────────────────────

function goPage(page, el) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  render();

  // Mostra boas-vindas na primeira visita ao chat
  if (page === 'ia' && document.getElementById('chatMessages').children.length === 0) {
    addWelcome();
  }
}

function changeMonth(dir) {
  viewMonth += dir;
  if (viewMonth < 0)  { viewMonth = 11; viewYear--; }
  if (viewMonth > 11) { viewMonth = 0;  viewYear++; }
  render();
}

function setTab(tab, el) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  renderTxList();
}

// ─── Helpers de view ─────────────────────────────────────────────────────────

function getMonthTx() {
  return transactions.filter(t => {
    const d = new Date(t.date + 'T12:00:00');
    return d.getFullYear() === viewYear && d.getMonth() === viewMonth;
  });
}

// ─── Email ───────────────────────────────────────────────────────────────────

function saveEmail() {
  alertEmail = document.getElementById('alertEmail').value.trim();
  save('jpfin_email', alertEmail);
  document.getElementById('emailStatus').textContent = alertEmail ? '✓ Salvo' : '';
}

function triggerEmailAlert(cat, spent, limit) {
  if (!alertEmail) return;
  const subject = encodeURIComponent(`[Finanças] Meta de ${cat} ultrapassada`);
  const body = encodeURIComponent(
    `Olá Juan Pablo,\n\nSua meta da categoria "${cat}" foi ultrapassada.\n\n` +
    `Gasto: ${fmt(spent)}\nLimite: ${fmt(limit)}\nExcedente: ${fmt(spent - limit)}\n\n` +
    `Acesse sua plataforma para ver detalhes.`
  );
  window.open(`mailto:${alertEmail}?subject=${subject}&body=${body}`);
}

// ─── Transações (manual) ─────────────────────────────────────────────────────

function addTxManual() {
  const date   = document.getElementById('txDate').value;
  const desc   = document.getElementById('txDesc').value.trim();
  const amount = parseFloat(document.getElementById('txAmount').value);
  const cat    = document.getElementById('txCat').value;
  const type   = document.getElementById('txType').value;
  const cardId = parseInt(document.getElementById('txCard').value) || 1;

  if (!date || !desc || isNaN(amount) || amount <= 0) { alert('Preencha todos os campos.'); return; }

  transactions.unshift({ id: nextId++, date, desc, cat, type, amount, cardId });
  save('jpfin_tx', transactions);
  document.getElementById('txDesc').value = '';
  document.getElementById('txAmount').value = '';

  const d = new Date(date + 'T12:00:00');
  viewYear = d.getFullYear(); viewMonth = d.getMonth();

  // Alerta de meta
  if (type === 'expense' && goals.expense && goals.expense[cat]) {
    const spent = getMonthTx().filter(t => t.type === 'expense' && t.cat === cat).reduce((s,t) => s + t.amount, 0);
    if (spent > goals.expense[cat]) triggerEmailAlert(cat, spent, goals.expense[cat]);
  }
  render();
}

function deleteTransaction(id) {
  transactions = transactions.filter(t => t.id !== id);
  save('jpfin_tx', transactions);
  render();
}

// ─── Recorrentes ─────────────────────────────────────────────────────────────

function addRecurring() {
  const desc   = document.getElementById('recDesc').value.trim();
  const amount = parseFloat(document.getElementById('recAmount').value);
  const cat    = document.getElementById('recCat').value;
  const type   = document.getElementById('recType').value;
  const day    = parseInt(document.getElementById('recDay').value);
  const cardId = parseInt(document.getElementById('recCard').value) || 1;

  if (!desc || isNaN(amount) || amount <= 0 || isNaN(day) || day < 1 || day > 31) { alert('Preencha todos os campos.'); return; }

  recurring.push({ id: nextRecId++, desc, amount, cat, type, day, cardId });
  save('jpfin_rec', recurring);
  document.getElementById('recDesc').value = '';
  document.getElementById('recAmount').value = '';
  document.getElementById('recDay').value = '';
  render();
}

function deleteRecurring(id) {
  recurring = recurring.filter(r => r.id !== id);
  save('jpfin_rec', recurring);
  render();
}

function applyRecurring() {
  const y = viewYear, m = viewMonth;
  let added = 0;
  recurring.forEach(r => {
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const day  = Math.min(r.day, daysInMonth);
    const date = `${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const already = transactions.some(t => t.date === date && t.desc === r.desc && t.amount === r.amount && t.recurId === r.id);
    if (!already) {
      transactions.unshift({ id: nextId++, date, desc: r.desc, cat: r.cat, type: r.type, amount: r.amount, cardId: r.cardId, recurId: r.id, recurrent: true });
      added++;
    }
  });
  save('jpfin_tx', transactions);
  alert(added > 0 ? `${added} transação(ões) fixa(s) lançada(s) para ${MONTHS[m]}/${y}.` : `Todas as fixas já foram lançadas este mês.`);
  render();
}

// ─── Categorias ──────────────────────────────────────────────────────────────

function addCategory() {
  const name   = document.getElementById('catName').value.trim();
  const icon   = document.getElementById('catIcon').value.trim() || '📦';
  const colors = document.getElementById('catColorSel').value.split(',');
  if (!name) { alert('Informe o nome.'); return; }
  if (categories.find(c => c.name === name)) { alert('Categoria já existe.'); return; }
  categories.push({ id: 'cat_' + Date.now(), name, icon, bar: colors[0], bg: colors[1], text: colors[2], custom: true });
  save('jpfin_cats', categories);
  document.getElementById('catName').value = '';
  document.getElementById('catIcon').value = '';
  render();
}

function deleteCategory(id) {
  const cat = categories.find(c => c.id === id);
  if (cat && !cat.custom) { alert('Não é possível remover categorias padrão.'); return; }
  categories = categories.filter(c => c.id !== id);
  save('jpfin_cats', categories);
  render();
}

// ─── Metas ───────────────────────────────────────────────────────────────────

function saveGoal() {
  const cat  = document.getElementById('goalCat').value;
  const type = document.getElementById('goalType').value;
  const amt  = parseFloat(document.getElementById('goalAmt').value);
  if (isNaN(amt) || amt <= 0) { alert('Informe um valor válido.'); return; }
  if (!goals[type]) goals[type] = {};
  goals[type][cat] = amt;
  save('jpfin_goals', goals);
  document.getElementById('goalAmt').value = '';
  render();
}

function deleteGoal(type, cat) {
  if (goals[type]) delete goals[type][cat];
  save('jpfin_goals', goals);
  render();
}

// ─── Cartões ─────────────────────────────────────────────────────────────────

function addCard() {
  const name  = document.getElementById('cardName').value.trim();
  const type  = document.getElementById('cardType').value;
  const color = document.getElementById('cardColor').value;
  if (!name) { alert('Informe o nome.'); return; }
  cards.push({ id: nextCardId++, name, type, color });
  save('jpfin_cards', cards);
  document.getElementById('cardName').value = '';
  render();
}

function deleteCard(id) {
  cards = cards.filter(c => c.id !== id);
  save('jpfin_cards', cards);
  render();
}

// ─── Exportar ────────────────────────────────────────────────────────────────

function exportData() {
  const from   = document.getElementById('expFrom').value;
  const to     = document.getElementById('expTo').value;
  const format = document.getElementById('expFormat').value;
  const txs    = transactions.filter(t => t.date >= from && t.date <= to).sort((a,b) => a.date.localeCompare(b.date));
  let content, mime, ext;

  if (format === 'csv') {
    content = '\uFEFF' + 'Data,Descrição,Categoria,Tipo,Valor,Cartão,Fixa,Via IA\n' +
      txs.map(t => {
        const card = cards.find(c => c.id === t.cardId);
        return `${t.date},"${t.desc}",${t.cat},${t.type === 'expense' ? 'Gasto' : 'Receita'},${t.amount.toFixed(2)},${card ? card.name : ''},${t.recurrent ? 'Sim' : 'Não'},${t.fromAI ? 'Sim' : 'Não'}`;
      }).join('\n');
    mime = 'text/csv'; ext = 'csv';
  } else {
    content = JSON.stringify({ exportado: new Date().toISOString(), periodo: { de: from, ate: to }, transacoes: txs }, null, 2);
    mime = 'application/json'; ext = 'json';
  }

  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = `financas_${from}_${to}.${ext}`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

// ════════════════════════════════════════════════════════
// RENDER FUNCTIONS
// ════════════════════════════════════════════════════════

function renderAlerts() {
  const txs = getMonthTx();
  const expTotals = {}, incTotals = {};
  txs.filter(t => t.type === 'expense').forEach(t => { expTotals[t.cat] = (expTotals[t.cat] || 0) + t.amount; });
  txs.filter(t => t.type === 'income').forEach(t => { incTotals[t.cat] = (incTotals[t.cat] || 0) + t.amount; });

  const alerts = [];
  Object.entries(goals.expense || {}).forEach(([cat, limit]) => {
    const spent = expTotals[cat] || 0, pct = spent / limit;
    if (pct >= 1) alerts.push({ type: 'danger', msg: `⚠️ Meta de <b>${cat}</b> ultrapassada — ${fmt(spent)} de ${fmt(limit)}` });
    else if (pct >= 0.8) alerts.push({ type: 'warn', msg: `🔔 <b>${cat}</b> em ${Math.round(pct*100)}% do limite (${fmt(spent)} de ${fmt(limit)})` });
  });
  const totalInc = txs.filter(t => t.type === 'income').reduce((s,t) => s + t.amount, 0);
  Object.entries(goals.income || {}).forEach(([cat, target]) => {
    if (target > 0 && totalInc >= target)
      alerts.push({ type: 'success', msg: `✅ Meta de receita <b>${cat}</b> atingida! ${fmt(totalInc)} de ${fmt(target)}` });
  });

  document.getElementById('alertsArea').innerHTML = alerts.map(a => `<div class="alert-banner ${a.type}">${a.msg}</div>`).join('');
}

function renderMetrics() {
  const txs     = getMonthTx();
  const expenses = txs.filter(t => t.type === 'expense').reduce((s,t) => s + t.amount, 0);
  const income   = txs.filter(t => t.type === 'income').reduce((s,t) => s + t.amount, 0);
  const balance  = income - expenses;
  const fixas    = recurring.filter(r => r.type === 'expense').reduce((s,r) => s + r.amount, 0);
  document.getElementById('metricsRow').innerHTML = `
    <div class="metric"><div class="metric-label">Gastos</div><div class="metric-value danger">${fmt(expenses)}</div></div>
    <div class="metric"><div class="metric-label">Receitas</div><div class="metric-value success">${fmt(income)}</div></div>
    <div class="metric"><div class="metric-label">Saldo</div><div class="metric-value ${balance >= 0 ? 'success' : 'danger'}">${fmt(balance)}</div></div>
    <div class="metric"><div class="metric-label">Fixas/mês</div><div class="metric-value warn">${fmt(fixas)}</div></div>
  `;
}

function renderCatBars() {
  const txs = getMonthTx().filter(t => t.type === 'expense');
  const totals = {};
  txs.forEach(t => { totals[t.cat] = (totals[t.cat] || 0) + t.amount; });
  const sorted = Object.entries(totals).sort((a,b) => b[1]-a[1]);
  const max = sorted[0] ? sorted[0][1] : 1;
  if (!sorted.length) { document.getElementById('catBars').innerHTML = '<p class="empty">Nenhum gasto neste mês</p>'; return; }
  document.getElementById('catBars').innerHTML = sorted.map(([cat, val]) => {
    const c = getCat(cat);
    const pct = Math.round((val / max) * 100);
    const glimit = goals.expense && goals.expense[cat];
    const gmark = glimit ? `<div class="bar-goal-line" style="left:${Math.min(Math.round((glimit/max)*100),100)}%;"></div>` : '';
    return `<div class="bar-row">
      <span class="bar-label">${cat}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${c.bar};"></div>${gmark}</div>
      <span class="bar-val">${fmt(val)}</span>
    </div>`;
  }).join('');
}

let lineChartInst = null;
function renderLineChart() {
  const el = document.getElementById('lineChart');
  if (!el) return;
  const labels = [], expData = [], incData = [];
  for (let m = 0; m < 6; m++) {
    let month = viewMonth - 5 + m, year = viewYear;
    while (month < 0)  { month += 12; year--; }
    while (month > 11) { month -= 12; year++; }
    labels.push(MONTHS[month].slice(0, 3));
    const txs = transactions.filter(t => { const d = new Date(t.date+'T12:00:00'); return d.getFullYear()===year && d.getMonth()===month; });
    expData.push(parseFloat(txs.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0).toFixed(2)));
    incData.push(parseFloat(txs.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0).toFixed(2)));
  }
  if (lineChartInst) lineChartInst.destroy();
  lineChartInst = new Chart(el, {
    type: 'line',
    data: { labels, datasets: [
      { label:'Gastos',   data:expData, borderColor:'#D85A30', backgroundColor:'rgba(216,90,48,0.08)',  tension:0.3, fill:true, pointRadius:3 },
      { label:'Receitas', data:incData, borderColor:'#1D9E75', backgroundColor:'rgba(29,158,117,0.08)', tension:0.3, fill:true, pointRadius:3 },
    ]},
    options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } },
      scales: {
        x: { grid:{ display:false }, ticks:{ font:{size:11}, color:'#888' } },
        y: { grid:{ color:'rgba(0,0,0,0.05)' }, ticks:{ font:{size:11}, color:'#888', callback: v => 'R$'+(v>=1000?(v/1000).toFixed(1)+'k':v) } }
      }
    }
  });
}

function txRow(t, showDelete) {
  const c    = getCat(t.cat);
  const card = cards.find(x => x.id === t.cardId);
  const ds   = new Date(t.date + 'T12:00:00').toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' });
  const badges = (t.recurrent ? '<span class="recur-badge">fixa</span>' : '') + (t.fromAI ? '<span class="ia-badge">IA</span>' : '');
  const del  = showDelete ? `<button class="tx-del" onclick="deleteTransaction(${t.id})" title="Remover">&times;</button>` : '';
  return `<div class="tx-item">
    <div class="tx-icon" style="background:${c.bg};">${c.icon || '📦'}</div>
    <div class="tx-info">
      <div class="tx-name">${t.desc}${badges}</div>
      <div class="tx-meta">${ds} · <span class="cat-badge" style="background:${c.bg};color:${c.text};">${t.cat}</span>${card ? ` · ${card.name}` : ''}</div>
    </div>
    <span class="tx-amount ${t.type}">${t.type==='expense'?'-':'+'}${fmt(t.amount)}</span>
    ${del}
  </div>`;
}

function renderRecentTx() {
  const txs = getMonthTx().sort((a,b) => b.date.localeCompare(a.date)).slice(0, 6);
  if (!txs.length) { document.getElementById('recentTx').innerHTML = '<p class="empty">Nenhuma transação</p>'; return; }
  document.getElementById('recentTx').innerHTML = txs.map(t => txRow(t, false)).join('');
}

function renderTxList() {
  const search = (document.getElementById('searchInput') || {}).value || '';
  const txs = getMonthTx()
    .filter(t => currentTab === 'all' || t.type === currentTab)
    .filter(t => !search || t.desc.toLowerCase().includes(search.toLowerCase()) || t.cat.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b) => b.date.localeCompare(a.date));
  if (!txs.length) { document.getElementById('txList').innerHTML = '<p class="empty">Nenhum lançamento</p>'; return; }
  document.getElementById('txList').innerHTML = txs.map(t => txRow(t, true)).join('');
}

function renderRecurring() {
  const expTotal = recurring.filter(r => r.type==='expense').reduce((s,r) => s+r.amount, 0);
  const incTotal = recurring.filter(r => r.type==='income').reduce((s,r) => s+r.amount, 0);
  document.getElementById('recurringSummary').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px;">
      <div class="metric"><div class="metric-label">Total fixas/mês (gastos)</div><div class="metric-value danger">${fmt(expTotal)}</div></div>
      <div class="metric"><div class="metric-label">Total fixas/mês (receitas)</div><div class="metric-value success">${fmt(incTotal)}</div></div>
      <div class="metric"><div class="metric-label">Saldo fixo</div><div class="metric-value ${incTotal-expTotal>=0?'success':'danger'}">${fmt(incTotal-expTotal)}</div></div>
    </div>`;
  if (!recurring.length) { document.getElementById('recurringList').innerHTML = '<p class="empty">Nenhuma fixa cadastrada</p>'; return; }
  document.getElementById('recurringList').innerHTML = recurring.map(r => {
    const c = getCat(r.cat);
    const card = cards.find(x => x.id === r.cardId);
    return `<div class="tx-item">
      <div class="tx-icon" style="background:${c.bg};">${c.icon||'📦'}</div>
      <div class="tx-info">
        <div class="tx-name">${r.desc}</div>
        <div class="tx-meta">Dia ${r.day} · <span class="cat-badge" style="background:${c.bg};color:${c.text};">${r.cat}</span>${card?` · ${card.name}`:''}</div>
      </div>
      <span class="tx-amount ${r.type}">${r.type==='expense'?'-':'+'}${fmt(r.amount)}</span>
      <button class="tx-del" onclick="deleteRecurring(${r.id})">&times;</button>
    </div>`;
  }).join('');
}

function renderGoalSection(type, elId) {
  const obj    = goals[type] || {};
  const txs    = getMonthTx().filter(t => t.type === type);
  const totals = {};
  txs.forEach(t => { totals[t.cat] = (totals[t.cat] || 0) + t.amount; });
  const entries = Object.entries(obj).filter(([,v]) => v > 0);
  if (!entries.length) { document.getElementById(elId).innerHTML = '<p class="empty">Nenhuma meta definida</p>'; return; }
  document.getElementById(elId).innerHTML = entries.map(([cat, limit]) => {
    const spent = totals[cat] || 0, pct = spent / limit;
    const cls = pct >= 1 ? 'pct-over' : pct >= 0.8 ? 'pct-warn' : 'pct-ok';
    const c = getCat(cat);
    const barColor = pct >= 1 ? '#E24B4A' : pct >= 0.8 ? '#BA7517' : c.bar;
    return `<div class="goal-row">
      <span style="font-size:13px;flex:1;">${c.icon||''} ${cat}</span>
      <div style="flex:2;"><div class="bar-track"><div class="bar-fill" style="width:${Math.min(Math.round(pct*100),100)}%;background:${barColor};"></div></div></div>
      <span style="font-size:12px;color:var(--text2);width:110px;text-align:right;">${fmt(spent)} / ${fmt(limit)}</span>
      <span style="font-size:12px;font-weight:700;width:38px;text-align:right;" class="${cls}">${Math.round(pct*100)}%</span>
      <button class="tx-del" onclick="deleteGoal('${type}','${cat}')">&times;</button>
    </div>`;
  }).join('');
}

function renderCategories() {
  document.getElementById('catList').innerHTML = `<div class="cat-tags">` +
    categories.map(c => `
      <span class="tag" style="background:${c.bg};color:${c.text};border-color:${c.bar}44;">
        ${c.icon} ${c.name}
        ${c.custom ? `<button class="tag-del" onclick="deleteCategory('${c.id}')" title="Remover">&times;</button>` : ''}
      </span>`
    ).join('') + '</div>';
}

let cardChartInst = null;
function renderCards() {
  const txs = getMonthTx().filter(t => t.type === 'expense');
  const totals = {};
  cards.forEach(c => { totals[c.id] = 0; });
  txs.forEach(t => { if (totals[t.cardId] !== undefined) totals[t.cardId] += t.amount; });
  document.getElementById('cardsList').innerHTML = cards.map(c => `
    <div class="card-row">
      <span class="card-dot" style="background:${c.color};"></span>
      <span style="font-size:13px;flex:1;margin-left:8px;">${c.name}</span>
      <span style="font-size:12px;color:var(--text2);margin-right:10px;">${TYPE_LABELS[c.type]}</span>
      <span style="font-size:13px;font-weight:700;color:var(--red);margin-right:10px;">${fmt(totals[c.id]||0)}</span>
      <button class="tx-del" onclick="deleteCard(${c.id})">&times;</button>
    </div>`
  ).join('');
  const el = document.getElementById('cardChart');
  if (!el) return;
  if (cardChartInst) cardChartInst.destroy();
  cardChartInst = new Chart(el, {
    type: 'doughnut',
    data: { labels: cards.map(c=>c.name), datasets:[{ data: cards.map(c=>parseFloat((totals[c.id]||0).toFixed(2))), backgroundColor: cards.map(c=>c.color), borderWidth:2, borderColor:'#fff' }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom', labels:{ font:{size:12}, boxWidth:12 } } } }
  });
}

function renderExportSummary() {
  const from = (document.getElementById('expFrom')||{}).value;
  const to   = (document.getElementById('expTo')||{}).value;
  if (!from || !to) return;
  const txs  = transactions.filter(t => t.date >= from && t.date <= to);
  const exp  = txs.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  const inc  = txs.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  document.getElementById('exportSummary').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:10px;">
      <div class="metric"><div class="metric-label">Lançamentos</div><div class="metric-value info">${txs.length}</div></div>
      <div class="metric"><div class="metric-label">Total gastos</div><div class="metric-value danger">${fmt(exp)}</div></div>
      <div class="metric"><div class="metric-label">Total receitas</div><div class="metric-value success">${fmt(inc)}</div></div>
    </div>
    <p style="font-size:12px;color:var(--text2);">Período: ${from} a ${to}</p>`;
}

// ─── Render principal ─────────────────────────────────────────────────────────

function render() {
  document.getElementById('monthLabel').textContent = MONTHS[viewMonth] + ' ' + viewYear;
  populateCatSelects();
  populateCardSelects();
  renderAlerts();

  if (currentPage === 'dashboard')   { renderMetrics(); renderCatBars(); renderLineChart(); renderRecentTx(); }
  if (currentPage === 'lancamentos') { renderTxList(); }
  if (currentPage === 'recorrentes') { renderRecurring(); }
  if (currentPage === 'metas')       { renderGoalSection('expense','goalsExpense'); renderGoalSection('income','goalsIncome'); }
  if (currentPage === 'categorias')  { renderCategories(); }
  if (currentPage === 'cartoes')     { renderCards(); }
  if (currentPage === 'exportar')    { renderExportSummary(); }
}

// ─── Init ────────────────────────────────────────────────────────────────────

document.getElementById('txDate').value = todayStr();
if (alertEmail) document.getElementById('alertEmail').value = alertEmail;

(function initExportDates() {
  const d = new Date(), y = d.getFullYear(), m = d.getMonth();
  document.getElementById('expFrom').value = new Date(y, m, 1).toISOString().split('T')[0];
  document.getElementById('expTo').value   = new Date(y, m+1, 0).toISOString().split('T')[0];
})();

document.getElementById('expFrom').addEventListener('change', renderExportSummary);
document.getElementById('expTo').addEventListener('change', renderExportSummary);

render();
