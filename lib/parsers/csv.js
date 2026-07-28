// Leitor de CSV de extrato/fatura.
//
// Ordem de tentativa, do mais informado ao mais burro:
//   1. perfil de banco detectado pelo conteúdo (lib/banks) → mapeamento dele;
//   2. cabeçalho reconhecido por sinônimos (pt/es/en), em qualquer ordem;
//   3. posicional (data, descrição, …, valor) — o comportamento original, que
//      funciona e por isso continua sendo o último recurso, não o primeiro.
//
// Suporta separador ';' ',' e tab; datas dd/mm/aaaa, dd-mm-aaaa, aaaa-mm-dd e
// dd/mm/aa; decimal por vírgula ou ponto; valor em coluna única assinada ou em
// colunas separadas de débito/crédito (comum na Argentina); negativo entre
// parênteses ou com sinal à direita.

import { parseAmountToCents } from '../format.js';
import { detectBank, columnsFor, pickColumn } from '../banks/index.js';

function splitLine(line, sep) {
  const out = [];
  let cur = '', inQ = false;
  for (const ch of line) {
    if (ch === '"') inQ = !inQ;
    else if (ch === sep && !inQ) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(c => c.trim().replace(/^"|"$/g, ''));
}

const SEPS = [';', '\t', ','];

/**
 * Separador mais provável: o que aparece mais vezes, e de forma consistente,
 * nas primeiras linhas. Empate resolve na ordem ';' > tab > ',' porque ',' é o
 * único que também aparece DENTRO de valor ("1.234,56").
 */
function sniffSep(lines) {
  const sample = lines.slice(0, 5);
  let best = ';', bestScore = -1;
  for (const sep of SEPS) {
    const counts = sample.map(l => splitLine(l, sep).length - 1);
    const total = counts.reduce((a, b) => a + b, 0);
    if (total <= 0) continue;
    // consistência: mesma quantidade de campos em todas as linhas vale mais
    const consistent = new Set(counts.filter(c => c > 0)).size <= 1;
    const score = total + (consistent ? 100 : 0);
    if (score > bestScore) { best = sep; bestScore = score; }
  }
  return bestScore < 0 ? ';' : best;
}

/**
 * Data em qualquer das grafias usadas por banco brasileiro e argentino.
 * `order` vem do perfil quando conhecido; sem perfil assume dia-mês-ano (é o
 * que BR e AR usam) e só desempata para mês-dia-ano se o dia for > 12.
 */
export function parseDate(s, order) {
  const raw = String(s || '').trim();
  let m = raw.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
  if (m) return iso(m[1], m[2], m[3]);

  m = raw.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/);
  if (!m) return null;
  let [, a, b, y] = m;
  if (y.length === 2) y = String(+y <= 79 ? 2000 + +y : 1900 + +y);
  // Sem perfil: dia-mês, salvo quando o segundo campo > 12 (só pode ser dia).
  const dayFirst = order === 'dmy' ? true : order === 'mdy' ? false : +b <= 12;
  const [d, mo] = dayFirst ? [a, b] : [b, a];
  if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31) return null;
  return iso(y, mo, d);
}

const iso = (y, m, d) =>
  `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/**
 * Valor → centavos, ou null. `decimal` (',' ou '.') vem do perfil; sem perfil
 * cai na heurística de lib/format.js, com um reforço: "1.234" e "1,234"
 * puramente agrupados são milhar, não decimal — o parseAmountToCents sozinho
 * leria 1,234 como um real e vinte e três centavos.
 */
export function parseAmountCents(raw, decimal) {
  let s = String(raw ?? '').replace(/[ \s]/g, '');
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
  return idx;
}

const usable = (idx) => idx.date >= 0 && (idx.amount >= 0 || (idx.debit >= 0 || idx.credit >= 0));

/**
 * Lê o CSV e diz também QUAL perfil reconheceu — quem importa usa isso para o
 * `source` da transação e para mostrar o banco detectado.
 *
 * @param {string} text
 * @param {{fileName?: string, profile?: object|null}} [opts]
 * @returns {{profile: object|null, transactions: Array}}
 */
export function parseCsvFile(text, { fileName = '', profile: forced } = {}) {
  const lines = String(text ?? '').split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return { profile: null, transactions: [] };

  const profile = forced !== undefined ? forced : detectBank(text, fileName, 'csv');
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

  const sign = spec.amountSign || 'auto';
  const txs = [];
  for (const line of rows) {
    const c = splitLine(line, sep);
    const date = parseDate(c[idx.date] || '', spec.dateFormat);
    if (!date) continue;

    const description = (idx.description >= 0 && c[idx.description])
      ? c[idx.description]
      // TODO i18n: import.noDescription — string de DADO (vai para
      // transactions.description), não de tela; mantida como estava.
      : 'Sem descrição';
    if (profile?.skipRow?.test(description)) continue;

    const cents = amountOf(c, idx, spec, sign);
    if (cents == null || cents === 0) continue;

    txs.push({
      date,
      description,
      amount: cents / 100,
      externalId: (idx.id >= 0 && c[idx.id]) ? c[idx.id] : null,
      source: profile?.source || 'csv',
      transfer: false,
    });
  }
  return { profile, transactions: txs };
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
