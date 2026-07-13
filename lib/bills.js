// Contas a pagar: ocorrências derivadas (nada de gerar lançamentos futuros no
// banco) + conciliação automática contra as transações importadas.

const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const clampDay = (y, m, d) => Math.min(d, new Date(y, m, 0).getDate());

/** Ocorrências de uma conta: 3 competências passadas + 2 futuras (mensal) ou ano atual/próximo (anual). */
export function occurrencesFor(bill, today = new Date()) {
  const out = [];
  if (bill.frequency === 'anual') {
    const m = Math.min(Math.max(bill.due_month || 1, 1), 12);
    for (const y of [today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1]) {
      out.push({ ref: String(y), due: `${y}-${pad(m)}-${pad(clampDay(y, m, bill.due_day))}` });
    }
  } else {
    for (let k = -3; k <= 2; k++) {
      const d = new Date(today.getFullYear(), today.getMonth() + k, 1);
      const [y, m] = [d.getFullYear(), d.getMonth() + 1];
      out.push({ ref: `${y}-${pad(m)}`, due: `${y}-${pad(m)}-${pad(clampDay(y, m, bill.due_day))}` });
    }
  }
  return out;
}

/**
 * Concilia e devolve as ocorrências com status.
 * Conciliação: despesa cuja descrição contém match_pattern, valor dentro da
 * tolerância e data entre 15 dias antes e 20 depois do vencimento → paga.
 */
export function computeBills(db, today = new Date()) {
  const todayIso = iso(today);
  const bills = db.prepare('SELECT * FROM bills ORDER BY archived, due_day, id').all();
  const paidStmt = db.prepare('SELECT tx_id FROM bill_payments WHERE bill_id = ? AND ref = ?');
  const payStmt = db.prepare(
    'INSERT OR IGNORE INTO bill_payments (bill_id, ref, tx_id) VALUES (?, ?, ?)');
  const candStmt = db.prepare(`
    SELECT id, date, amount_cents FROM transactions
    WHERE deleted_at IS NULL AND amount_cents < 0
      AND date BETWEEN date(?, '-15 days') AND date(?, '+20 days')
      AND description LIKE ? COLLATE NOCASE
    ORDER BY date
  `);

  const occurrences = [];
  for (const bill of bills) {
    if (bill.archived) continue;
    for (const { ref, due } of occurrencesFor(bill, today)) {
      let payment = paidStmt.get(bill.id, ref);
      // conciliação automática (só com padrão definido)
      if (!payment && bill.match_pattern.trim().length >= 3) {
        const tol = bill.amount_cents * (bill.tolerance_pct / 100);
        const match = candStmt.all(due, due, `%${bill.match_pattern.trim()}%`)
          .find(t => Math.abs(-t.amount_cents - bill.amount_cents) <= tol);
        if (match) {
          payStmt.run(bill.id, ref, match.id);
          payment = { tx_id: match.id };
        }
      }
      const status = payment ? 'paga' : due < todayIso ? 'atrasada' : 'proxima';
      occurrences.push({
        bill_id: bill.id, description: bill.description, category: bill.category,
        amount_cents: bill.amount_cents, frequency: bill.frequency,
        ref, due_date: due, status, tx_id: payment?.tx_id ?? null,
      });
    }
  }
  occurrences.sort((a, b) => a.due_date.localeCompare(b.due_date));
  return { bills, occurrences };
}
