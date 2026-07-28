#!/usr/bin/env node
// Testes dos parsers e do categorizador. Sem framework: `node scripts/testar-parsers.mjs`.
// Sai com código 1 se algo falhar (dá para pendurar num hook de commit).
//
// Os fixtures são SINTÉTICOS e escritos à mão — nenhum dado financeiro real.
// Para os bancos sem export de amostra, o fixture É a documentação da suposição
// de layout: se o arquivo real do banco vier diferente, o teste continua
// passando e o import falha na vida real. Então, ao conseguir um export de
// verdade, o certo é AJUSTAR O FIXTURE (com dados inventados) e ver o que quebra.

import { parseCsv, parseCsvFile, parseDate, parseAmountCents } from '../lib/parsers/csv.js';
import { parseOfx } from '../lib/parsers/ofx.js';
import { parseMercadoPagoPdf, parseExtrato, parseFatura } from '../lib/parsers/mercadopago.js';
import { detectBank, BANK_PROFILES } from '../lib/banks/index.js';
import { categorize, KEYWORD_DICTS } from '../lib/categorizer.js';
import { CAT } from '../lib/categories.js';
import { t } from '../lib/i18n/index.js';

let pass = 0;
const fails = [];

const show = (v) => typeof v === 'string' ? v : JSON.stringify(v);

function eq(name, actual, expected) {
  const a = show(actual), e = show(expected);
  if (a === e) { pass++; return true; }
  fails.push(`${name}\n      esperado: ${e}\n      obtido:   ${a}`);
  return false;
}

function ok(name, cond, detail = '') {
  if (cond) { pass++; return true; }
  fails.push(`${name}${detail ? `\n      ${detail}` : ''}`);
  return false;
}

// Sucesso é silencioso por bloco (só o total), falha é verborrágica: é o que se
// quer ler quando o teste roda a cada mexida no parser.
let mark = 0, started = false;
function section(title) {
  if (started) console.log(`  \x1b[32m${pass - mark} ok\x1b[0m`);
  started = true;
  mark = pass;
  console.log(`\n\x1b[1m${title}\x1b[0m`);
}

/** Compara só os campos que importam de uma transação. */
const shape = (tx) => ({
  date: tx.date,
  description: tx.description,
  cents: Math.round(tx.amount * 100),
  source: tx.source,
  ...(tx.transfer ? { transfer: true } : {}),
  ...(tx.externalId ? { id: tx.externalId } : {}),
});

// ─── 1. utilitários de data e valor ──────────────────────────────────────────
section('Datas');
eq('dd/mm/aaaa', parseDate('26/07/2026'), '2026-07-26');
eq('dd-mm-aaaa', parseDate('26-07-2026'), '2026-07-26');
eq('aaaa-mm-dd', parseDate('2026-07-26'), '2026-07-26');
eq('dd/mm/aa', parseDate('26/07/26'), '2026-07-26');
eq('dd.mm.aaaa', parseDate('26.07.2026'), '2026-07-26');
eq('mês > 12 desempata para mm/dd', parseDate('07/26/2026'), '2026-07-26');
eq('perfil manda: 01/02 com dmy', parseDate('01/02/2026', 'dmy'), '2026-02-01');
eq('perfil manda: 01/02 com mdy', parseDate('01/02/2026', 'mdy'), '2026-01-02');
eq('data inválida', parseDate('99/99/2026'), null);
eq('texto não é data', parseDate('Descrição'), null);

section('Valores');
eq('vírgula decimal', parseAmountCents('1.234,56', ','), 123456);
eq('ponto decimal', parseAmountCents('1,234.56', '.'), 123456);
eq('negativo com sinal', parseAmountCents('-45,90', ','), -4590);
eq('negativo entre parênteses', parseAmountCents('(45,90)', ','), -4590);
eq('negativo com sinal à direita', parseAmountCents('45,90-', ','), -4590);
eq('sufixo D é débito', parseAmountCents('45,90 D', ','), -4590);
eq('sufixo C é crédito', parseAmountCents('45,90 C', ','), 4590);
eq('símbolo e espaço não atrapalham', parseAmountCents('R$ 1.234,56', ','), 123456);
eq('$ argentino', parseAmountCents('$ 1.234,56', ','), 123456);
eq('só milhar, sem decimal (auto)', parseAmountCents('1.234'), 123400);
eq('vazio', parseAmountCents('', ','), null);
eq('sem número', parseAmountCents('  -  ', ','), null);

// ─── 2. fixtures por perfil ──────────────────────────────────────────────────
// Cada fixture declara o layout que o perfil ASSUME. Confiança em lib/banks.

