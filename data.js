/**
 * data.js — estado global, seeds e helpers de persistência
 * Finanças Pessoais — Juan Pablo Ladeira
 */

// ─── Persistência ────────────────────────────────────────────────────────────

function load(key, def) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; }
  catch (e) { return def; }
}

function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
}

// ─── Categorias padrão ───────────────────────────────────────────────────────

const DEFAULT_CATS = [
  { id: 'alimentacao',  name: 'Alimentação',    icon: '🍽️', bar: '#BA7517', bg: '#FAEEDA', text: '#412402', custom: false },
  { id: 'supermercado', name: 'Supermercado',   icon: '🛒', bar: '#1D9E75', bg: '#E1F5EE', text: '#085041', custom: false },
  { id: 'transporte',   name: 'Transporte',     icon: '🚗', bar: '#185FA5', bg: '#E6F1FB', text: '#042C53', custom: false },
  { id: 'saude',        name: 'Saúde',          icon: '💊', bar: '#E24B4A', bg: '#FCEBEB', text: '#501313', custom: false },
  { id: 'lazer',        name: 'Lazer',          icon: '🎉', bar: '#D4537E', bg: '#FBEAF0', text: '#4B1528', custom: false },
  { id: 'assinatura',   name: 'Assinatura',     icon: '📱', bar: '#7F77DD', bg: '#EEEDFE', text: '#26215C', custom: false },
  { id: 'cartao',       name: 'Cartão Crédito', icon: '💳', bar: '#888780', bg: '#F1EFE8', text: '#2C2C2A', custom: false },
  { id: 'pix',          name: 'Pix/Transfer',   icon: '📲', bar: '#639922', bg: '#EAF3DE', text: '#173404', custom: false },
  { id: 'salario',      name: 'Salário',        icon: '💰', bar: '#1D9E75', bg: '#E1F5EE', text: '#085041', custom: false },
  { id: 'outro',        name: 'Outro',          icon: '📦', bar: '#888780', bg: '#F1EFE8', text: '#2C2C2A', custom: false },
];

// ─── Seeds ───────────────────────────────────────────────────────────────────

const SEED_TX = [
  { id:1,  date:'2025-09-12', desc:'Anastecedora Janorágid',   cat:'Assinatura',    type:'expense', amount:18.00,   cardId:1 },
  { id:2,  date:'2025-09-12', desc:'DaxeTecnologia',            cat:'Assinatura',    type:'expense', amount:29.00,   cardId:1 },
  { id:3,  date:'2025-09-12', desc:'Marmita Tia Alice',         cat:'Alimentação',   type:'expense', amount:20.00,   cardId:1 },
  { id:4,  date:'2025-09-12', desc:'Rodrigo Paulo',             cat:'Pix/Transfer',  type:'expense', amount:104.00,  cardId:2 },
  { id:5,  date:'2025-09-13', desc:'Empório Português',         cat:'Alimentação',   type:'expense', amount:84.28,   cardId:1 },
  { id:6,  date:'2025-09-13', desc:'Supermercados Alvorada',    cat:'Supermercado',  type:'expense', amount:15.99,   cardId:1 },
  { id:7,  date:'2025-09-13', desc:'Fed Snt Pohso Alegre',      cat:'Transporte',    type:'expense', amount:270.00,  cardId:2 },
  { id:8,  date:'2025-09-15', desc:'Marmita Tia Alice',         cat:'Alimentação',   type:'expense', amount:20.00,   cardId:1 },
  { id:9,  date:'2025-09-18', desc:'Oficina de Pizza',          cat:'Alimentação',   type:'expense', amount:20.00,   cardId:1 },
  { id:10, date:'2025-09-21', desc:'RestaurantePorto',          cat:'Alimentação',   type:'expense', amount:40.00,   cardId:1 },
  { id:11, date:'2025-09-22', desc:'Supermercados Alvorada',    cat:'Supermercado',  type:'expense', amount:21.49,   cardId:1 },
  { id:12, date:'2025-09-24', desc:'Shups Sorveteria',          cat:'Alimentação',   type:'expense', amount:146.00,  cardId:1 },
  { id:13, date:'2025-09-30', desc:'Center Nox',                cat:'Assinatura',    type:'expense', amount:33.27,   cardId:1 },
  { id:14, date:'2025-10-01', desc:'Marmita Tia Alice',         cat:'Alimentação',   type:'expense', amount:20.00,   cardId:1 },
  { id:15, date:'2025-10-02', desc:'Dubelato',                  cat:'Alimentação',   type:'expense', amount:19.00,   cardId:1 },
  { id:16, date:'2025-10-03', desc:'PR Padaria e Confeitaria',  cat:'Alimentação',   type:'expense', amount:41.05,   cardId:1 },
  { id:17, date:'2025-10-04', desc:'Fed Snt Pohso Alegre',      cat:'Transporte',    type:'expense', amount:15.00,   cardId:2 },
  { id:18, date:'2025-10-06', desc:'Raia163',                   cat:'Saúde',         type:'expense', amount:55.17,   cardId:1 },
  { id:19, date:'2025-10-07', desc:'Restaurante Est Caipira',   cat:'Alimentação',   type:'expense', amount:111.40,  cardId:1 },
  { id:20, date:'2025-10-08', desc:'CEA Rao 220 Parcela 1/3',   cat:'Cartão Crédito',type:'expense', amount:273.33,  cardId:1 },
  { id:21, date:'2025-10-04', desc:'Pagamento fatura outubro',  cat:'Cartão Crédito',type:'expense', amount:3013.41, cardId:2 },
];

