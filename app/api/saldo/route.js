import { NextResponse } from 'next/server';
import { getDb, ACTIVE_TX } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Série do saldo ao longo do tempo + resumo por mês.
//
// É a pergunta que o app não respondia: "estou melhorando?". O dashboard e o
// relatório são mensais, e mês isolado não mostra tendência.
//
// ─── DUAS DECISÕES QUE MUDAM O SIGNIFICADO DO NÚMERO ─────────────────────────
//
// 1. TRANSFERÊNCIA INTERNA NÃO ENTRA. Dinheiro que sai da conta A e entra na
//    conta B não muda o quanto você tem. Somar as duas pontas faria a curva
//    subir e descer sozinha a cada movimentação. (Se um dia a série for POR
//    CONTA, aí a transferência importa — mas esta é a consolidada.)
//
// 2. SEM CONTA CADASTRADA, O SALDO ABSOLUTO É DESCONHECIDO. O app só sabe o
//    saldo de verdade se alguém informou o saldo inicial de uma conta e vinculou
//    as origens. Sem isso, o honesto é mostrar a VARIAÇÃO acumulada a partir de
//    zero e dizer na tela que é variação — inventar um ponto de partida seria
//    desenhar uma linha bonita em cima de um número que ninguém deu.
//    O campo `absolute` na resposta diz qual dos dois é.

export async function GET(request) {
  const db = getDb();
  const url = new URL(request.url);
  const ano = url.searchParams.get('year');

  // ── ponto de partida ───────────────────────────────────────────────────────
  // Conta com saldo inicial informado E origem vinculada. Sem vínculo, o saldo
  // inicial não tem movimentos para somar e viraria uma linha reta.
  const contas = db.prepare(`
    SELECT a.id, a.name, a.initial_cents, a.initial_date
    FROM accounts a
    WHERE a.archived = 0
      AND EXISTS (SELECT 1 FROM source_bindings b WHERE b.account_id = a.id)
  `).all();

  const absolute = contas.length > 0;
  const inicial = contas.reduce((s, c) => s + (c.initial_cents || 0), 0);
  // Data em que o saldo informado vale — a ÂNCORA, não o começo da curva.
  const ancora = contas.length ? contas.map(c => c.initial_date).sort()[0] : null;

  // A série cobre TODO o histórico, inclusive o que é anterior à âncora.
  //
  // A primeira versão disto começava a curva na data do saldo inicial e jogava
  // fora os meses anteriores — no banco real, 8 dos 9 meses sumiam e a curva
  // não fechava com a soma dos resultados mensais. Mas saber o saldo num dia e
  // todos os movimentos é saber o saldo em qualquer dia: basta reconstruir para
  // trás. O deslocamento é calculado adiante.
  const desde = db.prepare(`SELECT MIN(date) d FROM transactions WHERE ${ACTIVE_TX}`).get().d;

  if (!desde) {
    return NextResponse.json({
      absolute, initial: 0, points: [], months: [], years: [], empty: true,
    });
  }

  // ── movimento diário ───────────────────────────────────────────────────────
  //
  // transfer = 0: ver decisão 1 no topo.
  //
  // E uma terceira decisão, que só apareceu ao rodar contra dado real: quando há
  // conta cadastrada, a série soma APENAS as origens vinculadas a ela. Sem esse
  // recorte, os itens da fatura do cartão (que são despesa do CARTÃO, não saída
  // da conta) entravam na mesma conta do saldo bancário — dois conceitos
  // diferentes somados no mesmo número, ancorados num saldo que não os inclui.
  // O resultado parecia certo e não era.
  //
  // Sem conta cadastrada não há o que recortar: a série pega tudo e vira
  // VARIAÇÃO (absolute = false), que é o que a tela informa.
  const vinculadas = absolute
    ? db.prepare(`SELECT source FROM source_bindings WHERE account_id IS NOT NULL`)
        .all().map(r => r.source)
    : [];
  const filtroOrigem = vinculadas.length
    ? `AND source IN (${vinculadas.map(() => '?').join(',')})`
    : '';

  const dias = db.prepare(`
    SELECT date, SUM(amount_cents) delta
    FROM transactions
    WHERE ${ACTIVE_TX} AND transfer = 0 AND date >= ? ${filtroOrigem}
    GROUP BY date ORDER BY date
  `).all(desde, ...vinculadas);

  // Acumula do começo do histórico (base 0) e só depois desloca.
  let acc = 0;
  const bruto = dias.map(d => {
    acc += d.delta;
    return { date: d.date, balance: acc, delta: d.delta };
  });

  // Desloca a série para que o saldo na data da âncora seja o saldo informado.
  // Sem conta cadastrada não há âncora: a curva fica na base 0 e a resposta
  // devolve `absolute: false`, para a tela dizer que aquilo é VARIAÇÃO.
  let offset = 0;
  if (absolute && ancora) {
    const naAncora = bruto.filter(p => p.date <= ancora).at(-1)?.balance ?? 0;
    offset = inicial - naAncora;
  }
  const points = bruto.map(p => ({ ...p, balance: p.balance + offset }));

  // ── resumo por mês (a visão anual) ─────────────────────────────────────────
  const meses = db.prepare(`
    SELECT substr(date, 1, 7) ym,
           SUM(CASE WHEN amount_cents > 0 THEN amount_cents ELSE 0 END) income,
           SUM(CASE WHEN amount_cents < 0 THEN -amount_cents ELSE 0 END) expense,
           COUNT(*) n
    FROM transactions
    WHERE ${ACTIVE_TX} AND transfer = 0
    ${ano ? 'AND substr(date, 1, 4) = ?' : ''}
    GROUP BY ym ORDER BY ym
  `).all(...(ano ? [ano] : []));

  // Saldo no fim de cada mês, para a curva mensal (mais legível que a diária
  // quando o período é longo).
  const fimDeMes = new Map();
  for (const p of points) fimDeMes.set(p.date.slice(0, 7), p.balance);

  // ATENÇÃO — `result` e `balance` medem universos diferentes, de propósito:
  //
  //  · result  = TUDO que entrou e saiu no mês, inclusive compras no cartão no
  //    mês em que foram feitas. É a pergunta "quanto sobrou do que ganhei".
  //  · balance = saldo NA CONTA, só das origens vinculadas a ela. Compra no
  //    cartão não sai da conta no dia da compra; sai quando a fatura é paga.
  //
  // Os dois são certos e respondem a coisas distintas. A tela TEM de rotular
  // assim — dois números diferentes sem legenda na mesma linha é a receita para
  // alguém achar que um deles está errado.
  const months = meses.map(m => ({
    ym: m.ym,
    income: m.income,
    expense: m.expense,
    result: m.income - m.expense,   // escopo: todas as origens
    balance: fimDeMes.get(m.ym) ?? null, // escopo: só contas vinculadas
    count: m.n,
  }));

  const years = db.prepare(`
    SELECT DISTINCT substr(date, 1, 4) y FROM transactions
    WHERE ${ACTIVE_TX} ORDER BY y DESC
  `).all().map(r => r.y);

  return NextResponse.json({
    absolute,       // true = saldo de verdade; false = variação a partir de zero
    initial: absolute ? inicial : 0,
    since: desde,
    anchor: ancora, // data em que o saldo informado vale (null se não há conta)
    points,         // série diária do SALDO EM CONTA
    months,         // resumo mensal — ver a nota sobre result × balance acima
    years,          // anos com dado, para o seletor
    accounts: contas.length,
    balanceSources: vinculadas, // quais origens entram no saldo (transparência)
  });
}