const FIXTURES = [
  {
    profile: 'nubank-extrato-csv',
    fileName: 'NU_extrato.csv',
    // Layout documentado: vírgula, data dd/mm/aaaa, valor com PONTO decimal.
    text: [
      'Data,Valor,Identificador,Descrição',
      '01/07/2026,-50.00,63f1a2b4-0001,Transferência enviada pelo Pix - MERCADO XYZ',
      '02/07/2026,1200.00,63f1a2b4-0002,Transferência recebida pelo Pix - EMPRESA ABC',
    ].join('\n'),
    expect: [
      { date: '2026-07-01', description: 'Transferência enviada pelo Pix - MERCADO XYZ', cents: -5000, source: 'nubank-extrato', id: '63f1a2b4-0001' },
      { date: '2026-07-02', description: 'Transferência recebida pelo Pix - EMPRESA ABC', cents: 120000, source: 'nubank-extrato', id: '63f1a2b4-0002' },
    ],
  },
  {
    profile: 'nubank-fatura-csv',
    fileName: 'nubank-2026-07.csv',
    // Layout documentado: cabeçalho em inglês, data ISO, consumo positivo.
    text: [
      'date,title,amount',
      '2026-07-05,Netflix.com,39.90',
      '2026-07-09,Estorno de compra,-19.90',
    ].join('\n'),
    expect: [
      { date: '2026-07-05', description: 'Netflix.com', cents: -3990, source: 'nubank-fatura' },
      { date: '2026-07-09', description: 'Estorno de compra', cents: 1990, source: 'nubank-fatura' },
    ],
  },
  {
    profile: 'itau-csv',
    fileName: 'extrato-itau-julho.csv',
    // SUPOSIÇÃO: sem cabeçalho, três colunas ';'. Detecção depende do nome do
    // arquivo (ou do texto) conter "itau" — sem isso vira genérico.
    text: [
      '01/07/2026;PIX TRANSF JOAO;-150,00',
      '03/07/2026;RENDIMENTO POUPANCA;12,34',
      '03/07/2026;SALDO;1.000,00',
    ].join('\n'),
    expect: [
      { date: '2026-07-01', description: 'PIX TRANSF JOAO', cents: -15000, source: 'itau-extrato' },
      { date: '2026-07-03', description: 'RENDIMENTO POUPANCA', cents: 1234, source: 'itau-extrato' },
    ],
  },
  {
    profile: 'bradesco-csv',
    fileName: 'extrato.csv',
    // SUPOSIÇÃO: preâmbulo antes do cabeçalho e DÉBITO/CRÉDITO em colunas
    // separadas. Linha de saldo não é transação.
    text: [
      'Extrato de: Conta Corrente',
      'Periodo: 01/07/2026 a 31/07/2026',
      'Data;Histórico;Docto.;Crédito;Débito;Saldo',
      '01/07/2026;PIX RECEBIDO;000123;1.500,00;;1.500,00',
      '02/07/2026;PAGTO ENERGIA;000124;;250,50;1.249,50',
      '02/07/2026;Saldo Anterior;;;;1.249,50',
    ].join('\n'),
    expect: [
      { date: '2026-07-01', description: 'PIX RECEBIDO', cents: 150000, source: 'bradesco-extrato', id: '000123' },
      { date: '2026-07-02', description: 'PAGTO ENERGIA', cents: -25050, source: 'bradesco-extrato', id: '000124' },
    ],
  },
  {
    profile: 'bb-csv',
    fileName: 'extrato-conta.csv',
    // SUPOSIÇÃO: campos entre aspas, DUAS colunas de data (a do balancete não
    // é a do lançamento) e linhas de saldo no meio.
    text: [
      '"Data","Dependencia Origem","Histórico","Data do Balancete","Número do documento","Valor"',
      '"01/07/2026","1234-5","Transferencia recebida","01/07/2026","000987","2.000,00"',
      '"02/07/2026","1234-5","Saldo Anterior","02/07/2026","0","0,00"',
      '"02/07/2026","1234-5","Pagamento fornecedor","02/07/2026","000988","-350,75"',
    ].join('\n'),
    expect: [
      { date: '2026-07-01', description: 'Transferencia recebida', cents: 200000, source: 'bb-extrato', id: '000987' },
      { date: '2026-07-02', description: 'Pagamento fornecedor', cents: -35075, source: 'bb-extrato', id: '000988' },
    ],
  },
  {
    profile: 'inter-csv',
    fileName: 'extrato.csv',
    // SUPOSIÇÃO: preâmbulo com o nome do banco (que é o que permite detectar) e
    // cabeçalho genérico "Data Lançamento;Descrição;Valor;Saldo".
    text: [
      'Extrato Conta Corrente',
      'Banco Inter S.A.',
      'Data Lançamento;Descrição;Valor;Saldo',
      '05/07/2026;PIX ENVIADO - PADARIA;-99,90;100,10',
    ].join('\n'),
    expect: [
      { date: '2026-07-05', description: 'PIX ENVIADO - PADARIA', cents: -9990, source: 'inter-extrato' },
    ],
  },
  {
    profile: 'c6-fatura-csv',
    fileName: 'fatura_c6.csv',
    // SUPOSIÇÃO: duas colunas chamadas "Valor" — a de US$ é informativa, a que
    // entra na fatura é a em R$. Consumo positivo.
    text: [
      'Data de Compra;Nome no Cartão;Final do Cartão;Categoria;Descrição;Parcela;Valor (em US$);Cotação (em R$);Valor (em R$)',
      '10/06/2026;JUAN P;1234;Streaming;NETFLIX.COM;Única;0,00;0,00;39,90',
      '11/06/2026;JUAN P;1234;Viagem;HOTEL EXTERIOR;Única;10,00;5,50;55,00',
    ].join('\n'),
    expect: [
      { date: '2026-06-10', description: 'NETFLIX.COM', cents: -3990, source: 'c6-fatura' },
      { date: '2026-06-11', description: 'HOTEL EXTERIOR', cents: -5500, source: 'c6-fatura' },
    ],
  },
  {
    profile: 'galicia-csv',
    fileName: 'movimientos.csv',
    // SUPOSIÇÃO (BAIXA): ';' e débito/crédito em colunas separadas.
    text: [
      'Banco Galicia - Consulta de movimientos',
      'Fecha;Descripción;Origen;Débito;Crédito;Saldo',
      '03/07/2026;Compra COTO ABASTO;Sucursal;12.345,67;;100.000,00',
      '04/07/2026;Acreditación de sueldo;Sucursal;;250.000,00;350.000,00',
      '04/07/2026;Saldo al 04/07;;;;350.000,00',
    ].join('\n'),
    expect: [
      { date: '2026-07-03', description: 'Compra COTO ABASTO', cents: -1234567, source: 'galicia-extrato' },
      { date: '2026-07-04', description: 'Acreditación de sueldo', cents: 25000000, source: 'galicia-extrato' },
    ],
  },
  {
    profile: 'santander-ar-csv',
    fileName: 'movimientos.csv',
    // SUPOSIÇÃO (BAIXA): coluna única "Importe" já assinada.
    text: [
      'Santander Argentina - Movimientos de cuenta',
      'Fecha;Sucursal Origen;Descripción;Importe;Saldo',
      '05/07/2026;014;Débito automático EPEC;-15.300,45;120.000,00',
      '06/07/2026;014;Transferencia recibida;80.000,00;200.000,45',
    ].join('\n'),
    expect: [
      { date: '2026-07-05', description: 'Débito automático EPEC', cents: -1530045, source: 'santander-ar-extrato' },
      { date: '2026-07-06', description: 'Transferencia recibida', cents: 8000000, source: 'santander-ar-extrato' },
    ],
  },
  {
    profile: 'bbva-ar-csv',
    fileName: 'movimientos.csv',
    // SUPOSIÇÃO (BAIXA): "Fecha;Concepto;Importe;Saldo".
    text: [
      'BBVA Argentina',
      'Fecha;Concepto;Importe;Saldo',
      '06/07/2026;Pago de servicios Ecogas;-8.500,00;50.000,00',
    ].join('\n'),
    expect: [
      { date: '2026-07-06', description: 'Pago de servicios Ecogas', cents: -850000, source: 'bbva-ar-extrato' },
    ],
  },
  {
    profile: 'brubank-csv',
    fileName: 'movimientos.csv',
    // SUPOSIÇÃO (BAIXA): ',' como separador — e por isso o valor VEM ENTRE
    // ASPAS, senão a vírgula decimal partiria a coluna. A coluna "Tipo" é o que
    // dá o sinal, porque o valor vem sem ele.
    text: [
      'Brubank - Movimientos',
      'Fecha,Descripción,Tipo,Monto',
      '07/07/2026,"Rappi Argentina",Débito,"3.450,00"',
      '08/07/2026,"Devolución de compra",Crédito,"1.000,00"',
    ].join('\n'),
    expect: [
      { date: '2026-07-07', description: 'Rappi Argentina', cents: -345000, source: 'brubank-extrato' },
      { date: '2026-07-08', description: 'Devolución de compra', cents: 100000, source: 'brubank-extrato' },
    ],
  },
  {
    profile: 'uala-csv',
    fileName: 'uala-movimientos.csv',
    // SUPOSIÇÃO (BAIXA): igual ao Brubank na forma.
    text: [
      'Ualá - Resumen de movimientos',
      'Fecha,Descripción,Tipo,Monto',
      '08/07/2026,"Transferencia recibida",Crédito,"25.000,00"',
      '09/07/2026,"YPF Ruta 9",Débito,"18.700,50"',
    ].join('\n'),
    expect: [
      { date: '2026-07-08', description: 'Transferencia recibida', cents: 2500000, source: 'uala-extrato' },
      { date: '2026-07-09', description: 'YPF Ruta 9', cents: -1870050, source: 'uala-extrato' },
    ],
  },
  {
    profile: 'naranja-x-csv',
    fileName: 'resumen.csv',
    // SUPOSIÇÃO (BAIXA, a mais arriscada do registry): resumo de tarjeta com
    // importe POSITIVO para consumo. Se o export real vier assinado, inverte.
    text: [
      'Naranja X - Resumen de tarjeta',
      'Fecha,Comercio,Cuota,Importe',
      '09/07/2026,FRAVEGA CORDOBA,03/06,"45.000,00"',
      '10/07/2026,PAGO RECIBIDO,,"-20.000,00"',
    ].join('\n'),
    expect: [
      { date: '2026-07-09', description: 'FRAVEGA CORDOBA', cents: -4500000, source: 'naranja-x-fatura' },
      { date: '2026-07-10', description: 'PAGO RECIBIDO', cents: 2000000, source: 'naranja-x-fatura' },
    ],
  },
];

