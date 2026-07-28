// Categorias como CHAVES ESTÁVEIS.
//
// Antes da internacionalização, o nome em português era o identificador: o banco
// guardava "Alimentação" em transactions.category, rules.category, goals.category
// e bills.category. Isso impedia traduzir (e quebrava quando o usuário renomeava).
//
// Agora o identificador é uma chave neutra ('food'), o nome exibido vem da
// tradução, e categorias criadas pelo usuário guardam o nome digitado com
// custom = 1 — essas nunca são traduzidas, por definição.

/** Chaves canônicas. Use estas constantes em vez de string literal. */
export const CAT = {
  FOOD: 'food',
  TRANSPORT: 'transport',
  HOUSING: 'housing',
  SHOPPING: 'shopping',
  LEISURE: 'leisure',
  TRAVEL: 'travel',
  HEALTH: 'health',
  SUBSCRIPTIONS: 'subscriptions',
  FINANCIAL: 'financial',
  INCOME: 'income',
  TRANSFERS: 'transfers',
  TO_REVIEW: 'to_review',
};

/** Semente: [chave, cor, emoji]. O nome vem de i18n (`cat.<chave>`). */
export const CATEGORY_SEED = [
  [CAT.FOOD,          '#f97316', '🍔'],
  [CAT.TRANSPORT,     '#3b82f6', '🚗'],
  [CAT.HOUSING,       '#8b5cf6', '🏠'],
  [CAT.SHOPPING,      '#ec4899', '🛍️'],
  [CAT.LEISURE,       '#a855f7', '🎮'],
  [CAT.TRAVEL,        '#06b6d4', '✈️'],
  [CAT.HEALTH,        '#14b8a6', '💊'],
  [CAT.SUBSCRIPTIONS, '#eab308', '📺'],
  [CAT.FINANCIAL,     '#f43f5e', '🏦'],
  [CAT.INCOME,        '#22c55e', '💰'],
  [CAT.TRANSFERS,     '#64748b', '🔁'],
  [CAT.TO_REVIEW,     '#94a3b8', '❓'],
];

/** Não podem ser renomeadas nem excluídas: o motor depende delas. */
export const SYSTEM_CATEGORIES = [CAT.TRANSFERS, CAT.TO_REVIEW];

/** Categorias "flexíveis" — candidatas a corte nas sugestões de insight. */
export const FLEX_CATEGORIES = [CAT.LEISURE, CAT.SHOPPING, CAT.SUBSCRIPTIONS];

/** Excluídas das sugestões de meta de gasto (não são gasto discricionário). */
export const NON_BUDGET_CATEGORIES = [CAT.TRANSFERS, CAT.INCOME, CAT.TO_REVIEW];

/**
 * Nomes históricos → chave. Usado UMA vez, na migração de bancos v3.x.
 * Inclui as variações em espanhol para o caso de reimportar um banco de outra
 * instância. Comparação por forma normalizada (sem acento, minúsculo).
 */
export const LEGACY_NAME_TO_KEY = {
  // português (nomes originais do Fluxo v1–v3)
  'alimentacao': CAT.FOOD,
  'transporte': CAT.TRANSPORT,
  'moradia': CAT.HOUSING,
  'compras': CAT.SHOPPING,
  'lazer': CAT.LEISURE,
  'viagem': CAT.TRAVEL,
  'saude': CAT.HEALTH,
  'assinaturas': CAT.SUBSCRIPTIONS,
  'financeiro': CAT.FINANCIAL,
  'renda': CAT.INCOME,
  'transferencias': CAT.TRANSFERS,
  'a revisar': CAT.TO_REVIEW,
  // espanhol
  'comida': CAT.FOOD,
  'alimentacion': CAT.FOOD,
  'vivienda': CAT.HOUSING,
  'ocio': CAT.LEISURE,
  'viajes': CAT.TRAVEL,
  'salud': CAT.HEALTH,
  'suscripciones': CAT.SUBSCRIPTIONS,
  'financiero': CAT.FINANCIAL,
  'ingresos': CAT.INCOME,
  'por revisar': CAT.TO_REVIEW,
  // ('transferencias' em espanhol normaliza igual ao português — já coberto)
};

/** As 12 chaves canônicas (as demais são customizadas, não traduzíveis). */
export const CANONICAL_KEYS = new Set(Object.values(CAT));

/** É uma das 12 chaves canônicas (portanto traduzível)? */
export const isCanonicalKey = (key) => CANONICAL_KEYS.has(key);

/** minúsculo, sem acento — forma de comparação de nomes. */
export const normalizeName = (s) =>
  String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/**
 * Nome livre → slug utilizável como chave de categoria customizada.
 * "Dízimo" → "dizimo"; "Conta de Luz" → "conta-de-luz".
 * Prefixo `x-` marca origem de usuário e evita colidir com chave canônica.
 */
export function slugifyCategory(name) {
  const base = normalizeName(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'categoria';
  return CANONICAL_KEYS.has(base) ? `x-${base}` : base;
}
