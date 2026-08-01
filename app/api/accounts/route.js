import { NextResponse } from 'next/server';
import { t } from '@/lib/i18n';
import { getDb, ACTIVE_TX } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function accountPayload(db) {
  const accounts = db.prepare('SELECT * FROM accounts ORDER BY archived, id').all();
  const bindings = db.prepare(
    'SELECT source, account_id FROM source_bindings WHERE account_id IS NOT NULL').all();
  const balanceStmt = db.prepare(`
    SELECT COALESCE(SUM(amount_cents), 0) AS s FROM transactions
    WHERE ${ACTIVE_TX} AND date >= ? AND source IN (
      SELECT source FROM source_bindings WHERE account_id = ?
    )`);
  const enriched = accounts.map(a => ({
    ...a,
    sources: bindings.filter(b => b.account_id === a.id).map(b => b.source),
    balance_cents: a.initial_cents + balanceStmt.get(a.initial_date, a.id).s,
  }));
  // origens conhecidas = tudo que já apareceu em importações
  const knownSources = db.prepare(
    'SELECT DISTINCT source FROM transactions UNION SELECT DISTINCT kind FROM batches')
    .all().map(r => r.source || r.kind).filter(Boolean);
  return { accounts: enriched, knownSources: [...new Set(knownSources)].sort() };
}

export async function GET() {
  return NextResponse.json(accountPayload(getDb()));
}

function bindSources(db, sources, accountId) {
  db.prepare('UPDATE source_bindings SET account_id = NULL WHERE account_id = ?').run(accountId);
  for (const s of sources || []) {
    db.prepare(`
      INSERT INTO source_bindings (source, account_id) VALUES (?, ?)
      ON CONFLICT(source) DO UPDATE SET account_id = excluded.account_id
    `).run(s, accountId);
  }
  // vínculo retroativo: transações dessas origens passam a apontar para a conta
  const ph = (sources || []).map(() => '?').join(',');
  if (ph) {
    db.prepare(`UPDATE transactions SET account_id = ? WHERE source IN (${ph})`)
      .run(accountId, ...sources);
  }
}

export async function POST(request) {
  const { name, institution, kind, initial_cents, initial_date, sources } = await request.json();
  if (!name || !String(name).trim()) {
    return NextResponse.json({ error: t('api.nameRequired') }, { status: 400 });
  }
  const db = getDb();
  db.exec('BEGIN');
  try {
    const res = db.prepare(`
      INSERT INTO accounts (name, institution, kind, initial_cents, initial_date)
      VALUES (?, ?, ?, ?, ?)
    `).run(String(name).trim(), String(institution || '').trim(),
      kind || 'corrente', Math.round(initial_cents || 0), initial_date || '1970-01-01');
    bindSources(db, sources, res.lastInsertRowid);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
  return NextResponse.json(accountPayload(db));
}

export async function PATCH(request) {
  const { id, name, institution, kind, initial_cents, initial_date, sources, archived } = await request.json();
  const db = getDb();
  if (!db.prepare('SELECT 1 FROM accounts WHERE id = ?').get(id)) {
    return NextResponse.json({ error: t('api.accountNotFound') }, { status: 404 });
  }
  db.exec('BEGIN');
  try {
    db.prepare(`
      UPDATE accounts SET
        name = COALESCE(?, name), institution = COALESCE(?, institution),
        kind = COALESCE(?, kind), initial_cents = COALESCE(?, initial_cents),
        initial_date = COALESCE(?, initial_date), archived = COALESCE(?, archived)
      WHERE id = ?
    `).run(name ?? null, institution ?? null, kind ?? null,
      initial_cents != null ? Math.round(initial_cents) : null,
      initial_date ?? null, archived != null ? (archived ? 1 : 0) : null, id);
    if (sources !== undefined) bindSources(db, sources, id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
  return NextResponse.json(accountPayload(db));
}
