// Leitor de CSV de extrato/fatura.
//
// Ordem de tentativa, do mais informado ao mais burro:
//   1. perfil de banco detectado pelo conteúdo (lib/banks) → mapeamento dele;
//   2. cabeçalho reconhecido por sinônimos (pt/es/en), em qualquer ordem;
//   3. posicional (data, descrição, …, valor) — o comportamento original, que
//      funciona e por isso continua sendo o último recurso, não o primeiro.
//
// O que varia de banco para banco e é resolvido aqui, sem depender de perfil:
//
//   separador  ';' ',' tab e '|', escolhido pela CONSISTÊNCIA do número de
//              colunas entre as linhas — contar só a primeira erra quando a
//              descrição tem vírgula ou quando há preâmbulo com ponto e vírgula;
//   aspas      campo entre aspas com separador dentro, e aspas duplas
//              escapadas ("") no padrão RFC 4180;
//   decimal    decidido pela COLUNA INTEIRA, não pela célula (ver sniffDecimal);
//   data       dd/mm/aaaa, dd-mm-aaaa, aaaa-mm-dd, dd/mm/aa, dd.mm.aaaa, com o
//              desempate dd/mm × mm/dd olhando a coluna inteira (ver
//              sniffDateOrder);
//   sujeira    CRLF e CR solto, BOM residual, espaço não separável (U+00A0),
//              preâmbulo, cabeçalho repetido, saldo, subtotal, rodapé e linha
//              em branco.
//
// Regra de ouro: quando a evidência não decide, o parser AVISA (`warnings`) e
// cai no comportamento antigo. Chutar calado em dado financeiro é pior que não
// reconhecer.

import { parseAmountToCents } from '../format.js';
import { t } from '../i18n/index.js';
import { detectBank, columnsFor, pickColumn } from '../banks/index.js';

/**
 * Separa uma linha em campos, no padrão RFC 4180.
 *
 * Diferente da versão anterior (que só alternava um flag a cada aspas), aqui:
 *   - aspas só ABREM campo se o campo ainda estiver vazio, então um polegada
 *     no meio da descrição ('TV 50" SAMSUNG') não engole o resto da linha;
 *   - "" dentro de campo entre aspas vira uma aspas literal;
 *   - espaço depois da aspas de fechamento é descartado, mas espaço DENTRO das
 *     aspas é preservado — igual ao comportamento antigo, e isso importa: a
 *     descrição entra no hash de deduplicação.
 */
export function splitLine(line, sep) {
  const out = [];
  let cur = '', inQ = false, quoted = false, closed = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch !== '"') { cur += ch; continue; }
      if (line[i + 1] === '"') { cur += '"'; i++; continue; }  // "" → " literal
      inQ = false; closed = true;
      continue;
    }
    if (ch === sep) { out.push(cell(cur, quoted)); cur = ''; quoted = closed = false; continue; }
    if (ch === '"' && !closed && !cur.trim()) { inQ = true; quoted = true; cur = ''; continue; }
    if (closed && /\s/.test(ch)) continue;
    cur += ch;
  }
  out.push(cell(cur, quoted));
  return out;
}

// Campo sem aspas é aparado (o .trim() do JS já tira o U+00A0, que aparece
// direto em export de banco); campo entre aspas fica como veio.
const cell = (s, quoted) => (quoted ? s : s.trim());

// ',' por último de propósito: é o único separador que também aparece DENTRO
// de valor ("1.234,56") e de descrição.
const SEPS = [';', '\t', '|', ','];

/**
 * Separador mais provável, pela consistência do número de colunas.
 *
 * O critério é: qual separador produz a MESMA quantidade de campos no maior
 * número de linhas. Contagem bruta não serve — um preâmbulo com um ';' solto
 * ("Extrato; conta 12345, agência 001") ganhava da vírgula que separa as
 * colunas de verdade, porque aparecia "de forma consistente" em uma linha só.
 * O número de colunas entra apenas como desempate.
 */
export function sniffSep(lines) {
  const sample = lines.slice(0, 30);
  if (!sample.length) return ';';
  let best = null;
  for (const sep of SEPS) {
    const counts = sample.map((l) => splitLine(l, sep).length).filter((n) => n > 1);
    if (!counts.length) continue;
    const freq = new Map();
    for (const n of counts) freq.set(n, (freq.get(n) || 0) + 1);
    const [cols, hits] = [...freq].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
    const score = (hits / sample.length) * 1000 + Math.min(cols, 20) * 10 + hits;
    if (!best || score > best.score) best = { sep, score };
  }
  return best ? best.sep : ';';
}

