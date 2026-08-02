// Resumo de cartão de crédito do Mercado Pago Argentina ("Resumen de tarjeta").
//
// ─── Por que este arquivo existe, e não mais um layout em mercadopago.js ─────
// Até aqui o resumo argentino era ADIVINHADO: LAYOUTS.AR.invoice era uma
// tradução estrutural do layout brasileiro ("Movimientos del resumen",
// "Tarjeta X [", "Cuota N de M" separados por espaço). Confrontado com um
// documento real, nada disso existe. O resumo argentino não é o brasileiro em
// espanhol — é outro documento:
//
//   · a tabela é COLADA pelo pdf-parse, sem separador nenhum entre colunas:
//     "2/dicTIENDA EJEMPLO8 de 9678488$ 20.000,00"
//     = 2/dic · TIENDA EJEMPLO · cuota 8 de 9 · operación 678488 · $ 20.000,00
//     (exemplo com nome e valor trocados; a forma é a do documento real)
//   · NENHUMA data tem ano — nem as transações, nem o fechamento, nem o
//     vencimento, nem o rodapé. O ano precisa ser inferido (ver anoDoCiclo);
//   · há DUAS moedas na mesma tabela, pesos e dólares, e o documento não traz
//     cotação (ele mesmo diz que o câmbio é o do dia do pagamento);
//   · o detalhe começa por um bloco do período ANTERIOR que soma zero e que,
//     se importado, duplicaria a fatura passada.
//
// Confiança: ALTA para pesos — os três totais que o documento declara
// (consumos, impostos e total a pagar) são conferidos ao centavo a cada
// importação. Se o layout mudar, a importação falha alto em vez de gravar
// número errado.

import { monthIndexOf } from './labels.js';
import { t } from '../i18n/index.js';

/** "1.234,56" → 1234.56 */
const money = (s) => Math.round(parseFloat(String(s).replace(/\./g, '').replace(',', '.')) * 100) / 100;

const cents = (v) => Math.round(v * 100);

// "$ 1.234,56" | "US$ 83,69" | "-$ 219.778,82" — o sinal, quando existe, vem
// ANTES do símbolo, não do número.
const VALOR = String.raw`(-?)(US)?\$\s?([\d.]+,\d{2})`;

// dia/mês-abreviado, sem ano: "2/dic", "19/jun".
//
// A lista de meses é EXPLÍCITA, e não `[a-z]{3}`, porque a coluna seguinte
// cola na data sem separador: com um quantificador genérico o motor lia
// "junTotal a pagar…" como mês "junT" e a linha inteira era descartada em
// silêncio — a pior forma de falhar, porque o total simplesmente ficava menor.
const MESES = 'ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic';
const DATA = String.raw`(\d{1,2})\/(${MESES})`;

// Linha de consumo: data + descrição + [cuota] + operación(6 dígitos) + valor.
//
// A descrição é preguiçosa e a operação tem tamanho fixo, e é isso que desfaz a
// colagem sem separador: em "KIOSCO EJEMPLO25469834$ 6.500,00" o motor cresce a
// descrição até que sobrem exatamente seis dígitos antes do valor, chegando em
// "KIOSCO EJEMPLO25" + operação 469834. Se o corte sair errado, o prejuízo é
// cosmético (nome do estabelecimento com um dígito a mais ou a menos) — o VALOR
// e a DATA, que são o que vira dinheiro na tela, não dependem dele.
const LINHA_CONSUMO = new RegExp(
  `^${DATA}(.+?)(?:(\\d+) de (\\d+))?(\\d{6})${VALOR}$`, 'i');

// Linha simples: data + descrição + valor. Usada nas seções que não têm cuota
// nem número de operação (impostos, pagamentos, ajustes).
const LINHA_SIMPLES = new RegExp(`^${DATA}(.+?)${VALOR}$`, 'i');

// Cabeçalhos que o pdf-parse repete a cada página.
const RUIDO = [
  /^Fecha\s*Descripci[oó]n/i,
  /^DETALLE DE MOVIMIENTOS$/i,
  /^INFORMACI[OÓ]N ADICIONAL$/i,
  /^\d+$/,                    // marcador de nota de rodapé ("1")
  /^[¹²³]/,                   // a própria nota de rodapé
];

/**
 * É um resumo de cartão argentino do Mercado Pago?
 *
 * Exige DOIS marcadores próprios. "DETALLE DE MOVIMIENTOS" sozinho não serve:
 * o extrato de conta argentino também o traz, e roubar o documento do outro
 * parser seria um jeito silencioso de importar tudo errado.
 */
export function detectResumenTarjetaAr(text) {
  const s = String(text ?? '');
  if (/RESUMEN DE CUENTA/i.test(s)) return false;   // isso é extrato, não cartão
  return /Total a pagar/i.test(s) && (
    /Con tarjeta (virtual|f[ií]sica)/i.test(s) ||
    /Composici[oó]n del saldo del periodo anterior/i.test(s)
  );
}

