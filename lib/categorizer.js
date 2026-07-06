// Categorização em cascata: regras do usuário → dicionário embutido → "A revisar".
// Determinístico e transparente: nada de caixa-preta.

export const CATEGORIES = {
  'Alimentação':    '#f97316',
  'Transporte':     '#3b82f6',
  'Moradia':        '#8b5cf6',
  'Compras':        '#ec4899',
  'Lazer':          '#a855f7',
  'Viagem':         '#06b6d4',
  'Saúde':          '#14b8a6',
  'Assinaturas':    '#eab308',
  'Financeiro':     '#f43f5e',
  'Renda':          '#22c55e',
  'Transferências': '#64748b',
  'A revisar':      '#94a3b8',
};

// Dicionário calibrado nos extratos/faturas Mercado Pago do usuário.
const KEYWORDS = [
  // Transporte (corridas 99 aparecem como "99*")
  { kw: ['99*', 'uber', 'posto ', 'combustivel', 'estacionamento'], cat: 'Transporte' },
  // Alimentação
  { kw: ['supermercado', 'mercadinho', 'padaria', 'ifood', 'restaurante', 'lanch', 'center box', 'atacad', 'acougue', 'hortifruti'], cat: 'Alimentação' },
  // Assinaturas e telefonia
  { kw: ['amazon prime', 'amazonprime', 'netflix', 'spotify', 'melimais', 'tim s a', 'vivo ', 'claro ', 'disney', 'hbo', 'youtube premium', 'globoplay'], cat: 'Assinaturas' },
  // Saúde
  { kw: ['farmacia', 'drogaria', 'academia', 'fitness', 'clinica', 'laborator'], cat: 'Saúde' },
  // Compras
  { kw: ['mercadolivre', 'shein', 'shopee', 'aliexpress', 'amazon br', 'magalu', 'americanas'], cat: 'Compras' },
  // Viagem
  { kw: ['airbnb', 'latam', 'gol linhas', 'azul linhas', 'booking', 'hotel', 'hostel'], cat: 'Viagem' },
  // Moradia
  { kw: ['aluguel', 'cemig', 'energia', 'enel', 'copasa', 'saneamento', 'condominio', 'internet'], cat: 'Moradia' },
  // Financeiro (juros, tarifas, empréstimos)
  { kw: ['emprestimo', 'juros', 'iof', 'tarifa', 'anuidade', 'seguro'], cat: 'Financeiro' },
  // Renda
  { kw: ['rendimentos', 'salario', 'reembolso'], cat: 'Renda' },
];

const normalize = s => s.toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * @param {string} description
 * @param {Array<{pattern: string, category: string}>} rules regras do usuário (prioridade máxima)
 */
export function categorize(description, rules = []) {
  const d = normalize(description);
  for (const r of rules) {
    if (d.includes(normalize(r.pattern))) return r.category;
  }
  for (const { kw, cat } of KEYWORDS) {
    if (kw.some(k => d.includes(normalize(k)))) return cat;
  }
  return 'A revisar';
}
