// Motor de tradução. Minúsculo de propósito: o locale é fixo por instância
// (ver lib/config.js), então não há troca em runtime, provider, nem re-render.
// `t()` é uma função pura sobre um objeto — funciona igual em Server e Client
// Component, e o dicionário não usado é eliminado no tree-shaking do build.

import { LOCALE, DEFAULT_LOCALE } from '../config.js';
import { isCanonicalKey } from '../categories.js';
import ptBR from './pt-BR.js';
import esAR from './es-AR.js';

const DICTS = { 'pt-BR': ptBR, 'es-AR': esAR };

const dict = DICTS[LOCALE] || DICTS[DEFAULT_LOCALE];
const fallback = DICTS[DEFAULT_LOCALE];

/**
 * Traduz uma chave. Interpola {variaveis}.
 *
 *   t('dash.income')                    → "Entradas"
 *   t('import.done', { n: 12 })         → "12 lançamentos importados"
 *
 * Chave ausente devolve a própria chave — falha visível na tela em vez de
 * string vazia silenciosa, que é bem mais difícil de caçar.
 */
export function t(key, vars) {
  let s = dict[key] ?? fallback[key];
  if (s == null) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[i18n] chave ausente: ${key}`);
    }
    return key;
  }
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
  }
  return s;
}

/**
 * Plural. Procura `<chave>.one` / `<chave>.other`, interpolando {n}.
 *
 *   tn(1, 'import.tx')  → "1 lançamento"
 *   tn(9, 'import.tx')  → "9 lançamentos"
 */
export function tn(n, key, vars) {
  const suffix = Math.abs(n) === 1 ? 'one' : 'other';
  return t(`${key}.${suffix}`, { n, ...vars });
}

/**
 * Nome de exibição de uma categoria.
 *
 * Canônica ('food') → traduzida. Customizada → o nome guardado no banco, que é
 * o que o usuário digitou; traduzir isso seria presunção.
 *
 * O terceiro argumento existe por um caso que só aparece na prática: o usuário
 * RENOMEIA uma categoria canônica. A chave continua 'food' (nenhum dado se
 * move), mas `custom = 1` registra que ele escolheu um nome — e a escolha dele
 * ganha da tradução. Sem esse argumento, a API e a página discordariam do nome
 * da mesma categoria.
 *
 * @param {string} key chave da categoria
 * @param {string} [storedName] nome vindo de categories.name
 * @param {number|boolean} [custom] categories.custom (0/1 do SQLite)
 */
export function catLabel(key, storedName, custom = 0) {
  if (!key) return storedName || '';
  if (isCanonicalKey(key) && !custom) return t(`cat.${key}`);
  return storedName || key;
}

/**
 * Constrói um resolvedor a partir da lista de categorias da API.
 * Evita repetir `catLabel(k, byKey[k]?.name, byKey[k]?.custom)` em toda página.
 *
 * @param {Array<{key: string, name?: string, custom?: number}>} categories
 * @returns {(key: string) => string}
 */
export function makeCatLabeler(categories = []) {
  const byKey = new Map(categories.map((c) => [c.key, c]));
  return (key) => {
    const c = byKey.get(key);
    return catLabel(key, c?.name, c?.custom);
  };
}

export { LOCALE };
export default t;