const SEED_CARDS = [
  { id:1, name:'Mercado Pago Visa', type:'credit', color:'#185FA5' },
  { id:2, name:'Pix / Conta',       type:'pix',    color:'#1D9E75' },
];

const SEED_GOALS = {
  expense: { Alimentação:400, Supermercado:300, Transporte:200, Lazer:200, Assinatura:100 },
  income:  {}
};

const SEED_REC = [
  { id:1, desc:'Netflix',           amount:55.90, cat:'Assinatura',  type:'expense', day:10, cardId:1 },
  { id:2, desc:'Marmita Tia Alice', amount:20.00, cat:'Alimentação', type:'expense', day:1,  cardId:1 },
];

// ─── Estado reativo ──────────────────────────────────────────────────────────

let transactions = load('jpfin_tx',    SEED_TX);
let cards        = load('jpfin_cards', SEED_CARDS);
let goals        = load('jpfin_goals', SEED_GOALS);
let recurring    = load('jpfin_rec',   SEED_REC);
let categories   = load('jpfin_cats',  DEFAULT_CATS);
let alertEmail   = load('jpfin_email', '');

let nextId     = Math.max(1, ...transactions.map(t => t.id)) + 1;
let nextCardId = Math.max(1, ...cards.map(c => c.id)) + 1;
let nextRecId  = Math.max(1, ...recurring.map(r => r.id)) + 1;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const TYPE_LABELS = { credit:'Crédito', debit:'Débito', pix:'Pix/Conta' };

const fmt = v => 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits:2, maximumFractionDigits:2 });
const todayStr = () => new Date().toISOString().split('T')[0];

function getCat(name) {
  return categories.find(c => c.name === name)
    || { bar:'#888780', bg:'#F1EFE8', text:'#2C2C2A', icon:'📦' };
}

function catNames() { return categories.map(c => c.name); }

function populateCatSelects() {
  ['txCat','recCat','goalCat'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const cur = el.value;
    el.innerHTML = catNames().map(n => `<option>${n}</option>`).join('');
    if (cur) el.value = cur;
  });
}

function populateCardSelects() {
  ['txCard','recCard'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = cards.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  });
}
