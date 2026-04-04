/**
 * Finanças Pessoais — Juan Pablo Ladeira
 * app.js — lógica principal
 */

// ─── Constantes ─────────────────────────────────────────────────────────────

const MONTHS = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
];

const TYPE_LABELS = { credit: 'Crédito', debit: 'Débito', pix: 'Pix/Conta' };

const DEFAULT_CATS = [
  { id: 'alimentacao', name: 'Alimentação',   icon: '🍽️', bar: '#BA7517', bg: '#FAEEDA', text: '#412402', custom: false },
  { id: 'supermercado', name: 'Supermercado', icon: '🛒', bar: '#1D9E75', bg: '#E1F5EE', text: '#085041', custom: false },
  { id: 'transporte',  name: 'Transporte',    icon: '🚗', bar: '#185FA5', bg: '#E6F1FB', text: '#042C53', custom: false },
  { id: 'saude',       name: 'Saúde',         icon: '💊', bar: '#E24B4A', bg: '#FCEBEB', text: '#501313', custom: false },
  { id: 'lazer',       name: 'Lazer',         icon: '🎉', bar: '#D4537E', bg: '#FBEAF0', text: '#4B1528', custom: false },
  { id: 'assinatura',  name: 'Assinatura',    icon: '📱', bar: '#7F77DD', bg: '#EEEDFE', text: '#26215C', custom: false },
  { id: 'cartao',      name: 'Cartão Crédito',icon: '💳', bar: '#888780', bg: '#F1EFE8', text: '#2C2C2A', custom: false },
  { id: 'pix',         name: 'Pix/Transfer',  icon: '📲', bar: '#639922', bg: '#EAF3DE', text: '#173404', custom: false },
  { id: 'outro',       name: 'Outro',         icon: '📦', bar: '#888780', bg: '#F1EFE8', text: '#2C2C2A', custom: false },
];

const SEED_TX = [
  { id:1,  date:'2025-09-12', desc:'Anastecedora Janorágid',     cat:'Assinatura',    type:'expense', amount:18.00,   cardId:1 },
  { id:2,  date:'2025-09-12', desc:'DaxeTecnologia',              cat:'Assinatura',    type:'expense', amount:29.00,   cardId:1 },
  { id:3,  date:'2025-09-12', desc:'Marmita Tia Alice',           cat:'Alimentação',   type:'expense', amount:20.00,   cardId:1 },
  { id:4,  date:'2025-09-12', desc:'Rodrigo Paulo',               cat:'Pix/Transfer',  type:'expense', amount:104.00,  cardId:2 },
  { id:5,  date:'2025-09-12', desc:'Nelson Porto Chrel 14800',    cat:'Outro',         type:'expense', amount:140.00,  cardId:1 },
  { id:6,  date:'2025-09-13', desc:'Empório Português',           cat:'Alimentação',   type:'expense', amount:84.28,   cardId:1 },
  { id:7,  date:'2025-09-13', desc:'Supermercados Alvorada',      cat:'Supermercado',  type:'expense', amount:15.99,   cardId:1 },
  { id:8,  date:'2025-09-13', desc:'Fed Snt Pohso Alegre',        cat:'Transporte',    type:'expense', amount:270.00,  cardId:2 },
  { id:9,  date:'2025-09-15', desc:'Marmita Tia Alice',           cat:'Alimentação',   type:'expense', amount:20.00,   cardId:1 },
  { id:10, date:'2025-09-15', desc:'Cacau Show',                  cat:'Alimentação',   type:'expense', amount:19.99,   cardId:1 },
  { id:11, date:'2025-09-17', desc:'Supermercados Alvorada',      cat:'Supermercado',  type:'expense', amount:23.50,   cardId:1 },
  { id:12, date:'2025-09-18', desc:'Oficina de Pizza',            cat:'Alimentação',   type:'expense', amount:20.00,   cardId:1 },
  { id:13, date:'2025-09-18', desc:'Stegmann Filko Ltda',         cat:'Outro',         type:'expense', amount:110.20,  cardId:1 },
  { id:14, date:'2025-09-21', desc:'RestaurantePorto',            cat:'Alimentação',   type:'expense', amount:40.00,   cardId:1 },
  { id:15, date:'2025-09-22', desc:'Supermercados Alvorada',      cat:'Supermercado',  type:'expense', amount:21.49,   cardId:1 },
  { id:16, date:'2025-09-24', desc:'Shups Sorveteria',            cat:'Alimentação',   type:'expense', amount:146.00,  cardId:1 },
  { id:17, date:'2025-09-26', desc:'Edevaldo José da Mota',       cat:'Pix/Transfer',  type:'expense', amount:24.00,   cardId:2 },
  { id:18, date:'2025-09-30', desc:'Center Nox',                  cat:'Assinatura',    type:'expense', amount:33.27,   cardId:1 },
  { id:19, date:'2025-10-01', desc:'Marmita Tia Alice',           cat:'Alimentação',   type:'expense', amount:20.00,   cardId:1 },
  { id:20, date:'2025-10-02', desc:'Dubelato',                    cat:'Alimentação',   type:'expense', amount:19.00,   cardId:1 },
  { id:21, date:'2025-10-03', desc:'PR Padaria e Confeitaria',    cat:'Alimentação',   type:'expense', amount:41.05,   cardId:1 },
  { id:22, date:'2025-10-04', desc:'Fed Snt Pohso Alegre',        cat:'Transporte',    type:'expense', amount:15.00,   cardId:2 },
  { id:23, date:'2025-10-06', desc:'Raia163',                     cat:'Saúde',         type:'expense', amount:55.17,   cardId:1 },
  { id:24, date:'2025-10-07', desc:'Restaurante Est Caipira',     cat:'Alimentação',   type:'expense', amount:111.40,  cardId:1 },
  { id:25, date:'2025-10-08', desc:'CEA Rao 220 Parcela 1/3',     cat:'Cartão Crédito',type:'expense', amount:273.33,  cardId:1 },
  { id:26, date:'2025-10-04', desc:'Pagamento fatura outubro',    cat:'Cartão Crédito',type:'expense', amount:3013.41, cardId:2 },
];

