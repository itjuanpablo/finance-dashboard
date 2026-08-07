// Quitação de fatura de cartão: o que o usuário afirma, e o que o extrato sugere.
//
// ─── O problema que isto resolve ─────────────────────────────────────────────
// A fatura do cartão e o pagamento dela vivem em documentos DIFERENTES. A
// compra sai no extrato do cartão; o pagamento sai no extrato da CONTA, como
// um débito qualquer. Nada no dado liga um ao outro.
//
// Até aqui o app tentava adivinhar isso lendo o crédito "Pagamento da fatura"
// impresso dentro do PDF da fatura do mês SEGUINTE. Funciona — para quem
// importa religiosamente todo mês. Para todo mundo, a fatura paga em dia
// continuava dizendo "FATURA FECHADA" indefinidamente, que é uma tela mentindo
// com confiança.
//
// ─── Por que sugerir e não decidir ───────────────────────────────────────────
// Casar pagamento com fatura por VALOR é tentador e é onde mora o erro
// silencioso: um Pix de R$ 2.605,34 para outra pessoa no mesmo dia casaria
// igualzinho. A diferença entre "provavelmente é isto" e "é isto" não pode ser
// resolvida pelo computador aqui, então não é.
//
// A regra desta casa: a conciliação nunca grava. Ela devolve um candidato com
// o que encontrou — descrição, data e valor — e a tela pede confirmação. Quem
// afirma é o usuário; o app só aponta.

import { ACTIVE_TX } from './db.js';

const ABS = (n) => Math.abs(n);

// Quanto o valor pode diferir e ainda ser considerado a mesma fatura.
// R$ 1,00: cobre arredondamento e juros de um dia, e não cobre "coincidência".
const TOLERANCIA_CENTAVOS = 100;

// Quantos dias depois do vencimento ainda vale procurar. Pagamento atrasado
// existe; pagamento seis meses depois é outra coisa e não deve ser sugerido.
const DIAS_APOS_VENCIMENTO = 10;

// Descrições que o banco usa para pagamento de cartão, nos dois idiomas —
// isto é texto do BANCO, então as duas línguas ficam sempre ativas.
const PARECE_PAGAMENTO = [
  /pagamento.*(fatura|cart[ãa]o)/i,
  /pagto.*(fatura|cart[ãa]o)/i,
  /fatura.*cart[ãa]o/i,
  /pago.*(resumen|tarjeta)/i,
  /tarjeta.*cr[ée]dito/i,
];

const somaDias = (iso, dias) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

/**
 * Quitações já afirmadas para um cartão.
 * @returns {Record<string, {ref:string, paid_cents:number, paid_on:string|null, tx_id:number|null}>}
 */
export function quitacoesDo(db, cardId) {
  const linhas = db.prepare(
    'SELECT ref, paid_cents, paid_on, tx_id FROM invoice_settlements WHERE card_id = ?'
  ).all(cardId);
  return Object.fromEntries(linhas.map(l => [l.ref, l]));
}

/**
 * Procura, FORA do cartão, um débito que pareça o pagamento desta fatura.
 *
 * Só olha transações que NÃO pertencem às origens do próprio cartão: o
 * pagamento sai da conta, e um lançamento do próprio extrato do cartão nunca
 * é o pagamento dele.
 *
 * Devolve `null` quando não há candidato ÚNICO. Dois candidatos igualmente
 * plausíveis é caso de não sugerir nada — oferecer o primeiro seria escolher
 * por sorteio e chamar de conciliação.
 *
 * @param {object} db
 * @param {{closing_date:string, due_date:string, total_cents:number}} fatura
 * @param {string[]} sourcesDoCartao origens vinculadas ao cartão (a excluir)
 * @param {number[]} jaUsados tx_id já usados em outra quitação
 * @returns {{tx_id:number, date:string, description:string, amount_cents:number}|null}
 */
export function sugerirPagamento(db, fatura, sourcesDoCartao, jaUsados = []) {
  if (!fatura?.total_cents || fatura.total_cents <= 0) return null;

  const de = fatura.closing_date;
  const ate = somaDias(fatura.due_date, DIAS_APOS_VENCIMENTO);

  const phSrc = sourcesDoCartao.length ? sourcesDoCartao.map(() => '?').join(',') : "''";
  const candidatos = db.prepare(`
    SELECT id, date, description, amount_cents
    FROM transactions
    WHERE ${ACTIVE_TX}
      AND currency IS NULL
      AND amount_cents < 0
      AND date >= ? AND date <= ?
      AND (source IS NULL OR source NOT IN (${phSrc}))
  `).all(de, ate, ...sourcesDoCartao);

  const usados = new Set(jaUsados);
  const plausiveis = candidatos.filter(c =>
    !usados.has(c.id) &&
    ABS(ABS(c.amount_cents) - fatura.total_cents) <= TOLERANCIA_CENTAVOS &&
    // Valor batendo NÃO basta. Sem esta linha, qualquer despesa do mesmo valor
    // no período viraria "sua fatura foi paga" — e o usuário confirmaria sem
    // conferir, porque a tela pareceria segura.
    PARECE_PAGAMENTO.some(rx => rx.test(c.description || '')));

  if (plausiveis.length !== 1) return null;

  const c = plausiveis[0];
  return { tx_id: c.id, date: c.date, description: c.description, amount_cents: c.amount_cents };
}

/**
 * Status da fatura, agora com a quitação afirmada tendo a última palavra.
 *
 * A ordem importa e não é a mesma de antes: a checagem de ciclo vinha primeiro,
 * então uma fatura do mês corrente NUNCA podia aparecer como paga, mesmo com o
 * pagamento registrado. Quem paga adiantado merecia ver isso.
 */
export function statusDaFatura(inv, curRef, quitacao) {
  const pago = (quitacao?.paid_cents ?? 0) + inv.paid_cents;
  if (inv.total_cents > 0 && pago >= inv.total_cents - TOLERANCIA_CENTAVOS) return 'paga';
  if (inv.ref > curRef) return 'futura';
  if (inv.ref === curRef) return 'aberta';
  if (pago > 0) return 'parcial';
  return 'fechada';
}
