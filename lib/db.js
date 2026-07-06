// SQLite embutido do Node (>= 22.13) — sem dependência nativa, sem compilação.
// Inicialização preguiçosa: o banco só abre na primeira requisição,
// nunca durante o build do Next.
import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';

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
  `);
  return db;
}

// singleton — sobrevive ao hot reload do Next em dev
export function getDb() {
  const g = globalThis;
  return g.__fluxoDb ?? (g.__fluxoDb = createDb());
}