const SEED_CARDS = [
  { id: 1, name: 'Mercado Pago Visa', type: 'credit', color: '#185FA5' },
  { id: 2, name: 'Pix / Conta',        type: 'pix',    color: '#1D9E75' },
];

const SEED_GOALS = {
  expense: { Alimentação: 400, Supermercado: 300, Transporte: 200, Lazer: 200, Assinatura: 100 },
  income:  {}
};

const SEED_REC = [
  { id: 1, desc: 'Netflix',          amount: 55.90, cat: 'Assinatura',  type: 'expense', day: 10, cardId: 1 },
  { id: 2, desc: 'Marmita Tia Alice',amount: 20.00, cat: 'Alimentação', type: 'expense', day: 1,  cardId: 1 },
];

// ─── Estado ──────────────────────────────────────────────────────────────────

function load(key, def) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; }
  catch (e) { return def; }
}
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
}

let transactions = load('jpfin_tx', SEED_TX);
let cards        = load('jpfin_cards', SEED_CARDS);
let goals        = load('jpfin_goals', SEED_GOALS);
let recurring    = load('jpfin_rec', SEED_REC);
let categories   = load('jpfin_cats', DEFAULT_CATS);
let alertEmail   = load('jpfin_email', '');

let nextId     = Math.max(1, ...transactions.map(t => t.id)) + 1;
let nextCardId = Math.max(1, ...cards.map(c => c.id)) + 1;
let nextRecId  = Math.max(1, ...recurring.map(r => r.id)) + 1;

let viewYear = new Date().getFullYear();
let viewMonth = new Date().getMonth();
let currentTab = 'all';
let currentPage = 'dashboard';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = v => 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const todayStr = () => new Date().toISOString().split('T')[0];

function getCat(name) {
  return categories.find(c => c.name === name) || { bar: '#888780', bg: '#F1EFE8', text: '#2C2C2A', icon: '📦' };
}

function catNames() { return categories.map(c => c.name); }

function getMonthTx() {
  return transactions.filter(t => {
    const d = new Date(t.date + 'T12:00:00');
    return d.getFullYear() === viewYear && d.getMonth() === viewMonth;
  });
}

function populateCatSelects() {
  ['txCat', 'recCat', 'goalCat'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const cur = el.value;
    el.innerHTML = catNames().map(n => `<option>${n}</option>`).join('');
    if (cur) el.value = cur;
  });
}

function populateCardSelects() {
  ['txCard', 'recCard'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = cards.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  });
}

// ─── Navegação ───────────────────────────────────────────────────────────────

function goPage(page, el) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  render();
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

// ─── Toast notifications ────────────────────────────────────────────────────

let _toastTimer = null;

function showToast(msg, type = 'warn', duration = 5000) {
  const existing = document.getElementById('globalToast');
  if (existing) existing.remove();
  if (_toastTimer) clearTimeout(_toastTimer);
  const t = document.createElement('div');
  t.id = 'globalToast';
  t.className = `toast ${type}`;
  t.innerHTML = msg;
  t.onclick = () => t.remove();
  document.body.appendChild(t);
  _toastTimer = setTimeout(() => { const el = document.getElementById('globalToast'); if (el) el.remove(); }, duration);
}

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function sendBrowserNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body });
  }
}

// ─── Email / alerta ──────────────────────────────────────────────────────────

function saveEmail() {
  alertEmail = document.getElementById('alertEmail').value.trim();
  save('jpfin_email', alertEmail);
  document.getElementById('emailStatus').textContent = alertEmail ? '✓ Email salvo' : '';
}

function triggerEmailAlert(cat, spent, limit) {
  const over = spent > limit;
  const pct = Math.round((spent / limit) * 100);
  const msg = over
    ? `⚠️ <b>Meta de ${cat} ultrapassada!</b> Gasto: ${fmt(spent)} (limite: ${fmt(limit)})`
    : `🔔 <b>${cat}</b> em ${pct}% do limite — ${fmt(spent)} de ${fmt(limit)}`;
  showToast(msg, over ? 'danger' : 'warn', 7000);
  sendBrowserNotification(
    over ? `⚠️ Meta de ${cat} ultrapassada` : `🔔 ${cat} quase no limite`,
    `${fmt(spent)} de ${fmt(limit)} (${pct}%)`
  );
  if (alertEmail && over) {
    const subject = encodeURIComponent(`[Finanças] Meta de ${cat} ultrapassada`);
    const body = encodeURIComponent(
      `Olá Juan Pablo,\n\nSua meta da categoria "${cat}" foi ultrapassada.\n\n` +
      `Gasto: ${fmt(spent)}\nLimite: ${fmt(limit)}\nExcedente: ${fmt(spent - limit)}\n\n` +
      `Acesse sua plataforma financeira para ver os detalhes.`
    );
    window.open(`mailto:${alertEmail}?subject=${subject}&body=${body}`);
  }
}