section('Detecção de perfil (por conteúdo)');
for (const f of FIXTURES) {
  const hit = detectBank(f.text, f.fileName, 'csv');
  eq(`detecta ${f.profile}`, hit?.id ?? null, f.profile);
}
ok('CSV genérico não é atribuído a nenhum banco',
  detectBank('data;descricao;valor\n01/07/2026;Padaria;-10,00', 'meu.csv', 'csv') === null);
ok('perfil sem marcador não rouba arquivo alheio (Itaú sem "itau" no nome)',
  detectBank('01/07/2026;PIX TRANSF;-150,00', 'extrato.csv', 'csv') === null);
// Nome de banco DENTRO da descrição não pode virar detecção: era o jeito mais
// fácil de um perfil inferido roubar um CSV genérico.
ok('nome de banco na descrição não conta como marcador (Inter)',
  detectBank('data;descricao;valor\n01/07/2026;TRANSF INTER CONTAS;-10,00', 'extrato.csv', 'csv') === null);
ok('nome de banco na descrição não conta como marcador (Itaú)',
  detectBank('01/07/2026;PIX ITAU JOAO;-10,00', 'extrato.csv', 'csv') === null);

section('Leitura de CSV por perfil');
for (const f of FIXTURES) {
  const { profile, transactions } = parseCsvFile(f.text, { fileName: f.fileName });
  eq(`${f.profile}: perfil aplicado`, profile?.id ?? null, f.profile);
  eq(`${f.profile}: ${f.expect.length} lançamento(s)`, transactions.map(shape), f.expect);
}

