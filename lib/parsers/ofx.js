// Parser de OFX (SGML 1.x e XML 2.x) — o formato padrão dos bancos brasileiros
// e a melhor coisa que um banco pode entregar: já vem com FITID, que é chave de
// deduplicação de verdade, sem depender de hash de descrição.
//
// O que este arquivo passou a tratar, além do <STMTTRN> que já lia:
//
//   <CURDEF>     moeda declarada. Importar um extrato em USD numa instância em
//                BRL soma laranja com banana — agora sai aviso em vez de erro
//                silencioso na projeção do mês.
//   <CCSTMTRS>   fatura de cartão. Antes era lida como extrato de conta: os
//                lançamentos entravam certos (o sinal do OFX é o mesmo nos dois
//                casos), mas o app não sabia que era fatura. O SINAL NÃO É
//                MEXIDO aqui — inverter mudaria o valor gravado de todo mundo
//                que já importou OFX de cartão.
//   <LEDGERBAL>  saldo final declarado, usado para conferir o que foi lido em
//                CADEIA, do jeito que lib/parsers/mercadopago.js faz. Foi essa
//                checagem que pegou um bug real que a conferência de totais
//                deixou passar, e sai de graça a cada importação.
//
// SGML sem fechar tag continua sendo o caso normal: a leitura é por "abre a tag
// e pega até a próxima marcação ou quebra de linha", nunca por parser de XML.
// Encoding declarado no cabeçalho (`ENCODING:`/`CHARSET:`) é problema de
// lib/parsers/encoding.js, que o importador chama antes de chegar aqui.

import { parseAmountToCents } from '../format.js';
import { resolveCurrency } from '../config.js';

/** Valor de uma tag, no primeiro lugar em que ela aparece no trecho. */
const get = (block, tag) =>
  (block.match(new RegExp(`<${tag}>\\s*([^<\\r\\n]+)`, 'i')) || [])[1]?.trim() || null;

/**
 * Linha de saldo travestida de transação.
 *
 * Itaú e Bradesco emitem "SALDO ANTERIOR" e "SALDO DO DIA" como <STMTTRN>, com
 * TRNAMT igual ao saldo. Importar isso como lançamento cria uma "despesa" ou
 * "receita" do tamanho do saldo da conta e estraga qualquer soma do mês. Não é
 * transação: é o extrato se descrevendo.
 */
const BALANCE_LINE_RX =
  /^(?:s\s?a\s?l\s?d\s?o\b|saldo\b|previous balance|opening balance|closing balance|beginning balance)/i;

/** Dessas, as que servem de ÂNCORA para a validação em cadeia (saldo inicial). */
const ANCHOR_RX =
  /^(?:saldo\s+(?:anterior|inicial)|previous balance|opening balance|beginning balance)/i;

/**
 * Divide o arquivo por extrato. Um OFX pode trazer várias contas e, na mesma
 * remessa, conta corrente (<STMTRS>) e cartão (<CCSTMTRS>) — cada um com a sua
 * moeda e o seu saldo, que é o que a validação em cadeia precisa separar.
 */
function splitStatements(text) {
  const rx = /<(CC)?STMTRS>/gi;
  const marks = [];
  let m;
  while ((m = rx.exec(text)) !== null) {
    marks.push({ at: m.index, kind: m[1] ? 'invoice' : 'statement' });
  }
  if (!marks.length) {
    // Arquivo sem o envelope reconhecível (ou sem transação nenhuma): trata
    // como um extrato só, que é o comportamento antigo.
    return [{ kind: null, body: text }];
  }
  return marks.map((mark, i) => ({
    kind: mark.kind,
    body: text.slice(mark.at, i + 1 < marks.length ? marks[i + 1].at : undefined),
  }));
}

/** Saldo final declarado, em centavos, ou null. Ignora o <AVAILBAL>. */
function ledgerBalance(body) {
  const at = body.search(/<LEDGERBAL>/i);
  if (at < 0) return null;
  const rest = body.slice(at).split(/<\/LEDGERBAL>|<AVAILBAL>/i)[0];
  const raw = get(rest, 'BALAMT');
  const cents = raw == null ? null : parseAmountToCents(raw);
  return cents == null || !isFinite(cents) ? null : cents;
}

