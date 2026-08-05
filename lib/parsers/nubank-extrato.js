// Extrato de conta do Nubank (PDF, em reais).
//
// ─── O que torna este layout perigoso ────────────────────────────────────────
// O VALOR DE CADA LANÇAMENTO NÃO TEM SINAL. Quem diz a direção é o cabeçalho do
// grupo em que ele está, dentro do dia:
//
//   16 JUL 2026
//   Total de entradas+ 360,00          ← daqui para baixo é ENTRADA
//   Transferência recebida pelo Pix…
//   360,00
//   18 JUL 2026
//   Total de saídas- 360,00            ← daqui para baixo é SAÍDA
//   Pagamento de fatura
//   211,69
//   Transferência enviada pelo Pix…
//   148,31
//
// Ler esse marcador errado não faz o parser falhar: ele importa despesa como
// receita. O total de linhas continua certo, as datas continuam certas, e o
// número na tela fica com o sinal trocado — o tipo de erro que este projeto
// trata como o pior de todos.
//
// A descrição vem QUEBRADA em várias linhas (o Pix traz nome, CPF mascarado,
// instituição, agência e conta), e o valor é sempre a última linha do bloco.
//
// ─── A defesa ────────────────────────────────────────────────────────────────
// Cada grupo declara o próprio subtotal, e ele é conferido ao centavo a cada
// importação (ver conferirGrupos). Num extrato onde o sinal é inferido,
// conferir a soma não é zelo: é a única coisa que separa "leu certo" de
// "inverteu tudo".

import { t } from '../i18n/index.js';

/** "1.234,56" → centavos. */
const cents = (s) =>
  Math.round(parseFloat(String(s).replace(/\./g, '').replace(',', '.')) * 100);

const MESES = {
  JAN: 1, FEV: 2, MAR: 3, ABR: 4, MAI: 5, JUN: 6,
  JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12,
};

// "16 JUL 2026" — cabeçalho de dia
const DIA_RX = /^(\d{1,2})\s+([A-ZÇ]{3})\s+(\d{4})$/i;

// "Total de entradas+ 360,00" / "Total de saídas- 360,00" — marcador de grupo.
// O sinal impresso aqui é redundante com a palavra, e é conferido: se um dia o
// Nubank escrever "Total de saídas+", o parser prefere não adivinhar.
const GRUPO_RX = /^Total de (entradas|sa[ií]das)\s*([+-])\s*([\d.]+,\d{2})$/i;

// Valor sozinho numa linha: fecha o bloco da descrição anterior.
const VALOR_RX = /^([\d.]+,\d{2})$/;

// …mas o extrato usa DUAS formas, e misturadas no mesmo dia:
//
//   Pagamento de fatura211,69              ← descrição e valor COLADOS
//   Transferência enviada pelo PixFulano…  ← descrição em várias linhas
//   148,31                                 ← e o valor sozinho no fim
//
// A primeira versão só entendia a segunda forma. O lançamento colado sumia, e
// quem denunciou foi o subtotal do dia: 360,00 declarado contra 148,31 lidos.
// Sem essa conferência, teria entrado um extrato com uma despesa a menos e
// nenhum sinal de que faltava algo.
const COLADO_RX = /^(.*[^\d.,\s])([\d.]+,\d{2})$/;

// Linhas do documento que não são nem lançamento nem estrutura.
const RUIDO = [
  /^VALORES EM R\$$/i,
  /^Movimenta[çc][õo]es$/i,
  /^Saldo (final do per[ií]odo|inicial)$/i,
  /^Rendimento l[ií]quido$/i,
  /^Total de (entradas|sa[ií]das)$/i,
  /^\d+ de \d+$/,                                  // "1 de 2"
  /^Extrato gerado dia /i,
  /Tem alguma d[úu]vida|Ouvidoria|nubank\.com\.br|Atendimento/i,
  /^Nu (Financeira|Pagamentos)/i,
  /^CNPJ:/i,
  /^O saldo l[ií]quido corresponde/i,
  /^N[ãa]o nos responsabilizamos/i,
  /^Asseguramos a autenticidade/i,
  // NÃO ponha aqui uma regra para "linha que é só um número": o resumo do topo
  // é composto exatamente assim, mas o VALOR DE CADA LANÇAMENTO também. Uma
  // regra dessas mata todos os lançamentos e o parser devolve zero — foi o que
  // aconteceu na primeira versão. Quem descarta o resumo do topo é o
  // `comecou`, que só libera a leitura depois de "Movimentações".
];

/** É um extrato de conta do Nubank? */
export function detectNubankExtrato(text) {
  const s = String(text ?? '');
  return /Movimenta[çc][õo]es/i.test(s) &&
         /Total de (entradas|sa[ií]das)/i.test(s) &&
         /nubank\.com\.br|Nu Pagamentos|Nu Financeira/i.test(s);
}