// ─── Transações ──────────────────────────────────────────────────────────────

function addTransaction() {
  const date   = document.getElementById('txDate').value;
  const desc   = document.getElementById('txDesc').value.trim();
  const amount = parseFloat(document.getElementById('txAmount').value);
  const cat    = document.getElementById('txCat').value;
  const type   = document.getElementById('txType').value;
  const cardId = parseInt(document.getElementById('txCard').value) || 1;

  if (!date || !desc || isNaN(amount) || amount <= 0) {
    alert('Preencha todos os campos corretamente.');
    return;
  }

  transactions.unshift({ id: nextId++, date, desc, cat, type, amount, cardId });
  save('jpfin_tx', transactions);

  document.getElementById('txDesc').value   = '';
  document.getElementById('txAmount').value = '';

  // Navega para o mês do lançamento
  const d = new Date(date + 'T12:00:00');
  viewYear = d.getFullYear();
  viewMonth = d.getMonth();

  // Verifica se ultrapassou meta ou está próximo
  if (type === 'expense' && goals.expense && goals.expense[cat]) {
    const limit = goals.expense[cat];
    const spent = getMonthTx()
      .filter(t => t.type === 'expense' && t.cat === cat)
      .reduce((s, t) => s + t.amount, 0);
    const pct = spent / limit;
    if (pct >= 1) triggerEmailAlert(cat, spent, limit);
    else if (pct >= 0.8) triggerEmailAlert(cat, spent, limit);
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

  if (!desc || isNaN(amount) || amount <= 0 || isNaN(day) || day < 1 || day > 31) {
    alert('Preencha todos os campos.');
    return;
  }

  recurring.push({ id: nextRecId++, desc, amount, cat, type, day, cardId });
  save('jpfin_rec', recurring);

  document.getElementById('recDesc').value   = '';
  document.getElementById('recAmount').value = '';
  document.getElementById('recDay').value    = '';
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
    const day = Math.min(r.day, daysInMonth);
    const date = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const already = transactions.some(t => t.date === date && t.desc === r.desc && t.amount === r.amount && t.recurId === r.id);

    if (!already) {
      transactions.unshift({ id: nextId++, date, desc: r.desc, cat: r.cat, type: r.type, amount: r.amount, cardId: r.cardId, recurId: r.id, recurrent: true });
      added++;
    }
  });

  save('jpfin_tx', transactions);
  alert(added > 0
    ? `${added} transação(ões) fixa(s) lançada(s) para ${MONTHS[m]}/${y}.`
    : `Todas as fixas já foram lançadas este mês.`
  );
  render();
}

// ─── Categorias ──────────────────────────────────────────────────────────────

function addCategory() {
  const name  = document.getElementById('catName').value.trim();
  const icon  = document.getElementById('catIcon').value.trim() || '📦';
  const colors = document.getElementById('catColorSel').value.split(',');

  if (!name) { alert('Informe o nome da categoria.'); return; }
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

  if (!name) { alert('Informe o nome do cartão.'); return; }
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

  const txs = transactions.filter(t => t.date >= from && t.date <= to).sort((a, b) => a.date.localeCompare(b.date));
  let content, mime, ext;

  if (format === 'csv') {
    const header = 'Data,Descrição,Categoria,Tipo,Valor,Cartão,Fixa\n';
    const rows = txs.map(t => {
      const card = cards.find(c => c.id === t.cardId);
      return `${t.date},"${t.desc}",${t.cat},${t.type === 'expense' ? 'Gasto' : 'Receita'},${t.amount.toFixed(2)},${card ? card.name : ''},${t.recurrent ? 'Sim' : 'Não'}`;
    }).join('\n');
    content = '\uFEFF' + header + rows; mime = 'text/csv'; ext = 'csv';
  } else {
    content = JSON.stringify({ exportado: new Date().toISOString(), periodo: { de: from, ate: to }, transacoes: txs }, null, 2);
    mime = 'application/json'; ext = 'json';
  }

  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `financas_${from}_${to}.${ext}`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

// ─── Render: Alertas ─────────────────────────────────────────────────────────

function renderAlerts() {
  const txs = getMonthTx();
  const expTotals = {}, incTotals = {};
  txs.filter(t => t.type === 'expense').forEach(t => { expTotals[t.cat] = (expTotals[t.cat] || 0) + t.amount; });
  txs.filter(t => t.type === 'income').forEach(t => { incTotals[t.cat] = (incTotals[t.cat] || 0) + t.amount; });

  const alerts = [];

  Object.entries(goals.expense || {}).forEach(([cat, limit]) => {
    const spent = expTotals[cat] || 0, pct = spent / limit;
    if (pct >= 1) alerts.push({ type: 'danger', msg: `⚠️ Meta de <b>${cat}</b> ultrapassada — ${fmt(spent)} de ${fmt(limit)}` });
    else if (pct >= 0.8) alerts.push({ type: 'warn', msg: `🔔 <b>${cat}</b> em ${Math.round(pct * 100)}% do limite (${fmt(spent)} de ${fmt(limit)})` });
  });

  const totalIncome = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  Object.entries(goals.income || {}).forEach(([cat, target]) => {
    if (target > 0 && totalIncome >= target)
      alerts.push({ type: 'success', msg: `✅ Meta de receita <b>${cat}</b> atingida! ${fmt(totalIncome)} de ${fmt(target)}` });
  });

  document.getElementById('alertsArea').innerHTML = alerts.map(a =>
    `<div class="alert-banner ${a.type}">${a.msg}</div>`
  ).join('');
}

// ─── Render: Métricas ────────────────────────────────────────────────────────

function renderMetrics() {
  const txs     = getMonthTx();
  const expenses = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const income   = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const balance  = income - expenses;
  const fixas    = recurring.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);

  document.getElementById('metricsRow').innerHTML = `
    <div class="metric"><div class="metric-label">Gastos</div><div class="metric-value danger">${fmt(expenses)}</div></div>
    <div class="metric"><div class="metric-label">Receitas</div><div class="metric-value success">${fmt(income)}</div></div>
    <div class="metric"><div class="metric-label">Saldo</div><div class="metric-value ${balance >= 0 ? 'success' : 'danger'}">${fmt(balance)}</div></div>
    <div class="metric"><div class="metric-label">Fixas/mês</div><div class="metric-value warn">${fmt(fixas)}</div></div>
  `;
}

