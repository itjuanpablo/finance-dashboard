// Extrato de conta de banco argentino no formato "Últimos movimientos".
//
// Layout observado num documento real (conta sueldo / seguridad social):
//
// (exemplo com número de conta, nomes e valores TROCADOS — a forma é a do
// documento real, o conteúdo não é de ninguém)
//
//   Últimos movimientos de CUENTA SUELDO / DE LA SEGURIDAD SOCIAL
//   Número de cuenta 000000000000000
//   Fecha
//   Nro.
//   Transacción
//   DescripciónImporteSaldo
//   29/08/20251947285972CAPITALIZACION AH$ 0,09$ 881,99
//   20/08/2025868500MONOTRIBUTO FISICAS-$ 63.357,80$ 881,90
//   20/08/2025748998
//   TPUSH NOMBRE APELLIDO
//   DOC00000000000
//   $ 64.000,00$ 64.239,70
//
// Três diferenças que importam em relação ao Mercado Pago:
//
//  1. A data usa BARRA (dd/mm/aaaa), não hífen.
//  2. O SINAL NEGATIVO VEM ANTES DO "$" — "-$ 63.357,80", e não "$ -63.357,80".
//     Ler isso errado não deixa o parser falhar: ele importa uma despesa como
//     receita, o que dobra o erro no saldo e passa por qualquer conferência de
//     "número de linhas".
//  3. Os movimentos vêm em ordem DECRESCENTE de data, e cada linha traz o saldo
//     DEPOIS do movimento. Isso permite a validação forte: saldo de uma linha
//     tem de ser o saldo da linha anterior (mais antiga) mais o importe. Doze
//     elos conferidos num documento de treze linhas — só o saldo de abertura
//     não é declarado.
//
// ─── Sobre o BANCO ───────────────────────────────────────────────────────────
// O texto do PDF NÃO diz de qual banco é: o nome aparece só no logotipo, que é
// imagem. Então este perfil é reconhecido pelo LAYOUT, não pela instituição, e o
// `source` é genérico (`ar-cuenta`). Consequência prática: se dois bancos
// argentinos usarem o mesmo formato de página, os dois caem aqui e ficam na
// mesma "origem" na tela de Contas. Quando o banco for identificado, basta
// renomear o perfil — mas mudar o `source` reimportaria como novas todas as
// transações já gravadas (o `source` entra no hash), então isso é decisão
// consciente, não detalhe.

import { parseMoney } from './mercadopago.js';

/** "-$ 1.234,56" ou "$ 1.234,56" → -1234.56 / 1234.56 */
const MONEY = String.raw`(-?)\s*\$\s*([\d.]+,\d{2})`;

/**
 * Linhas que não são movimento e podem cair dentro da descrição por causa da
 * quebra de página. Removidas ANTES de casar os blocos: cabeçalho que contenha
 * algo parecido com data ou valor faria o parser casar no lugar errado e
 * engolir o movimento seguinte — foi exatamente o que aconteceu com a data de
 * geração no rodapé do extrato do Mercado Pago.
 */
const NOISE = [
  /^\d+\/\d+$/,                          // marcador de página "1/2"
  /^[ÚU]ltimos movimientos/i,
  /^N[úu]mero de cuenta/i,
  /^Fecha$/i,
  /^Nro\.?$/i,
  /^Transacci[óo]n$/i,
  /^Descripci[óo]nImporteSaldo$/i,
  /^Saldo (inicial|final|anterior)/i,
  /^P[áa]gina \d+/i,
  /^Fecha de (generaci[óo]n|emisi[óo]n)/i,
];

const stripNoise = (text) =>
  String(text).split('\n').filter(l => !NOISE.some(rx => rx.test(l.trim()))).join('\n');

/** Descrição em várias linhas → uma linha; nunca um parágrafo. */
function cleanDesc(raw) {
  const d = String(raw).split('\n').map(l => l.trim()).filter(Boolean)
    .join(' ').replace(/\s+/g, ' ').trim();
  return d.length > 120 ? `${d.slice(0, 120).trim()}…` : d;
}

/** Este texto é um extrato neste layout? */
export function detectExtractoAr(text) {
  const t = String(text ?? '');
  return /[ÚU]ltimos movimientos/i.test(t) &&
         /Descripci[óo]nImporteSaldo/i.test(t);
}

/**
 * Confere a cadeia de saldos declarada no documento.
 *
 * Os movimentos vêm do mais novo para o mais antigo, então a verificação anda de
 * baixo para cima: saldo[i] = saldo[i+1] + importe[i]. É a mesma ideia do
 * `assertChain` do OFX, e é a checagem que pega o erro que a soma de totais não
 * pega — sinal invertido numa linha, movimento duplicado, movimento perdido.
 *
 * Tolerância de 1 centavo por elo, para arredondamento do próprio banco.
 *
 * @returns {string[]} avisos (vazio quando fecha)
 * @throws quando algum elo não fecha — importar torto é pior que não importar
 */
