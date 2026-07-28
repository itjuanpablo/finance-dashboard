import { NextResponse } from 'next/server';
import { t } from '@/lib/i18n';
import { getDb, isValidCategory } from '@/lib/db';
import { computeBills } from '@/lib/bills';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDb();
  return NextResponse.json(computeBills(db));
}

// `b.category` é CHAVE (bills.category), validada contra categories.key.
function validate(db, b) {
  if (!b.description?.trim()) return t('api.descRequired');
  if (!Number.isFinite(b.amount_cents) || Math.round(b.amount_cents) <= 0) return t('api.invalidAmount');
  if (!isValidCategory(db, b.category)) return t('api.invalidCategory');
  if (!(b.due_day >= 1 && b.due_day <= 28)) return 'Dia de vencimento entre 1 e 28';
  if (!['mensal', 'anual'].includes(b.frequency)) return t('api.invalidFrequency');
  if (b.frequency === 'anual' && !(b.due_month >= 1 && b.due_month <= 12)) return 'Mês de vencimento inválido';
  return null;
}

export async function POST(request) {
  const b = await request.json();
  const db = getDb();
  const err = validate(db, b);
  if (err) return NextResponse.json({ error: err }, { status: 400 });
  db.prepare(`
    INSERT INTO bills (description, amount_cents, category, due_day, frequency, due_month, match_pattern, tolerance_pct)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(b.description.trim(), Math.round(b.amount_cents), b.category,
    Math.round(b.due_day), b.frequency, b.frequency === 'anual' ? Math.round(b.due_month) : null,
    String(b.match_pattern || '').trim(), Math.min(Math.max(Math.round(b.tolerance_pct ?? 10), 0), 50));
  return NextResponse.json(computeBills(db));
}

export async function PATCH(request) {
  const b = await request.json();
  const db = getDb();
  const cur = db.prepare('SELECT * FROM bills WHERE id = ?').get(b.id);
  if (!cur) return NextResponse.json({ error: t('api.accountNotFound') }, { status: 404 });
  const merged = { ...cur, ...b };
  if (b.archived === undefined) {
    const err = validate(db, merged);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
  }
  db.prepare(`
    UPDATE bills SET description = ?, amount_cents = ?, category = ?, due_day = ?,
      frequency = ?, due_month = ?, match_pattern = ?, tolerance_pct = ?, archived = ?
    WHERE id = ?
  `).run(merged.description.trim(), Math.round(merged.amount_cents), merged.category,
    Math.round(merged.due_day), merged.frequency,
    merged.frequency === 'anual' ? Math.round(merged.due_month || 1) : null,
    String(merged.match_pattern || '').trim(),
    Math.min(Math.max(Math.round(merged.tolerance_pct ?? 10), 0), 50),
    merged.archived ? 1 : 0, b.id);
  return NextResponse.json(computeBills(db));
}

// PUT: marcar/desmarcar competência como paga manualmente
export async function PUT(request) {
  const { bill_id, ref, paid } = await request.json();
  const db = getDb();
  if (paid) {
    db.prepare('INSERT OR IGNORE INTO bill_payments (bill_id, ref) VALUES (?, ?)').run(bill_id, ref);
  } else {
    db.prepare('DELETE FROM bill_payments WHERE bill_id = ? AND ref = ?').run(bill_id, ref);
  }
  return NextResponse.json(computeBills(db));
}

export async function DELETE(request) {
  const { id } = await request.json();
  const db = getDb();
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM bill_payments WHERE bill_id = ?').run(id);
    db.prepare('DELETE FROM bills WHERE id = ?').run(id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
  return NextResponse.json(computeBills(db));
}