// ─── Render: Barras de categorias ────────────────────────────────────────────

function renderCatBars() {
  const txs = getMonthTx().filter(t => t.type === 'expense');
  const totals = {};
  txs.forEach(t => { totals[t.cat] = (totals[t.cat] || 0) + t.amount; });
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const max = sorted[0] ? sorted[0][1] : 1;

  if (!sorted.length) { document.getElementById('catBars').innerHTML = '<p class="empty">Nenhum gasto neste mês</p>'; return; }

  document.getElementById('catBars').innerHTML = sorted.map(([cat, val]) => {
    const c = getCat(cat);
    const pct = Math.round((val / max) * 100);
    const glimit = goals.expense && goals.expense[cat];
    const gmark = glimit ? `<div class="bar-goal-line" style="left:${Math.min(Math.round((glimit / max) * 100), 100)}%;"></div>` : '';
    return `<div class="bar-row">
      <span class="bar-label">${cat}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${c.bar};"></div>${gmark}</div>
      <span class="bar-val">${fmt(val)}</span>
    </div>`;
  }).join('');
}

// ─── Render: Gráfico de linha ─────────────────────────────────────────────────

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
    const txs = transactions.filter(t => {
      const d = new Date(t.date + 'T12:00:00');
      return d.getFullYear() === year && d.getMonth() === month;
    });
    expData.push(parseFloat(txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0).toFixed(2)));
    incData.push(parseFloat(txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0).toFixed(2)));
  }

  if (lineChartInst) lineChartInst.destroy();
  lineChartInst = new Chart(el, {
    type: 'line',
    data: { labels, datasets: [
      { label: 'Gastos',   data: expData, borderColor: '#D85A30', backgroundColor: 'rgba(216,90,48,0.08)',  tension: 0.3, fill: true, pointRadius: 3 },
      { label: 'Receitas', data: incData, borderColor: '#1D9E75', backgroundColor: 'rgba(29,158,117,0.08)', tension: 0.3, fill: true, pointRadius: 3 }
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 }, color: '#888' } },
        y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 11 }, color: '#888', callback: v => 'R$' + (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v) } }
      }
    }
  });
}

// ─── Render: Últimas transações (dashboard) ───────────────────────────────────

function renderRecentTx() {
  const txs = getMonthTx().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
  if (!txs.length) { document.getElementById('recentTx').innerHTML = '<p class="empty">Nenhuma transação</p>'; return; }
  document.getElementById('recentTx').innerHTML = txs.map(t => txRow(t, false)).join('');
}

// ─── Render: Lista de transações ─────────────────────────────────────────────

function renderTxList() {
  const search = (document.getElementById('searchInput') || {}).value || '';
  const txs = getMonthTx()
    .filter(t => currentTab === 'all' || t.type === currentTab)
    .filter(t => !search || t.desc.toLowerCase().includes(search.toLowerCase()) || t.cat.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.date.localeCompare(a.date));

  if (!txs.length) { document.getElementById('txList').innerHTML = '<p class="empty">Nenhum lançamento</p>'; return; }
  document.getElementById('txList').innerHTML = txs.map(t => txRow(t, true)).join('');
}