// ─── 3. genérico (comportamento antigo, preservado) ──────────────────────────
section('CSV genérico');
eq('cabeçalho pt reconhecido',
  parseCsv('data;descricao;valor\n26/07/2026;Padaria Central;-10,50', { fileName: 'x.csv' }).map(shape),
  [{ date: '2026-07-26', description: 'Padaria Central', cents: -1050, source: 'csv' }]);

eq('sem cabeçalho: posicional (data, descrição, …, valor)',
  parseCsv('26/07/2026;Padaria Central;-10,50', { fileName: 'x.csv' }).map(shape),
  [{ date: '2026-07-26', description: 'Padaria Central', cents: -1050, source: 'csv' }]);

eq('separador vírgula',
  parseCsv('data,descricao,valor\n26/07/2026,Uber viagem,-23.45', { fileName: 'x.csv' }).map(shape),
  [{ date: '2026-07-26', description: 'Uber viagem', cents: -2345, source: 'csv' }]);

eq('separador tab',
  parseCsv('data\tdescricao\tvalor\n26/07/2026\tUber viagem\t-23,45', { fileName: 'x.csv' }).map(shape),
  [{ date: '2026-07-26', description: 'Uber viagem', cents: -2345, source: 'csv' }]);

eq('cabeçalho em inglês',
  parseCsv('date;memo;amount\n2026-07-26;Coffee shop;-9.99', { fileName: 'x.csv' }).map(shape),
  [{ date: '2026-07-26', description: 'Coffee shop', cents: -999, source: 'csv' }]);

eq('débito/crédito em colunas separadas, sem perfil de banco',
  parseCsv([
    'Fecha;Descripción;Débito;Crédito',
    '26/07/2026;Compra supermercado;1.234,56;',
    '27/07/2026;Acreditación;;2.000,00',
  ].join('\n'), { fileName: 'x.csv' }).map(shape),
  [
    { date: '2026-07-26', description: 'Compra supermercado', cents: -123456, source: 'csv' },
    { date: '2026-07-27', description: 'Acreditación', cents: 200000, source: 'csv' },
  ]);

eq('valor negativo entre parênteses',
  parseCsv('data;descricao;valor\n26/07/2026;Tarifa;(12,30)', { fileName: 'x.csv' }).map(shape),
  [{ date: '2026-07-26', description: 'Tarifa', cents: -1230, source: 'csv' }]);

eq('coluna saldo não é confundida com valor',
  parseCsv('data;historico;valor;saldo\n26/07/2026;Compra;-10,00;5.000,00', { fileName: 'x.csv' }).map(shape),
  [{ date: '2026-07-26', description: 'Compra', cents: -1000, source: 'csv' }]);

