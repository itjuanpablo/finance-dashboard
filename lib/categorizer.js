// Categorização em cascata: regras do usuário → dicionário embutido → a revisar.
// Determinístico e transparente: nada de caixa-preta.
//
// Devolve CHAVE de categoria (CAT.FOOD), nunca nome traduzido: o nome muda com
// o idioma e com o gosto do usuário, a chave não. Ver docs/i18n.md.
//
// Há um dicionário por região (REGION.keywords: 'br' | 'ar'), porque comércio é
// local: "Coto" só quer dizer supermercado na Argentina, "99*" só quer dizer
// corrida no Brasil. A instância roda em um idioma só, então só um dicionário é
// consultado — mas os dois ficam exportados para poder testar ambos.

import { CAT } from './categories.js';
import { REGION } from './config.js';

/**
 * Dicionário Brasil — calibrado nos extratos/faturas Mercado Pago do usuário.
 * Conteúdo idêntico ao de antes da i18n; só o destino virou chave.
 */
const KEYWORDS_BR = [
  // Transporte (corridas 99 aparecem como "99*")
  { kw: ['99*', 'uber', 'posto ', 'combustivel', 'estacionamento'], cat: CAT.TRANSPORT },
  // Alimentação
  { kw: ['supermercado', 'mercadinho', 'padaria', 'ifood', 'restaurante', 'lanch', 'center box', 'atacad', 'acougue', 'hortifruti'], cat: CAT.FOOD },
  // Assinaturas e telefonia
  { kw: ['amazon prime', 'amazonprime', 'netflix', 'spotify', 'melimais', 'tim s a', 'vivo ', 'claro ', 'disney', 'hbo', 'youtube premium', 'globoplay'], cat: CAT.SUBSCRIPTIONS },
  // Saúde
  { kw: ['farmacia', 'drogaria', 'academia', 'fitness', 'clinica', 'laborator'], cat: CAT.HEALTH },
  // Compras
  { kw: ['mercadolivre', 'shein', 'shopee', 'aliexpress', 'amazon br', 'magalu', 'americanas'], cat: CAT.SHOPPING },
  // Viagem
  { kw: ['airbnb', 'latam', 'gol linhas', 'azul linhas', 'booking', 'hotel', 'hostel'], cat: CAT.TRAVEL },
  // Moradia
  { kw: ['aluguel', 'cemig', 'energia', 'enel', 'copasa', 'saneamento', 'condominio', 'internet'], cat: CAT.HOUSING },
  // Financeiro (juros, tarifas, empréstimos)
  { kw: ['emprestimo', 'juros', 'iof', 'tarifa', 'anuidade', 'seguro'], cat: CAT.FINANCIAL },
  // Renda
  { kw: ['rendimentos', 'salario', 'reembolso'], cat: CAT.INCOME },
];

/**
 * Dicionário Argentina — comércios e serviços de uso corrente. Inclui
 * prestadoras provinciais (EPEC, Ecogas, Aguas Cordobesas, Red Bus, Apross)
 * além das nacionais: quem mora fora de Buenos Aires não é atendido só por
 * marca nacional.
 *
 * A ORDEM IMPORTA, porque o casamento é por substring:
 *   - assinaturas antes de moradia: "Personal Pay" (carteira) contém
 *     "personal" (telefonia), e cair em moradia seria errado;
 *   - token curto vira RegExp com \b: "Día" e "Vea" (supermercados) casariam
 *     dentro de "dias", "mediador", "veame"; "Max" casaria em "maxikiosco".
 */
