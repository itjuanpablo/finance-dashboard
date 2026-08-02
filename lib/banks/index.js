// Registry de perfis de banco.
//
// Um perfil DESCREVE o arquivo (separador, ordem da data, onde está o valor),
// não contém código de parsing: quem lê é lib/parsers/csv.js. Assim adicionar
// banco é acrescentar dado, e o parser continua sendo um só.
//
// ─────────────────────────────────────────────────────────────────────────────
// HONESTIDADE SOBRE A ORIGEM DO LAYOUT
//
// Só dois perfis foram calibrados contra arquivos reais (os PDFs do Mercado
// Pago Brasil do usuário). Todo o resto foi escrito a partir de layouts
// documentados publicamente ou inferidos. Cada perfil declara `confidence`:
//
//   'alta'  — cabeçalho conferido/documentado; errar aqui seria surpresa
//   'media' — layout amplamente reportado, sem arquivo em mãos
//   'baixa' — inferido; PRECISA de um export real para virar confiável
//
// Um perfil que erra calado é pior que o parser genérico. Por isso:
//   1. o mapeamento de coluna é por SINÔNIMO de cabeçalho, nunca por índice
//      fixo (exceto nos exports sabidamente sem cabeçalho, e aí a detecção
//      exige o nome do banco);
//   2. perfil de confiança 'baixa' só é aceito se, além do cabeçalho plausível,
//      houver marcador do banco no conteúdo ou no nome do arquivo
//      (`requireMarker`);
//   3. quando nada casa, cai no genérico — que já funciona.

import { detectMercadoPago } from '../parsers/mercadopago.js';
import { detectExtractoAr } from '../parsers/extracto-ar.js';
import { detectResumenTarjetaAr } from '../parsers/resumen-tarjeta-ar.js';
import { REGION } from '../config.js';