/**
 * Ano do ciclo, inferido — o documento não traz nenhum.
 *
 * Não há como acertar isto a partir do arquivo: o resumo diz "Fecha de cierre
 * 18 de julio" e para aí; o PDF também não tem CreationDate. O único ponto de
 * apoio é o RELÓGIO de quem importa, e a suposição é a mais conservadora
 * possível — o fechamento é o mais recente que já aconteceu.
 *
 * Consequência aceita: importar hoje um resumo de dois anos atrás data tudo
 * como se fosse do ano passado. Por isso a suposição vira AVISO na tela, em
 * vez de ficar só neste comentário. Errar em silêncio é o que não pode.
 *
 * @param {number} mesFechamento 1–12
 * @param {number} diaFechamento
 * @param {Date} hoje
 */
export function anoDoCiclo(mesFechamento, diaFechamento, hoje = new Date()) {
  const ano = hoje.getFullYear();
  const fechamento = new Date(ano, mesFechamento - 1, diaFechamento);
  // fechamento ainda no futuro ⇒ o resumo é do ano passado
  return fechamento > hoje ? ano - 1 : ano;
}

/** "18 de julio" logo depois de um rótulo → { dia, mes } */
function dataDeciclo(text, rotulo) {
  const m = String(text).match(
    new RegExp(`${rotulo}\\s*\\n?\\s*(\\d{1,2})\\s+de\\s+([a-zA-ZáéíóúÁÉÍÓÚ]+)`, 'i'));
  if (!m) return null;
  const mes = monthIndexOf(m[2]);
  return mes ? { dia: +m[1], mes } : null;
}

/** Valor declarado pelo documento no bloco "Consolidado", em centavos. */
function declarado(text, rotulo) {
  const m = String(text).match(new RegExp(`^${rotulo}\\s*${VALOR}`, 'im'));
  return m ? cents(money(m[3])) * (m[1] === '-' ? -1 : 1) : null;
}

/**
 * Confere o que o parser somou contra o que o documento declara.
 *
 * O resumo declara os mesmos números DUAS vezes — no bloco "Consolidado" do
 * topo e no "Subtotal" de cada seção. Isto usa o Consolidado, que é o mais
 * estável, e trata divergência como motivo para NÃO importar: um resumo de
 * cartão errado por uma linha continua parecendo certo na tela.
 */
function conferir(text, somas) {
  const alvos = [
    ['consumos', /Consumos/.source, somas.consumos],
    ['impostos', /Impuestos e intereses/.source, somas.impostos],
  ];
  const problemas = [];
  let conferiu = 0;

  for (const [nome, rotulo, somado] of alvos) {
    const esperado = declarado(text, rotulo);
    if (esperado == null) continue;
    conferiu++;
    if (Math.abs(esperado - somado) > 1) {
      problemas.push(`${nome}: documento diz ${(esperado / 100).toFixed(2)}, ` +
        `parser somou ${(somado / 100).toFixed(2)}`);
    }
  }

  const total = declarado(text, /Total a pagar/.source);
  const anterior = declarado(text, /Saldo del periodo anterior/.source) ?? 0;
  if (total != null) {
    conferiu++;
    const esperado = anterior + somas.consumos + somas.impostos + somas.outros;
    if (Math.abs(total - esperado) > 1) {
      problemas.push(`total a pagar: documento diz ${(total / 100).toFixed(2)}, ` +
        `as partes somam ${(esperado / 100).toFixed(2)}`);
    }
  }

  if (problemas.length) {
    throw new Error(t('import.err.resumenTotals', { problems: problemas.join('; ') }));
  }
  return conferiu;
}

/**
 * Resumo de cartão argentino → transações.
 *
 * @param {string} text texto extraído do PDF
 * @param {{today?: Date}} [opts] `today` existe para o teste fixar o relógio
 * @returns {{transactions: Array, warnings: string[]}}
 */
