import { NextResponse } from 'next/server';
import { t } from '@/lib/i18n';
import crypto from 'crypto';
import { getDb, categoryColors, isValidCategory, ACTIVE_TX } from '@/lib/db';
import { CAT } from '@/lib/categories';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Contrato v4: transactions.category guarda a CHAVE da categoria. Os mapas de
// apoio (cor, emoji) são indexados pela mesma chave; o nome de exibição é
// resolvido no cliente por makeCatLabeler.

export async function GET(request) {
  const db = getDb();
  // ?trash=1 → a lixeira. Só o que foi excluído pelo usuário: um lançamento-pai
  // (dividido) nunca aparece aqui, porque ele não foi excluído — foi repartido,
  // e mostrá-lo faria a pessoa "restaurar" algo que ela não apagou.
  // `request?.url` e não `request.url`: a rota também é chamada direto pelos
  // testes, sem objeto Request. Estourar aqui transformaria "sem parâmetro" em
  // erro 500 na listagem principal — a tela mais usada do app.
  const trash = request?.url && new URL(request.url).searchParams.get('trash') === '1';
  if (trash) {
    const trashed = db.prepare(`
      SELECT id, date, description, amount_cents, category, transfer, source, deleted_at
      FROM transactions
      WHERE deleted_at IS NOT NULL AND has_children = 0
      ORDER BY deleted_at DESC, id DESC
    `).all();
    return NextResponse.json({ transactions: trashed, trash: true });
  }
  // `invoice_ref` e `batch_id` viajam para a tela porque o dashboard precisa
  // deles para não mentir:
  //  · invoice_ref é a competência da fatura em que a parcela FOI cobrada. Sem
  //    ela, a projeção de parcelas futuras só tem `date` (data da COMPRA,
  //    repetida em todas as parcelas) e erra o mês — ver o cálculo em app/page.js.
  //  · batch_id permite contar, ANTES de confirmar o desfazer, quantas linhas do
  //    lote têm edição manual — que o DELETE físico leva embora para sempre.
  const transactions = db.prepare(`
    SELECT id, date, description, amount_cents, category, transfer, source, account_id,
           invoice_ref, batch_id,
           original_date, original_description, original_amount_cents
    FROM transactions WHERE ${ACTIVE_TX}
    ORDER BY date DESC, id DESC
  `).all();
  const categoryEmojis = {};
  db.prepare('SELECT key, emoji FROM categories WHERE archived = 0')
    .all().forEach(c => { categoryEmojis[c.key] = c.emoji; });
  return NextResponse.json({ transactions, categories: categoryColors(db), categoryEmojis });
}

// POST: lançamento manual (despesa ou receita) — sem arquivo, direto no app.
export async function POST(request) {
  const { date, description, amount_cents, category } = await request.json();
  const db = getDb();
  const desc = String(description || '').trim();
  const cents = Math.round(Number(amount_cents));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
    return NextResponse.json({ error: t('api.invalidDate') }, { status: 400 });
  }
  if (!desc) return NextResponse.json({ error: t('api.descRequired') }, { status: 400 });
  if (!isFinite(cents) || cents === 0) {
    return NextResponse.json({ error: t('api.invalidAmount') }, { status: 400 });
  }
  if (!isValidCategory(db, category)) {
    return NextResponse.json({ error: t('api.invalidCategory') }, { status: 400 });
  }
  db.prepare(`
    INSERT INTO transactions (date, description, amount_cents, category, transfer, source, hash)
    VALUES (?, ?, ?, ?, 0, 'manual', ?)
  `).run(date, desc, cents, category, `manual:${crypto.randomUUID()}`);
  return NextResponse.json({ ok: true });
}

// PATCH: edita uma transação (categoria, data, descrição, valor, transferência).
// - Primeira edição de data/descrição/valor guarda o original (para "restaurar").
// - O hash de deduplicação NUNCA é recalculado: reimportar o arquivo não
//   ressuscita a versão antiga.
// - restore: true desfaz as edições manuais.
export async function PATCH(request) {
  const body = await request.json();
  const { id } = body;
  if (!id) return NextResponse.json({ error: t('api.idRequired') }, { status: 400 });
  const db = getDb();
  const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
  if (!tx) return NextResponse.json({ error: t('api.txNotFound') }, { status: 404 });

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
      return NextResponse.json({ error: t('api.invalidCategory') }, { status: 400 });
    }
    sets.push('category = @category');
    args.category = body.category;

    // Categoria "Transferências" IMPLICA a bandeira de transferência interna.
    //
    // Sem isto não havia forma nenhuma de ensinar ao app que um lançamento é
    // dinheiro trocando de bolso: `transfer` só era escrito pelos parsers, e a
    // tela apenas lia. Quando o parser não reconhece (ex.: transferência
    // recebida da própria conta em outro banco, que o extrato não distingue de
    // uma receita), o total de entradas do mês fica inflado e o usuário não
    // tinha o que fazer — trocar a categoria mudava o gráfico e não mudava o
    // total, o que é pior: dois números discordando na mesma tela.
    //
    // O caminho inverso também: tirar de "Transferências" para uma categoria
    // real significa "isto é despesa/receita de verdade", então a bandeira cai.
    // `body.transfer` explícito continua tendo a última palavra (abaixo).
    if (body.transfer === undefined) {
      sets.push('transfer = @transferFromCat');
      args.transferFromCat = body.category === CAT.TRANSFERS ? 1 : 0;
    }
  }
  if (body.transfer !== undefined) {
    sets.push('transfer = @transfer');
    args.transfer = body.transfer ? 1 : 0;
  }
  if (body.date !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      return NextResponse.json({ error: t('api.invalidDateFormat') }, { status: 400 });
    }
    if (tx.original_date == null) { sets.push('original_date = @od'); args.od = tx.date; }
    sets.push('date = @date'); args.date = body.date;
  }
  if (body.description !== undefined) {
    const d = String(body.description).trim();
    if (!d) return NextResponse.json({ error: t('api.descEmpty') }, { status: 400 });
    if (tx.original_description == null) { sets.push('original_description = @ode'); args.ode = tx.description; }
    sets.push('description = @description'); args.description = d;
  }
  if (body.amount_cents !== undefined) {
    const v = Math.round(Number(body.amount_cents));
    if (!isFinite(v) || v === 0) {
      return NextResponse.json({ error: t('api.invalidAmount') }, { status: 400 });
    }
    if (tx.original_amount_cents == null) { sets.push('original_amount_cents = @oa'); args.oa = tx.amount_cents; }
    sets.push('amount_cents = @amount'); args.amount = v;
  }

  if (!sets.length) return NextResponse.json({ error: t('api.nothingToChange') }, { status: 400 });
  db.prepare(`UPDATE transactions SET ${sets.join(', ')} WHERE id = ${Number(id)}`).run(args);

  // regra opcional (mesmo comportamento de antes)
  let ruleApplied = 0;
  if (body.createRule && body.pattern && body.pattern.trim().length >= 3 && body.category) {
    const p = body.pattern.trim();
    db.prepare('INSERT INTO rules (pattern, category) VALUES (?, ?) ON CONFLICT(pattern) DO UPDATE SET category = excluded.category')
      .run(p, body.category);
    // só recategoriza o que ainda está pendente de revisão (chave, não nome)
    const res = db.prepare(
      `UPDATE transactions SET category = ? WHERE category = ? AND ${ACTIVE_TX} AND description LIKE ? COLLATE NOCASE`
    ).run(body.category, CAT.TO_REVIEW, `%${p}%`);
    ruleApplied = res.changes;
  }
  return NextResponse.json({ ok: true, ruleApplied });
}