const KEYWORDS_AR = [
  // Assinaturas e streaming (antes de moradia: ver nota acima)
  // "Pago de suscripción Nivel N" é a assinatura do próprio Mercado Pago
  // (níveis de benefício) — visto em extrato real.
  { kw: ['netflix', 'spotify', 'disney', 'star+', 'paramount', 'hbo', /\bmax\b/, 'personal pay', 'youtube premium', 'apple.com/bill', 'meli+', 'pago de suscripcion', 'suscripcion nivel'], cat: CAT.SUBSCRIPTIONS },
  // Delivery e comida
  { kw: ['rappi', 'pedidosya', 'pedidos ya', 'mostaza', 'grido', 'kiosco', 'panaderia', 'rotiseria', 'restaurante', 'parrilla', 'cafe '], cat: CAT.FOOD },
  // Supermercado e almacén
  { kw: ['coto', 'carrefour', 'libertad', 'disco', 'jumbo', 'vital', 'maxiconsumo', /\bdia\b/, /\bvea\b/, 'super mami', 'almacen'], cat: CAT.FOOD },
  // Serviços da casa (luz, gás, água, telecom) → moradia
  { kw: ['epec', 'ecogas', 'aguas cordobesas', 'municipalidad', 'rentas', 'alquiler', 'expensas', 'personal ', 'movistar', 'claro ', 'telecentro', /\bflow\b/, 'fibertel', 'cablevision', 'internet'], cat: CAT.HOUSING },
  // Transporte
  { kw: [/\bsube\b/, 'red bus', 'redbus', 'ypf', 'shell', 'axion', 'puma energia', 'cabify', 'uber', 'didi', 'estacionamiento', 'playa de estacion', 'peaje'], cat: CAT.TRANSPORT },
  // Saúde
  { kw: ['farmacity', 'del aguila', 'farmacia', 'osde', 'swiss medical', 'apross', 'galeno', 'sancor salud', 'laboratorio', 'clinica', 'sanatorio', 'gimnasio'], cat: CAT.HEALTH },
  // Compras
  { kw: ['mercado libre', 'mercadolibre', 'fravega', 'musimundo', 'garbarino', 'falabella', 'dexter', 'shein', 'aliexpress', 'temu'], cat: CAT.SHOPPING },
  // Viagem
  { kw: ['aerolineas', 'flybondi', 'despegar', 'booking', 'airbnb', 'hotel', 'hosteria', 'cabana'], cat: CAT.TRAVEL },
  // Financeiro: impostos e encargos que o banco cobra por dentro.
  // 'monotributo' e 'imp. afip' vistos em extrato real de conta sueldo: são
  // débito direto de tributo, e cair em "a revisar" todo mês é trabalho manual
  // repetido para algo que nunca muda de natureza.
  { kw: ['impuesto al debito', 'impuesto al credito', 'ley 25413', 'percepcion', 'retencion', 'iva ', 'iibb', 'ingresos brutos', 'sellado', 'interes', 'intereses', 'comision', 'mantenimiento de cuenta', 'seguro', 'prestamo', 'monotributo', 'imp. afip', 'imp afip', /\barca\b/], cat: CAT.FINANCIAL },
  // Fintech (carteiras): sem mais contexto, é movimentação financeira
  { kw: ['mercado pago', 'mercadopago', /\buala\b/, 'naranja x', 'brubank', 'modo ', 'cvu'], cat: CAT.FINANCIAL },
  // Renda. 'capitalizacion' é o juro que o banco credita na caixa de poupança —
  // visto em extrato real, e é receita, não transferência.
  { kw: ['sueldo', 'haberes', 'honorarios', 'transferencia recibida', 'reintegro', 'devolucion', 'plazo fijo', 'rendimientos', 'capitalizacion'], cat: CAT.INCOME },
];

/** Dicionários por região, expostos para teste (a instância usa um só). */
export const KEYWORD_DICTS = { br: KEYWORDS_BR, ar: KEYWORDS_AR };

/**
 * Dicionário da região ATIVA. É FUNÇÃO, não constante — e a diferença aqui não
 * é estética, é de resultado.
 *
 * Como constante, o valor era decidido na carga do módulo, quando o locale só
 * podia vir do `.env`. Desde a v4.1 o idioma normalmente vem do BANCO (a pessoa
 * escolhe no seletor 🌐), e nesse caminho o módulo já havia sido avaliado —
 * então uma instalação em espanhol seguia categorizando com o dicionário
 * brasileiro. Efeito medido: "MONOTRIBUTO FISICAS", "SUPER MAMI", "IMP. AFIP"
 * caíam todos em "a revisar", e o dono do app concluía que a categorização
 * automática simplesmente não funciona na Argentina.
 *
 * O custo de resolver por chamada é uma leitura de propriedade num objeto.
 */
export const activeKeywords = () => KEYWORD_DICTS[REGION.keywords] || KEYWORDS_BR;

const normalize = s => String(s || '').toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const hits = (d, kw) =>
  kw.some(k => (k instanceof RegExp ? k.test(d) : d.includes(normalize(k))));

/**
 * Descrição → chave de categoria. Regra do usuário ganha do dicionário; nada
 * casou, devolve CAT.TO_REVIEW (o usuário decide, o programa não adivinha).
 *
 * @param {string} description
 * @param {Array<{pattern: string, category: string}>} rules regras do usuário (prioridade máxima)
 * @param {Array<{kw: Array<string|RegExp>, cat: string}>} [dict] dicionário (padrão: o da região ativa)
 * @returns {string} chave de categoria
 */
export function categorize(description, rules = [], dict = activeKeywords()) {
  const d = normalize(description);
  for (const r of rules) {
    if (d.includes(normalize(r.pattern))) return r.category;
  }
  for (const { kw, cat } of dict) {
    if (hits(d, kw)) return cat;
  }
  return CAT.TO_REVIEW;
}
