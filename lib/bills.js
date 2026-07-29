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
  const pendentes = []; // conciliações a gravar: [bill_id, ref, tx_id]
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
          pendentes.push([bill.id, ref, match.id]);
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

  // POR QUE UMA LEITURA GRAVA AQUI.
  //
  // `GET /api/bills` chama isto e o INSERT abaixo persiste a conciliação
  // automática. Fica de propósito no caminho de leitura porque é ela que faz a
  // conta aparecer como PAGA assim que o extrato é importado; num PUT explícito o
  // painel mostraria "atrasada" para conta já debitada até alguém apertar um
  // botão — informação errada sobre dinheiro, que é exatamente o que se quer
  // evitar. A escrita é idempotente: `INSERT OR IGNORE` numa PK (bill_id, ref),
  // então repetir a leitura não muda nada e não há o que desfazer.
  //
  // O que faltava era a TRANSAÇÃO: solto, um lote de N conciliações podia parar
  // no meio (SQLITE_BUSY, disco) e deixar metade das competências marcadas. E a
  // falha era invisível — agora sobe como `reconcileError` para a tela avisar.
  let reconcileError = null;
  if (pendentes.length) {
    // O BEGIN entra no try: hoje nenhuma rota chama computeBills dentro de uma
    // transação, mas se um dia chamar, "cannot start a transaction within a
    // transaction" tem de virar aviso — não exceção subindo por uma LEITURA.
    try {
      db.exec('BEGIN');
      for (const p of pendentes) payStmt.run(...p);
      db.exec('COMMIT');
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch { /* nada aberto para desfazer */ }
      reconcileError = e.message;
    }
  }
  // As ocorrências devolvidas já refletem a conciliação calculada em memória:
  // mesmo com a gravação falhando, a tela mostra o status correto — o que se
  // perde é a persistência, e a próxima leitura tenta de novo.
  return { bills, occurrences, reconcileError };
}
