import { NextResponse } from 'next/server';
import { t } from '@/lib/i18n';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Último fechamento: se hoje é dia > closing_day, fechou neste mês; senão, no anterior.
function lastClosingDate(closingDay) {
  const now = new Date();
  let y = now.getFullYear(), m = now.getMonth();
  if (now.getDate() <= closingDay) m -= 1;
  if (m < 0) { m = 11; y -= 1; }
  const day = Math.min(closingDay, new Date(y, m + 1, 0).getDate());
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function cardPayload(db) {
  const cards = db.prepare('SELECT * FROM cards ORDER BY archived, id').all();
  const bindings = db.prepare(
    'SELECT source, card_id FROM source_bindings WHERE card_id IS NOT NULL').all();
  const openStmt = db.prepare(`
    SELECT COALESCE(SUM(-amount_cents), 0) AS s FROM transactions
    WHERE deleted_at IS NULL AND amount_cents < 0 AND transfer = 0 AND date > ?
      AND source IN (SELECT source FROM source_bindings WHERE card_id = ?)`);
  const enriched = cards.map(c => {
    const closing = lastClosingDate(c.closing_day);
    return {
      ...c,
      sources: bindings.filter(b => b.card_id === c.id).map(b => b.source),
      last_closing: closing,
      open_invoice_cents: openStmt.get(closing, c.id).s,
    };
  });
  return { cards: enriched };
}

export async function GET() {
  return NextResponse.json(cardPayload(getDb()));
}

function bindSources(db, sources, cardId) {
  db.prepare('UPDATE source_bindings SET card_id = NULL WHERE card_id = ?').run(cardId);
  for (const s of sources || []) {
    db.prepare(`
      INSERT INTO source_bindings (source, card_id) VALUES (?, ?)
      ON CONFLICT(source) DO UPDATE SET card_id = excluded.card_id
    `).run(s, cardId);
  }
}

export async function POST(request) {
  const { name, last4, limit_cents, closing_day, due_day, sources } = await request.json();
  if (!name || !String(name).trim()) {
    return NextResponse.json({ error: t('api.nameRequired') }, { status: 400 });
  }
  const cd = Math.min(Math.max(Math.round(closing_day || 1), 1), 28);
  const dd = Math.min(Math.max(Math.round(due_day || 10), 1), 28);
  const db = getDb();
  db.exec('BEGIN');
  try {
    const res = db.prepare(`
      INSERT INTO cards (name, last4, limit_cents, closing_day, due_day)
      VALUES (?, ?, ?, ?, ?)
    `).run(String(name).trim(), String(last4 || '').slice(-4),
      Math.round(limit_cents || 0), cd, dd);
    bindSources(db, sources, res.lastInsertRowid);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
  return NextResponse.json(cardPayload(db));
}

export async function PATCH(request) {
  const { id, name, last4, limit_cents, closing_day, due_day, sources, archived } = await request.json();
  const db = getDb();
  if (!db.prepare('SELECT 1 FROM cards WHERE id = ?').get(id)) {
    return NextResponse.json({ error: t('api.cardNotFound') }, { status: 404 });
  }
  db.exec('BEGIN');
  try {
    db.prepare(`
      UPDATE cards SET
        name = COALESCE(?, name), last4 = COALESCE(?, last4),
        limit_cents = COALESCE(?, limit_cents),
        closing_day = COALESCE(?, closing_day), due_day = COALESCE(?, due_day),
        archived = COALESCE(?, archived)
      WHERE id = ?
    `).run(name ?? null, last4 != null ? String(last4).slice(-4) : null,
      limit_cents != null ? Math.round(limit_cents) : null,
      closing_day != null ? Math.min(Math.max(Math.round(closing_day), 1), 28) : null,
      due_day != null ? Math.min(Math.max(Math.round(due_day), 1), 28) : null,
      archived != null ? (archived ? 1 : 0) : null, id);
    if (sources !== undefined) bindSources(db, sources, id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
  return NextResponse.json(cardPayload(db));
}
