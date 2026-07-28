// Configuração de instância. O Fluxo é local-first: cada pessoa roda o seu,
// então idioma e moeda são fixos por instalação, definidos no .env.local — não
// há troca em runtime nem estado de usuário. Isso mantém o app sem sessão.
//
//   NEXT_PUBLIC_FLUXO_LOCALE=es-AR
//   NEXT_PUBLIC_FLUXO_CURRENCY=ARS   (opcional; derivado do locale)
//
// O prefixo NEXT_PUBLIC_ é obrigatório: o valor é embutido no bundle em build
// time e por isso vale igual no servidor e no cliente, sem precisar de context.

/** Locales suportados e seus padrões regionais. */
export const LOCALES = {
  'pt-BR': {
    intl: 'pt-BR',
    currency: 'BRL',
    symbol: 'R$',
    htmlLang: 'pt-BR',
    // dd/mm/aaaa, vírgula decimal, ponto de milhar
    dateOrder: 'dmy',
    decimal: ',',
    thousand: '.',
    keywords: 'br',   // dicionário de categorização (lib/categorizer)
    banks: 'br',      // perfis de banco preferidos na detecção
  },
  'es-AR': {
    intl: 'es-AR',
    currency: 'ARS',
    symbol: '$',
    htmlLang: 'es-AR',
    dateOrder: 'dmy',
    decimal: ',',
    thousand: '.',
    keywords: 'ar',
    banks: 'ar',
  },
};

export const DEFAULT_LOCALE = 'pt-BR';

// Acesso literal: `process.env.NEXT_PUBLIC_X` é substituído em build time pelo
// Next. Acesso dinâmico (process.env[nome]) não seria, e quebraria no cliente.
const rawLocale = process.env.NEXT_PUBLIC_FLUXO_LOCALE;
const rawCurrency = process.env.NEXT_PUBLIC_FLUXO_CURRENCY;

/** Locale ativo desta instância. Cai no padrão se o valor for inválido. */
export const LOCALE = LOCALES[rawLocale] ? rawLocale : DEFAULT_LOCALE;

/** Configuração regional ativa (moeda, símbolo, separadores, dicionários). */
export const REGION = {
  ...LOCALES[LOCALE],
  ...(rawCurrency ? { currency: rawCurrency } : {}),
};

export const CURRENCY = REGION.currency;

/** true quando a instância roda em espanhol (útil em casos pontuais). */
export const IS_ES = LOCALE.startsWith('es');