function txRow(t, showDelete) {
  const c    = getCat(t.cat);
  const card = cards.find(x => x.id === t.cardId);
  const ds   = new Date(t.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const del  = showDelete ? `<button class="tx-del" onclick="deleteTransaction(${t.id})" title="Remover">&times;</button>` : '';
  return `<div class="tx-item">
    <div class="tx-icon" style="background:${c.bg};">${c.icon}</div>
    <div class="tx-info">
      <div class="tx-name">${t.desc}${t.recurrent ? ' <span class="recur-badge">fixa</span>' : ''}</div>
      <div class="tx-meta">${ds} · <span class="cat-badge" style="background:${c.bg};color:${c.text};">${t.cat}</span>${card ? ` · ${card.name}` : ''}</div>
    </div>
    <span class="tx-amount ${t.type}">${t.type === 'expense' ? '-' : '+'}${fmt(t.amount)}</span>
    ${del}
  </div>`;
}

// ─── Render: Transações fixas ─────────────────────────────────────────────────

function renderRecurring() {
  const expTotal = recurring.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
  const incTotal = recurring.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0);

  document.getElementById('recurringSummary').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px;">
      <div class="metric"><div class="metric-label">Total fixas/mês (gastos)</div><div class="metric-value danger">${fmt(expTotal)}</div></div>
      <div class="metric"><div class="metric-label">Total fixas/mês (receitas)</div><div class="metric-value success">${fmt(incTotal)}</div></div>
      <div class="metric"><div class="metric-label">Saldo fixo</div><div class="metric-value ${incTotal - expTotal >= 0 ? 'success' : 'danger'}">${fmt(incTotal - expTotal)}</div></div>
    </div>`;

  if (!recurring.length) { document.getElementById('recurringList').innerHTML = '<p class="empty">Nenhuma transação fixa cadastrada</p>'; return; }

  document.getElementById('recurringList').innerHTML = recurring.map(r => {
    const c = getCat(r.cat);
    const card = cards.find(x => x.id === r.cardId);
    return `<div class="tx-item">
      <div class="tx-icon" style="background:${c.bg};">${c.icon}</div>
      <div class="tx-info">
        <div class="tx-name">${r.desc}</div>
        <div class="tx-meta">Dia ${r.day} · <span class="cat-badge" style="background:${c.bg};color:${c.text};">${r.cat}</span>${card ? ` · ${card.name}` : ''}</div>
      </div>
      <span class="tx-amount ${r.type}">${r.type === 'expense' ? '-' : '+'}${fmt(r.amount)}</span>
      <button class="tx-del" onclick="deleteRecurring(${r.id})">&times;</button>
    </div>`;
  }).join('');
}

// ─── Render: Metas ────────────────────────────────────────────────────────────

function renderGoalSection(type, elId) {
  const obj    = goals[type] || {};
  const txs    = getMonthTx().filter(t => t.type === type);
  const totals = {};
  txs.forEach(t => { totals[t.cat] = (totals[t.cat] || 0) + t.amount; });
  const entries = Object.entries(obj).filter(([, v]) => v > 0);

  if (!entries.length) { document.getElementById(elId).innerHTML = '<p class="empty">Nenhuma meta definida</p>'; return; }

  document.getElementById(elId).innerHTML = entries.map(([cat, limit]) => {
    const spent = totals[cat] || 0, pct = spent / limit;
    const cls = pct >= 1 ? 'pct-over' : pct >= 0.8 ? 'pct-warn' : 'pct-ok';
    const c = getCat(cat);
    const barColor = pct >= 1 ? '#E24B4A' : pct >= 0.8 ? '#BA7517' : c.bar;
    return `<div class="goal-row">
      <span style="font-size:13px;color:var(--text);flex:1;">${c.icon} ${cat}</span>
      <div style="flex:2;"><div class="bar-track"><div class="bar-fill" style="width:${Math.min(Math.round(pct * 100), 100)}%;background:${barColor};"></div></div></div>
      <span style="font-size:12px;color:var(--text-secondary);width:105px;text-align:right;">${fmt(spent)} / ${fmt(limit)}</span>
      <span class="goal-pct ${cls}">${Math.round(pct * 100)}%</span>
      <button class="tx-del" onclick="deleteGoal('${type}','${cat}')">&times;</button>
    </div>`;
  }).join('');
}

// ─── Render: Categorias ───────────────────────────────────────────────────────

function renderCategories() {
  document.getElementById('catList').innerHTML = `<div class="cat-tags">` +
    categories.map(c => `
      <span class="tag" style="background:${c.bg};color:${c.text};border-color:${c.bar}44;">
        ${c.icon} ${c.name}
        ${c.custom ? `<button class="tag-del" onclick="deleteCategory('${c.id}')" title="Remover">&times;</button>` : ''}
      </span>`
    ).join('') + '</div>';
}

// ─── Render: Cartões ──────────────────────────────────────────────────────────

let cardChartInst = null;

function renderCards() {
  const txs = getMonthTx().filter(t => t.type === 'expense');
  const totals = {};
  cards.forEach(c => { totals[c.id] = 0; });
  txs.forEach(t => { if (totals[t.cardId] !== undefined) totals[t.cardId] += t.amount; });

  document.getElementById('cardsList').innerHTML = cards.map(c => `
    <div class="card-row">
      <span class="card-dot" style="background:${c.color};"></span>
      <span style="font-size:13px;color:var(--text);flex:1;margin-left:8px;">${c.name}</span>
      <span style="font-size:12px;color:var(--text-secondary);margin-right:12px;">${TYPE_LABELS[c.type]}</span>
      <span style="font-size:13px;font-weight:600;color:var(--red);margin-right:12px;">${fmt(totals[c.id] || 0)}</span>
      <button class="tx-del" onclick="deleteCard(${c.id})">&times;</button>
    </div>`
  ).join('');

  const el = document.getElementById('cardChart');
  if (!el) return;
  if (cardChartInst) cardChartInst.destroy();
  cardChartInst = new Chart(el, {
    type: 'doughnut',
    data: {
      labels: cards.map(c => c.name),
      datasets: [{ data: cards.map(c => parseFloat((totals[c.id] || 0).toFixed(2))), backgroundColor: cards.map(c => c.color), borderWidth: 2, borderColor: '#fff' }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 12 }, boxWidth: 12 } } } }
  });
}

// ─── Render: Exportar ────────────────────────────────────────────────────────

function renderExportSummary() {
  const from = (document.getElementById('expFrom') || {}).value;
  const to   = (document.getElementById('expTo')   || {}).value;
  if (!from || !to) return;

  const txs     = transactions.filter(t => t.date >= from && t.date <= to);
  const expenses = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const income   = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);

  document.getElementById('exportSummary').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:10px;">
      <div class="metric"><div class="metric-label">Lançamentos</div><div class="metric-value info">${txs.length}</div></div>
      <div class="metric"><div class="metric-label">Total gastos</div><div class="metric-value danger">${fmt(expenses)}</div></div>
      <div class="metric"><div class="metric-label">Total receitas</div><div class="metric-value success">${fmt(income)}</div></div>
    </div>
    <p style="font-size:12px;color:var(--text-secondary);">Período: ${from} a ${to}</p>`;
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
  if (currentPage === 'metas')       { renderGoalSection('expense', 'goalsExpense'); renderGoalSection('income', 'goalsIncome'); }
  if (currentPage === 'categorias')  { renderCategories(); }
  if (currentPage === 'cartoes')     { renderCards(); }
  if (currentPage === 'exportar')    { renderExportSummary(); }
}

