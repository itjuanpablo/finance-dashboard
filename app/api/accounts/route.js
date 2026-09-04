import { NextResponse } from 'next/server';
import { t } from '@/lib/i18n';
import { getDb, ACTIVE_TX, BASE_CURRENCY } from '@/lib/db';
import { isValidIsoDate } from '@/lib/date';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function accountPayload(db) {
  const accounts = db.prepare('SELECT * FROM accounts ORDER BY archived, id').all();
  const bindings = db.prepare(
    'SELECT source, account_id FROM source_bindings WHERE account_id IS NOT NULL').all();
  // Duas consultas, e a diferença entre elas é o ponto: o saldo de uma conta só
  // pode somar movimentos NA MOEDA DELA. Misturar dólar com real numa conta
  // daria um saldo que nunca existiu — e plausível, que é o pior tipo.
  const saldoBase = db.prepare(`
    SELECT COALESCE(SUM(amount_cents), 0) AS s FROM transactions
    WHERE ${ACTIVE_TX} AND ${BASE_CURRENCY} AND date >= ? AND source IN (
      SELECT source FROM source_bindings WHERE account_id = ?
    )`);
  const saldoMoeda = db.prepare(`
    SELECT COALESCE(SUM(amount_cents), 0) AS s FROM transactions
    WHERE ${ACTIVE_TX} AND currency = ? AND date >= ? AND source IN (
      SELECT source FROM source_bindings WHERE account_id = ?
    )`);
  const enriched = accounts.map(a => ({
    ...a,
    sources: bindings.filter(b => b.account_id === a.id).map(b => b.source),
    balance_cents: a.initial_cents + (a.currency
      ? saldoMoeda.get(a.currency, a.initial_date, a.id).s
      : saldoBase.get(a.initial_date, a.id).s),
  }));
  // origens conhecidas = tudo que já apareceu em importações
  const knownSources = db.prepare(
    'SELECT DISTINCT source FROM transactions UNION SELECT DISTINCT kind FROM batches')
    .all().map(r => r.source || r.kind).filter(Boolean);
  // Sugestões, nunca uma alteração automática: valores iguais em sentidos
  // opostos podem coincidir por acaso. A pessoa confirma na tela antes de o
  // lançamento deixar de contar como receita/despesa.
  const transferSuggestions = db.prepare(`
    SELECT a.id AS out_id, b.id AS in_id, a.date AS out_date, b.date AS in_date,
           a.description AS out_description, b.description AS in_description,
           ABS(a.amount_cents) AS amount_cents, a.account_id AS out_account_id,
           b.account_id AS in_account_id
    FROM transactions a JOIN transactions b
      ON a.amount_cents = -b.amount_cents
     AND a.account_id <> b.account_id
     AND a.date BETWEEN date(b.date, '-2 days') AND date(b.date, '+2 days')
     AND a.id < b.id
    WHERE ${ACTIVE_TX.replaceAll('has_children', 'a.has_children').replaceAll('deleted_at', 'a.deleted_at')}
      AND b.deleted_at IS NULL AND b.has_children = 0
      AND a.transfer = 0 AND b.transfer = 0
      AND a.account_id IS NOT NULL AND b.account_id IS NOT NULL
    ORDER BY a.date DESC LIMIT 12
  `).all();
  return { accounts: enriched, knownSources: [...new Set(knownSources)].sort(), transferSuggestions };
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
  const { name, institution, kind, initial_cents, initial_date, sources, currency } = await request.json();
  if (!name || !String(name).trim()) {
    return NextResponse.json({ error: t('api.nameRequired') }, { status: 400 });
  }
  const initialDate = initial_date || '1970-01-01';
  if (!isValidIsoDate(initialDate)) {
    return NextResponse.json({ error: t('api.invalidDate') }, { status: 400 });
  }
  const db = getDb();
  db.exec('BEGIN');
  try {
    const res = db.prepare(`
      INSERT INTO accounts (name, institution, kind, initial_cents, initial_date, currency)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(String(name).trim(), String(institution || '').trim(),
      kind || 'corrente', Math.round(initial_cents || 0), initialDate,
      // Vazio vira NULL, e NULL quer dizer "moeda da instalação". Guardar 'BRL'
      // numa instalação brasileira seria repetir o padrão em cada linha e criar
      // dois jeitos de dizer a mesma coisa.
      currency ? String(currency).toUpperCase() : null);
    bindSources(db, sources, res.lastInsertRowid);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
  return NextResponse.json(accountPayload(db));
}

export async function PATCH(request) {
  const { id, name, institution, kind, initial_cents, initial_date, sources, archived, currency } = await request.json();
  const db = getDb();
  if (!db.prepare('SELECT 1 FROM accounts WHERE id = ?').get(id)) {
    return NextResponse.json({ error: t('api.accountNotFound') }, { status: 404 });
  }
  if (initial_date !== undefined && !isValidIsoDate(initial_date)) {
    return NextResponse.json({ error: t('api.invalidDate') }, { status: 400 });
  }
  db.exec('BEGIN');
  try {
    db.prepare(`
      UPDATE accounts SET
        name = COALESCE(?, name), institution = COALESCE(?, institution),
        kind = COALESCE(?, kind), initial_cents = COALESCE(?, initial_cents),
        initial_date = COALESCE(?, initial_date), archived = COALESCE(?, archived),
        currency = COALESCE(?, currency)
      WHERE id = ?
    `).run(name ?? null, institution ?? null, kind ?? null,
      initial_cents != null ? Math.round(initial_cents) : null,
      initial_date ?? null, archived != null ? (archived ? 1 : 0) : null,
      // String vazia = "voltar para a moeda da instalação"; undefined = não mexer.
      currency === undefined ? null : (currency ? String(currency).toUpperCase() : null),
      id);
    if (sources !== undefined) bindSources(db, sources, id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
  return NextResponse.json(accountPayload(db));
}