eq('linha sem data é ignorada',
  parseCsv('data;descricao;valor\n;Total do mês;-999,00\n26/07/2026;Compra;-10,00', { fileName: 'x.csv' }).map(shape),
  [{ date: '2026-07-26', description: 'Compra', cents: -1000, source: 'csv' }]);

eq('valor zero é ignorado (linha de saldo, ajuste)',
  parseCsv('data;descricao;valor\n26/07/2026;Ajuste;0,00', { fileName: 'x.csv' }).length, 0);
eq('arquivo vazio', parseCsv('', { fileName: 'x.csv' }).length, 0);

// ─── 4. OFX ──────────────────────────────────────────────────────────────────
section('OFX');
const OFX = `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260726120000[-03:EST]<TRNAMT>-45.90<FITID>202607260001<MEMO>PADARIA CENTRAL</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260727<TRNAMT>1500.00<FITID>202607270002<NAME>SALARIO EMPRESA</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
eq('OFX SGML com dois lançamentos', parseOfx(OFX).map(shape), [
  { date: '2026-07-26', description: 'PADARIA CENTRAL', cents: -4590, source: 'ofx', id: '202607260001' },
  { date: '2026-07-27', description: 'SALARIO EMPRESA', cents: 150000, source: 'ofx', id: '202607270002' },
]);
eq('OFX sem transações', parseOfx('<OFX></OFX>').length, 0);

// ─── 5. Mercado Pago ─────────────────────────────────────────────────────────
// BR é o layout validado contra documentos reais: estes fixtures existem para
// travar o comportamento e garantir que a generalização para AR não o mexeu.
section('Mercado Pago Brasil (regressão — layout validado)');

const MP_BR_EXTRATO = [
  'EXTRATO DE CONTA',
  'DETALHE DOS MOVIMENTOS',
  'Entradas: R$ 100,00',
  'Saidas: R$ 50,00',
  'DataDescriçãoID da operaçãoValorSaldo',
  '01-07-2026',
  'Transferência Recebida de EMPRESA ABC',
  '1234567890R$ 100,00R$ 1.100,00',
  '02-07-2026',
  'Pagamento Cartão de crédito',
  '1234567891R$ -50,00R$ 1.050,00',
].join('\n');

eq('extrato BR', parseMercadoPagoPdf(MP_BR_EXTRATO).transactions.map(shape), [
  { date: '2026-07-01', description: 'Transferência Recebida de EMPRESA ABC', cents: 10000, source: 'mp-extrato', id: '1234567890' },
  { date: '2026-07-02', description: 'Pagamento Cartão de crédito', cents: -5000, source: 'mp-extrato', transfer: true, id: '1234567891' },
]);
eq('extrato BR: kind/country', (({ kind, country, source }) => ({ kind, country, source }))(parseMercadoPagoPdf(MP_BR_EXTRATO)),
  { kind: 'extrato', country: 'BR', source: 'mp-extrato' });

const MP_BR_FATURA = [
  'Vencimento: 10/07/2026',
  'Movimentações na fatura',
  '10/06Pagamento da faturaR$ 500,00',
  'Cartão Visa [1234]',
  'DataMovimentaçõesValor',
  '05/07NETFLIX.COMR$ 39,90',
  '20/06SUPERMERCADO XParcela 2 de 6R$ 100,00',
  '21/06COMPRA EXTERIOR US$ 10,00R$ 55,00',
  'Total R$ 694,90',
].join('\n');

eq('fatura BR', parseMercadoPagoPdf(MP_BR_FATURA).transactions.map(shape), [
  { date: '2026-06-10', description: 'Pagamento da fatura', cents: 50000, source: 'mp-fatura', transfer: true },
  { date: '2026-07-05', description: 'NETFLIX.COM', cents: -3990, source: 'mp-fatura' },
  { date: '2026-06-20', description: 'SUPERMERCADO X (parcela 2/6)', cents: -10000, source: 'mp-fatura' },
  { date: '2026-06-21', description: 'COMPRA EXTERIOR US$ 10,00', cents: -5500, source: 'mp-fatura' },
]);
eq('fatura BR: mês de competência', parseMercadoPagoPdf(MP_BR_FATURA).transactions[0].invoiceRef, '2026-07');
ok('fatura BR: "US$" não é confundido com o valor da linha',
  parseMercadoPagoPdf(MP_BR_FATURA).transactions.every(x => Math.round(x.amount * 100) !== -1000));

const MP_BR_CORROMPIDO = [
  'Movimentações na fatura',
  'Cartão Visa [1234]',
  '05/07ÿþÿþÿþ',
  '06/07ÿþÿþÿþ',
  '07/07ÿþÿþÿþ',
  '08/07ÿþÿþÿþ',
  '09/07ÿþÿþÿþ',
].join('\n');
eq('PDF com camada de texto corrompida', parseMercadoPagoPdf(MP_BR_CORROMPIDO).kind, 'corrompido');
eq('PDF de outro banco', parseMercadoPagoPdf('Extrato Banco Qualquer').kind, 'desconhecido');

section('Mercado Pago Argentina — extrato (VALIDADO contra documento real)');

// Fixture SINTÉTICA que reproduz a estrutura de um extrato real de conta em
// pesos: dados inventados, layout observado. Reproduz de propósito as três
// armadilhas do documento de verdade:
//   1. o cabeçalho da tabela vem QUEBRADO em quatro linhas e reaparece a cada
//      página, caindo dentro da descrição da transação seguinte;
//   2. o rodapé tem "Fecha de generación: dd-mm-aaaa", que tem o mesmo formato
//      de uma data de transação e roubava o bloco seguinte;
//   3. o titular transfere para a própria conta, com o nome em outra ordem e
//      em maiúsculas — não é despesa, é dinheiro trocando de bolso.
const MP_AR_EXTRACTO = [
  '',
  '1/2',
  'RESUMEN DE CUENTA EN PESOS',
  'Ana Maria Gomez',
  'CVU: 0000000000000000000000 20000000000CUIT/ CUIL:',
  ' Del 1 al 31 de julio de 2026Periodo:',
  'Saldo inicial: $ 50.000,00',
  'Entradas: $ 130.000,00',
  'Salidas: $ -45.300,45',
  'Saldo final: $ 134.699,55',
  'DETALLE DE MOVIMIENTOS',
  'FechaDescripción',
  'ID de la',
  'operación',
  'ValorSaldo',
  '01-07-2026',
  'Transferencia recibida de ',
  'EMPRESA SRL',
  '1234567890$ 100.000,00$ 150.000,00',
  '02-07-2026',
  'Pago de servicios Ecogas',
  '1234567891$ -15.300,45$ 134.699,55',
  '03-07-2026',
  'Transferencia enviada GOMEZ ANA ',
  'MARIA',
  '1234567892$ -30.000,00$ 104.699,55',
  '',
  'Fecha de generación: 05-08-2026',
  'Mercado Libre S.R.L. CUIT 30-70308853-4 Av. Caseros 3039, Piso 2, CP 1264, Parque Patricios, CABA. Encuentra nuestros canales',
  'de consulta en: www.mercadopago.com.ar',
  '2/2',
  'FechaDescripción',
  'ID de la',
  'operación',
  'ValorSaldo',
  '04-07-2026',
  'Rendimientos',
  '1234567893$ 30.000,00$ 134.699,55',
].join('\n');

eq('extracto AR', parseMercadoPagoPdf(MP_AR_EXTRACTO).transactions.map(shape), [
  { date: '2026-07-01', description: 'Transferencia recibida de EMPRESA SRL', cents: 10000000, source: 'mp-ar-extrato', id: '1234567890' },
  { date: '2026-07-02', description: 'Pago de servicios Ecogas', cents: -1530045, source: 'mp-ar-extrato', id: '1234567891' },
  // transfer: o titular é "Ana Maria Gomez" — dinheiro para a própria conta
  { date: '2026-07-03', description: 'Transferencia enviada GOMEZ ANA MARIA', cents: -3000000, source: 'mp-ar-extrato', transfer: true, id: '1234567892' },
  { date: '2026-07-04', description: 'Rendimientos', cents: 3000000, source: 'mp-ar-extrato', id: '1234567893' },
]);
eq('extracto AR: kind/country', (({ kind, country, source }) => ({ kind, country, source }))(parseMercadoPagoPdf(MP_AR_EXTRACTO)),
  { kind: 'extrato', country: 'AR', source: 'mp-ar-extrato' });

// Regressão do bug encontrado no documento real: a data de geração do PDF no
// rodapé não pode virar transação, nem roubar a descrição da seguinte.
ok('AR: data de geração do rodapé não vira transação',
  parseMercadoPagoPdf(MP_AR_EXTRACTO).transactions.every(t => t.date <= '2026-07-31'),
  parseMercadoPagoPdf(MP_AR_EXTRACTO).transactions.map(t => t.date).join(' '));
ok('AR: rodapé jurídico não contamina descrição',
  !parseMercadoPagoPdf(MP_AR_EXTRACTO).transactions.some(t => /Mercado Libre|Caseros|generaci/i.test(t.description)));
ok('AR: cabeçalho repetido a cada página não entra na descrição',
  !parseMercadoPagoPdf(MP_AR_EXTRACTO).transactions.some(t => /Fecha|ValorSaldo|ID de la|operación/i.test(t.description)));

// Autotransferência: o titular é "Ana Maria Gomez" e a descrição diz
// "GOMEZ ANA MARIA" — ordem e caixa trocadas.
const arTx = parseMercadoPagoPdf(MP_AR_EXTRACTO).transactions;
ok('AR: transferência para a própria conta marcada como interna',
  arTx.find(t => /GOMEZ ANA MARIA/.test(t.description))?.transfer === true);
ok('AR: transferência para terceiro NÃO é marcada como interna',
  arTx.find(t => /EMPRESA SRL/.test(t.description))?.transfer === false);
ok('AR: homônimo parcial não conta como autotransferência',
  parseMercadoPagoPdf(MP_AR_EXTRACTO.replace('GOMEZ ANA ', 'GOMEZ CARLA '))
    .transactions.find(t => /GOMEZ CARLA/.test(t.description))?.transfer === false);

const MP_AR_RESUMEN = [
  'Vencimiento: 10/07/2026',
  'Movimientos del resumen',
  'Consumos: $ 139.900,00',
  'Tarjeta Visa [1234]',
  'FechaMovimientosValor',
  '05/07NETFLIX.COM$ 39.900,00',
  '20/06COTO ABASTOCuota 2 de 6$ 100.000,00',
].join('\n');

eq('resumen AR', parseMercadoPagoPdf(MP_AR_RESUMEN).transactions.map(shape), [
  { date: '2026-07-05', description: 'NETFLIX.COM', cents: -3990000, source: 'mp-ar-fatura' },
  { date: '2026-06-20', description: 'COTO ABASTO (cuota 2/6)', cents: -10000000, source: 'mp-ar-fatura' },
]);

// O ponto central do "melhor esforço": quando os totais do documento não batem
// com o que o parser somou, tem de EXPLODIR — não gravar torto em silêncio.
const MP_AR_RESUMEN_TORTO = MP_AR_RESUMEN.replace('Consumos: $ 139.900,00', 'Consumos: $ 999.999,99');
let explodiu = null;
try { parseMercadoPagoPdf(MP_AR_RESUMEN_TORTO); } catch (e) { explodiu = e.message; }
ok('AR: totais que não fecham lançam erro explícito',
  explodiu && /totais não fecham/.test(explodiu), explodiu ? `mensagem: ${explodiu}` : 'não lançou nada');

const MP_AR_SEM_TOTAIS = MP_AR_EXTRACTO
  .replace('Entradas: $ 130.000,00', '').replace('Salidas: $ -45.300,45', '');
ok('AR: sem totais declarados, devolve aviso em vez de fingir validação',
  parseMercadoPagoPdf(MP_AR_SEM_TOTAIS).warnings.length === 1);

// Extrato AR com total adulterado tem de explodir, igual ao resumo.
const MP_AR_EXTRACTO_TORTO = MP_AR_EXTRACTO.replace('Entradas: $ 130.000,00', 'Entradas: $ 999.999,99');
let explodiuExtrato = null;
try { parseMercadoPagoPdf(MP_AR_EXTRACTO_TORTO); } catch (e) { explodiuExtrato = e.message; }
ok('AR extrato: total adulterado lança erro explícito',
  explodiuExtrato && /totais não fecham/.test(explodiuExtrato));

ok('AR extrato: totais reais conferem, sem warning',
  parseMercadoPagoPdf(MP_AR_EXTRACTO).warnings.length === 0);

ok('BR não confere totais (já validado ao centavo nos arquivos reais)',
  parseMercadoPagoPdf(MP_BR_EXTRATO).warnings.length === 0);

eq('parseExtrato sem opções continua sendo o parser BR',
  parseExtrato(MP_BR_EXTRATO).length, 2);
eq('parseFatura sem opções continua sendo o parser BR',
  parseFatura(MP_BR_FATURA).length, 4);

// ─── 6. categorizador ────────────────────────────────────────────────────────
section('Categorizador (chaves, não nomes)');

const catBR = (d) => categorize(d, [], KEYWORD_DICTS.br);
const catAR = (d) => categorize(d, [], KEYWORD_DICTS.ar);

const CASOS_BR = [
  ['99*Corrida 12/07', CAT.TRANSPORT],
  ['UBER *TRIP SAO PAULO', CAT.TRANSPORT],
  ['SUPERMERCADO BOM PRECO', CAT.FOOD],
  ['IFOOD CLUB', CAT.FOOD],
  ['NETFLIX.COM', CAT.SUBSCRIPTIONS],
  ['DROGARIA SAO PAULO', CAT.HEALTH],
  ['MERCADOLIVRE*COMPRA', CAT.SHOPPING],
  ['AIRBNB PAYMENTS', CAT.TRAVEL],
  ['CEMIG DISTRIBUICAO', CAT.HOUSING],
  ['IOF sobre compra internacional', CAT.FINANCIAL],
  ['Rendimentos da conta', CAT.INCOME],
  ['XPTO COMERCIO LTDA', CAT.TO_REVIEW],
];
for (const [desc, exp] of CASOS_BR) eq(`br: ${desc}`, catBR(desc), exp);

const CASOS_AR = [
  ['RAPPI ARGENTINA', CAT.FOOD],
  ['PEDIDOSYA', CAT.FOOD],
  ['COTO CICSA ABASTO', CAT.FOOD],
  ['SUPERMERCADO DIA', CAT.FOOD],
  ['VEA CORDOBA', CAT.FOOD],
  ['EPEC - Factura julio', CAT.HOUSING],
  ['ECOGAS', CAT.HOUSING],
  ['AGUAS CORDOBESAS', CAT.HOUSING],
  ['TELECENTRO FLOW', CAT.HOUSING],
  ['PERSONAL FACTURA MOVIL', CAT.HOUSING],
  ['SUBE CARGA', CAT.TRANSPORT],
  ['RED BUS CORDOBA', CAT.TRANSPORT],
  ['YPF SERVICENTRO', CAT.TRANSPORT],
  ['CABIFY', CAT.TRANSPORT],
  ['FARMACITY 123', CAT.HEALTH],
  ['OSDE 210', CAT.HEALTH],
  ['APROSS', CAT.HEALTH],
  ['MERCADO LIBRE COMPRA', CAT.SHOPPING],
  ['FRAVEGA CORDOBA', CAT.SHOPPING],
  ['NETFLIX.COM', CAT.SUBSCRIPTIONS],
  ['PERSONAL PAY RECARGA', CAT.SUBSCRIPTIONS],
  ['SPOTIFY AB', CAT.SUBSCRIPTIONS],
  ['IMPUESTO AL DEBITO LEY 25413', CAT.FINANCIAL],
  ['PERCEPCION IVA RG 4815', CAT.FINANCIAL],
  ['IIBB CORDOBA', CAT.FINANCIAL],
  ['MERCADO PAGO P2P', CAT.FINANCIAL],
  ['UALA RECARGA', CAT.FINANCIAL],
  ['NARANJA X CUOTA', CAT.FINANCIAL],
  ['Acreditación de sueldo', CAT.INCOME],
  ['KIOSCO DON JOSE', CAT.FOOD],
  ['COMERCIO XPTO SRL', CAT.TO_REVIEW],
];
for (const [desc, exp] of CASOS_AR) eq(`ar: ${desc}`, catAR(desc), exp);

ok('regra do usuário ganha do dicionário',
  categorize('NETFLIX.COM', [{ pattern: 'netflix', category: CAT.LEISURE }], KEYWORD_DICTS.br) === CAT.LEISURE);
ok('acento não atrapalha', catAR('Farmácia del Águila') === CAT.HEALTH);
ok('token curto não casa dentro de palavra ("dia" em "mediador")',
  catAR('MEDIADOR JUDICIAL') === CAT.TO_REVIEW);
ok('token curto não casa dentro de palavra ("max" em "maxikiosco")',
  catAR('MAXIKIOSCO SUR') !== CAT.SUBSCRIPTIONS);
ok('devolve sempre chave canônica',
  [...CASOS_BR, ...CASOS_AR].every(([d]) => Object.values(CAT).includes(catBR(d)) && Object.values(CAT).includes(catAR(d))));

// ─── 7. contrato com o dicionário de i18n ────────────────────────────────────
// Chave ausente devolve a própria chave: se algum destes falhar, o importador
// mostraria "import.err.empty" na cara do usuário.
section('Chaves de i18n usadas pelo importador');
for (const key of [
  'import.err.empty', 'import.err.unsupported', 'import.err.corrupt',
  'import.err.unknownPdf', 'import.err.noColumns', 'import.detected',
  'bank.generic.csv', 'bank.generic.ofx', 'bank.statement', 'bank.invoice', 'bank.unknown',
]) ok(`existe: ${key}`, t(key) !== key, 'chave ausente no dicionário');

// ─── 8. sanidade do registry ─────────────────────────────────────────────────
section('Registry de bancos');
ok('todo perfil tem id, nome, país, formatos, source e confiança',
  BANK_PROFILES.every(p => p.id && p.name && p.country && p.formats?.length && p.source && p.confidence));
ok('ids são únicos', new Set(BANK_PROFILES.map(p => p.id)).size === BANK_PROFILES.length);
ok('sources são únicos', new Set(BANK_PROFILES.map(p => p.source)).size === BANK_PROFILES.length);
eq('source do Mercado Pago BR não mudou (source_bindings existentes)',
  BANK_PROFILES.filter(p => p.id.startsWith('mp-br')).map(p => p.source).sort(),
  ['mp-extrato', 'mp-fatura']);
ok('todo perfil CSV tem mapeamento csv', BANK_PROFILES
  .filter(p => p.formats.includes('csv')).every(p => p.csv));
ok('todo perfil de confiança baixa exige marcador ou é PDF', BANK_PROFILES
  .filter(p => p.confidence === 'baixa')
  .every(p => p.requireMarker || p.formats.includes('pdf')));

// ─── resultado ───────────────────────────────────────────────────────────────
console.log(`  \x1b[32m${pass - mark} ok\x1b[0m`);
console.log(`\n${'─'.repeat(72)}`);
if (fails.length) {
  console.log(`\x1b[31m${fails.length} falha(s)\x1b[0m de ${pass + fails.length} verificações:\n`);
  fails.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  process.exit(1);
}
console.log(`\x1b[32mtudo certo\x1b[0m — ${pass} verificações`);
