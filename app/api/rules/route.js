import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { CATEGORIES } from '@/lib/categorizer';

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
export async function POST(request) {
  const { pattern, category } = await request.json();
  if (!pattern || pattern.trim().length < 3 || !(category in CATEGORIES)) {
    return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 });
  }
  const db = getDb();
  db.prepare(
    'INSERT INTO rules (pattern, category) VALUES (?, ?) ON CONFLICT(pattern) DO UPDATE SET category = excluded.category'
  ).run(pattern.trim(), category);
  return NextResponse.json({ ok: true });
}

// DELETE: remove uma regra. Transações já categorizadas não são alteradas.
export async function DELETE(request) {
  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });
  const db = getDb();
  db.prepare('DELETE FROM rules WHERE id = ?').run(id);
  return NextResponse.json({ ok: true });
}
