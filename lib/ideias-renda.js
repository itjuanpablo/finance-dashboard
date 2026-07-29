// Catálogo curado de ideias de renda extra — conteúdo estático, sem backend.
// Só a estrutura vive aqui: título, investimento, esforço e passos são texto
// visível, então moram no dicionário (`evolve.idea.<chave>.*`).
//
// A resolução é PREGUIÇOSA de propósito — função chamada no render, não `const`
// resolvido no import. Até a v4.0 o locale era constante de build e resolver na
// carga do módulo estava certo; na v4.1 o idioma muda em runtime, e um `const`
// congelaria estas nove ideias no idioma que estava ativo no primeiro import:
// a pessoa trocaria para español, o app inteiro trocaria e só /evoluir ficaria
// em português. É o mesmo motivo pelo qual lib/format.js não guarda Intl no topo
// do arquivo (ver docs/i18n.md).

import { t } from './i18n/index.js';

const CATALOGO = [
  ['digital', 'artes'],
  ['digital', 'templates'],
  ['digital', 'freelance'],
  ['servicos', 'aulas'],
  ['servicos', 'fotografia'],
  ['servicos', 'suporte'],
  ['vendas', 'doces'],
  ['vendas', 'desapego'],
  ['vendas', 'revenda'],
];

/** Ideias com o texto já traduzido NO IDIOMA ATIVO AGORA. Chame no render. */
export function getIdeias() {
  return CATALOGO.map(([categoria, key]) => ({
    categoria,
    key,
    titulo: t(`evolve.idea.${key}.title`),
    investimento: t(`evolve.idea.${key}.invest`),
    esforco: t(`evolve.idea.${key}.effort`),
    passos: [1, 2, 3].map(n => t(`evolve.idea.${key}.step${n}`)),
  }));
}
