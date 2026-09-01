// Datas financeiras são strings "AAAA-MM-DD". A regex sozinha aceita
// 2026-02-31, que ordena normalmente no SQLite e vira um erro silencioso em
// filtros e totais. Validamos o calendário sem converter pelo fuso local.
export function isValidIsoDate(value) {
  if (typeof value !== 'string') return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [, ys, ms, ds] = m;
  const year = Number(ys), month = Number(ms), day = Number(ds);
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}