function parseStatement({ kind, body }) {
  const warnings = [];
  const currency = get(body, 'CURDEF');
  const transactions = [];
  let anchor = null;      // saldo inicial em centavos, quando o banco o emite
  let dropped = 0;        // linhas de saldo descartadas

  for (const chunk of body.split(/<STMTTRN>/i).slice(1)) {
    const b = chunk.split(/<\/STMTTRN>|<\/BANKTRANLIST>|<LEDGERBAL>/i)[0];
    const dt = get(b, 'DTPOSTED') || get(b, 'DTUSER') || '';
    const d = dt.match(/^(\d{4})(\d{2})(\d{2})/);
    if (!d) continue;
    // OFX manda ponto decimal, mas há banco brasileiro que emite "1.234,56":
    // parseAmountToCents decide pelo último separador e acerta os dois.
    const cents = parseAmountToCents(get(b, 'TRNAMT') || '0');
    if (cents == null || !isFinite(cents)) continue;

    const description = get(b, 'MEMO') || get(b, 'NAME') || 'Sem descrição';
    if (BALANCE_LINE_RX.test(description.trim())) {
      // A primeira linha de saldo anterior vira âncora da cadeia; as demais
      // ("saldo do dia") são só ruído.
      if (anchor == null && ANCHOR_RX.test(description.trim())) anchor = cents;
      dropped++;
      continue;
    }

    transactions.push({
      date: `${d[1]}-${d[2]}-${d[3]}`,
      description,
      amount: cents / 100,
      externalId: get(b, 'FITID'),
      // `source` fica 'ofx' de propósito, inclusive na fatura de cartão:
      // trocá-lo reimportaria como novo tudo o que já está no banco de dados.
      source: 'ofx',
      transfer: false,
      cents,
    });
  }

  const balance = ledgerBalance(body);
  warnings.push(...assertChain(transactions, anchor, balance, kind));
  const instanceCurrency = resolveCurrency();
  if (currency && currency.toUpperCase() !== String(instanceCurrency).toUpperCase()) {
    warnings.push(
      `o arquivo declara moeda ${currency.toUpperCase()} e esta instância trabalha em ${instanceCurrency}: ` +
      'os valores foram importados como estão, sem conversão');
  }
  if (dropped) {
    warnings.push(`${dropped} linha(s) de saldo vinham marcadas como transação e foram descartadas`);
  }

  return {
    kind,
    currency: currency ? currency.toUpperCase() : null,
    balance: balance == null ? null : balance / 100,
    transactions: transactions.map(({ cents, ...tx }) => tx),
    warnings,
  };
}

/**
 * Validação em cadeia: saldo inicial + tudo o que foi lido = saldo final.
 *
 * É a mesma ideia de assertTotals em lib/parsers/mercadopago.js — o documento
 * auditando o parser a cada importação — e vale mais que conferir a soma:
 * pega transação perdida, transação lida duas vezes, valor com sinal trocado e
 * linha de saldo descartada por engano. Lança em vez de devolver: importar
 * duzentos lançamentos silenciosamente errados é o pior resultado possível.
 *
 * Só roda quando a cadeia FECHA sozinha (âncora + saldo final declarados). Sem
 * âncora não dá para conferir nada — o OFX não declara saldo inicial — e aí a
 * saída é um aviso, nunca um erro: recusar um arquivo por falta de informação
 * que o banco nunca mandou seria pior que importar.
 */
function assertChain(txs, anchor, balance, kind) {
  if (balance == null) return [];   // nada foi prometido, nada a conferir
  if (anchor == null) {
    return ['o arquivo declara saldo final mas não traz saldo inicial: a leitura não pôde ser conferida em cadeia'];
  }
  const soma = txs.reduce((a, t) => a + t.cents, 0);
  const diff = anchor + soma - balance;
  if (Math.abs(diff) <= 1) return [];   // um centavo de folga para arredondamento
  const money = (c) => (c / 100).toFixed(2);
  // TODO i18n: import.err.ofxChainMismatch — mensagem técnica, como a do
  // Mercado Pago, enquanto não há chave para ela no dicionário.
  throw new Error(
    `[OFX${kind === 'invoice' ? ' cartão' : ''}] a cadeia de saldos não fecha: ` +
    `saldo inicial ${money(anchor)} + lançamentos ${money(soma)} = ${money(anchor + soma)}, ` +
    `mas o arquivo declara saldo final ${money(balance)} (diferença de ${money(diff)}). ` +
    'Nada foi importado — o arquivo pode estar truncado ou o layout mudou.');
}

/**
 * Lê o OFX inteiro e devolve o que o importador precisa saber.
 *
 * @param {string} text
 * @returns {{transactions: Array, kind: 'statement'|'invoice'|null,
 *            currency: string|null, balance: number|null, warnings: string[]}}
 */
export function parseOfxFile(text) {
  const src = String(text ?? '');
  const parts = splitStatements(src).map(parseStatement);
  const transactions = parts.flatMap((p) => p.transactions);
  const warnings = parts.flatMap((p) => p.warnings);

  // Um arquivo com conta e cartão junto não é "fatura": só rotula como fatura
  // quando tudo o que veio é cartão.
  const kinds = new Set(parts.filter((p) => p.transactions.length).map((p) => p.kind));
  const kind = kinds.size === 1 ? [...kinds][0] : null;

  const moedas = new Set(parts.map((p) => p.currency).filter(Boolean));
  if (moedas.size > 1) {
    warnings.push(`o arquivo mistura as moedas ${[...moedas].join(', ')} no mesmo lote`);
  }

  const saldos = parts.map((p) => p.balance).filter((b) => b != null);
  return {
    transactions,
    kind,
    currency: moedas.size === 1 ? [...moedas][0] : null,
    balance: saldos.length === 1 ? saldos[0] : null,
    warnings,
  };
}

/**
 * Assinatura histórica: só as transações. Mantida porque é o que o resto do app
 * (e os testes antigos) consomem.
 */
export function parseOfx(text) {
  return parseOfxFile(text).transactions;
}
