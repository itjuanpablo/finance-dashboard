// Catálogo curado de ideias de renda extra — conteúdo estático, sem backend.
// Só a estrutura vive aqui: título, investimento, esforço e passos são texto
// visível, então moram no dicionário (`evolve.idea.<chave>.*`) e são resolvidos
// no import — o locale é fixo por instância, não há troca em runtime.

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

export const IDEIAS = CATALOGO.map(([categoria, key]) => ({
  categoria,
  key,
  titulo: t(`evolve.idea.${key}.title`),
  investimento: t(`evolve.idea.${key}.invest`),
  esforco: t(`evolve.idea.${key}.effort`),
  passos: [1, 2, 3].map(n => t(`evolve.idea.${key}.step${n}`)),
}));
