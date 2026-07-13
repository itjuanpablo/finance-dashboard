import { NextResponse } from 'next/server';
import { getDb, isValidCategory } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDb();
  const rules = db.prepare(
    'SELECT id, pattern, category, created_at FROM rules ORDER BY id DESC'
  ).all();
  return NextResponse.json({ rules });
}

// POST: cria ou edita uma regra (upsert por padrão de texto).
// apply: true também recategoriza retroativamente tudo que está em "A revisar".
export async function POST(request) {
  const { pattern, category, apply } = await request.json();
  const db = getDb();
  if (!pattern || pattern.trim().length < 3 || !isValidCategory(db, category)) {
    return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 });
  }
  const p = pattern.trim();
  db.prepare(
    'INSERT INTO rules (pattern, category) VALUES (?, ?) ON CONFLICT(pattern) DO UPDATE SET category = excluded.category'
  ).run(p, category);
  let applied = 0;
  if (apply) {
    applied = db.prepare(
      "UPDATE transactions SET category = ? WHERE category = 'A revisar' AND deleted_at IS NULL AND description LIKE ? COLLATE NOCASE"
    ).run(category, `%${p}%`).changes;
  }
  return NextResponse.json({ ok: true, applied });
}

// DELETE: remove uma regra. Transações já categorizadas não são alteradas.
export async function DELETE(request) {
  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });
  const db = getDb();
  db.prepare('DELETE FROM rules WHERE id = ?').run(id);
  return NextResponse.json({ ok: true });
}
