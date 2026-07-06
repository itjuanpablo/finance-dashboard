import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { CATEGORIES } from '@/lib/categorizer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDb();
  const transactions = db.prepare(
    'SELECT id, date, description, amount_cents, category, transfer, source FROM transactions ORDER BY date DESC, id DESC'
  ).all();
  return NextResponse.json({ transactions, categories: CATEGORIES });
}

// PATCH: recategoriza uma transação; opcionalmente cria uma regra e a aplica
// retroativamente a tudo que ainda está em "A revisar".
export async function PATCH(request) {
  const { id, category, createRule, pattern } = await request.json();
  if (!id || !category || !(category in CATEGORIES)) {
    return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 });
  }
  const db = getDb();

  db.prepare('UPDATE transactions SET category = ? WHERE id = ?').run(category, id);

  let ruleApplied = 0;
  if (createRule && pattern && pattern.trim().length >= 3) {
    const p = pattern.trim();
    db.prepare('INSERT INTO rules (pattern, category) VALUES (?, ?) ON CONFLICT(pattern) DO UPDATE SET category = excluded.category')
      .run(p, category);
    const res = db.prepare(
      "UPDATE transactions SET category = ? WHERE category = 'A revisar' AND description LIKE ? COLLATE NOCASE"
    ).run(category, `%${p}%`);
    ruleApplied = res.changes;
  }
  return NextResponse.json({ ok: true, ruleApplied });
}
