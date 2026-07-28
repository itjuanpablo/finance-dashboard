import { NextResponse } from 'next/server';
import { t } from '@/lib/i18n';
import { getDb, isValidCategory } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Ações em lote sobre transações selecionadas.
// { ids: number[], action: 'category' | 'delete' | 'undelete' | 'transfer', value? }
// Em action 'category', `value` é a CHAVE da categoria.
// Exclusão é soft delete: a linha mantém o hash e continua bloqueando
// reimportação duplicada; 'undelete' desfaz.
export async function POST(request) {
  const { ids, action, value } = await request.json();
  if (!Array.isArray(ids) || !ids.length || ids.length > 5000) {
    return NextResponse.json({ error: t('api.invalidIds') }, { status: 400 });
  }
  const db = getDb();
  const list = ids.map(Number).filter(Number.isInteger);
  const ph = list.map(() => '?').join(',');

  let sql;
  const args = [];
  if (action === 'category') {
    if (!isValidCategory(db, value)) {
      return NextResponse.json({ error: t('api.invalidCategory') }, { status: 400 });
    }
    sql = `UPDATE transactions SET category = ? WHERE id IN (${ph})`;
    args.push(value);
  } else if (action === 'delete') {
    sql = `UPDATE transactions SET deleted_at = datetime('now') WHERE id IN (${ph})`;
  } else if (action === 'undelete') {
    sql = `UPDATE transactions SET deleted_at = NULL WHERE id IN (${ph})`;
  } else if (action === 'transfer') {
    sql = `UPDATE transactions SET transfer = ? WHERE id IN (${ph})`;
    args.push(value ? 1 : 0);
  } else {
    return NextResponse.json({ error: t('api.unknownAction') }, { status: 400 });
  }

  const res = db.prepare(sql).run(...args, ...list);
  return NextResponse.json({ ok: true, changed: res.changes });
}
