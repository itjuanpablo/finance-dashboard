import { NextResponse } from 'next/server';
import { t } from '@/lib/i18n';
import crypto from 'crypto';
import { getDb, isValidCategory } from '@/lib/db';
import { CAT } from '@/lib/categories';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Dividir um lançamento em partes.
//
// Caso típico: compra de mercado de R$ 200 que é R$ 150 de comida e R$ 50 de
// produto de limpeza. Antes disso, escolher uma categoria era escolher qual
// mentira contar.
//
// COMO FICA NO BANCO
//
// O lançamento original NÃO é apagado: vira um contêiner com `has_children = 1`
// e some das listas e dos totais (ver ACTIVE_TX em lib/db.js). Ele tem de
// continuar existindo porque guarda o `hash` de deduplicação — apagá-lo faria a
// reimportação do mesmo extrato trazer a compra de volta, agora duplicada com
// as partes.
//
// As partes nascem com `parent_id` apontando para ele, herdam data e origem, e
// carregam as categorias. Cada parte ganha hash próprio derivado do pai, para
// nunca colidir com um lançamento importado.
//
// A regra que não pode ser quebrada: a SOMA DAS PARTES É IGUAL AO ORIGINAL.
// Não é preferência de arquitetura — é a diferença entre reorganizar um gasto e
// inventar dinheiro. A validação abaixo recusa qualquer divisão que não feche.

/** POST — divide. Body: { id, parts: [{ amount_cents, category, description? }] } */
export async function POST(request) {
  const { id, parts } = await request.json();
  const db = getDb();

  const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
  if (!tx) return NextResponse.json({ error: t('api.txNotFound') }, { status: 404 });
  if (tx.has_children) {
    return NextResponse.json({ error: t('split.errAlreadySplit') }, { status: 400 });
  }
  if (tx.parent_id) {
    // Dividir a parte de uma divisão criaria uma árvore, e com ela a pergunta
    // "qual nível conta?". Um nível só mantém a resposta óbvia.
    return NextResponse.json({ error: t('split.errIsPart') }, { status: 400 });
  }
  if (!Array.isArray(parts) || parts.length < 2) {
    return NextResponse.json({ error: t('split.errMinParts') }, { status: 400 });
  }

  const limpas = [];
  for (const p of parts) {
    const cents = Math.round(Number(p.amount_cents));
    if (!isFinite(cents) || cents === 0) {
      return NextResponse.json({ error: t('api.invalidAmount') }, { status: 400 });
    }
    // Todas as partes têm de ter o mesmo sinal do original: metade de uma
    // despesa não vira receita.
    if (Math.sign(cents) !== Math.sign(tx.amount_cents)) {
      return NextResponse.json({ error: t('split.errSign') }, { status: 400 });
    }
    if (!isValidCategory(db, p.category)) {
      return NextResponse.json({ error: t('api.invalidCategory') }, { status: 400 });
    }
    limpas.push({
      cents,
      category: p.category,
      description: String(p.description || '').trim() || tx.description,
    });
  }

  const soma = limpas.reduce((s, p) => s + p.cents, 0);
  if (soma !== tx.amount_cents) {
    return NextResponse.json({
      error: t('split.errSum', {
        parts: (soma / 100).toFixed(2),
        total: (tx.amount_cents / 100).toFixed(2),
      }),
    }, { status: 400 });
  }

  db.exec('BEGIN');
  try {
    const ins = db.prepare(`
      INSERT INTO transactions
        (date, description, amount_cents, category, transfer, source, external_id,
         hash, batch_id, account_id, invoice_ref, parent_id)
      VALUES (@date, @description, @amount_cents, @category, @transfer, @source, NULL,
              @hash, @batch_id, @account_id, @invoice_ref, @parent_id)`);

    limpas.forEach((p, i) => {
      ins.run({
        date: tx.date,
        description: p.description,
        amount_cents: p.cents,
        category: p.category,
        // Uma parte de uma despesa comum nunca é transferência interna; se o
        // original era transferência, dividir não faria sentido (e a tela não
        // oferece), mas herdar é o comportamento menos surpreendente.
        transfer: tx.transfer,
        source: tx.source,
        // Hash derivado do pai + índice: determinístico (dividir de novo depois
        // de desfazer gera o mesmo) e sem chance de colidir com hash de arquivo.
        hash: `split:${tx.hash}:${i}`,
        batch_id: tx.batch_id,
        account_id: tx.account_id,
        invoice_ref: tx.invoice_ref,
        parent_id: tx.id,
      });
    });

    db.prepare('UPDATE transactions SET has_children = 1 WHERE id = ?').run(tx.id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return NextResponse.json({ error: e.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, parts: limpas.length });
}

/** DELETE — desfaz a divisão. Body: { id } (id do pai OU de uma das partes) */
export async function DELETE(request) {
  const { id } = await request.json();
  const db = getDb();

  const alvo = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
  if (!alvo) return NextResponse.json({ error: t('api.txNotFound') }, { status: 404 });

  // Aceita o id do pai ou de qualquer parte: da tela, quem está visível é a
  // parte, então exigir o id do pai obrigaria a interface a saber disso.
  const paiId = alvo.has_children ? alvo.id : alvo.parent_id;
  if (!paiId) return NextResponse.json({ error: t('split.errNotSplit') }, { status: 400 });

  db.exec('BEGIN');
  try {
    // DELETE físico das partes, não soft delete: elas nunca existiram no
    // extrato do banco, são um recorte do usuário. Deixá-las na lixeira faria
    // aparecer lá um lançamento que ele não reconheceria.
    const n = db.prepare('DELETE FROM transactions WHERE parent_id = ?').run(paiId).changes;
    db.prepare('UPDATE transactions SET has_children = 0 WHERE id = ?').run(paiId);
    db.exec('COMMIT');
    return NextResponse.json({ ok: true, removed: n, restored: paiId });
  } catch (e) {
    db.exec('ROLLBACK');
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/** GET ?id= — as partes de um lançamento dividido (para a tela de detalhe). */
export async function GET(request) {
  const id = Number(new URL(request.url).searchParams.get('id'));
  const db = getDb();
  const parts = db.prepare(`
    SELECT id, date, description, amount_cents, category, parent_id
    FROM transactions WHERE parent_id = ? ORDER BY id`).all(id);
  return NextResponse.json({ parts });
}
