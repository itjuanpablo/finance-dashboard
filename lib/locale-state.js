// Estado do locale ativo. Módulo minúsculo e SEM DEPENDÊNCIA de propósito:
// `lib/db.js` escreve aqui e `lib/config.js` lê, e db.js já importa i18n para
// semear as categorias — se a leitura morasse em config.js ou i18n, o import
// viraria ciclo.
//
// Variável de módulo mutável é aceitável aqui, e só aqui, porque o Fluxo é
// local-first e monousuário: um processo serve uma pessoa. Num app com várias
// sessões isto seria um bug — o locale de um vazaria para o outro.
//
// No CLIENTE quem manda é `window.__FLUXO_LOCALE__`, injetado pelo servidor em
// app/layout.js antes de qualquer render. Ver lib/config.js → resolveLocale().

let activeLocale = null;
let activeCurrency = null;
let browserLocale = null;

/** Locale definido pelo servidor nesta execução, ou null se ainda não resolvido. */
export const getActiveLocale = () => activeLocale;

/** Moeda definida pelo servidor nesta execução, ou null. */
export const getActiveCurrency = () => activeCurrency;

/**
 * Idioma que o NAVEGADOR pediu (Accept-Language), ou null.
 *
 * É só um palpite, e o mais fraco de todos: vale enquanto ninguém escolheu
 * idioma na tela. app/layout.js grava aqui a cada requisição; as rotas de API,
 * que não recebem o cabeçalho no mesmo caminho, leem o que o último layout
 * deixou. Isso funciona porque um processo serve uma pessoa só — a mesma
 * premissa que justifica o resto deste módulo.
 */
export const getBrowserLocale = () => browserLocale;

/**
 * Chamado por app/layout.js com o que veio no Accept-Language da requisição.
 * Aceita null: uma requisição sem cabeçalho apaga o palpite anterior em vez de
 * herdá-lo — palpite velho de outra origem é pior que nenhum palpite.
 */
export function setBrowserLocale(locale) {
  browserLocale = locale ?? null;
}

/** Chamado por lib/db.js ao abrir o banco e por app/layout.js a cada render. */
export function setActive({ locale, currency } = {}) {
  if (locale !== undefined) activeLocale = locale;
  if (currency !== undefined) activeCurrency = currency;
}