// ─── Init ────────────────────────────────────────────────────────────────────

document.getElementById('txDate').value = todayStr();

(function initExportDates() {
  const d = new Date(), y = d.getFullYear(), m = d.getMonth();
  document.getElementById('expFrom').value = new Date(y, m, 1).toISOString().split('T')[0];
  document.getElementById('expTo').value   = new Date(y, m + 1, 0).toISOString().split('T')[0];
})();

if (alertEmail) document.getElementById('alertEmail').value = alertEmail;

document.getElementById('expFrom').addEventListener('change', renderExportSummary);
document.getElementById('expTo').addEventListener('change', renderExportSummary);

// ─── API Key (para importação PDF) ────────────────────────────────────────────

let anthropicApiKey = load('jpfin_anthropic_key', '');

function saveApiKey() {
  anthropicApiKey = (document.getElementById('anthropicKey').value || '').trim();
  save('jpfin_anthropic_key', anthropicApiKey);
  document.getElementById('apiKeyStatus').textContent = anthropicApiKey ? '✓ Salva' : '';
}

// ─── Importar Extrato ─────────────────────────────────────────────────────────

let importRows = []; // parsed rows pending confirmation

function openImportModal() {
  document.getElementById('importModal').style.display = 'flex';
  document.getElementById('pdfApiKeyBox').style.display = 'block';
  if (anthropicApiKey) {
    document.getElementById('anthropicKey').value = anthropicApiKey;
    document.getElementById('apiKeyStatus').textContent = '✓ Salva';
  }
  requestNotificationPermission();
}

function closeImportModal() {
  document.getElementById('importModal').style.display = 'none';
  resetImport();
}

function resetImport() {
  importRows = [];
  document.getElementById('importPreview').style.display = 'none';
  document.getElementById('pdfProcessing').style.display = 'none';
  document.getElementById('importFile').value = '';
  const dz = document.getElementById('dropZone');
  if (dz) dz.style.display = '';
}

// Drag-and-drop
const _dz = document.getElementById('dropZone');
if (_dz) {
  _dz.addEventListener('dragover', e => { e.preventDefault(); _dz.classList.add('drag-over'); });
  _dz.addEventListener('dragleave', () => _dz.classList.remove('drag-over'));
  _dz.addEventListener('drop', e => {
    e.preventDefault(); _dz.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) processImportFile(file);
  });
}

function handleImportFile(input) {
  const file = input.files[0];
  if (file) processImportFile(file);
}

function processImportFile(file) {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.pdf')) {
    processPDFImport(file);
    return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    const text = e.target.result;
    try {
      importRows = lower.endsWith('.ofx') ? parseOFX(text) : parseCSVAuto(text);
      if (!importRows.length) { showToast('Nenhuma transação encontrada no arquivo.', 'warn'); return; }
      renderImportPreview();
    } catch (err) {
      showToast('Erro ao ler arquivo: ' + err.message, 'danger');
    }
  };
  reader.readAsText(file, 'UTF-8');
}

