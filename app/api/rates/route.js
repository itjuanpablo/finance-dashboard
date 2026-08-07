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

// ─── A segunda fonte, e por que ela é segunda ────────────────────────────────
// O BCE publica ~30 moedas e NÃO publica peso argentino — justo a que faz falta
// aqui. Esta fonte cobre o resto, mas não tem a mesma natureza: o BCE divulga
// uma taxa de referência oficial, uma vez por dia útil; esta é uma média de
// mercado. Por isso ela complementa e não substitui — onde o BCE tem o número,
// o número do BCE prevalece.
//
// As moedas abaixo saem daqui, e a tela avisa quando uma delas está em uso.
const FONTE_EXTRA =
  'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json';
const EXTRAS = ['ARS'];

// As moedas que o conversor oferece. A fonte devolve ~30 e a lista virava uma
// rolagem de siglas que ninguém reconhece — IDR, ISK, MYR — para achar quatro
// que importam. Lista curta é escolha de produto, não limitação técnica:
// acrescentar uma linha aqui basta (e o `VERSAO_CACHE` abaixo cuida do resto).
//
// A ordem é a da tela, e é deliberada: primeiro as duas do usuário, depois as
// que ele realmente usa, depois as grandes.
const MOEDAS = ['BRL', 'USD', 'ARS', 'EUR', 'GBP', 'JPY', 'CHF', 'CNY', 'CAD', 'AUD'];

// Cache guardado por versão. SEM isto, mudar a lista de moedas não teria efeito
// nenhum para quem já tinha cotação salva: o app serviria a lista antiga até o
// cache expirar, e o peso argentino simplesmente não apareceria — foi
// exatamente o que aconteceu. Cache que não sabe de que época é mente calado.
const VERSAO_CACHE = 2;

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
  const fresco = cache?.v === VERSAO_CACHE
    && cache?.fetched_at && (agora - cache.fetched_at) < VALIDADE_MS;

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

    const rates = { ...dados.rates, [dados.base || 'EUR']: 1 };

    // Moedas que o BCE não publica. Falha aqui NÃO derruba a cotação principal:
    // é melhor um conversor com 30 moedas que um conversor nenhum.
    let extra = [];
    let extraDate = null;
    try {
      const r2 = await fetch(FONTE_EXTRA, { cache: 'no-store' });
      if (r2.ok) {
        const d2 = await r2.json();
        const porDolar = d2?.usd;
        for (const cod of EXTRAS) {
          const v = porDolar?.[cod.toLowerCase()];
          // A fonte extra dá "quanto vale 1 USD"; a base aqui é EUR. Converter
          // pela ponte USD do BCE mantém tudo num eixo só — misturar bases é
          // como as taxas ficam sutilmente erradas sem ninguém perceber.
          if (Number.isFinite(v) && v > 0 && !rates[cod]) {
            rates[cod] = rates.USD * v;
            extra.push(cod);
          }
        }
        extraDate = d2?.date ?? null;
      }
    } catch { /* sem as extras; segue com as do BCE */ }

    // Só as moedas oferecidas, na ordem da tela. A ordem de inserção do objeto
    // é o que o conversor usa para montar a lista — não há um segundo lugar
    // decidindo isso.
    const oferecidas = {};
    for (const c of MOEDAS) if (Number.isFinite(rates[c])) oferecidas[c] = rates[c];

    const faltando = MOEDAS.filter(c => !oferecidas[c]);

    const novo = {
      v: VERSAO_CACHE,
      base: dados.base || 'EUR',
      date: dados.date,                       // dia da cotação, segundo o BCE
      rates: oferecidas,
      extra: extra.filter(c => oferecidas[c]), // quais vieram da segunda fonte
      missing: faltando,                       // pedidas e não obtidas
      extra_date: extraDate,
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
