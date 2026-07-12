import { NextResponse } from 'next/server';
import { getDb, categoryColors } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Faturas são DERIVADAS das transações + ciclo de fechamento do cartão.
// Parcelas carregam a data da compra original, então a parcela N é deslocada
// N-1 meses para cair no ciclo em que de fato foi cobrada.

const MONTHS_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const pad = n => String(n).padStart(2, '0');
const addMonthsYm = (y, m, k) => {
  m = m - 1 + k;
  return [y + Math.floor(m / 12), (m % 12) + 1];
};
const clampDay = (y, m, d) => Math.min(d, new Date(y, m, 0).getDate());

// ciclo (ref) a que uma data pertence: janela (fechamento anterior, fechamento]
function refOf(dateIso, closingDay, shiftMonths = 0) {
  let y = +dateIso.slice(0, 4), m = +dateIso.slice(5, 7);
  const d = +dateIso.slice(8, 10);
  if (shiftMonths) [y, m] = addMonthsYm(y, m, shiftMonths);
  if (d > closingDay) [y, m] = addMonthsYm(y, m, 1);
  return `${y}-${pad(m)}`;
}

export async function GET(request) {
  const cardId = Number(new URL(request.url).searchParams.get('card_id'));
  const db = getDb();
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(cardId);
  if (!card) return NextResponse.json({ error: 'Cartão não encontrado' }, { status: 404 });
  const sources = db.prepare(
    'SELECT source FROM source_bindings WHERE card_id = ?').all(cardId).map(r => r.source);
  if (!sources.length) {
    return NextResponse.json({ card, invoices: [], noSources: true, categories: categoryColors(db) });
  }

  const ph = sources.map(() => '?').join(',');
  const txs = db.prepare(`
    SELECT id, date, description, amount_cents, category, transfer, invoice_ref
    FROM transactions
    WHERE deleted_at IS NULL AND source IN (${ph})
    ORDER BY date DESC, id DESC
  `).all(...sources);

  const invoices = {}; // ref → { txs, total, paid, byCat }
  const get = ref => (invoices[ref] = invoices[ref] || { ref, txs: [], total_cents: 0, paid_cents: 0, by_category: {} });

  for (const t of txs) {
    // pagamento de fatura: crédito vinculado pelo mês citado na descrição
    const pay = t.description.match(/Pagamento da fatura de (\p{L}+)\/(\d{4})/iu);
    if (pay && t.transfer) {
      const mi = MONTHS_PT.indexOf(pay[1].toLowerCase());
      if (mi >= 0) get(`${pay[2]}-${pad(mi + 1)}`).paid_cents += Math.abs(t.amount_cents);
      continue;
    }
    if (t.amount_cents >= 0 || t.transfer) continue;
    // preferência: competência gravada na importação (exata);
    // fallback: janela por data com deslocamento de parcelas (aproximada)
    const parc = t.description.match(/\(parcela (\d+)\/(\d+)\)$/);
    const ref = t.invoice_ref
      || refOf(t.date, card.closing_day, parc ? +parc[1] - 1 : 0);
    const inv = get(ref);
    inv.txs.push(t);
    inv.total_cents += -t.amount_cents;
    inv.by_category[t.category] = (inv.by_category[t.category] || 0) - t.amount_cents;
  }

  const now = new Date();
  const curRef = refOf(now.toISOString().slice(0, 10), card.closing_day);

  const list = Object.values(invoices)
    .filter(inv => inv.txs.length || inv.paid_cents)
    .sort((a, b) => b.ref.localeCompare(a.ref))
    .map(inv => {
      const [y, m] = [+inv.ref.slice(0, 4), +inv.ref.slice(5, 7)];
      const closing = `${y}-${pad(m)}-${pad(clampDay(y, m, card.closing_day))}`;
      let [dy, dm] = card.due_day <= card.closing_day ? addMonthsYm(y, m, 1) : [y, m];
      const due = `${dy}-${pad(dm)}-${pad(clampDay(dy, dm, card.due_day))}`;
      const status = inv.ref > curRef ? 'futura'
        : inv.ref === curRef ? 'aberta'
        : inv.paid_cents >= inv.total_cents - 100 && inv.total_cents > 0 ? 'paga'
        : inv.paid_cents > 0 ? 'parcial' : 'fechada';
      return { ...inv, closing_date: closing, due_date: due, status, tx_count: inv.txs.length };
    });

  return NextResponse.json({
    card: { ...card, sources },
    invoices: list,
    currentRef: curRef,
    categories: categoryColors(db),
  });
}
