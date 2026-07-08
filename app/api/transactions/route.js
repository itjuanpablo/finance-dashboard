import { NextResponse } from 'next/server';
import { getDb, categoryColors, isValidCategory } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDb();
  const transactions = db.prepare(`
    SELECT id, date, description, amount_cents, category, transfer, source, account_id,
           original_date, original_description, original_amount_cents
    FROM transactions WHERE deleted_at IS NULL
    ORDER BY date DESC, id DESC
  `).all();
  return NextResponse.json({ transactions, categories: categoryColors(db) });
}

// PATCH: edita uma transação (categoria, data, descrição, valor, transferência).
// - Primeira edição de data/descrição/valor guarda o original (para "restaurar").
// - O hash de deduplicação NUNCA é recalculado: reimportar o arquivo não
//   ressuscita a versão antiga.
// - restore: true desfaz as edições manuais.
export async function PATCH(request) {
  const body = await request.json();
  const { id } = body;
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });
  const db = getDb();
  const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
  if (!tx) return NextResponse.json({ error: 'Transação não encontrada' }, { status: 404 });

  if (body.restore) {
    db.prepare(`
      UPDATE transactions SET
        date = COALESCE(original_date, date),
        description = COALESCE(original_description, description),
        amount_cents = COALESCE(original_amount_cents, amount_cents),
        original_date = NULL, original_description = NULL, original_amount_cents = NULL
      WHERE id = ?
    `).run(id);
    return NextResponse.json({ ok: true });
  }

  const sets = [];
  const args = {};

  if (body.category !== undefined) {
    if (!isValidCategory(db, body.category)) {
      return NextResponse.json({ error: 'Categoria inválida' }, { status: 400 });
    }
    sets.push('category = @category');
    args.category = body.category;
  }
  if (body.transfer !== undefined) {
    sets.push('transfer = @transfer');
    args.transfer = body.transfer ? 1 : 0;
  }
  if (body.date !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      return NextResponse.json({ error: 'Data inválida (use AAAA-MM-DD)' }, { status: 400 });
    }
    if (tx.original_date == null) { sets.push('original_date = @od'); args.od = tx.date; }
    sets.push('date = @date'); args.date = body.date;
  }
  if (body.description !== undefined) {
    const d = String(body.description).trim();
    if (!d) return NextResponse.json({ error: 'Descrição vazia' }, { status: 400 });
    if (tx.original_description == null) { sets.push('original_description = @ode'); args.ode = tx.description; }
    sets.push('description = @description'); args.description = d;
  }
  if (body.amount_cents !== undefined) {
    const v = Math.round(Number(body.amount_cents));
    if (!isFinite(v) || v === 0) {
      return NextResponse.json({ error: 'Valor inválido' }, { status: 400 });
    }
    if (tx.original_amount_cents == null) { sets.push('original_amount_cents = @oa'); args.oa = tx.amount_cents; }
    sets.push('amount_cents = @amount'); args.amount = v;
  }

  if (!sets.length) return NextResponse.json({ error: 'Nada para alterar' }, { status: 400 });
  db.prepare(`UPDATE transactions SET ${sets.join(', ')} WHERE id = ${Number(id)}`).run(args);

  // regra opcional (mesmo comportamento de antes)
  let ruleApplied = 0;
  if (body.createRule && body.pattern && body.pattern.trim().length >= 3 && body.category) {
    const p = body.pattern.trim();
    db.prepare('INSERT INTO rules (pattern, category) VALUES (?, ?) ON CONFLICT(pattern) DO UPDATE SET category = excluded.category')
      .run(p, body.category);
    const res = db.prepare(
      "UPDATE transactions SET category = ? WHERE category = 'A revisar' AND deleted_at IS NULL AND description LIKE ? COLLATE NOCASE"
    ).run(body.category, `%${p}%`);
    ruleApplied = res.changes;
  }
  return NextResponse.json({ ok: true, ruleApplied });
}