export function parseResumenTarjetaAr(text, { today = new Date() } = {}) {
  const linhas = String(text).split('\n').map(l => l.trim()).filter(Boolean);

  const cierre = dataDeciclo(text, 'Fecha de cierre') ||
                 dataDeciclo(text, 'Cierre actual');
  const venc = dataDeciclo(text, 'Fecha de vencimiento') ||
               dataDeciclo(text, 'Vencimiento actual') || cierre;
  if (!cierre) throw new Error(t('import.err.resumenNoCycle'));

  const ano = anoDoCiclo(cierre.mes, cierre.dia, today);
  const invoiceRef = venc
    ? `${venc.mes > cierre.mes ? ano - 1 : ano}-${String(venc.mes).padStart(2, '0')}`
    : null;

  // Compra parcelada mostra a data da COMPRA, que pode ser de outro ano: mês
  // depois do fechamento só cabe no ciclo anterior. É a mesma regra do layout
  // brasileiro, só que aqui o ano de referência também é inferido.
  const dataDe = (dia, mesTxt) => {
    const mes = monthIndexOf(mesTxt);
    if (!mes) return null;
    const y = mes > cierre.mes ? ano - 1 : ano;
    return `${y}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  };

  const txs = [];
  const dolares = [];
  const somas = { consumos: 0, impostos: 0, outros: 0 };

  let secao = null;           // 'anterior' | 'consumos' | 'impostos' | 'outros'
  let comecou = false;        // só depois de "DETALLE DE MOVIMIENTOS"

  for (const linha of linhas) {
    if (!comecou) {
      // Antes disto vem o bloco "Consolidado", que repete os mesmos rótulos
      // ("Consumos$ 268.497,94") e viraria seção fantasma.
      if (/^DETALLE DE MOVIMIENTOS$/i.test(linha)) comecou = true;
      continue;
    }

    // ── troca de seção ──────────────────────────────────────────────────
    if (/^Composici[oó]n del saldo del periodo anterior$/i.test(linha)) { secao = 'anterior'; continue; }
    if (/^Consumos$/i.test(linha)) { secao = 'consumos'; continue; }
    if (/^Impuestos e intereses$/i.test(linha)) { secao = 'impostos'; continue; }
    if (/^(Pagos anticipados|Ajustes y reembolsos)$/i.test(linha)) { secao = 'outros'; continue; }
    if (/^Con tarjeta (virtual|f[ií]sica)$/i.test(linha)) continue;   // segue em consumos
    if (/^Subtotal/i.test(linha)) { secao = null; continue; }
    if (/^Total a pagar/i.test(linha)) break;                          // fim do detalhe
    if (!secao || RUIDO.some(rx => rx.test(linha))) continue;

    // O período anterior é lido e DESCARTADO de propósito: são o total da
    // fatura passada e os pagamentos que a quitaram. Somam zero (o próprio
    // documento diz "Subtotal $ 0,00") e importá-los duplicaria o ciclo
    // anterior inteiro.
    if (secao === 'anterior') continue;

    const m = secao === 'consumos'
      ? linha.match(LINHA_CONSUMO)
      : linha.match(LINHA_SIMPLES);
    if (!m) continue;

    const [dia, mesTxt] = [m[1], m[2]];
    const data = dataDe(+dia, mesTxt);
    if (!data) continue;

    const consumo = secao === 'consumos';
    const desc = m[3].trim();
    const cuotaN = consumo ? m[4] : null;
    const cuotaT = consumo ? m[5] : null;
    const operacao = consumo ? m[6] : null;
    const [sinal, usd, valor] = consumo ? [m[7], m[8], m[9]] : [m[4], m[5], m[6]];

    const bruto = money(valor) * (sinal === '-' ? -1 : 1);

    // Dólar não entra. O resumo cobra pesos e dólares em colunas separadas e
    // NÃO traz cotação — ele próprio avisa que o câmbio é o do dia do
    // pagamento. Converter por um número inventado aqui colocaria na tela um
    // gasto que ninguém teve; somar 20 "pesos" onde o documento diz US$ 20
    // seria pior ainda. Então fica de fora, e o aviso diz exatamente quanto.
    if (usd) {
      dolares.push({ date: data, description: desc, usd: Math.abs(bruto) });
      continue;
    }

    // Consumo e imposto são gastos; crédito vem com sinal negativo impresso e
    // volta a ser positivo aqui (reembolso é dinheiro de volta).
    const amount = -bruto;
    somas[secao === 'impostos' ? 'impostos' : secao === 'consumos' ? 'consumos' : 'outros'] += cents(bruto);

    txs.push({
      date: data,
      description: desc + (cuotaN ? ` (cuota ${cuotaN}/${cuotaT})` : ''),
      amount,
      // O número de operação é único no resumo, mas NÃO é usado como chave de
      // deduplicação: o mesmo consumo parcelado reaparece com outro número a
      // cada ciclo. Deixar o hash de conteúdo cuidar disso é mais seguro.
      externalId: null,
      source: 'mp-ar-fatura',
      transfer: false,
      invoiceRef,
    });
  }

  const conferidos = conferir(text, somas);

  const warnings = [];
  warnings.push(t('import.warn.inferredYear', {
    year: ano,
    closing: `${cierre.dia}/${String(cierre.mes).padStart(2, '0')}`,
  }));
  if (dolares.length) {
    const totalUsd = dolares.reduce((s, d) => s + d.usd, 0);
    warnings.push(t('import.warn.foreignSkipped', {
      n: dolares.length,
      total: totalUsd.toFixed(2).replace('.', ','),
    }));
  }
  if (!conferidos) warnings.push(t('import.warn.noTotals'));

  return { transactions: txs, warnings, foreign: dolares };
}
