// Formatação e parsing de moeda, data e número — dirigidos pelo locale da
// instância (lib/config.js). Substitui os `fmtBRL` espalhados pelas páginas.
//
// Regra de ouro do projeto: valores circulam em CENTAVOS (inteiro) no banco e
// nas APIs. Só a borda de exibição/entrada converte.

import { LOCALE, REGION, CURRENCY } from './config.js';

const nf = (opts) => new Intl.NumberFormat(REGION.intl, opts);

// Instâncias de Intl são caras de criar; memoiza as usadas em listas grandes.
const moneyFmt = nf({ style: 'currency', currency: CURRENCY });
const moneyFmt0 = nf({ style: 'currency', currency: CURRENCY, maximumFractionDigits: 0 });
const numFmt = nf({});

/** Centavos → moeda local. Ex.: 123456 → "R$ 1.234,56" / "$ 1.234,56" */
export const fmtMoney = (cents) => moneyFmt.format((cents || 0) / 100);

/** Centavos → moeda local sem centavos, para eixos de gráfico e cards. */
export const fmtMoney0 = (cents) => moneyFmt0.format((cents || 0) / 100);

/** Centavos → forma compacta ("R$ 12,3 mil"). Usado em gráficos apertados. */
export function fmtMoneyShort(cents) {
  const v = (cents || 0) / 100;
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${REGION.symbol} ${numFmt.format(+(v / 1_000_000).toFixed(1))}M`;
  if (abs >= 1_000) return `${REGION.symbol} ${numFmt.format(+(v / 1_000).toFixed(1))}k`;
  return moneyFmt.format(v);
}

/** Símbolo da moeda ativa, para placeholders de input. */
export const currencySymbol = REGION.symbol;

/**
 * Texto digitado pelo usuário → centavos (inteiro), ou null se não for número.
 * Aceita "1.234,56", "1234.56", "R$ 1.234,56", "$1234", "-45,90".
 * Heurística: se houver vírgula E ponto, o que vier por último é o decimal.
 */
export function parseAmountToCents(input) {
  if (input == null) return null;
  let s = String(input).trim();
  if (!s) return null;
  const negative = /^-/.test(s) || /\(.*\)/.test(s); // (1.234,56) = negativo
  s = s.replace(/[^\d.,-]/g, '');                    // fora símbolo e espaço
  if (!s) return null;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let normalized;
  if (lastComma > lastDot) {
    normalized = s.replace(/\./g, '').replace(',', '.');       // 1.234,56
  } else if (lastDot > lastComma) {
    normalized = s.replace(/,/g, '');                          // 1,234.56
  } else {
    normalized = s;                                            // 1234
  }
  normalized = normalized.replace(/-/g, '');
  const v = parseFloat(normalized);
  if (!isFinite(v)) return null;
  const cents = Math.round(v * 100);
  return negative ? -cents : cents;
}

/** "AAAA-MM-DD" → data local curta ("26/07/2026"). */
export function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  if (!y || !m || !d) return String(iso);
  // Formatação manual: `new Date('2026-07-26')` é UTC e desloca o dia em
  // fusos negativos — bug clássico que já mordeu este projeto.
  return REGION.dateOrder === 'dmy' ? `${d}/${m}/${y}` : `${m}/${d}/${y}`;
}

/** "AAAA-MM-DD" → dia e mês ("26/07"). */
export function fmtDayMonth(iso) {
  if (!iso) return '';
  const [, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}`;
}

/** "AAAA-MM" → mês por extenso capitalizado ("Julho 2026" / "Julio 2026"). */
export function fmtMonthLong(ym) {
  if (!ym) return '';
  const [y, m] = String(ym).split('-');
  const label = new Intl.DateTimeFormat(REGION.intl, { month: 'long', timeZone: 'UTC' })
    .format(new Date(Date.UTC(+y, +m - 1, 1)));
  return `${label.charAt(0).toUpperCase()}${label.slice(1)} ${y}`;
}

/** "AAAA-MM" → mês abreviado ("jul/26"). Para eixo do gráfico de evolução. */
export function fmtMonthShort(ym) {
  if (!ym) return '';
  const [y, m] = String(ym).split('-');
  const label = new Intl.DateTimeFormat(REGION.intl, { month: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(+y, +m - 1, 1)));
  return `${label.replace('.', '')}/${String(y).slice(2)}`;
}

/** Data/hora de agora no formato local — usado no cabeçalho do relatório. */
export const fmtToday = () =>
  new Intl.DateTimeFormat(REGION.intl, { dateStyle: 'short' }).format(new Date());

/** Número puro com separadores locais. */
export const fmtNumber = (n) => numFmt.format(n || 0);

/** Percentual inteiro ("37%"). */
export const fmtPercent = (ratio) =>
  nf({ style: 'percent', maximumFractionDigits: 0 }).format(ratio || 0);

export { LOCALE, CURRENCY };