/**
 * Data em qualquer das grafias usadas por banco brasileiro e argentino.
 * `order` vem do perfil quando conhecido, ou da análise da coluna inteira
 * (sniffDateOrder); sem nenhum dos dois assume dia-mês-ano — é o que BR e AR
 * usam — e só desempata para mês-dia-ano se o segundo campo for > 12.
 */
export function parseDate(s, order) {
  const raw = String(s || '').trim();
  let m = raw.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
  if (m) return iso(m[1], m[2], m[3]);

  m = raw.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/);
  if (!m) return null;
  let [, a, b, y] = m;
  if (y.length === 2) y = String(+y <= 79 ? 2000 + +y : 1900 + +y);
  const dayFirst = order === 'dmy' ? true : order === 'mdy' ? false : +b <= 12;
  const [d, mo] = dayFirst ? [a, b] : [b, a];
  if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31) return null;
  return iso(y, mo, d);
}

const iso = (y, m, d) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/**
 * Ordem dos campos da COLUNA de data.
 *
 * Célula por célula, "07/05/2026" é indecidível. A coluna não é: basta UMA
 * linha com o primeiro campo > 12 para o mês estar na segunda posição em TODAS
 * (nenhum banco alterna formato no mesmo arquivo), e vice-versa.
 *
 *   05/07 06/07 20/07  → algum dia > 12 na 1ª posição  → dmy
 *   07/05 07/20        → algum dia > 12 na 2ª posição  → mdy
 *   05/07 06/07        → sem evidência → null (parseDate assume dmy)
 *   25/07 07/25        → CONFLITO: o arquivo mistura os dois → null + aviso,
 *                        e cada célula se vira sozinha. Não dá para escolher
 *                        sem inventar, e inventar aqui troca julho por maio.
 *
 * @returns {{order: 'dmy'|'mdy'|null, why: string}}
 */
export function sniffDateOrder(values) {
  let dmy = 0, mdy = 0;
  for (const v of values) {
    const s = String(v ?? '').trim();
    if (/^\d{4}[-\/.]/.test(s)) continue;               // ISO não tem ambiguidade
    const m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/);
    if (!m) continue;
    const a = +m[1], b = +m[2];
    if (a > 12 && b <= 12) dmy++;
    else if (b > 12 && a <= 12) mdy++;
  }
  if (dmy && mdy) return { order: null, why: 'conflito' };
  if (dmy) return { order: 'dmy', why: 'dia > 12 na primeira posição' };
  if (mdy) return { order: 'mdy', why: 'dia > 12 na segunda posição' };
  return { order: null, why: 'sem evidência' };
}

/**
 * Separador decimal da COLUNA de valor.
 *
 * "1.234" sozinho é indecidível: mil duzentos e trinta e quatro (BR/AR) ou
 * 1,234 (US). A coluna decide, porque um extrato não mistura convenção:
 *
 *   qualquer célula com vírgula decimal ("-45,90")      → ','  (BR/AR)
 *   qualquer célula com ponto decimal  ("-45.90")       → '.'  (US)
 *   nenhuma das duas, mas há "1.234" (grupo de milhar)  → ','  (o ponto agrupa)
 *   nenhuma das duas, mas há "1,234"                    → '.'  (a vírgula agrupa)
 *   nada                                                → null (célula a célula)
 *
 * EMPATE (a coluna tem as duas formas decimais): devolve null e AVISA. A
 * heurística por célula de lib/format.js — vale o último separador — acerta
 * "1.234,56" e "1,234.56" individualmente, então cair nela é melhor que impor
 * uma convenção errada à coluna inteira. O que continua indecidível nesse caso
 * é o "1.234" puro, e é exatamente sobre isso que o aviso serve.
 *
 * @returns {{decimal: ','|'.'|null, why: string}}
 */
export function sniffDecimal(values) {
  let comma = 0, dot = 0, commaGroup = 0, dotGroup = 0;
  for (const v of values) {
    const s = String(v ?? '').replace(/[^\d.,-]/g, '');
    if (!/\d/.test(s)) continue;
    if (/,\d{1,2}(?!\d)/.test(s)) comma++;
    if (/\.\d{1,2}(?!\d)/.test(s)) dot++;
    if (/\d,\d{3}(?!\d)/.test(s)) commaGroup++;
    if (/\d\.\d{3}(?!\d)/.test(s)) dotGroup++;
  }
  if (comma && dot) return { decimal: null, why: 'empate' };
  if (comma) return { decimal: ',', why: `vírgula decimal em ${comma} valor(es)` };
  if (dot) return { decimal: '.', why: `ponto decimal em ${dot} valor(es)` };
  if (dotGroup && !commaGroup) return { decimal: ',', why: 'ponto usado como milhar' };
  if (commaGroup && !dotGroup) return { decimal: '.', why: 'vírgula usada como milhar' };
  return { decimal: null, why: 'sem evidência' };
}

