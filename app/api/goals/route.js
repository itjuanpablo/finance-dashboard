import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { CATEGORIES } from '@/lib/categorizer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDb();
  const goals = db.prepare('SELECT category, limit_cents FROM goals').all();
  return NextResponse.json({ goals });
}

// PUT: define/atualiza a meta de uma categoria; limite <= 0 remove a meta.
export async function PUT(request) {
  const { category, limit_cents } = await request.json();
  if (!(category in CATEGORIES) || typeof limit_cents !== 'number') {
    return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 });
  }
  const db = getDb();
  if (limit_cents <= 0) {
    db.prepare('DELETE FROM goals WHERE category = ?').run(category);
  } else {
    db.prepare(
      'INSERT INTO goals (category, limit_cents) VALUES (?, ?) ON CONFLICT(category) DO UPDATE SET limit_cents = excluded.limit_cents'
    ).run(category, Math.round(limit_cents));
  }
  return NextResponse.json({ ok: true });
}