// ── PDF Import via Claude API ──
async function processPDFImport(file) {
  const key = anthropicApiKey || (document.getElementById('anthropicKey').value || '').trim();
  if (!key) {
    showToast('Informe sua chave da API Anthropic para importar PDFs.', 'warn', 6000);
    document.getElementById('pdfApiKeyBox').style.display = 'block';
    return;
  }

  // Show processing state
  document.getElementById('dropZone').style.display = 'none';
  document.getElementById('pdfProcessing').style.display = 'block';
  document.getElementById('pdfStatusMsg').textContent = 'Lendo o PDF...';

  try {
    // Convert PDF to base64
    const base64 = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result.split(',')[1]);
      r.onerror = () => rej(new Error('Falha ao ler arquivo'));
      r.readAsDataURL(file);
    });

    document.getElementById('pdfStatusMsg').textContent = 'Enviando para a IA analisar...';

    const catList = catNames().join(', ');
    const prompt = `Você é um extrator de dados financeiros. Analise este extrato bancário em PDF e extraia TODAS as transações.

Retorne SOMENTE um array JSON válido, sem markdown, sem explicações, sem texto antes ou depois.
Formato de cada objeto:
{
  "date": "YYYY-MM-DD",
  "desc": "descrição da transação",
  "amount": 99.99,
  "type": "expense" ou "income"
}

Regras:
- type = "expense" para débitos/compras/saídas/pagamentos
- type = "income" para créditos/depósitos/entradas/receitas  
- amount sempre positivo
- Se a data não tiver ano, use o ano mais provável baseado no documento
- Inclua TODAS as transações visíveis, sem omitir nenhuma
- desc: use a descrição original do extrato, sem cortar`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `Erro da API: ${response.status}`);
    }

    document.getElementById('pdfStatusMsg').textContent = 'Processando resultado...';

    const data = await response.json();
    const rawText = data.content.map(b => b.text || '').join('').trim();

    // Parse JSON — strip any accidental markdown fences
    const jsonStr = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(jsonStr);

    if (!Array.isArray(parsed) || !parsed.length) throw new Error('Nenhuma transação encontrada no PDF.');

    importRows = parsed.map(r => ({
      date: r.date || todayStr(),
      desc: String(r.desc || 'Sem descrição'),
      amount: Math.abs(parseFloat(r.amount) || 0),
      type: r.type === 'income' ? 'income' : 'expense',
      cat: guessCategory(r.desc || ''),
      cardId: cards[0]?.id || 1,
      _skip: false
    })).filter(r => r.amount > 0);

    document.getElementById('pdfProcessing').style.display = 'none';
    renderImportPreview();

  } catch (err) {
    document.getElementById('pdfProcessing').style.display = 'none';
    document.getElementById('dropZone').style.display = '';
    showToast('Erro ao processar PDF: ' + err.message, 'danger', 8000);
  }
}

// ── OFX Parser ──
function parseOFX(text) {
  const rows = [];
  const txBlocks = text.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) || [];
  txBlocks.forEach(block => {
    const get = tag => { const m = block.match(new RegExp(`<${tag}>([^<\n\r]+)`, 'i')); return m ? m[1].trim() : ''; };
    const dtRaw = get('DTPOSTED') || get('DTUSER');
    const date = dtRaw ? `${dtRaw.slice(0,4)}-${dtRaw.slice(4,6)}-${dtRaw.slice(6,8)}` : todayStr();
    const amount = parseFloat(get('TRNAMT').replace(',', '.')) || 0;
    const desc = (get('MEMO') || get('NAME') || 'Sem descrição').replace(/&amp;/g,'&');
    const type = amount < 0 ? 'expense' : 'income';
    rows.push({ date, desc, amount: Math.abs(amount), type, cat: guessCategory(desc), cardId: cards[0]?.id || 1, _skip: false });
  });
  return rows;
}

// ── CSV Auto-detect (Nubank, Inter, C6, Itaú, Bradesco, genérico) ──
function parseCSVAuto(text) {
  const clean = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/^\uFEFF/, '');
  const lines = clean.split('\n').filter(l => l.trim());
  if (lines.length < 2) throw new Error('Arquivo CSV vazio ou inválido.');

  const sep = lines[0].includes(';') ? ';' : ',';
  const header = csvSplit(lines[0], sep).map(h => h.trim().toLowerCase().replace(/"/g, ''));

  const idxDate   = findCol(header, ['data', 'date', 'data lançamento', 'data pagamento', 'data da compra']);
  const idxDesc   = findCol(header, ['descrição', 'descricao', 'description', 'histórico', 'historico', 'title', 'memo', 'estabelecimento']);
  const idxAmt    = findCol(header, ['valor', 'amount', 'value', 'montante', 'vlr']);
  const idxType   = findCol(header, ['tipo', 'type', 'natureza']);
  const idxCredit = findCol(header, ['crédito', 'credito', 'credit', 'entrada']);
  const idxDebit  = findCol(header, ['débito', 'debito', 'debit', 'saída', 'saida']);

  if (idxDate === -1 || idxDesc === -1) throw new Error('Não foi possível identificar colunas de data e descrição.');

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = csvSplit(lines[i], sep).map(c => c.trim().replace(/^"|"$/g, ''));
    if (cols.length < 2 || !cols[idxDate]) continue;

    let dateStr = cols[idxDate] || '';
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) dateStr = dateStr.split('/').reverse().join('-');
    else if (/^\d{2}\/\d{2}\/\d{2}$/.test(dateStr)) { const p = dateStr.split('/'); dateStr = `20${p[2]}-${p[1]}-${p[0]}`; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;

    let amount = 0, type = 'expense';
    if (idxAmt !== -1) {
      const raw = cols[idxAmt].replace(/\./g, '').replace(',', '.').replace(/[^0-9.\-]/g, '');
      amount = parseFloat(raw) || 0;
      type = amount < 0 ? 'expense' : 'income';
      amount = Math.abs(amount);
    } else if (idxCredit !== -1 || idxDebit !== -1) {
      const cr = parseFloat((cols[idxCredit]||'').replace(/\./g,'').replace(',','.')) || 0;
      const db = parseFloat((cols[idxDebit]||'').replace(/\./g,'').replace(',','.')) || 0;
      if (db > 0) { amount = db; type = 'expense'; }
      else if (cr > 0) { amount = cr; type = 'income'; }
    }
    if (amount <= 0) continue;

    if (idxType !== -1) {
      const t = (cols[idxType]||'').toLowerCase();
      type = (t.includes('créd') || t.includes('cred') || t.includes('receita') || t.includes('entrad')) ? 'income' : 'expense';
    }

    const desc = cols[idxDesc] || 'Sem descrição';
    rows.push({ date: dateStr, desc, amount, type, cat: guessCategory(desc), cardId: cards[0]?.id || 1, _skip: false });
  }
  return rows;
}

