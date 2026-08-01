// Configuração regional da instância: qual idioma e qual moeda.
//
// Até a v4.0 isso era constante de build (`NEXT_PUBLIC_FLUXO_LOCALE`), o que era
// simples mas exigia editar arquivo e reiniciar. Desde a v4.1 a escolha vive na
// tabela `settings` do SQLite e pode ser trocada pela própria tela.
//
// PRECEDÊNCIA, do mais forte para o mais fraco:
//   1. o que a pessoa escolheu na tela  (settings.locale, no banco)
//   2. NEXT_PUBLIC_FLUXO_LOCALE          (.env.local — semeia a 1ª execução)
//   3. pt-BR
//
// Quem já tinha `.env.local` não vê diferença até mexer no seletor; a partir daí
// a escolha da tela ganha.
//
// COMO O VALOR CHEGA AOS DOIS LADOS
//   · servidor: lib/db.js grava em lib/locale-state.js ao abrir o banco;
//     app/layout.js reforça a cada render.
//   · cliente: app/layout.js injeta `window.__FLUXO_LOCALE__` num <script> que
//     roda ANTES da hidratação. Ler de lá é síncrono e garante que servidor e
//     cliente renderizem o mesmo texto — mismatch de hidratação aqui apareceria
//     como texto trocado na tela, não como erro óbvio.

import { getActiveLocale, getActiveCurrency } from './locale-state.js';

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

/** Moedas oferecidas no seletor. Símbolo só para placeholder de input. */
export const CURRENCIES = {
  BRL: { symbol: 'R$', label: 'Real' },
  ARS: { symbol: '$', label: 'Peso argentino' },
  USD: { symbol: 'US$', label: 'Dólar' },
  EUR: { symbol: '€', label: 'Euro' },
};

// Acesso literal: `process.env.NEXT_PUBLIC_X` é substituído em build time pelo
// Next. Acesso dinâmico (process.env[nome]) não seria, e quebraria no cliente.
const envLocale = process.env.NEXT_PUBLIC_FLUXO_LOCALE;
const envCurrency = process.env.NEXT_PUBLIC_FLUXO_CURRENCY;

/** O valor é um locale que existe? */
export const isSupportedLocale = (l) => !!LOCALES[l];

/**
 * Locale escrito no `.env`, ou null se não houver.
 *
 * Separado de BUILD_LOCALE porque "o dono da instalação declarou pt-BR" e
 * "ninguém declarou nada, então caiu no padrão" precisam ser distinguíveis:
 * o primeiro tem de vencer o palpite do navegador, o segundo não.
 */
export const ENV_LOCALE = isSupportedLocale(envLocale) ? envLocale : null;

/** Locale de build — só o fallback, não a verdade. */
export const BUILD_LOCALE = ENV_LOCALE ?? DEFAULT_LOCALE;

const isBrowser = typeof window !== 'undefined';

/**
 * Locale ativo AGORA. Função, não constante: o valor pode mudar entre um render
 * e o próximo, quando a pessoa troca no seletor.
 */
export function resolveLocale() {
  if (isBrowser) {
    const injected = window.__FLUXO_LOCALE__;
    if (isSupportedLocale(injected)) return injected;
  }
  const active = getActiveLocale();
  if (isSupportedLocale(active)) return active;
  return BUILD_LOCALE;
}

/**
 * Moeda ativa AGORA.
 *
 * Moeda é INDEPENDENTE do idioma de propósito. Os valores no banco são
 * centavos sem moeda: se trocar para espanhol trocasse a moeda junto, um saldo
 * de R$ 1.000 viraria $ 1.000 em pesos — mesmo número, significado diferente,
 * sem nada ter sido convertido. Uma instalação nova deriva a moeda do idioma
 * escolhido no `.env`; depois disso, só muda quem mexer explicitamente.
 */
export function resolveCurrency() {
  if (isBrowser) {
    const injected = window.__FLUXO_CURRENCY__;
    if (injected) return injected;
  }
  const active = getActiveCurrency();
  if (active) return active;
  if (envCurrency) return envCurrency;
  return LOCALES[BUILD_LOCALE].currency;
}

/** Bloco regional ativo (símbolo, separadores, dicionários) já com a moeda. */
export function resolveRegion() {
  const locale = resolveLocale();
  const currency = resolveCurrency();
  return {
    ...LOCALES[locale],
    locale,
    currency,
    symbol: CURRENCIES[currency]?.symbol ?? LOCALES[locale].symbol,
  };
}

/** Moeda que uma instalação nova assume ao escolher este idioma. */
export const defaultCurrencyFor = (locale) =>
  LOCALES[locale]?.currency ?? LOCALES[DEFAULT_LOCALE].currency;

/**
 * Cabeçalho Accept-Language do navegador → locale suportado, ou null.
 *
 * Usado SÓ enquanto ninguém escolheu idioma na tela (ver lib/db.js →
 * localeWasChosen). É a diferença entre o app abrir em português na máquina de
 * um argentino e abrir já em espanhol: o navegador dele informa isso em toda
 * requisição, e ignorar essa informação para depois pedir que ele configure na
 * mão é trabalho que o programa podia ter poupado.
 *
 * Casa por idioma, não por país: "es-MX", "es-419" e "es" caem todos em es-AR,
 * porque é o único espanhol que existe aqui. Melhor um espanhol com sotaque
 * argentino do que português para quem não lê português.
 *
 * Formato: "es-AR,es;q=0.9,en;q=0.8" — lista com peso, maior peso primeiro.
 *
 * @param {string|null|undefined} header
 * @returns {string|null} locale suportado, ou null se nenhum casar
 */
export function localeFromAcceptLanguage(header) {
  if (!header) return null;

  const pedidos = String(header)
    .split(',')
    .map((parte) => {
      const [tag, ...params] = parte.trim().split(';');
      const q = params.find((p) => p.trim().startsWith('q='));
      return { tag: tag.trim().toLowerCase(), q: q ? parseFloat(q.split('=')[1]) : 1 };
    })
    .filter((p) => p.tag && p.tag !== '*')
    .sort((a, b) => b.q - a.q);

  const suportados = Object.keys(LOCALES);

  for (const { tag } of pedidos) {
    // 1) casamento exato ("es-ar" → es-AR)
    const exato = suportados.find((l) => l.toLowerCase() === tag);
    if (exato) return exato;
    // 2) mesmo idioma, país diferente ("es-mx", "es" → es-AR)
    const idioma = tag.split('-')[0];
    const porIdioma = suportados.find((l) => l.toLowerCase().split('-')[0] === idioma);
    if (porIdioma) return porIdioma;
  }
  return null;
}

// ── Compatibilidade com a v4.0 ───────────────────────────────────────────────
// Estes eram constantes. Viraram getters para não quebrar `import { REGION }`
// nem passar a mentir depois de uma troca de idioma. Código novo deve chamar
// resolveRegion()/resolveLocale() direto.

export const REGION = new Proxy({}, {
  get: (_, prop) => resolveRegion()[prop],
  has: (_, prop) => prop in resolveRegion(),
  ownKeys: () => Reflect.ownKeys(resolveRegion()),
  getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
});