/** minúsculo, sem acento, espaços colapsados — forma de comparação. */
export const norm = (s) =>
  String(s ?? '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // acentos, já separados pelo NFD
    .replace(/[\s\u00a0]+/g, ' ')      // NBSP aparece em export de banco
    .trim();

/** Região de cabeçalho: primeiras linhas, onde vive preâmbulo + cabeçalho. */
const headerRegion = (text) =>
  String(text ?? '').split(/\r?\n/).slice(0, 25).map(norm).join('\n');

/** Alguma linha do cabeçalho contém todos os tokens? (ordem não importa) */
const lineWithAll = (text, tokens) =>
  headerRegion(text).split('\n').some((l) => tokens.every((tk) => l.includes(norm(tk))));

/** Alguma linha do cabeçalho contém todos os `all` e algum dos `any`? */
const lineWith = (text, all, any) =>
  headerRegion(text).split('\n').some((l) =>
    all.every((tk) => l.includes(norm(tk))) &&
    (!any?.length || any.some((tk) => l.includes(norm(tk)))));

const DATA_ROW = /^\W*"?\d{1,4}[-\/.]\d{1,2}[-\/.]\d{1,4}/;

/**
 * Preâmbulo: o que vem antes da primeira linha de dados (a primeira que começa
 * com data). É onde o export escreve titular, período e nome do banco.
 */
const preamble = (text) => {
  const out = [];
  for (const l of String(text ?? '').split(/\r?\n/).slice(0, 25)) {
    if (DATA_ROW.test(l.trim())) break;
    out.push(norm(l));
  }
  return out.join('\n');
};

/**
 * Nome do banco no preâmbulo do arquivo, ou no nome do arquivo?
 *
 * Procura SÓ no preâmbulo, nunca no corpo: no corpo o nome do banco aparece
 * dentro de descrição ("TRANSF INTER CONTAS", "PIX ITAU"), e aí um perfil
 * inferido roubaria um CSV genérico — o "errar calado" que se quer evitar.
 * Export sem preâmbulo (Itaú) depende do nome do arquivo, e é melhor assim:
 * a alternativa seria adivinhar.
 */
const marker = (text, fileName, rx) =>
  rx.test(preamble(text)) || rx.test(norm(fileName));

/**
 * Instituição declarada pelo PRÓPRIO arquivo OFX: `<ORG>` (nome da instituição
 * no bloco <FI>) e `<BANKID>` (código COMPE, 341 = Itaú, 237 = Bradesco…).
 *
 * É a evidência mais forte que existe para OFX — vem do banco, não do nome do
 * arquivo — e não corre o risco do marcador de texto: CSV não tem tag, então
 * isto nunca rouba um arquivo alheio. Antes desta função nenhum perfil casava
 * com OFX (todos os `detect` procuram cabeçalho de CSV) e todo OFX aparecia
 * como "OFX genérico", mesmo vindo de um banco conhecido.
 *
 * O `source` gravado continua sendo 'ofx' de qualquer jeito (ver
 * lib/importer.js): isto muda o que se MOSTRA, não o que se grava.
 */
const ofxBank = (text, rx, compe) => {
  const t = String(text ?? '');
  const org = t.match(/<(?:ORG|FINAME)>\s*([^<\r\n]+)/i)?.[1];
  if (org && rx.test(norm(org))) return true;
  const bankId = t.match(/<BANKID>\s*0*(\d{1,4})/i)?.[1];
  return !!(compe && bankId && +bankId === compe);
};

// ─── sinônimos de coluna ─────────────────────────────────────────────────────
// `any` em ordem de prioridade; `not` descarta a célula. Prefixo '=' exige
// igualdade exata — necessário em token curto ('id') que casaria com meia
// planilha por substring.

/** @type {Record<string, {any: string[], not?: string[]}>} */
export const DEFAULT_COLUMNS = {
  date: {
    any: ['data de compra', 'data lancamento', 'data do lancamento', 'data movimento',
      'fecha operacion', 'fecha de operacion', 'fecha contable', 'fecha', 'data', 'date', '=dt'],
    not: ['balancete', 'vencimento', 'vencimiento', 'saldo', 'cierre'],
  },
  description: {
    any: ['descricao', 'descripcion', 'historico', 'concepto', 'detalle', 'lancamento',
      'movimentacao', 'movimiento', 'estabelecimento', 'comercio', 'beneficiario',
      'memo', 'title', 'description', 'referencia', 'observacao'],
    not: ['tipo de'],
  },
  amount: {
    // "Valor (em R$)" tem de ganhar de "Valor (em US$)" na fatura do C6:
    // o valor em dólar é informativo, o que entra na fatura é o convertido.
    any: ['valor (em r$)', 'valor em r$', 'valor', 'importe', 'monto', 'amount', 'value', '=vlr'],
    not: ['us$', 'usd', 'dolar', 'saldo', 'cotacao', 'cotizacion', 'original', 'iof', 'parcela', 'cuota'],
  },
  debit: {
    any: ['debito', 'debe', 'saidas', 'saida', 'egresos', 'egreso', 'pagos'],
    not: ['saldo', 'cartao', 'tarjeta', 'automatico'],
  },
  credit: {
    any: ['credito', 'haber', 'entradas', 'entrada', 'ingresos', 'ingreso', 'depositos'],
    not: ['saldo', 'cartao', 'tarjeta', 'limite'],
  },
  balance: { any: ['saldo', 'balance'] },
  id: {
    any: ['identificador', 'id da operacao', 'id de la operacion', 'numero do documento',
      'nro de operacion', 'numero de operacion', 'codigo de operacion', '=id', '=fitid',
      '=docto', '=documento'],
  },
  type: { any: ['tipo de movimiento', 'tipo de operacion', 'tipo', '=d/c', 'debito/credito'] },
  installment: { any: ['parcela', 'cuotas', 'cuota'] },
};

const asSpec = (v) => (Array.isArray(v) ? { any: v } : v);

/**
 * Especificação efetiva de colunas: o que o perfil declara vem primeiro (ganha
 * a disputa), os sinônimos genéricos ficam como rede de segurança. Perfil
 * apertado demais deixa de ler um export que mudou uma palavra no cabeçalho.
 */
export function columnsFor(profile) {
  const own = profile?.csv?.columns || {};
  const out = {};
  for (const field of new Set([...Object.keys(DEFAULT_COLUMNS), ...Object.keys(own)])) {
    const o = asSpec(own[field]) || {};
    const d = DEFAULT_COLUMNS[field] || {};
    out[field] = {
      any: [...(o.any || []), ...(d.any || [])],
      not: [...(o.not || []), ...(d.not || [])],
    };
  }
  return out;
}

/**
 * Índice da coluna que casa com a especificação, ou -1.
 * Prioridade: sinônimo declarado antes; dentro do sinônimo, igualdade > começa
 * com > contém. Evita que 'data' roube a coluna de 'data do balancete'.
 */
export function pickColumn(headerCells, spec) {
  const cells = headerCells.map(norm);
  const s = asSpec(spec) || {};
  const reject = (cell) => (s.not || []).some((n) => cell.includes(norm(n)));
  for (const raw of s.any || []) {
    const exactOnly = raw.startsWith('=');
    const tk = norm(exactOnly ? raw.slice(1) : raw);
    for (const test of exactOnly
      ? [(c) => c === tk]
      : [(c) => c === tk, (c) => c.startsWith(tk), (c) => c.includes(tk)]) {
      const i = cells.findIndex((c) => c && !reject(c) && test(c));
      if (i >= 0) return i;
    }
  }
  return -1;
}

// ─── perfis: Brasil ──────────────────────────────────────────────────────────

const BR_PROFILES = [
  {
    id: 'nubank-extrato-csv',
    name: 'Nubank',
    kind: 'statement',
    country: 'BR',
    formats: ['csv'],
    source: 'nubank-extrato',
    fallbackSource: 'csv',
    // Confiança: ALTA — cabeçalho "Data,Valor,Identificador,Descrição" é o
    // export de conta do Nubank, estável há anos e amplamente documentado.
    // Valor já vem assinado, com PONTO decimal ("-50.00") — atenção: é o único
    // export BR relevante que não usa vírgula.
    confidence: 'alta',
    csv: {
      sep: ',',
      dateFormat: 'dmy',
      decimal: '.',
      amountSign: 'signed',
      columns: { date: ['data'], amount: ['valor'], description: ['descricao'], id: ['identificador'] },
    },
    detect: (text) => lineWithAll(text, ['data', 'valor', 'identificador', 'descricao']),
  },
  {
    id: 'nubank-fatura-csv',
    name: 'Nubank',
    kind: 'invoice',
    country: 'BR',
    formats: ['csv'],
    source: 'nubank-fatura',
    fallbackSource: 'csv',
    // Confiança: ALTA — a fatura do cartão exporta cabeçalho em INGLÊS
    // ("date,title,amount"), data ISO e valor positivo para consumo. Assinatura
    // inconfundível; é o que separa este perfil do extrato.
    confidence: 'alta',
    csv: {
      sep: ',',
      dateFormat: 'ymd',
      decimal: '.',
      // Positivo = consumo. Negativo (estorno/pagamento) mantém o sinal
      // invertido pela mesma regra: amount = -valor.
      amountSign: 'expense',
      columns: { date: ['date'], amount: ['amount'], description: ['title'] },
    },
    detect: (text) => lineWithAll(text, ['date', 'title', 'amount']),
  },
  {
    id: 'itau-csv',
    name: 'Itaú',
    kind: 'statement',
    country: 'BR',
    formats: ['csv', 'ofx'],
    source: 'itau-extrato',
    fallbackSource: 'csv',
    // Confiança: MÉDIA para o layout (três colunas ';' sem cabeçalho:
    // data;histórico;valor, vírgula decimal), BAIXA para a detecção — sem
    // cabeçalho não há o que reconhecer, então exigimos o nome do banco no
    // arquivo. Sem isso vira genérico, que lê esse layout do mesmo jeito.
    // Validar com export real: o Itaú também publica variantes com saldo.
    confidence: 'media',
    requireMarker: true,
    csv: {
      sep: ';',
      dateFormat: 'dmy',
      decimal: ',',
      amountSign: 'signed',
      positions: { date: 0, description: 1, amount: 2 },
    },
    detect: (text, fileName) =>
      ofxBank(text, /\bita[uú]/, 341) ||
      (marker(text, fileName, /\bita[uú]\b/) &&
        /(^|\n)\s*\d{2}\/\d{2}\/\d{4};/.test(String(text ?? '').slice(0, 4000))),
    skipRow: /^saldo( |$)|^s a l d o/i,
  },
  {
    id: 'bradesco-csv',
    name: 'Bradesco',
    kind: 'statement',
    country: 'BR',
    formats: ['csv', 'ofx'],
    source: 'bradesco-extrato',
    fallbackSource: 'csv',
    // Confiança: MÉDIA — layout reportado: preâmbulo de algumas linhas e
    // cabeçalho "Data;Histórico;Docto.;Crédito;Débito;Saldo", ou seja DÉBITO E
    // CRÉDITO EM COLUNAS SEPARADAS. O cabeçalho de 4 campos é específico o
    // bastante para dispensar marcador.
    confidence: 'media',
    csv: {
      sep: ';',
      dateFormat: 'dmy',
      decimal: ',',
      amountSign: 'debitCredit',
      columns: {
        date: ['data'], description: ['historico'],
        debit: ['debito'], credit: ['credito'], id: ['docto'],
      },
    },
    detect: (text) =>
      ofxBank(text, /bradesco/, 237) ||
      lineWithAll(text, ['data', 'historico', 'credito', 'debito']),
    skipRow: /^saldo (anterior|atual|do dia)|^total( |$)/i,
  },
  {
    id: 'bb-csv',
    name: 'Banco do Brasil',
    kind: 'statement',
    country: 'BR',
    formats: ['csv', 'ofx'],
    source: 'bb-extrato',
    fallbackSource: 'csv',
    // Confiança: MÉDIA — cabeçalho reportado com aspas e vírgula:
    // "Data","Dependencia Origem","Histórico","Data do Balancete",
    // "Número do documento","Valor". As duas colunas de data são a pegadinha:
    // 'Data do Balancete' não é a data do lançamento (daí o `not: balancete`
    // nos sinônimos). O extrato traz linhas "Saldo Anterior"/"S A L D O" que
    // NÃO são transação.
    confidence: 'media',
    csv: {
      sep: ',',
      dateFormat: 'dmy',
      decimal: ',',
      amountSign: 'signed',
      columns: {
        date: ['data'], description: ['historico'], amount: ['valor'],
        id: ['numero do documento'],
      },
    },
    detect: (text) =>
      ofxBank(text, /banco do brasil|^bb$/, 1) ||
      lineWith(text, ['data', 'historico'], ['balancete', 'dependencia']),
    skipRow: /^s ?a ?l ?d ?o|^saldo (anterior|do dia)/i,
  },
  {
    id: 'inter-csv',
    name: 'Inter',
    kind: 'statement',
    country: 'BR',
    formats: ['csv', 'ofx'],
    source: 'inter-extrato',
    fallbackSource: 'csv',
    // Confiança: BAIXA — o Inter exporta com preâmbulo ("Extrato Conta
    // Corrente", período, saldo) e cabeçalho genérico
    // "Data Lançamento;Descrição;Valor;Saldo". Genérico demais para reconhecer
    // sem o nome do banco: exige marcador. Validar com export real (há também
    // variante com coluna "Tipo de Transação").
    confidence: 'baixa',
    requireMarker: true,
    csv: {
      sep: ';',
      dateFormat: 'dmy',
      decimal: ',',
      amountSign: 'signed',
      columns: { date: ['data lancamento', 'data'], description: ['descricao'], amount: ['valor'] },
    },
    detect: (text, fileName) =>
      ofxBank(text, /banco inter|\binter\b/, 77) ||
      (marker(text, fileName, /banco inter|\binter\b/) &&
        lineWith(text, ['data'], ['valor', 'importe'])),
    skipRow: /^saldo( |$)/i,
  },
  {
    id: 'c6-fatura-csv',
    name: 'C6 Bank',
    kind: 'invoice',
    country: 'BR',
    formats: ['csv'],
    source: 'c6-fatura',
    fallbackSource: 'csv',
    // Confiança: MÉDIA — fatura do cartão C6 exporta com ';' e colunas
    // "Data de Compra;Nome no Cartão;Final do Cartão;Categoria;Descrição;
    //  Parcela;Valor (em US$);Cotação (em R$);Valor (em R$)".
    // Duas colunas chamadas "Valor": a de US$ é rejeitada pelos sinônimos.
    // "Final do Cartão" é o marcador de cabeçalho.
    confidence: 'media',
    csv: {
      sep: ';',
      dateFormat: 'dmy',
      decimal: ',',
      amountSign: 'expense',
      columns: {
        date: ['data de compra'], description: ['descricao'],
        amount: ['valor (em r$)'], installment: ['parcela'],
      },
    },
    detect: (text) =>
      lineWithAll(text, ['final do cartao']) ||
      lineWithAll(text, ['data de compra', 'valor (em r$)']),
  },
  {
    id: 'mp-br-extrato',
    name: 'Mercado Pago',
    kind: 'statement',
    country: 'BR',
    formats: ['pdf'],
    source: 'mp-extrato',   // NÃO MUDAR: source_bindings existentes dependem
    // Confiança: ALTA — o único perfil validado ao centavo contra documentos
    // reais (totais parseados batem com "Entradas/Saidas" do cabeçalho).
    confidence: 'alta',
    detect: (text) => detectMercadoPago(text).id === 'mp-br-extrato',
  },
  {
    id: 'mp-br-fatura',
    name: 'Mercado Pago',
    kind: 'invoice',
    country: 'BR',
    formats: ['pdf'],
    source: 'mp-fatura',    // NÃO MUDAR: source_bindings existentes dependem
    // Confiança: ALTA — validado contra as faturas reais do usuário.
    confidence: 'alta',
    detect: (text) => detectMercadoPago(text).id === 'mp-br-fatura',
  },
];

// ─── perfis: Argentina ───────────────────────────────────────────────────────
//
// Exceto o extrato do Mercado Pago (validado contra um documento real), NENHUM
// export argentino foi visto por este código. Os demais são 'baixa' e exigem
// marcador do banco. O que eles agregam sobre o genérico é o `source` (para
// vincular conta), o nome exibido e a convenção de sinal; a leitura em si é a
// mesma heurística tolerante. Cada um precisa de um arquivo real para subir de
// confiança.

const AR_PROFILES = [
  {
    // Reconhecido pelo LAYOUT, não pela instituição: o PDF não traz o nome do
    // banco no texto (só no logotipo, que é imagem). Ver o cabeçalho de
    // lib/parsers/extracto-ar.js.
    id: 'ar-cuenta-extracto',
    name: 'Banco argentino',
    kind: 'statement',
    country: 'AR',
    formats: ['pdf'],
    source: 'ar-cuenta',
    // Confiança: ALTA — calibrado contra documento real de 13 movimentos, e a
    // cadeia de saldos declarada no próprio extrato é conferida elo por elo a
    // cada importação. Se o banco mudar o layout, a importação falha com erro
    // em vez de gravar número errado.
    confidence: 'alta',
    detect: (text) => detectExtractoAr(text),
  },
  {
    id: 'mp-ar-extracto',
    name: 'Mercado Pago',
    kind: 'statement',
    country: 'AR',
    formats: ['pdf'],
    source: 'mp-ar-extrato',
    // Confiança: ALTA — calibrado contra um extrato real de conta em pesos
    // (48 movimentos): entradas, saídas e a cadeia de saldos linha a linha
    // fecham ao centavo com o que o documento declara.
    // Source distinto do BR porque é outra conta, de outra pessoa, em outra
    // moeda — vínculos de conta não devem se misturar.
    confidence: 'alta',
    detect: (text) => detectMercadoPago(text).id === 'mp-ar-extracto',
  },
  {
    id: 'mp-ar-resumen',
    name: 'Mercado Pago',
    kind: 'invoice',
    country: 'AR',
    formats: ['pdf'],
    source: 'mp-ar-fatura',
    // Confiança: ALTA para pesos — calibrado contra um resumo real de 18
    // movimentos. Os três totais declarados pelo documento (consumos,
    // impostos e total a pagar) são conferidos ao centavo a cada importação;
    // divergência de um centavo cancela a importação inteira.
    //
    // Ressalva declarada: consumos em DÓLAR ficam de fora, porque o resumo os
    // cobra em coluna separada e não traz cotação. O parser diz quanto ficou
    // de fora, em vez de converter por um número inventado.
    confidence: 'alta',
    detect: (text) => detectResumenTarjetaAr(text),
  },
  {
    id: 'galicia-csv',
    name: 'Banco Galicia',
    kind: 'statement',
    country: 'AR',
    formats: ['csv'],
    source: 'galicia-extrato',
    fallbackSource: 'csv',
    // Confiança: BAIXA — inferido. Assume-se export de "Consulta de
    // movimientos" com ';', vírgula decimal e DÉBITO/CRÉDITO em colunas
    // separadas ("Fecha;Descripción;Origen;Débito;Crédito;Saldo").
    // Validar com export real.
    confidence: 'baixa',
    requireMarker: true,
    csv: {
      sep: ';',
      dateFormat: 'dmy',
      decimal: ',',
      amountSign: 'debitCredit',
      columns: { date: ['fecha'], description: ['descripcion'], debit: ['debito'], credit: ['credito'] },
    },
    detect: (text, fileName) =>
      marker(text, fileName, /galicia/) && lineWith(text, ['fecha'], ['debito', 'importe', 'monto']),
    skipRow: /^saldo( |$)|^total( |$)/i,
  },
  {
    id: 'santander-ar-csv',
    name: 'Santander Argentina',
    kind: 'statement',
    country: 'AR',
    formats: ['csv'],
    source: 'santander-ar-extrato',
    fallbackSource: 'csv',
    // Confiança: BAIXA — inferido. Assume ';' e coluna única assinada
    // ("Fecha;Sucursal Origen;Descripción;Importe;Saldo"). Há relato de
    // variante com Débito/Crédito: os sinônimos genéricos cobrem as duas, o
    // parser escolhe pelo cabeçalho que encontrar. Validar com export real.
    confidence: 'baixa',
    requireMarker: true,
    csv: {
      sep: ';',
      dateFormat: 'dmy',
      decimal: ',',
      amountSign: 'auto',
      columns: { date: ['fecha'], description: ['descripcion'], amount: ['importe'] },
    },
    detect: (text, fileName) =>
      marker(text, fileName, /santander/) && lineWith(text, ['fecha'], ['importe', 'debito', 'monto']),
    skipRow: /^saldo( |$)|^total( |$)/i,
  },
  {
    id: 'bbva-ar-csv',
    name: 'BBVA Argentina',
    kind: 'statement',
    country: 'AR',
    formats: ['csv'],
    source: 'bbva-ar-extrato',
    fallbackSource: 'csv',
    // Confiança: BAIXA — inferido. Assume "Fecha;Concepto;Importe;Saldo",
    // coluna única assinada. Validar com export real (BBVA costuma entregar
    // XLS; se for o caso, o usuário exporta como CSV e o separador muda).
    confidence: 'baixa',
    requireMarker: true,
    csv: {
      sep: ';',
      dateFormat: 'dmy',
      decimal: ',',
      amountSign: 'auto',
      columns: { date: ['fecha'], description: ['concepto'], amount: ['importe'] },
    },
    detect: (text, fileName) =>
      marker(text, fileName, /bbva|banco frances/) && lineWith(text, ['fecha'], ['importe', 'monto']),
    skipRow: /^saldo( |$)|^total( |$)/i,
  },
  {
    id: 'brubank-csv',
    name: 'Brubank',
    kind: 'statement',
    country: 'AR',
    formats: ['csv'],
    source: 'brubank-extrato',
    fallbackSource: 'csv',
    // Confiança: BAIXA — inferido. Assume ',' e "Fecha,Descripción,Tipo,Monto"
    // com coluna 'Tipo' indicando débito/crédito. O parser usa 'Tipo' só se o
    // valor vier sem sinal. Validar com export real.
    confidence: 'baixa',
    requireMarker: true,
    csv: {
      sep: ',',
      dateFormat: 'dmy',
      decimal: ',',
      amountSign: 'auto',
      columns: { date: ['fecha'], description: ['descripcion'], amount: ['monto', 'importe'], type: ['tipo'] },
    },
    detect: (text, fileName) =>
      marker(text, fileName, /brubank/) && lineWith(text, ['fecha'], ['monto', 'importe']),
  },
  {
    id: 'uala-csv',
    name: 'Ualá',
    kind: 'statement',
    country: 'AR',
    formats: ['csv'],
    source: 'uala-extrato',
    fallbackSource: 'csv',
    // Confiança: BAIXA — inferido. Assume ',' e "Fecha,Descripción,Tipo,Monto".
    // Validar com export real.
    confidence: 'baixa',
    requireMarker: true,
    csv: {
      sep: ',',
      dateFormat: 'dmy',
      decimal: ',',
      amountSign: 'auto',
      columns: { date: ['fecha'], description: ['descripcion'], amount: ['monto', 'importe'], type: ['tipo'] },
    },
    detect: (text, fileName) =>
      marker(text, fileName, /\buala\b/) && lineWith(text, ['fecha'], ['monto', 'importe']),
  },
  {
    id: 'naranja-x-csv',
    name: 'Naranja X',
    kind: 'invoice',
    country: 'AR',
    formats: ['csv'],
    source: 'naranja-x-fatura',
    fallbackSource: 'csv',
    // Confiança: BAIXA — inferido. Assume resumo de tarjeta com
    // "Fecha,Comercio,Cuota,Importe" e valor POSITIVO para consumo (por isso
    // amountSign 'expense'). Se o export real vier assinado, este perfil
    // inverte tudo — é a suposição mais arriscada do arquivo, e o fixture em
    // scripts/testar-parsers.mjs existe para deixá-la explícita.
    confidence: 'baixa',
    requireMarker: true,
    csv: {
      sep: ',',
      dateFormat: 'dmy',
      decimal: ',',
      amountSign: 'expense',
      columns: {
        date: ['fecha'], description: ['comercio', 'detalle'],
        amount: ['importe', 'monto'], installment: ['cuota'],
      },
    },
    detect: (text, fileName) =>
      marker(text, fileName, /naranja/) &&
      lineWith(text, ['fecha'], ['comercio', 'detalle', 'importe']),
    skipRow: /^total( |$)|^saldo( |$)/i,
  },
];

/** Todos os perfis conhecidos. */
export const BANK_PROFILES = [...BR_PROFILES, ...AR_PROFILES];

const byId = new Map(BANK_PROFILES.map((p) => [p.id, p]));

/** Perfil por id. */
export const bankById = (id) => byId.get(id) || null;

/** Perfil pelo `source` gravado nas transações (usado por source_bindings). */
export const bankBySource = (source) =>
  BANK_PROFILES.find((p) => p.source === source) || null;

const CONF_ORDER = { alta: 0, media: 1, baixa: 2 };

/**
 * Perfis candidatos, na ordem de tentativa: primeiro confiança, depois região
 * da instância. Ordenar por confiança evita que um perfil inferido roube um
 * arquivo que o perfil documentado leria certo.
 */
function candidates(format) {
  const home = REGION.banks === 'ar' ? 'AR' : 'BR';
  return BANK_PROFILES
    .filter((p) => !format || p.formats.includes(format))
    .slice()
    .sort((a, b) =>
      (CONF_ORDER[a.confidence] - CONF_ORDER[b.confidence]) ||
      ((a.country === home ? 0 : 1) - (b.country === home ? 0 : 1)));
}

/**
 * Detecta o perfil pelo CONTEÚDO (cabeçalho do CSV, marcadores do PDF/OFX),
 * com o nome do arquivo apenas como reforço. Devolve null quando nada casa —
 * e aí quem chama usa o parser genérico, que é o comportamento antigo.
 *
 * @param {string} text conteúdo do arquivo (texto extraído, no caso de PDF)
 * @param {string} [fileName]
 * @param {'csv'|'ofx'|'pdf'} [format]
 */
export function detectBank(text, fileName = '', format = undefined) {
  for (const p of candidates(format)) {
    try {
      if (p.detect(text, fileName)) return p;
    } catch {
      // perfil com detecção quebrada não pode derrubar a importação inteira
    }
  }
  return null;
}
