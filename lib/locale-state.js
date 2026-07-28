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

/** Locale definido pelo servidor nesta execução, ou null se ainda não resolvido. */
export const getActiveLocale = () => activeLocale;

/** Moeda definida pelo servidor nesta execução, ou null. */
export const getActiveCurrency = () => activeCurrency;

/** Chamado por lib/db.js ao abrir o banco e por app/layout.js a cada render. */
export function setActive({ locale, currency } = {}) {
  if (locale !== undefined) activeLocale = locale;
  if (currency !== undefined) activeCurrency = currency;
}
