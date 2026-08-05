// Extrato da Conta Global do Inter (PDF, em dólar).
//
// ─── Por que este parser quase não existiu ───────────────────────────────────
// Numa primeira leitura eu concluí que o arquivo era ilegível com segurança: o
// VALOR NÃO TEM SINAL, e as palavras "Beneficiário" e "Remetente" que aparecem
// sob cada lançamento não indicam direção — as duas saem tanto em débito quanto
// em crédito. Como o CSV do mesmo banco traz "Débito/Crédito" escrito, deixei o
// PDF de fora.
//
// Estava errado, e o motivo importa. Existem DUAS fontes de informação aqui, e
// elas são INDEPENDENTES:
//
//   1. o TIPO da transação diz a direção
//      ("Compra no Cartão Global" sai, "Carregamento recebido" entra);
//   2. o "Saldo do dia" de cada bloco fecha uma cadeia que vai até o
//      "Saldo Inicial" declarado no topo.
//
// Deduzir o sinal da própria cadeia seria circular — a cadeia fecharia sempre,
// por construção. Deduzir do TIPO e conferir com a CADEIA não é: se um tipo novo
// aparecer e for classificado errado, o dia dele deixa de reconciliar e a
// importação é cancelada. É a diferença entre um palpite e um palpite auditado.
//
// Conferido contra o documento real, elo por elo:
//   86,69 + 9,38 = 96,07 → +3,53 = 99,60 → −1,42 = 98,18 → +8,00 = 106,18
//   → −95,34 = 10,84 → −10,81 = 0,03 = Saldo Inicial ✓
//
// ─── Estrutura ───────────────────────────────────────────────────────────────
//   3 de agosto de 2026
//   Saldo do dia:$ 86,69Taxas mensais totais:$ 0,00
//   TransaçãoBeneficiário / RemetenteQuantia
//   Compra no Cartão GlobalLA ESTANCIA      ← tipo COLADO na contraparte
//   Beneficiário                            ← não diz direção; é ruído
//   $ 9,38
//
// Os dias vêm do mais NOVO para o mais antigo, e "Saldo do dia" é o saldo ao
// FIM daquele dia.

import { t } from '../i18n/index.js';
import { monthIndexOf } from './labels.js';

const cents = (s) =>
  Math.round(parseFloat(String(s).replace(/\./g, '').replace(',', '.')) * 100);

/**
 * Tipos de lançamento e sua direção.
 *
 * Esta lista é a única coisa aqui que é conhecimento externo, e por isso é a
 * única que pode envelhecer. Um tipo novo do banco cai em `null` — e aí a
 * importação para, em vez de escolher um sinal. A cadeia de saldos é a segunda
 * linha de defesa: mesmo um tipo mal classificado derruba a reconciliação do dia.
 */
const DIRECAO = [
  [/^Compra no Cart[ãa]o Global/i, -1],
  [/^Chip Internacional/i, -1],
  [/^Tarifa|^Taxa|^Estorno de tarifa/i, -1],
  [/^Carregamento recebido/i, +1],
  [/^Resgate de Conta Investimento/i, +1],
  [/^Aplica[çc][ãa]o em Conta Investimento/i, -1],
  [/^Reembolso|^Estorno/i, +1],
];

const direcaoDe = (linha) => DIRECAO.find(([rx]) => rx.test(linha))?.[1] ?? null;

// "3 de agosto de 2026"
const DIA_RX = /^(\d{1,2})\s+de\s+([a-zA-ZçÇáéíóúÁÉÍÓÚ]+)\s+de\s+(\d{4})$/;
// "Saldo do dia:$ 86,69" (com ou sem "Taxas mensais totais" colado depois)
const SALDO_DIA_RX = /^Saldo do dia:\s*\$\s*(-?[\d.]+,\d{2})/i;
// "$ 9,38" sozinho
const VALOR_RX = /^\$\s*(-?[\d.]+,\d{2})$/;

/** É o extrato da Conta Global do Inter em PDF? */
export function detectInterGlobalPdf(text) {
  const s = String(text ?? '').replace(/\0/g, '');
  return /Saldo do dia:/i.test(s) &&
         /Conta Cayman|Cart[ãa]o Global|INTER&CO|Global Account/i.test(s) &&
         /Saldo Inicial:/i.test(s);
}

/**
 * Reconcilia a cadeia de saldos diários.
 *
 * Os dias vêm do mais novo para o mais antigo, e cada "Saldo do dia" é o saldo
 * ao FIM daquele dia. Então: saldo(dia) − soma(movimentos do dia) tem de dar o
 * saldo do dia anterior — e o último elo tem de bater com o "Saldo Inicial"
 * declarado no topo.
 *
 * É esta função que autoriza o parser a existir. Sem ela, o sinal seria só um
 * palpite baseado numa lista de nomes que o banco pode mudar amanhã.
 */
