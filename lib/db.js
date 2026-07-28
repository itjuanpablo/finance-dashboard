// SQLite embutido do Node (>= 22.13) — sem dependência nativa, sem compilação.
// Inicialização preguiçosa + migração automática: bancos criados em versões
// anteriores ganham as tabelas/colunas novas sem perder nada.
import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import {
  CAT,
  CATEGORY_SEED,
  SYSTEM_CATEGORIES,
  LEGACY_NAME_TO_KEY,
  normalizeName,
  slugifyCategory,
  isCanonicalKey,
} from './categories.js';
import { t, catLabel } from './i18n/index.js';
import { setActive } from './locale-state.js';
import { BUILD_LOCALE, isSupportedLocale, defaultCurrencyFor } from './config.js';

// Versão do esquema (PRAGMA user_version). Histórico:
//   0–3  categorias identificadas pelo nome em português (Fluxo v1–v3.2)
//   4    categorias identificadas por chave estável (internacionalização)
//   5    tabela `settings` (idioma e moeda escolhidos na tela)
const SCHEMA_VERSION = 5;

export { CATEGORY_SEED, SYSTEM_CATEGORIES, CAT };

export const dataDir = () =>
  process.env.FLUXO_DATA_DIR || path.join(process.cwd(), 'data');

function ensureColumns(db, table, cols) {
  const existing = new Set(
    db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name));
  for (const [name, ddl] of Object.entries(cols)) {
    if (!existing.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${ddl}`);
  }
}

/**
 * Cópia datada do banco. Roda após cada importação (mantém as 30 últimas) e
 * antes de migração destrutiva — nesse caso com prefixo próprio, para a cópia
 * pré-migração não ser descartada pela rotação das cópias de importação.
 */
export function backupDb(db, tag = '') {
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    const dir = dataDir();
    const bdir = path.join(dir, 'backups');
    fs.mkdirSync(bdir, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    const dest = path.join(bdir, `fluxo-${tag ? `${tag}-` : ''}${stamp}.db`);
    fs.copyFileSync(path.join(dir, 'fluxo.db'), dest);
    if (!tag) {
      // rotação só das cópias automáticas de importação (fluxo-AAAAMMDD…)
      const olds = fs.readdirSync(bdir).filter(f => /^fluxo-\d/.test(f)).sort();
      while (olds.length > 30) fs.unlinkSync(path.join(bdir, olds.shift()));
    }
    return dest;
  } catch {
    // backup é conveniência: nunca pode derrubar uma importação
    return null;
  }
}

/**
 * v3 → v4: categorias passam a ser identificadas por chave estável.
 *
 * Antes, o nome em português era o identificador, copiado em
 * transactions.category, rules.category, goals.category e bills.category.
 * Aqui cada categoria recebe uma chave e todas as referências são reescritas
 * numa única transação. Categorias criadas pelo usuário (não reconhecidas pelo
 * mapa de nomes históricos) viram `custom = 1` e mantêm o nome digitado:
 * traduzir o "Dízimo" de alguém seria presunção do programa.
 *
 * @returns {Array<{oldName: string, key: string, custom: number}>|null}
 *          o mapeamento aplicado, ou null se não havia nada a migrar
 */
function migrateCategoryKeys(db) {
  const rows = db.prepare('SELECT id, name, key FROM categories').all();
  const pending = rows.filter(r => !r.key);
  if (!pending.length) return null;

  backupDb(db, 'pre-v4');

  const used = new Set(rows.filter(r => r.key).map(r => r.key));
  const mapping = [];
  for (const r of pending) {
    const known = LEGACY_NAME_TO_KEY[normalizeName(r.name)];
    const base = known && !used.has(known) ? known : slugifyCategory(r.name);
    let key = base, i = 2;
    while (used.has(key)) key = `${base}-${i++}`; // nomes que normalizam igual
    used.add(key);
    mapping.push({
      id: r.id,
      oldName: r.name,
      key,
      custom: isCanonicalKey(key) ? 0 : 1,
    });
  }

  db.exec('BEGIN');
  try {
    const setKey = db.prepare('UPDATE categories SET key = ?, custom = ? WHERE id = ?');
    const updaters = ['transactions', 'rules', 'goals', 'bills'].map(tb =>
      db.prepare(`UPDATE ${tb} SET category = ? WHERE category = ?`));

    for (const m of mapping) {
      setKey.run(m.key, m.custom, m.id);
      // `name` NÃO é reescrito: para chave canônica o nome exibido vem de i18n,
      // e sobrescrever aqui poderia colidir com o UNIQUE de uma categoria que o
      // usuário criou com esse mesmo nome no outro idioma.
      updaters.forEach(u => u.run(m.key, m.oldName));
    }
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_cat_key ON categories(key)');
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw new Error(
      `Falha na migração de categorias para chaves (v4): ${e.message}. ` +
      'O banco não foi alterado; há uma cópia em data/backups/fluxo-pre-v4-*.db');
  }
  return mapping;
}

function createDb() {
  const dir = dataDir();
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
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
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
  ensureColumns(db, 'categories', {
    key: 'TEXT',
    custom: 'INTEGER NOT NULL DEFAULT 0',
  });

  const count = db.prepare('SELECT COUNT(*) AS n FROM categories').get().n;
  if (count === 0) {
    // primeira execução: chave canônica + nome no idioma da instância
    const ins = db.prepare(
      'INSERT INTO categories (key, name, color, emoji, sort_order, custom) VALUES (?, ?, ?, ?, ?, 0)');
    CATEGORY_SEED.forEach(([key, color, emoji], i) =>
      ins.run(key, t(`cat.${key}`), color, emoji, i));
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_cat_key ON categories(key)');
  } else {
    migrateCategoryKeys(db);
  }

  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version < SCHEMA_VERSION) db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);

  // Primeira execução: a escolha do .env vira o valor inicial de settings. A
  // partir daí quem manda é a tela — o .env passa a ser só semente.
  seedSettings(db);
  publishLocale(db);

  return db;
}

// ── settings: preferências da instalação ────────────────────────────────────

/** Valor de uma preferência, ou `fallback` se não existir. */
export function getSetting(db, key, fallback = null) {
  return db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? fallback;
}

/** Grava uma preferência. Locale/moeda passam a valer no próximo render. */
export function setSetting(db, key, value) {
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, String(value));
  if (key === 'locale' || key === 'currency') publishLocale(db);
}

function seedSettings(db) {
  if (getSetting(db, 'locale') == null) {
    setSetting(db, 'locale', BUILD_LOCALE);
  }
  if (getSetting(db, 'currency') == null) {
    // Moeda nasce derivada do idioma, mas depois vive por conta própria: trocar
    // o idioma não pode reinterpretar valores já gravados (ver lib/config.js).
    setSetting(db, 'currency',
      process.env.NEXT_PUBLIC_FLUXO_CURRENCY || defaultCurrencyFor(BUILD_LOCALE));
  }
}

/**
 * Empurra a escolha do banco para lib/locale-state.js, de onde lib/config.js lê.
 * Roda ao abrir o banco e a cada gravação — assim qualquer código de servidor
 * que já tenha chamado getDb() traduz no idioma certo sem receber parâmetro.
 */
function publishLocale(db) {
  const locale = getSetting(db, 'locale');
  setActive({
    locale: isSupportedLocale(locale) ? locale : BUILD_LOCALE,
    currency: getSetting(db, 'currency') || undefined,
  });
}

/** Idioma e moeda ativos, para o servidor injetar no HTML. */
export function localeSettings(db) {
  const locale = getSetting(db, 'locale');
  return {
    locale: isSupportedLocale(locale) ? locale : BUILD_LOCALE,
    currency: getSetting(db, 'currency') || defaultCurrencyFor(BUILD_LOCALE),
  };
}

// singleton — sobrevive ao hot reload do Next em dev
export function getDb() {
  const g = globalThis;
  return g.__fluxoDb ?? (g.__fluxoDb = createDb());
}

/** Migração exposta para o script de linha de comando (scripts/migrar-v4.mjs). */
export { migrateCategoryKeys };

/**
 * Categorias com o nome de exibição já resolvido (`label`): traduzido quando a
 * chave é canônica, o nome digitado quando é do usuário.
 */
export function categoryRows(db, { includeArchived = false } = {}) {
  const where = includeArchived ? '' : 'WHERE archived = 0';
  return db
    .prepare(`SELECT id, key, name, color, emoji, archived, sort_order, custom
              FROM categories ${where} ORDER BY sort_order, id`)
    .all()
    .map(c => ({
      ...c,
      label: catLabel(c.key, c.name, c.custom),
      system: SYSTEM_CATEGORIES.includes(c.key),
    }));
}

/** Categorias ativas como { chave: cor } (contrato usado pelo dashboard) */
export function categoryColors(db) {
  const map = {};
  db.prepare('SELECT key, color FROM categories WHERE archived = 0 ORDER BY sort_order, id')
    .all().forEach(c => { map[c.key] = c.color; });
  return map;
}

/** Valida chave de categoria contra o banco (ativas) */
export function isValidCategory(db, key) {
  return !!db.prepare('SELECT 1 FROM categories WHERE key = ? AND archived = 0').get(key);
}

/** Chave → nome de exibição, para rótulos montados no servidor (insights, relatório). */
export function categoryLabeler(db) {
  const rows = new Map(
    db.prepare('SELECT key, name, custom FROM categories').all().map(r => [r.key, r]));
  return (key) => {
    const r = rows.get(key);
    return catLabel(key, r?.name, r?.custom);
  };
}
