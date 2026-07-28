import { NextResponse } from 'next/server';
import { t } from '@/lib/i18n';
import { getDb, isValidCategory } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDb();
  const goals = db.prepare('SELECT category, limit_cents, rollover FROM goals').all();
  return NextResponse.json({ goals });
}

// PUT: define/atualiza a meta de uma categoria; limite <= 0 remove a meta.
// `category` é CHAVE (goals.category), validada contra categories.key.
// rollover (opcional): sobra/estouro do mês anterior ajusta o orçamento do mês.
export async function PUT(request) {
  const { category, limit_cents, rollover } = await request.json();
  const db = getDb();
  if (typeof limit_cents !== 'number' ||
      (limit_cents > 0 && !isValidCategory(db, category))) {
    return NextResponse.json({ error: t('api.invalidParams') }, { status: 400 });
  }
  if (limit_cents <= 0) {
    db.prepare('DELETE FROM goals WHERE category = ?').run(category);
  } else {
    const cur = db.prepare('SELECT rollover FROM goals WHERE category = ?').get(category);
    const roll = rollover !== undefined ? (rollover ? 1 : 0) : (cur?.rollover ?? 0);
    db.prepare(`
      INSERT INTO goals (category, limit_cents, rollover) VALUES (?, ?, ?)
      ON CONFLICT(category) DO UPDATE SET limit_cents = excluded.limit_cents, rollover = excluded.rollover
    `).run(category, Math.round(limit_cents), roll);
  }
  return NextResponse.json({ ok: true });
}