/**
 * Valor → centavos, ou null. `decimal` (',' ou '.') vem do perfil ou da coluna;
 * sem ele cai na heurística de lib/format.js, com um reforço: "1.234" e "1,234"
 * puramente agrupados são milhar, não decimal — o parseAmountToCents sozinho
 * leria 1,234 como um real e vinte e três centavos.
 */
export function parseAmountCents(raw, decimal) {
  let s = String(raw ?? '').replace(/[ \s]/g, '');   // \s do JS já inclui U+00A0
  if (!s) return null;
  const parens = /^\(.*\)$/.test(s);
  s = s.replace(/[()]/g, '');
  const trailingMinus = /-$/.test(s);
  s = s.replace(/-$/, '');
  // sufixo D/C usado por alguns extratos ("1.234,56 D")
  const suffix = s.match(/([DCdc])$/)?.[1]?.toUpperCase();
  if (suffix) s = s.slice(0, -1);
  s = s.replace(/[^\d.,-]/g, '');
  if (!/\d/.test(s)) return null;

  let cents;
  if (decimal === ',') {
    cents = round100(s.replace(/\./g, '').replace(',', '.'));
  } else if (decimal === '.') {
    cents = round100(s.replace(/,/g, ''));
  } else if (/^-?\d{1,3}([.,]\d{3})+$/.test(s)) {
    cents = round100(s.replace(/[.,]/g, ''));   // só grupos de milhar
  } else {
    cents = parseAmountToCents(s);
  }
  if (cents == null || !isFinite(cents)) return null;
  if (parens || trailingMinus || suffix === 'D') cents = -Math.abs(cents);
  if (suffix === 'C') cents = Math.abs(cents);
  return cents;
}

function round100(str) {
  const v = parseFloat(str);
  return isFinite(v) ? Math.round(v * 100) : null;
}

/**
 * Confere a cadeia de saldos declarada no próprio CSV.
 *
 * É a checagem que a soma de totais não faz: pega sinal invertido numa linha,
 * lançamento perdido no meio e valor lido com decimal errado — casos em que o
 * total continua plausível e a data continua certa.
 *
 * ─── Por que AVISA em vez de abortar ─────────────────────────────────────────
 * O OFX e o extrato argentino ABORTAM quando a cadeia não fecha, e está certo:
 * são formatos fechados, de um emissor só, e uma quebra ali significa que o
 * parser errou.
 *
 * CSV é o leitor genérico. Uma cadeia quebrada também acontece quando a pessoa
 * exportou uma VISÃO FILTRADA — por categoria, por busca, por conta — e nesse
 * caso não há erro nenhum: faltam linhas no arquivo, não na leitura. Abortar
 * impediria importações que hoje funcionam, para punir o usuário por um erro do
 * parser que pode não existir.
 *
 * Então: silêncio quando fecha, aviso nomeando a primeira divergência quando
 * não fecha. Quem exportou filtrado ignora; quem não exportou vai olhar.
 *
 * A DIREÇÃO é descoberta, não presumida: há banco que exporta do mais novo para
 * o mais antigo e banco que faz o contrário. Testa as duas e fica com a que
 * quebra menos.
 *
 * @param {Array<{date: string, description: string, amount: number, balance: number|null}>} txs
 * @returns {{quebras: number, total: number, primeira: object|null}|null}
 *   null quando não há saldo suficiente para conferir
 */
export function conferirCadeiaSaldo(txs) {
  const comSaldo = txs.filter((t) => t.balance != null);
  if (comSaldo.length < 2 || comSaldo.length !== txs.length) return null;

  const c = (v) => Math.round(v * 100);

  // asc:  saldo[i] = saldo[i-1] + valor[i]   (mais antigo primeiro)
  // desc: saldo[i] = saldo[i+1] + valor[i]   (mais novo primeiro)
  const medir = (desc) => {
    const quebras = [];
    for (let i = 0; i < txs.length; i++) {
      const anterior = desc ? txs[i + 1] : txs[i - 1];
      if (!anterior) continue;
      const esperado = c(anterior.balance) + c(txs[i].amount);
      if (Math.abs(esperado - c(txs[i].balance)) > 1) {
        quebras.push({
          date: txs[i].date,
          description: String(txs[i].description).slice(0, 40),
          esperado: esperado / 100,
          declarado: txs[i].balance,
        });
      }
    }
    return quebras;
  };

  const asc = medir(false), dsc = medir(true);
  const quebras = asc.length <= dsc.length ? asc : dsc;
  return { quebras: quebras.length, total: txs.length - 1, primeira: quebras[0] ?? null };
}