function reconciliar(dias, saldoInicial) {
  const quebras = [];
  for (let i = 0; i < dias.length; i++) {
    const anterior = i + 1 < dias.length ? dias[i + 1].saldo : saldoInicial;
    if (anterior == null) continue;
    const soma = dias[i].txs.reduce((s, t) => s + Math.round(t.amount * 100), 0);
    if (Math.abs(dias[i].saldo - soma - anterior) > 1) {
      quebras.push(
        `${dias[i].data}: ${(anterior / 100).toFixed(2)} ${soma >= 0 ? '+' : '−'} ` +
        `${Math.abs(soma / 100).toFixed(2)} daria ${((anterior + soma) / 100).toFixed(2)}, ` +
        `mas o extrato diz ${(dias[i].saldo / 100).toFixed(2)}`);
    }
  }
  if (quebras.length) {
    throw new Error(t('import.err.interGlobalChain', {
      broken: quebras.length, total: dias.length, first: quebras[0],
    }));
  }
  return [];
}

/**
 * Extrato da Conta Global → transações, em dólar.
 *
 * @param {string} text texto extraído do PDF
 * @returns {{transactions: Array, warnings: string[]}}
 */
export function parseInterGlobalPdf(text) {
  // O PDF traz bytes nulos entre páginas; sem tirar, as linhas colam.
  const linhas = String(text).replace(/\0/g, '').split('\n')
    .map(l => l.trim()).filter(Boolean);

  const mi = String(text).match(/Saldo Inicial:\s*\$\s*(-?[\d.]+,\d{2})/i);
  const mf = String(text).match(/Saldo Final:\s*\$\s*(-?[\d.]+,\d{2})/i);
  const saldoInicial = mi ? cents(mi[1]) : null;

  const dias = [];
  const txs = [];
  // Mesma identidade que o CSV do mesmo extrato produz — ver `stableId` em
  // lib/parsers/csv.js. Sem isto, importar os dois formatos dobra tudo.
  const vistos = new Map();
  let dia = null;
  let pendente = null;   // { desc, sinal } esperando o valor

  for (const linha of linhas) {
    const d = linha.match(DIA_RX);
    if (d) {
      const mes = monthIndexOf(d[2]);
      if (mes) {
        dia = {
          data: `${d[3]}-${String(mes).padStart(2, '0')}-${String(d[1]).padStart(2, '0')}`,
          saldo: null, txs: [],
        };
        dias.push(dia);
        pendente = null;
      }
      continue;
    }

    const sd = linha.match(SALDO_DIA_RX);
    if (sd && dia) { dia.saldo = cents(sd[1]); continue; }

    const v = linha.match(VALOR_RX);
    if (v && pendente && dia) {
      const valorCents = cents(v[1]) * pendente.sinal;
      const chave = `${dia.data}|${valorCents}`;
      const ordem = (vistos.get(chave) ?? 0) + 1;
      vistos.set(chave, ordem);

      const tx = {
        date: dia.data,
        description: pendente.desc,
        amount: valorCents / 100,
        externalId: `${dia.data}|${valorCents}|${ordem}`,
        source: 'inter-global',
        transfer: false,
        // A conta é em DÓLAR. Sem isto, 86,69 dólares viram 86,69 reais na
        // soma do painel — ver BASE_CURRENCY em lib/db.js.
        currency: 'USD',
      };
      txs.push(tx);
      dia.txs.push(tx);
      pendente = null;
      continue;
    }

    // "Beneficiário" e "Remetente" sozinhos: parecem indicar direção e NÃO
    // indicam — saem nos dois casos. Ignorar de propósito, com o comentário
    // aqui para ninguém "consertar" isso depois.
    if (/^(Benefici[áa]rio|Remetente)$/i.test(linha)) continue;

    const sinal = direcaoDe(linha);
    if (sinal != null && dia) {
      pendente = { desc: linha, sinal };
    }
  }

  // Sem saldo inicial não há como fechar a cadeia, e sem cadeia o sinal é
  // palpite puro. Recusar é melhor que importar metade invertida.
  if (saldoInicial == null || !dias.length) {
    throw new Error(t('import.err.interGlobalNoBalance'));
  }

  reconciliar(dias, saldoInicial);

  // A cadeia fechou dia a dia; o total é o mesmo fato dito de outro jeito, e
  // serve para pegar um dia inteiro perdido no fim do arquivo.
  if (mf) {
    const somaTotal = txs.reduce((s, t) => s + Math.round(t.amount * 100), 0);
    if (Math.abs(saldoInicial + somaTotal - cents(mf[1])) > 1) {
      throw new Error(t('import.err.interGlobalChain', {
        broken: 1, total: dias.length,
        first: `${(saldoInicial / 100).toFixed(2)} + ${(somaTotal / 100).toFixed(2)} ` +
               `≠ ${(cents(mf[1]) / 100).toFixed(2)}`,
      }));
    }
  }

  return { transactions: txs, warnings: [] };
}
