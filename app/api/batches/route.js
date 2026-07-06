import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDb();
  const batches = db.prepare(
    'SELECT id, file_name, kind, inserted, skipped, imported_at FROM batches ORDER BY id DESC'
  ).all();
  return NextResponse.json({ batches });
}

// DELETE: desfaz uma importação — remove as transações daquele lote.
export async function DELETE(request) {
  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });
  const db = getDb();
  db.exec('BEGIN');
  try {
    const res = db.prepare('DELETE FROM transactions WHERE batch_id = ?').run(id);
    db.prepare('DELETE FROM batches WHERE id = ?').run(id);
    db.exec('COMMIT');
    return NextResponse.json({ ok: true, removed: res.changes });
  } catch (e) {
    db.exec('ROLLBACK');
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