/** Índices de coluna resolvidos a partir de uma linha de cabeçalho. */
function mapHeader(cells, cols) {
  const at = (f) => pickColumn(cells, cols[f]);
  const idx = {
    date: at('date'), description: at('description'), amount: at('amount'),
    debit: at('debit'), credit: at('credit'), id: at('id'), type: at('type'),
  };
  // saldo nunca é valor de lançamento; se a heurística caiu nele, descarta
  const balance = at('balance');
  if (idx.amount === balance) idx.amount = -1;
  // …mas o índice FICA: o saldo é a única evidência interna que um CSV oferece
  // para conferir a leitura linha a linha (ver conferirCadeiaSaldo).
  idx.balance = balance;
  return idx;
}

const usable = (idx) => idx.date >= 0 && (idx.amount >= 0 || (idx.debit >= 0 || idx.credit >= 0));

/**
 * Linha que TEM data e valor e mesmo assim não é lançamento: fechamento de
 * saldo, subtotal, rodapé de totais. Cada perfil já traz o seu `skipRow`; isto
 * é a rede para o CSV genérico, que não tem perfil nenhum.
 *
 * O padrão de "total" é fechado de propósito ("Total", "Total do mês",
 * "Totales") em vez de `^total`: "TOTAL EXPRESS TRANSPORTES" é estabelecimento,
 * e engolir uma despesa real seria pior que importar um subtotal.
 */
const SUMMARY_RX =
  /^(?:s ?a ?l ?d ?o\b|saldos?\b|subtotal|sub-total|total(?:es|ais)?$|total\s+(?:do|da|de|del|dos|geral|general|mes|m[êe]s|per[íi]odo|periodo|acumulado)\b)/i;

const isSummary = (desc) =>
  SUMMARY_RX.test(String(desc ?? '').replace(/[   ]/g, ' ').trim());

/**
 * Lê o CSV e diz também QUAL perfil reconheceu — quem importa usa isso para o
 * `source` da transação e para mostrar o banco detectado.
 *
 * @param {string} text
 * @param {{fileName?: string, profile?: object|null}} [opts]
 * @returns {{profile: object|null, transactions: Array, warnings: string[],
 *            sep: string, decimal: string|null, dateFormat: string|null}}
 */