function findCol(header, variants) {
  for (const v of variants) { const i = header.findIndex(h => h.includes(v)); if (i !== -1) return i; }
  return -1;
}

function csvSplit(line, sep) {
  const result = []; let cur = ''; let inQ = false;
  for (const ch of line) {
    if (ch === '"') inQ = !inQ;
    else if (ch === sep && !inQ) { result.push(cur); cur = ''; }
    else cur += ch;
  }
  result.push(cur);
  return result;
}

function guessCategory(desc) {
  const d = desc.toLowerCase();
  if (/netflix|spotify|amazon prime|disney|hbo|youtube|apple/.test(d)) return 'Assinatura';
  if (/uber|99|taxi|onibus|metrô|metro|combustivel|gasolina|shell|posto|pedágio/.test(d)) return 'Transporte';
  if (/farmácia|drogaria|raia|pacheco|ultrafarma|médico|clinica|hospital|lab/.test(d)) return 'Saúde';
  if (/carrefour|pão de açúcar|extra|atacadao|atacadão|hortifruti|supermercado|mercadinho/.test(d)) return 'Supermercado';
  if (/restaurante|lanchonete|ifood|rappi|mcdonalds|burger|pizza|sushi|padaria|café|bakery|marmita/.test(d)) return 'Alimentação';
  if (/pix|transferência|ted|doc/.test(d)) return 'Pix/Transfer';
  for (const c of categories) { if (d.includes(c.name.toLowerCase())) return c.name; }
  return 'Outro';
}

function renderImportPreview() {
  let newCount = 0, dupCount = 0;
  importRows.forEach(row => {
    const isDup = transactions.some(t =>
      t.date === row.date && Math.abs(t.amount - row.amount) < 0.01 &&
      t.desc.toLowerCase().trim() === row.desc.toLowerCase().trim()
    );
    row._dup = isDup; row._skip = isDup;
    isDup ? dupCount++ : newCount++;
  });

  document.getElementById('dropZone').style.display = 'none';
  document.getElementById('importPreview').style.display = 'block';

  document.getElementById('importStats').innerHTML = `
    <div class="metric"><div class="metric-label">Encontradas</div><div class="metric-value info">${importRows.length}</div></div>
    <div class="metric"><div class="metric-label">Novas</div><div class="metric-value success">${newCount}</div></div>
    <div class="metric"><div class="metric-label">Duplicadas</div><div class="metric-value warn">${dupCount}</div></div>`;

  const catOptions = catNames().map(n => `<option>${n}</option>`).join('');
  const cardOptions = cards.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

  const tableRows = importRows.map((row, i) => `
    <tr class="${row._dup ? 'import-skip' : ''}">
      <td>${row.date.split('-').reverse().join('/')}</td>
      <td title="${row.desc}">${row.desc.length > 22 ? row.desc.slice(0,22)+'…' : row.desc}</td>
      <td style="font-weight:600;color:${row.type==='expense'?'var(--red)':'var(--green)'};">${row.type==='expense'?'-':'+'}${fmt(row.amount)}</td>
      <td><select onchange="importRows[${i}].cat=this.value" ${row._dup?'disabled':''}>${catOptions.replace(`<option>${row.cat}</option>`,`<option selected>${row.cat}</option>`)}</select></td>
      <td><select onchange="importRows[${i}].cardId=parseInt(this.value)" ${row._dup?'disabled':''}>${cardOptions}</select></td>
      <td style="text-align:center;">${row._dup ? '<span title="Duplicada">🔁</span>' : `<input type="checkbox" checked onchange="importRows[${i}]._skip=!this.checked" />`}</td>
    </tr>`).join('');

  document.getElementById('importMapping').innerHTML = `
    <div style="max-height:280px;overflow-y:auto;border:0.5px solid var(--border);border-radius:var(--radius-sm);">
      <table class="import-table">
        <thead><tr><th>Data</th><th>Descrição</th><th>Valor</th><th>Categoria</th><th>Cartão</th><th>✓</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>`;
}

function confirmImport() {
  const toImport = importRows.filter(r => !r._skip);
  if (!toImport.length) { showToast('Nenhuma transação selecionada.', 'warn'); return; }

  toImport.forEach(row => {
    transactions.unshift({ id: nextId++, date: row.date, desc: row.desc, cat: row.cat, type: row.type, amount: row.amount, cardId: row.cardId });
  });
  save('jpfin_tx', transactions);

  // Check goals after import
  const bycat = {};
  toImport.filter(r => r.type === 'expense').forEach(r => { bycat[r.cat] = (bycat[r.cat]||0) + r.amount; });
  Object.entries(bycat).forEach(([cat]) => {
    if (goals.expense && goals.expense[cat]) {
      const limit = goals.expense[cat];
      const spent = getMonthTx().filter(t => t.type === 'expense' && t.cat === cat).reduce((s,t) => s+t.amount, 0);
      if (spent / limit >= 0.8) triggerEmailAlert(cat, spent, limit);
    }
  });

  closeImportModal();
  const btn = document.querySelector('[onclick*="lancamentos"]');
  if (btn) goPage('lancamentos', btn);
  showToast(`✅ ${toImport.length} transação(ões) importada(s) com sucesso!`, 'success', 4000);
  render();
}

render();