/**
 * Confere cada GRUPO contra o subtotal que ele mesmo declara.
 *
 * Por que por grupo e não pelo total do período: o total do período mora num
 * bloco do topo onde os RÓTULOS e os VALORES estão separados —
 * "Total de entradas" numa lista e "+633,00" noutra, casados por posição. Casar
 * por posição é frágil, e a primeira versão deste parser casou o regex do
 * período com o subtotal do primeiro dia, achando que tinha conferido algo.
 *
 * O subtotal de cada dia, ao contrário, vem colado ao número
 * ("Total de entradas+ 360,00") e não tem essa ambiguidade. Conferir grupo a
 * grupo também é uma checagem MAIS FORTE: um erro localizado num único dia se
 * dilui no total do período e some, mas estoura no grupo.
 *
 * ABORTA em vez de avisar — ao contrário do leitor de CSV. Aqui o sinal de cada
 * linha é INFERIDO do grupo: se a soma não bate, a hipótese mais provável não é
 * "faltou uma linha", é "o agrupamento foi lido errado e metade do extrato está
 * com o sinal invertido".
 */
function conferirGrupos(grupos) {
  const problemas = [];
  for (const g of grupos) {
    const somado = g.txs.reduce((s, x) => s + Math.abs(Math.round(x.amount * 100)), 0);
    if (Math.abs(somado - g.declarado) > 1) {
      problemas.push(
        `${g.data} ${g.entrada ? 'entradas' : 'saídas'}: ` +
        `${(g.declarado / 100).toFixed(2)} × ${(somado / 100).toFixed(2)}`);
    }
  }
  if (problemas.length) {
    throw new Error(t('import.err.nubankTotals', { problems: problemas.join('; ') }));
  }
  return grupos.length ? [] : [t('import.warn.nubankNoTotals')];
}

/**
 * Extrato do Nubank → transações.
 *
 * @param {string} text texto extraído do PDF
 * @returns {{transactions: Array, warnings: string[]}}
 */
export function parseNubankExtrato(text) {
  const linhas = String(text).split('\n').map(l => l.trim()).filter(Boolean);

  const txs = [];
  const grupos = [];      // cada "Total de entradas/saídas" abre um, para conferir
  let grupo = null;
  let data = null;        // dia corrente
  let sinal = 0;          // +1 entrada, -1 saída — vem do marcador de grupo
  let desc = [];          // descrição sendo acumulada (vem quebrada em linhas)
  let comecou = false;    // só depois de "Movimentações"

  for (const linha of linhas) {
    if (!comecou) {
      // O topo repete "Total de entradas/saídas" e os valores do resumo. Entrar
      // antes da hora faria o resumo virar lançamento.
      if (/^Movimenta[çc][õo]es$/i.test(linha)) comecou = true;
      continue;
    }

    const dia = linha.match(DIA_RX);
    if (dia) {
      const mes = MESES[dia[2].toUpperCase()];
      if (mes) {
        data = `${dia[3]}-${String(mes).padStart(2, '0')}-${String(dia[1]).padStart(2, '0')}`;
        // Trocar de dia sem ter fechado o bloco anterior significa descrição
        // sem valor: descarta em vez de arrastar para o dia seguinte.
        desc = [];
      }
      continue;
    }

    const marcador = linha.match(GRUPO_RX);
    if (marcador) {
      const [, palavra, simbolo] = marcador;
      const porPalavra = /entradas/i.test(palavra) ? 1 : -1;
      const porSimbolo = simbolo === '+' ? 1 : -1;
      // A palavra e o símbolo dizem a mesma coisa. Quando discordam, o
      // documento mudou de forma e adivinhar seria escolher um sinal no cara ou
      // coroa — num extrato, isso é a diferença entre receita e despesa.
      if (porPalavra !== porSimbolo) {
        throw new Error(t('import.err.nubankSign', { line: linha }));
      }
      sinal = porPalavra;
      grupo = { data, entrada: sinal > 0, declarado: cents(marcador[3]), txs: [] };
      grupos.push(grupo);
      desc = [];
      continue;
    }

    if (RUIDO.some(rx => rx.test(linha))) continue;

    const solto = linha.match(VALOR_RX);
    const colado = solto ? null : linha.match(COLADO_RX);
    const valor = solto ? solto[1] : colado?.[2];
    if (colado) desc.push(colado[1]);

    if (valor && data && sinal && desc.length) {
      const tx = {
        date: data,
        description: desc.join(' ').replace(/\s+/g, ' ').trim(),
        amount: (cents(valor) / 100) * sinal,
        externalId: null,
        source: 'nubank-extrato',
        transfer: false,
        // Extrato do Nubank é em reais, que é a moeda da instalação brasileira:
        // nulo em vez de 'BRL' para não afirmar o que já é o padrão.
        currency: null,
      };
      txs.push(tx);
      grupo?.txs.push(tx);
      desc = [];
      continue;
    }

    // Não é data, nem grupo, nem valor, nem ruído: é pedaço de descrição.
    desc.push(linha);
  }

  return { transactions: txs, warnings: conferirGrupos(grupos) };
}
