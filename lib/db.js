// SQLite embutido do Node (>= 22.13) — sem dependência nativa, sem compilação.
// Inicialização preguiçosa + migração automática: bancos criados em versões
// anteriores ganham as tabelas/colunas novas sem perder nada.
import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';

// Cores/emoji iniciais — após o primeiro uso, a fonte da verdade é a tabela `categories`.
export const CATEGORY_SEED = [
  ['Alimentação',    '#f97316', '🍔'],
  ['Transporte',     '#3b82f6', '🚗'],
  ['Moradia',        '#8b5cf6', '🏠'],
  ['Compras',        '#ec4899', '🛍️'],
  ['Lazer',          '#a855f7', '🎮'],
  ['Viagem',         '#06b6d4', '✈️'],
  ['Saúde',          '#14b8a6', '💊'],
  ['Assinaturas',    '#eab308', '📺'],
  ['Financeiro',     '#f43f5e', '🏦'],
  ['Renda',          '#22c55e', '💰'],
  ['Transferências', '#64748b', '🔁'],
  ['A revisar',      '#94a3b8', '❓'],
];

// Categorias de sistema: não podem ser renomeadas nem excluídas.
export const SYSTEM_CATEGORIES = ['Transferências', 'A revisar'];

function ensureColumns(db, table, cols) {
  const existing = new Set(
    db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name));
  for (const [name, ddl] of Object.entries(cols)) {
    if (!existing.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${ddl}`);
  }
}

function createDb() {
  const dir = process.env.FLUXO_DATA_DIR || path.join(process.cwd(), 'data');
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, 'fluxo.db'));
  try {
    db.exec('PRAGMA journal_mode = WAL;');
  } catch {
    // alguns filesystems não suportam WAL; o journal padrão resolve
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_name TEXT NOT NULL,
      kind TEXT NOT NULL,
      inserted INTEGER NOT NULL DEFAULT 0,
      skipped INTEGER NOT NULL DEFAULT 0,
      imported_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      category TEXT NOT NULL,
      transfer INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL,
      external_id TEXT,
      hash TEXT NOT NULL UNIQUE,
      batch_id INTEGER REFERENCES batches(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date);
    CREATE TABLE IF NOT EXISTS rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS goals (
      category TEXT PRIMARY KEY,
      limit_cents INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL,
      emoji TEXT NOT NULL DEFAULT '',
      archived INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      institution TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT 'corrente',
      initial_cents INTEGER NOT NULL DEFAULT 0,
      initial_date TEXT NOT NULL DEFAULT '1970-01-01',
      archived INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      last4 TEXT NOT NULL DEFAULT '',
      limit_cents INTEGER NOT NULL DEFAULT 0,
      closing_day INTEGER NOT NULL DEFAULT 1,
      due_day INTEGER NOT NULL DEFAULT 10,
      archived INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS source_bindings (
      source TEXT PRIMARY KEY,
      account_id INTEGER REFERENCES accounts(id),
      card_id INTEGER REFERENCES cards(id)
    );
    CREATE TABLE IF NOT EXISTS bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      category TEXT NOT NULL,
      due_day INTEGER NOT NULL,
      frequency TEXT NOT NULL DEFAULT 'mensal',
      due_month INTEGER,
      match_pattern TEXT NOT NULL DEFAULT '',
      tolerance_pct INTEGER NOT NULL DEFAULT 10,
      archived INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS bill_payments (
      bill_id INTEGER NOT NULL REFERENCES bills(id),
      ref TEXT NOT NULL,
      paid_at TEXT NOT NULL DEFAULT (datetime('now')),
      tx_id INTEGER,
      PRIMARY KEY (bill_id, ref)
    );
  `);

  // migração: colunas novas em bancos antigos
  ensureColumns(db, 'goals', {
    rollover: 'INTEGER NOT NULL DEFAULT 0', // sobra/estouro do mês anterior ajusta o orçamento
  });
  ensureColumns(db, 'transactions', {
    deleted_at: 'TEXT',
    original_date: 'TEXT',
    original_description: 'TEXT',
    original_amount_cents: 'INTEGER',
    account_id: 'INTEGER',
    invoice_ref: 'TEXT', // competência da fatura (AAAA-MM), gravada na importação
  });

  // seed de categorias na primeira execução
  const count = db.prepare('SELECT COUNT(*) AS n FROM categories').get().n;
  if (count === 0) {
    const ins = db.prepare(
      'INSERT INTO categories (name, color, emoji, sort_order) VALUES (?, ?, ?, ?)');
    CATEGORY_SEED.forEach(([name, color, emoji], i) => ins.run(name, color, emoji, i));
  }

  return db;
}

// singleton — sobrevive ao hot reload do Next em dev
export function getDb() {
  const g = globalThis;
  return g.__fluxoDb ?? (g.__fluxoDb = createDb());
}

/** Categorias ativas como { nome: cor } (contrato usado pelo dashboard) */
export function categoryColors(db) {
  const map = {};
  db.prepare('SELECT name, color FROM categories WHERE archived = 0 ORDER BY sort_order, id')
    .all().forEach(c => { map[c.name] = c.color; });
  return map;
}

/** Valida nome de categoria contra o banco (ativas) */
export function isValidCategory(db, name) {
  return !!db.prepare('SELECT 1 FROM categories WHERE name = ? AND archived = 0').get(name);
}
