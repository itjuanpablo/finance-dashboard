// Descobre o ESTABELECIMENTO por trás da descrição de um lançamento.
//
// ─── Por que isto saiu de dentro do componente ───────────────────────────────
// A versão anterior morava em components/RevisaoMassa.js e cabia em três
// linhas: tirar o prefixo e ficar com as duas primeiras palavras. Numa tela
// real ela produziu estes grupos:
//
//   "de fatura"     ← de "Pagamento de fatura": o prefixo comeu a única
//                      palavra que importava
//   "de conta"      ← de "Pagamento de conta BANCO BRADESCARD S A"
//   "13 566"        ← de "Pagamento com QR Pix 13 566 909 PAULO ROBERT":
//                      as duas primeiras "palavras" eram pedaços de CPF
//   "EBN *Canva04906" e "EBN *Canva04814"
//                   ← a MESMA assinatura do Canva, em dois grupos, porque a
//                      operadora cola um id diferente em cada cobrança
//
// O efeito prático: o usuário categorizava, o item sumia, e no lugar aparecia
// outro pedaço do mesmo comerciante. A sensação era de que a lista não
// terminava nunca — e não terminava mesmo.
//
// Pior que a lista teimosa: o nome do grupo virava o PADRÃO DA REGRA gravada.
// "de fatura" e "13 566" ficavam valendo para sempre, com prioridade máxima
// sobre o dicionário, classificando errado toda importação futura.
//
// Aqui a função tem nome, mora fora da tela e tem teste próprio
// (scripts/testes/testar-agrupamento.mjs) com os casos reais acima.

import { stripInstallment } from './parsers/labels.js';

// "EBN *Canva04906", "PayU *ADIDAS", "DL *99 Ride", "MP*LOJA".
// A sigla antes do asterisco é o intermediário de pagamento, não a loja.
const PROCESSADORA = /^[A-Za-z]{2,6}\s*\*\s*/;

// Prefixos operacionais que não identificam o estabelecimento.
// As duas línguas ficam sempre ativas porque isto é texto do BANCO, não da
// interface: um extrato brasileiro diz "Pagamento com QR Pix" mesmo numa
// instância em espanhol, e vice-versa.
const PREFIXOS = [
  // pt-BR
  /^pagamento com qr pix\s+/i, /^pagamento\s+/i, /^compra\s+/i,
  /^transferência pix (recebida|enviada)\s+/i,
  /^dinheiro (retirado|reservado)\s+/i,
  // es-AR — Confiança: BAIXA, inferido; ajustar com extrato real
  /^pago con qr\s+/i, /^pago\s+/i, /^compra en\s+/i,
  /^transferencia (recibida|enviada)\s+/i, /^débito automático\s+/i,
];

// Palavras que ligam, mas não nomeiam.
const LIGACAO = new Set([
  'de', 'da', 'do', 'das', 'dos', 'com', 'em', 'no', 'na', 'para', 'a', 'o', 'e',
  'del', 'la', 'el', 'en', 'con', 'por', 'y',
]);

// Palavras que descrevem a OPERAÇÃO, não quem recebeu.
// Um grupo formado só por estas não identifica ninguém — e é o sinal de que a
// descrição inteira era operacional ("Pagamento de fatura"), caso em que o
// nome honesto do grupo é a própria frase, não um pedaço dela.
const OPERACIONAL = new Set([
  'fatura', 'conta', 'boleto', 'factura', 'cuenta', 'pagamento', 'pago',
  'compra', 'transferência', 'transferencia', 'pix', 'recebida', 'enviada',
  'recibida', 'débito', 'debito', 'crédito', 'credito', 'ted', 'doc',
  'dinheiro', 'saque', 'tarifa', 'taxa', 'juros', 'rendimentos',
]);

const soDigitos = (tk) => /^\d+$/.test(tk);
const pedacos = (s) => String(s).split(/\s+/).filter(Boolean);

// "Canva04906" → "Canva". Só corta corrida de 3+ dígitos colada a letra: um
// número curto costuma fazer parte do nome ("Loja 25", "Posto 3").
const semId = (tk) => tk.replace(/(\p{L})\d{3,}$/u, '$1');

/**
 * Nome do estabelecimento a partir da descrição bruta do banco.
 *
 * Devolve string vazia quando não sobra nada aproveitável — quem chama decide
 * o que fazer com isso (a tela de revisão simplesmente ignora o lançamento).
 *
 * @param {string} description descrição como veio do extrato
 * @returns {string}
 */
export function merchantKey(description) {
  const bruto = stripInstallment(String(description ?? '')).trim();
  if (!bruto) return '';

  let d = bruto.replace(PROCESSADORA, '');
  for (const p of PREFIXOS) {
    const resto = d.replace(p, '').trim();
    // Só tira o prefixo se sobrar alguma coisa. Sem esta guarda,
    // "Pagamento" sozinho virava string vazia e o lançamento sumia da revisão.
    if (resto) d = resto;
  }

  let tks = pedacos(d);

  // Corrida de números no COMEÇO é fragmento de CPF/CNPJ do Pix. Só descarta
  // quando são dois ou mais: um número sozinho pode ser o próprio nome — a
  // "99" é uma empresa, e "99 Ride" não pode virar só "Ride".
  let i = 0;
  while (i < tks.length && soDigitos(tks[i])) i++;
  if (i >= 2) tks = tks.slice(i);

  tks = tks
    .map(semId)
    .filter(tk => tk && !LIGACAO.has(tk.toLowerCase()))
    // número longo solto é identificador, não nome
    .filter(tk => !(soDigitos(tk) && tk.length >= 3));

  const nomeiam = tks.filter(tk => !OPERACIONAL.has(tk.toLowerCase()));

  // Nada além de palavra operacional: a descrição toda era a operação.
  // Devolver "fatura" aqui geraria uma regra `LIKE '%fatura%'` valendo para
  // sempre; devolver a frase inteira é mais estreito e mais legível.
  if (!nomeiam.length) return pedacos(bruto).slice(0, 3).join(' ');

  return nomeiam.slice(0, 2).join(' ');
}