export function parseCsvFile(text, { fileName = '', profile: forced } = {}) {
  const warnings = [];
  // CR solto (export de Mac antigo) conta como quebra; BOM residual sai fora.
  const raw = String(text ?? '').replace(/^﻿/, '');
  const lines = raw.split(/\r\n|\r|\n/).filter((l) => l.trim());
  if (!lines.length) {
    return { profile: null, transactions: [], warnings, sep: ';', decimal: null, dateFormat: null };
  }

  const profile = forced !== undefined ? forced : detectBank(raw, fileName, 'csv');
  const spec = profile?.csv || {};
  const sep = spec.sep || sniffSep(lines);
  const cols = columnsFor(profile);

  // Cabeçalho pode não estar na primeira linha: Bradesco e Inter escrevem um
  // preâmbulo com titular e período antes dela.
  let idx = null, headerAt = -1;
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const cand = mapHeader(splitLine(lines[i], sep), cols);
    if (usable(cand)) { idx = cand; headerAt = i; break; }
  }

  let rows;
  if (idx) {
    rows = lines.slice(headerAt + 1);
  } else if (spec.positions) {
    // export sem cabeçalho (Itaú): o perfil diz as posições
    idx = { date: -1, description: -1, amount: -1, debit: -1, credit: -1, id: -1, type: -1, ...spec.positions };
    rows = lines;
  } else {
    // Último recurso: posicional. Comportamento original do Fluxo, mantido
    // porque é o que salva CSV feito à mão e export exótico.
    const first = splitLine(lines[0], sep);
    idx = { date: 0, description: 1, amount: first.length - 1, debit: -1, credit: -1, id: -1, type: -1 };
    rows = lines;
  }

  const cells = rows.map((l) => splitLine(l, sep));

  // ── análise de coluna ──────────────────────────────────────────────────────
  // Só as linhas que começam com algo em forma de data entram na amostra:
  // preâmbulo, rodapé e cabeçalho repetido contaminariam a estatística.
  const DATEISH = /^\d{1,4}[-\/.]\d{1,2}[-\/.]\d{1,4}/;
  const txCells = idx.date >= 0
    ? cells.filter((c) => DATEISH.test(String(c[idx.date] ?? '').trim()))
    : [];
  const colOf = (i) => (i >= 0 ? txCells.map((c) => c[i]) : []);

  let dateFormat = spec.dateFormat || null;
  if (!dateFormat && txCells.length) {
    const d = sniffDateOrder(colOf(idx.date));
    if (d.order) dateFormat = d.order;
    else if (d.why === 'conflito') {
      warnings.push(t('import.warn.csvMixedDates'));
    }
  }

  let decimal = spec.decimal || null;
  if (!decimal && txCells.length) {
    const amounts = [...colOf(idx.amount), ...colOf(idx.debit), ...colOf(idx.credit)];
    const d = sniffDecimal(amounts);
    if (d.decimal) decimal = d.decimal;
    else if (d.why === 'empate') {
      warnings.push(t('import.warn.csvMixedDecimals'));
    }
  }

  const eff = { ...spec, dateFormat, decimal };
  const sign = spec.amountSign || 'auto';
  const txs = [];
  for (const c of cells) {
    const date = parseDate(c[idx.date] || '', eff.dateFormat);
    if (!date) continue;   // preâmbulo, cabeçalho repetido, rodapé, linha vazia

    const description = (idx.description >= 0 && c[idx.description])
      ? c[idx.description]
      // TODO i18n: import.noDescription — string de DADO (vai para
      // transactions.description), não de tela; mantida como estava.
      : 'Sem descrição';
    if (profile?.skipRow?.test(description) || isSummary(description)) continue;

    const cents = amountOf(c, idx, eff, sign);
    if (cents == null || cents === 0) continue;

    const saldo = idx.balance >= 0 ? parseAmountCents(c[idx.balance] || '', eff.decimal) : null;

    txs.push({
      date,
      description,
      amount: cents / 100,
      externalId: (idx.id >= 0 && c[idx.id]) ? c[idx.id] : null,
      source: profile?.source || 'csv',
      transfer: false,
      balance: saldo == null ? null : saldo / 100,
    });
  }

  const cadeia = conferirCadeiaSaldo(txs);
  if (cadeia?.quebras) {
    const p = cadeia.primeira;
    warnings.push(t('import.warn.csvChain', {
      broken: cadeia.quebras,
      total: cadeia.total,
      date: p.date,
      desc: p.description,
      expected: p.esperado.toFixed(2),
      declared: p.declarado.toFixed(2),
    }));
  }

  // O saldo não é dado de transação: serviu para conferir e sai daqui.
  return {
    profile,
    transactions: txs.map(({ balance, ...t }) => t),
    warnings, sep, decimal, dateFormat,
  };
}

/**
 * Valor da linha em centavos, com sinal resolvido.
 * 'expense' inverte (fatura de cartão: consumo vem positivo, estorno negativo);
 * débito/crédito em colunas separadas é o caso argentino/Bradesco; a coluna
 * "Tipo" só desempata quando o número vem sem sinal.
 */
function amountOf(c, idx, spec, sign) {
  const dec = spec.decimal;
  const hasPair = idx.debit >= 0 || idx.credit >= 0;

  if (sign === 'debitCredit' || (hasPair && (sign === 'auto' || idx.amount < 0))) {
    const d = Math.abs(parseAmountCents(c[idx.debit] ?? '', dec) || 0);
    const cr = Math.abs(parseAmountCents(c[idx.credit] ?? '', dec) || 0);
    if (!d && !cr) return null;
    return cr - d;
  }

  let cents = parseAmountCents(c[idx.amount] ?? '', dec);
  if (cents == null) return null;
  if (sign === 'expense') return -cents;

  const raw = String(c[idx.amount] ?? '');
  const signless = !/[-()]/.test(raw) && !/[dcDC]\s*$/.test(raw);
  if (idx.type >= 0 && signless) {
    const tipo = String(c[idx.type] ?? '').toLowerCase();
    if (/^d|debit|debe|gasto|consumo|compra|pago|egreso|saida|saída/.test(tipo)) return -Math.abs(cents);
    if (/^c|credit|haber|ingreso|acredit|deposit|entrada|cobro/.test(tipo)) return Math.abs(cents);
  }
  return cents;
}

/**
 * Assinatura histórica: só as transações. Mantida porque é o que o resto do app
 * (e os testes antigos) consomem.
 */
export function parseCsv(text, opts) {
  return parseCsvFile(text, opts).transactions;
}
