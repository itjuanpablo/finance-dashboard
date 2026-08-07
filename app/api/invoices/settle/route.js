import { NextResponse } from 'next/server';
import { t } from '@/lib/i18n';
import { getDb, ACTIVE_TX } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Marcar / desmarcar uma fatura como paga.
//
// Não existe tabela de faturas — elas são derivadas — então a quitação é
// identificada pelo par (cartão, competência), que é o mesmo par que a tela
// exibe. Ver o comentário de invoice_settlements em lib/db.js.
//
// Nenhuma transação é criada aqui. O dinheiro já saiu da conta e já está no
// extrato; inventar um lançamento para "representar" o pagamento contaria o
// mesmo gasto duas vezes no mês. A quitação é uma AFIRMAÇÃO sobre um fato que
// já está nos dados, não um fato novo.

const REF_RX = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATA_RX = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(request) {
  const { card_id, ref, paid_cents, paid_on, tx_id } = await request.json();
  const db = getDb();

  if (!Number.isInteger(card_id) || !REF_RX.test(String(ref ?? ''))) {
    return NextResponse.json({ error: t('api.invalidParams') }, { status: 400 });
  }
  if (!db.prepare('SELECT 1 FROM cards WHERE id = ?').get(card_id)) {
    return NextResponse.json({ error: t('api.cardNotFound') }, { status: 404 });
  }

  const cents = Math.round(Number(paid_cents));
  // Valor não positivo, absurdo, ou não numérico: o mesmo cuidado do
  // importador (ver LIMITE_CENTAVOS em lib/importer.js). Quitação com valor
  // errado envenena o status para sempre e não dá erro em lugar nenhum.
  if (!Number.isFinite(cents) || cents <= 0 || cents > 1e12) {
    return NextResponse.json({ error: t('api.invalidParams') }, { status: 400 });
  }

  const quando = DATA_RX.test(String(paid_on ?? '')) ? paid_on : null;

  // tx_id só é aceito se a transação EXISTIR e não estiver já usada em outra
  // quitação — senão um mesmo pagamento quitaria duas faturas.
  let vinculo = null;
  if (Number.isInteger(tx_id)) {
    // ACTIVE_TX e não só `deleted_at IS NULL`: um lançamento-pai (dividido) tem
    // o valor repetido nos filhos, e vinculá-lo aqui deixaria a quitação
    // apontando para um valor que o app deliberadamente não conta.
    const existe = db.prepare(
      `SELECT 1 FROM transactions WHERE id = ? AND ${ACTIVE_TX}`).get(tx_id);
    const emUso = db.prepare(
      'SELECT 1 FROM invoice_settlements WHERE tx_id = ? AND NOT (card_id = ? AND ref = ?)'
    ).get(tx_id, card_id, ref);
    if (!existe || emUso) {
      return NextResponse.json({ error: t('cards.settleTxTaken') }, { status: 400 });
    }
    vinculo = tx_id;
  }

  db.prepare(`
    INSERT INTO invoice_settlements (card_id, ref, paid_cents, paid_on, tx_id)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(card_id, ref) DO UPDATE SET
      paid_cents = excluded.paid_cents,
      paid_on    = excluded.paid_on,
      tx_id      = excluded.tx_id
  `).run(card_id, ref, cents, quando, vinculo);

  return NextResponse.json({ ok: true });
}

// DELETE: desfaz a quitação. A fatura volta ao status que os dados sozinhos
// sustentam — nenhuma transação é tocada, porque nenhuma foi criada.
export async function DELETE(request) {
  const { card_id, ref } = await request.json();
  if (!Number.isInteger(card_id) || !REF_RX.test(String(ref ?? ''))) {
    return NextResponse.json({ error: t('api.invalidParams') }, { status: 400 });
  }
  const db = getDb();
  const r = db.prepare(
    'DELETE FROM invoice_settlements WHERE card_id = ? AND ref = ?').run(card_id, ref);
  return NextResponse.json({ ok: true, removed: r.changes });
}