export function assertBalanceChain(txs) {
  if (txs.length < 2) return [];
  const cents = (v) => Math.round(v * 100);
  const quebras = [];

  for (let i = txs.length - 2; i >= 0; i--) {
    const esperado = cents(txs[i + 1].balance) + cents(txs[i].amount);
    if (Math.abs(esperado - cents(txs[i].balance)) > 1) {
      quebras.push(
        `${txs[i].date} "${txs[i].description.slice(0, 40)}": saldo anterior ` +
        `${(txs[i + 1].balance).toFixed(2)} ${txs[i].amount >= 0 ? '+' : '−'} ` +
        `${Math.abs(txs[i].amount).toFixed(2)} daria ${(esperado / 100).toFixed(2)}, ` +
        `mas o documento diz ${txs[i].balance.toFixed(2)}`);
    }
  }

  if (quebras.length) {
    throw new Error(
      `A cadeia de saldos do extrato não fecha em ${quebras.length} de ` +
      `${txs.length - 1} movimentos, então o arquivo NÃO foi importado. ` +
      `Primeira divergência — ${quebras[0]}. ` +
      'Isso costuma significar que o layout do banco mudou; ' +
      'exporte em CSV ou OFX enquanto o parser não for ajustado.');
  }
  return [];
}

/**
 * Extrato "Últimos movimientos" → transações.
 *
 * @param {string} text texto extraído do PDF
 * @returns {{transactions: Array, warnings: string[]}}
 */
export function parseExtractoAr(text) {
  const clean = stripNoise(text);
  const txs = [];

  // dd/mm/aaaa · nº da transação · descrição (pode ter \n) · importe · saldo
  //
  // O nº é `\d{4,12}` GULOSO logo após a data, e a descrição começa no primeiro
  // caractere não-numérico. Isso assume que descrição nunca começa por dígito —
  // verdade nos movimentos vistos (TPUSH, TRANSF, IMP. AFIP, SUPER MAMI,
  // CAPITALIZACION, MONOTRIBUTO, DB TARJETA). Se um banco começar a descrição
  // com número, parte dela seria comida pelo nº do movimento; a cadeia de
  // saldos continuaria fechando, porque só o texto se perde, não o valor.
  const rx = new RegExp(
    String.raw`(\d{2})\/(\d{2})\/(\d{4})(\d{4,12})([\s\S]*?)${MONEY}\s*${MONEY}`, 'g');

  let m;
  while ((m = rx.exec(clean)) !== null) {
    const [, dd, mm, yyyy, nro, rawDesc, sinalImp, imp, sinalSaldo, saldo] = m;
    const desc = cleanDesc(rawDesc);
    if (!desc) continue;
    txs.push({
      date: `${yyyy}-${mm}-${dd}`,
      description: desc,
      amount: (sinalImp === '-' ? -1 : 1) * parseMoney(imp),
      balance: (sinalSaldo === '-' ? -1 : 1) * parseMoney(saldo),
      // Nº do movimento é único no banco e estável entre exportações: serve de
      // chave de deduplicação, igual ao ID de operação do Mercado Pago.
      externalId: nro,
      source: 'ar-cuenta',
      // Débito da fatura do cartão é dinheiro saindo da conta para pagar outra
      // conta sua: transferência interna, não despesa nova (a despesa está nos
      // itens da fatura). Sem isto, quem importa extrato E fatura conta duas
      // vezes.
      //
      // NÃO entra aqui, de propósito:
      //  · CAPITALIZACION — é juro creditado na poupança, ou seja RECEITA. O
      //    categorizador manda para "Renda".
      //  · TPUSH <nome> — transferência recebida. Quando o nome é o do próprio
      //    titular, é dinheiro trocando de bolso (tipicamente vindo do Mercado
      //    Pago), e contar como receita infla a renda do mês. Mas este layout
      //    NÃO declara o titular em campo nenhum — o nome só aparece dentro da
      //    descrição, e presumir que quem manda é o dono da conta seria chute
      //    sobre dinheiro. Fica para o usuário marcar na tela (categoria
      //    "Transferências" agora também liga a bandeira de transferência).
      transfer: /^DB TARJETA DE CREDITO|^PAGO TARJETA|^DEBITO AUTOMATICO TARJETA/i.test(desc),
    });
  }

  const warnings = assertBalanceChain(txs);
  if (!txs.length) return { transactions: [], warnings };

  // A cadeia fechou, mas o saldo não é dado de transação — não vai para o banco.
  return {
    transactions: txs.map(({ balance, ...t }) => t),
    warnings,
  };
}
