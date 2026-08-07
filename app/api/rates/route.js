import { NextResponse } from 'next/server';
import { getDb, getSetting, setSetting } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Cotação de referência para o CONVERSOR — e só para ele.
//
// ─── A linha que este arquivo não pode cruzar ────────────────────────────────
// O Fluxo nunca converte dinheiro. Um gasto em dólar de julho não vira reais
// pela cotação de hoje, porque isso produziria um número que nunca existiu; é
// por isso que o painel mostra dois totais lado a lado em vez de um só.
//
// Esta rota NÃO muda nada disso. Ela alimenta uma calculadora: você digita um
// valor e vê o equivalente. Nenhum lançamento é convertido, nenhuma soma passa
// a cruzar moeda, nada daqui é gravado em `transactions`.
//
// Se um dia alguém quiser usar isto para converter um total, a resposta é não:
// a garantia de que "soma nunca cruza moeda" é o que faz os saldos estarem
// certos, e ela morre no instante em que uma taxa entra numa soma.
//
// ─── A primeira chamada de rede do app ───────────────────────────────────────
// Até aqui o Fluxo não falava com servidor nenhum. Isto é a exceção, e por isso
// é estreita: sai daqui apenas um GET sem parâmetro nenhum. Nenhum dado seu
// atravessa a rede — nem valor, nem descrição, nem identificador.
//
// Fonte: Frankfurter (https://frankfurter.dev), taxas de referência do Banco
// Central Europeu, código aberto e sem cadastro.
//
// ─── "Tempo real" não existe aqui, e a tela precisa dizer isso ───────────────
// O BCE publica UMA cotação por dia útil, por volta das 16h de Brasília. Não é
// a taxa do seu banco nem a do câmbio turismo, que embutem spread e IOF. Por
// isso a resposta sempre carrega `date` e `stale`: a tela mostra de quando é o
// número. Cotação sem data é a mentira mais fácil de contar numa tela.

const FONTE = 'https://api.frankfurter.dev/v1/latest';
const CHAVE = 'fx_cache';

// De quanto em quanto tempo vale tentar de novo. Menor que isto é bater no
// servidor alheio à toa: a taxa só muda uma vez por dia útil.
const VALIDADE_MS = 6 * 60 * 60 * 1000;

// Se o servidor não responder rápido, o conversor abre com a taxa guardada em
// vez de deixar a tela pendurada. Offline tem de ser um caso comum, não um erro.
const TIMEOUT_MS = 6000;

const lerCache = (db) => {
  try { return JSON.parse(getSetting(db, CHAVE) || 'null'); } catch { return null; }
};

export async function GET() {
  const db = getDb();
  const cache = lerCache(db);
  const agora = Date.now();
  const fresco = cache?.fetched_at && (agora - cache.fetched_at) < VALIDADE_MS;

  if (fresco) {
    return NextResponse.json({ ...cache, stale: false, offline: false });
  }

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(FONTE, { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const dados = await res.json();
    // A resposta vem com base EUR e todas as moedas. Guardar assim permite
    // qualquer par por regra de três, sem uma requisição por par.
    if (!dados?.rates?.USD || !dados?.date) throw new Error('resposta inesperada');

    const novo = {
      base: dados.base || 'EUR',
      date: dados.date,                       // dia da cotação, segundo o BCE
      rates: { ...dados.rates, [dados.base || 'EUR']: 1 },
      fetched_at: agora,                      // quando ESTE app buscou
      source: 'ECB/Frankfurter',
    };
    setSetting(db, CHAVE, JSON.stringify(novo));
    return NextResponse.json({ ...novo, stale: false, offline: false });
  } catch (e) {
    // Sem rede, com cache: serve o que tem e AVISA que está velho. Sem cache:
    // diz que não sabe. Em nenhum dos dois casos inventa um número — cotação
    // chutada é pior que cotação ausente, porque parece certa.
    if (cache) return NextResponse.json({ ...cache, stale: true, offline: true });
    return NextResponse.json({ error: String(e.message || e), offline: true }, { status: 503 });
  }
}
