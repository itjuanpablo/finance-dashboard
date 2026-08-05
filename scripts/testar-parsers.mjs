#!/usr/bin/env node
// Testes dos parsers e do categorizador. Sem framework: `node scripts/testar-parsers.mjs`.
// Sai com código 1 se algo falhar (dá para pendurar num hook de commit).
//
// Os fixtures são SINTÉTICOS e escritos à mão — nenhum dado financeiro real.
// Para os bancos sem export de amostra, o fixture É a documentação da suposição
// de layout: se o arquivo real do banco vier diferente, o teste continua
// passando e o import falha na vida real. Então, ao conseguir um export de
// verdade, o certo é AJUSTAR O FIXTURE (com dados inventados) e ver o que quebra.

import {
  parseCsv, parseCsvFile, parseDate, parseAmountCents,
  sniffSep, sniffDecimal, sniffDateOrder, splitLine, conferirCadeiaSaldo,
} from '../lib/parsers/csv.js';
import { parseOfx, parseOfxFile } from '../lib/parsers/ofx.js';
import { decodeBuffer, countMojibake, undoMojibake } from '../lib/parsers/encoding.js';
import { parseMercadoPagoPdf, parseExtrato, parseFatura } from '../lib/parsers/mercadopago.js';
import { detectBank, BANK_PROFILES } from '../lib/banks/index.js';
import { parseExtractoAr, detectExtractoAr } from '../lib/parsers/extracto-ar.js';
import { parseResumenTarjetaAr, detectResumenTarjetaAr, anoDoCiclo } from '../lib/parsers/resumen-tarjeta-ar.js';
import { parseNubankExtrato, detectNubankExtrato } from '../lib/parsers/nubank-extrato.js';
import { parseInterGlobalPdf, detectInterGlobalPdf } from '../lib/parsers/inter-global-pdf.js';
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

// ─── 1b. encoding ────────────────────────────────────────────────────────────
// Fixtures são BUFFERS montados byte a byte: é a única forma de testar isto sem
// depender de como o editor salvou este arquivo.
section('Encoding (bytes → texto)');

/** Texto → bytes windows-1252 (só o que este teste precisa: Latin-1 puro). */
const win1252 = (s) => Buffer.from(s, 'latin1');
/** Texto correto → arquivo duplamente codificado (o mojibake de verdade). */
const duploUtf8 = (s) => Buffer.from(Buffer.from(s, 'utf8').toString('latin1'), 'utf8');

eq('windows-1252 vira texto certo',
  decodeBuffer(win1252('Transferência;Conceição;-10,50')).text,
  'Transferência;Conceição;-10,50');
eq('windows-1252: encoding informado',
  decodeBuffer(win1252('Transferência')).encoding, 'windows-1252');
eq('UTF-8 puro não é mexido',
  decodeBuffer(Buffer.from('Ação; Não; señor; ñandú', 'utf8')).text, 'Ação; Não; señor; ñandú');
eq('UTF-8 puro: encoding informado',
  decodeBuffer(Buffer.from('Ação', 'utf8')).encoding, 'utf-8');
eq('mojibake é detectado e desfeito',
  decodeBuffer(duploUtf8('Transferência recebida — CONCEIÇÃO')).text,
  'Transferência recebida — CONCEIÇÃO');
eq('mojibake: encoding informado',
  decodeBuffer(duploUtf8('Transferência')).detectedBy, 'mojibake');
ok('mojibake: avisa o que fez',
  decodeBuffer(duploUtf8('Transferência')).warnings.length === 1);
eq('texto legítimo com acento não é confundido com mojibake',
  countMojibake('Ação; À vista; Árvore; MÁXIMO; ñ'), 0);
// Texto que mistura acento CERTO com marca de mojibake não tem reversão válida
// (os bytes de volta não formam UTF-8). Nesse caso o parser não mexe no texto e
// avisa — desfazer pela metade seria estragar a parte que estava boa.
eq('reversão que não fecha devolve null (não chuta)', undoMojibake('Café Ã© bom'), null);
eq('mojibake parcial: texto preservado',
  decodeBuffer(Buffer.from('Café Ã© bom', 'utf8')).text, 'Café Ã© bom');
ok('mojibake parcial: avisa que não mexeu',
  decodeBuffer(Buffer.from('Café Ã© bom', 'utf8')).warnings.some(w => /não fecha/.test(w)));

eq('BOM UTF-8 é respeitado e removido',
  decodeBuffer(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('Data;Descrição', 'utf8')])).text,
  'Data;Descrição');
eq('BOM UTF-16LE é respeitado',
  decodeBuffer(Buffer.from('﻿Data;Ação', 'utf16le')).text, 'Data;Ação');
eq('BOM UTF-16BE é respeitado',
  decodeBuffer(Buffer.concat([Buffer.from([0xfe, 0xff]),
    Buffer.from([...'Data;Ação'].flatMap(c => [c.charCodeAt(0) >> 8, c.charCodeAt(0) & 0xff]))])).text,
  'Data;Ação');
eq('UTF-16LE sem BOM (export "Unicode" do Excel)',
  decodeBuffer(Buffer.from('Data;Descrição;Valor', 'utf16le')).text, 'Data;Descrição;Valor');
eq('arquivo vazio não explode', decodeBuffer(Buffer.alloc(0)).text, '');

// U+FFFD que já veio no arquivo: não dá para recuperar o byte, mas tem de
// aparecer no aviso em vez de passar batido para dentro do banco de dados.
ok('perda anterior à importação vira aviso',
  decodeBuffer(Buffer.from('Transfer�ncia', 'utf8')).warnings
    .some(w => /U\+FFFD/.test(w)));

// Cabeçalho OFX: ENCODING/CHARSET mandam mais que a heurística.
const ofxLatin = (memo) => win1252([
  'OFXHEADER:100', 'DATA:OFXSGML', 'VERSION:102', 'ENCODING:USASCII', 'CHARSET:1252', '',
  '<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL',
  '<BANKTRANLIST>',
  `<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260726<TRNAMT>-45.90<FITID>L1<MEMO>${memo}</STMTTRN>`,
  '</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>',
].join('\n'));

eq('OFX com CHARSET:1252 é lido em windows-1252',
  decodeBuffer(ofxLatin('TRANSFERÊNCIA PIX'), { format: 'ofx' }).encoding, 'windows-1252');
eq('OFX Latin-1: acento chega inteiro na descrição',
  parseOfx(decodeBuffer(ofxLatin('TRANSFERÊNCIA PIX'), { format: 'ofx' }).text)[0].description,
  'TRANSFERÊNCIA PIX');

// Banco que declara 1252 e grava UTF-8 existe. Declaração é indício; mojibake
// (ao ler como 1252) é prova de que a declaração está errada.
const ofxMentiroso = Buffer.concat([
  win1252('OFXHEADER:100\nENCODING:USASCII\nCHARSET:1252\n\n<OFX><STMTRS><MEMO>'),
  Buffer.from('TRANSFERÊNCIA PIX', 'utf8'),
  win1252('</MEMO></STMTRS></OFX>'),
]);
eq('cabeçalho que mente é desmentido pelo conteúdo',
  decodeBuffer(ofxMentiroso, { format: 'ofx' }).detectedBy, 'cabecalho-desmentido');
ok('cabeçalho desmentido avisa',
  decodeBuffer(ofxMentiroso, { format: 'ofx' }).warnings.length >= 1);

// Integração: buffer errado → CSV lido certo, com a descrição íntegra (é ela
// que entra no hash de deduplicação).
const CSV_1252 = win1252([
  'Data;Histórico;Valor',
  '26/07/2026;Transferência enviada - PADARIA SÃO JOÃO;-10,50',
].join('\r\n'));
eq('CSV em windows-1252 com CRLF: descrição íntegra',
  parseCsv(decodeBuffer(CSV_1252).text, { fileName: 'x.csv' }).map(shape),
  [{ date: '2026-07-26', description: 'Transferência enviada - PADARIA SÃO JOÃO', cents: -1050, source: 'csv' }]);

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

// ─── 3b. variações de formatação (o que muda de banco para banco) ────────────
section('CSV: variações de formatação');
const csv = (linhas, fileName = 'x.csv') => parseCsv(linhas.join('\n'), { fileName }).map(shape);
const csvFull = (linhas, fileName = 'x.csv') => parseCsvFile(linhas.join('\n'), { fileName });

// separador
eq('separador |', csv(['data|descricao|valor', '26/07/2026|Padaria|-10,50']),
  [{ date: '2026-07-26', description: 'Padaria', cents: -1050, source: 'csv' }]);
// O preâmbulo tem UM ';' e nenhuma vírgula fora das colunas. Contando ocorrências
// (o critério antigo) o ';' parecia "consistente" e roubava o arquivo inteiro;
// pela consistência de COLUNAS entre linhas, a vírgula ganha com folga.
eq('preâmbulo com ; não rouba o separador',
  sniffSep(['Extrato; conta 12345, agência 001', 'data,descricao,valor',
    '01/07/2026,PADARIA,-10.50', '02/07/2026,MERCADO,-20.00']), ',');
eq('preâmbulo com ; : lê as duas linhas',
  csv(['Extrato; conta 12345, agência 001', 'data,descricao,valor',
    '01/07/2026,PADARIA,-10.50', '02/07/2026,MERCADO,-20.00']).length, 2);

// aspas
eq('separador dentro de aspas não parte a coluna',
  csv(['date,description,amount', '2026-07-26,"PADARIA CENTRAL, LTDA",-10.50']),
  [{ date: '2026-07-26', description: 'PADARIA CENTRAL, LTDA', cents: -1050, source: 'csv' }]);
eq('aspas duplas escapadas ("")',
  csv(['data;descricao;valor', '26/07/2026;"ACME ""BAR"" LTDA";-10,50'])[0].description,
  'ACME "BAR" LTDA');
eq('aspas no meio do campo não engolem a linha',
  csv(['data;descricao;valor', '26/07/2026;TV 50" SAMSUNG;-1.999,00']),
  [{ date: '2026-07-26', description: 'TV 50" SAMSUNG', cents: -199900, source: 'csv' }]);
eq('campo entre aspas preserva o espaço interno (a descrição entra no hash)',
  splitLine('a;"  b  ";c', ';'), ['a', '  b  ', 'c']);

// decimal ambíguo, resolvido pela COLUNA
eq('coluna BR: "1.234" é mil duzentos e trinta e quatro',
  csv(['data;descricao;valor', '26/07/2026;A;1.234', '27/07/2026;B;-45,90'])[0].cents, 123400);
eq('coluna US: o mesmo "1.234" é um e vinte e três',
  csv(['data;descricao;valor', '26/07/2026;A;1.234', '27/07/2026;B;-45.90'])[0].cents, 123);
eq('sniffDecimal: vírgula em qualquer célula manda',
  sniffDecimal(['1.234', '45,90', '2.000']).decimal, ',');
eq('sniffDecimal: ponto com 2 casas manda',
  sniffDecimal(['1.234', '45.90', '2000']).decimal, '.');
eq('sniffDecimal: só milhar com ponto → vírgula decimal',
  sniffDecimal(['1.234', '2.000']).decimal, ',');
eq('sniffDecimal: empate não decide', sniffDecimal(['1.234,56', '1,234.56']).decimal, null);
// Empate: cada célula é lida pelo último separador (acerta as duas) e o parser
// AVISA, porque um "1.234" solto nessa coluna continua sem resposta.
const EMPATE = csvFull(['data;descricao;valor', '26/07/2026;A;1.234,56', '27/07/2026;B;1,234.56']);
eq('empate: valores lidos célula a célula',
  EMPATE.transactions.map(x => Math.round(x.amount * 100)), [123456, 123456]);
ok('empate: avisa em vez de chutar a coluna',
  EMPATE.warnings.some(w => /valor/.test(w)), EMPATE.warnings.join(' | '));

// dd/mm × mm/dd, resolvido pela COLUNA
eq('sniffDateOrder: dia > 12 na 2ª posição → mm/dd',
  sniffDateOrder(['07/05/2026', '07/20/2026']).order, 'mdy');
eq('sniffDateOrder: dia > 12 na 1ª posição → dd/mm',
  sniffDateOrder(['05/07/2026', '20/07/2026']).order, 'dmy');
eq('sniffDateOrder: sem evidência não inventa',
  sniffDateOrder(['05/07/2026', '06/07/2026']).order, null);
// Célula a célula "07/05" é 5 de julho ou 7 de maio; a coluna decide, porque a
// linha seguinte tem 20 no lugar do mês.
eq('coluna mm/dd: 07/05 é 5 de julho, não 7 de maio',
  csv(['date,description,amount', '07/05/2026,Coffee,-9.99', '07/20/2026,Books,-15.00'])
    .map(x => x.date), ['2026-07-05', '2026-07-20']);
const DATA_CONFLITO = csvFull(['data;descricao;valor', '25/07/2026;A;-1,00', '07/25/2026;B;-2,00']);
ok('coluna de data com as duas ordens: avisa',
  DATA_CONFLITO.warnings.some(w => /data/.test(w)), DATA_CONFLITO.warnings.join(' | '));

// sujeira de export
eq('CRLF', parseCsv('data;descricao;valor\r\n26/07/2026;Padaria;-10,50\r\n', { fileName: 'x.csv' }).map(shape),
  [{ date: '2026-07-26', description: 'Padaria', cents: -1050, source: 'csv' }]);
eq('CR solto (Mac antigo)', parseCsv('data;descricao;valor\r26/07/2026;Padaria;-10,50', { fileName: 'x.csv' }).length, 1);
eq('BOM residual no começo do cabeçalho',
  parseCsv('﻿data;descricao;valor\n26/07/2026;Padaria;-10,50', { fileName: 'x.csv' }).map(shape),
  [{ date: '2026-07-26', description: 'Padaria', cents: -1050, source: 'csv' }]);
// U+00A0 entre o milhar e a centena, e sobrando na borda do campo: é o que sai
// de internet banking que formatou o número para a tela antes de exportar.
eq('espaço não separável no valor e na borda do campo',
  csv(['data;descricao;valor', '26/07/2026; PADARIA CENTRAL ;-1 234,56']),
  [{ date: '2026-07-26', description: 'PADARIA CENTRAL', cents: -123456, source: 'csv' }]);
eq('linha em branco no meio não atrapalha',
  csv(['data;descricao;valor', '26/07/2026;Padaria;-10,50', '', '27/07/2026;Mercado;-20,00']).length, 2);

// linhas que não são transação
eq('saldo, subtotal, total e cabeçalho repetido não viram lançamento',
  csv([
    'data;descricao;valor',
    '01/07/2026;Compra;-10,00',
    '02/07/2026;Saldo anterior;1.000,00',
    '03/07/2026;Total do mês;-500,00',
    '04/07/2026;SUBTOTAL;-20,00',
    'data;descricao;valor',
    '05/07/2026;S A L D O;900,00',
  ]),
  [{ date: '2026-07-01', description: 'Compra', cents: -1000, source: 'csv' }]);
// O outro lado do risco: "Total" como começo de nome de estabelecimento é
// despesa de verdade, e engolir despesa é pior que importar um subtotal.
eq('estabelecimento que começa com "total" continua sendo transação',
  csv(['data;descricao;valor', '05/07/2026;TOTAL EXPRESS TRANSPORTES;-30,00']).length, 1);

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
eq('OFX: moeda declarada em CURDEF',
  parseOfxFile(OFX.replace('<STMTRS>', '<STMTRS><CURDEF>BRL')).currency, 'BRL');
eq('OFX de conta é reconhecido como extrato', parseOfxFile(OFX).kind, 'statement');

// Fatura de cartão: <CCSTMTRS> em vez de <STMTRS>. O SINAL NÃO MUDA — no OFX o
// consumo do cartão já vem negativo, e inverter aqui trocaria o valor de tudo
// que já foi importado.
const OFX_CARTAO = `OFXHEADER:100
<OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><CURDEF>BRL
<CCACCTFROM><ACCTID>XXXX1234</CCACCTFROM>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260705<TRNAMT>-39.90<FITID>C1<MEMO>NETFLIX.COM</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260709<TRNAMT>19.90<FITID>C2<MEMO>ESTORNO DE COMPRA</STMTTRN>
</BANKTRANLIST></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`;
eq('OFX de cartão é reconhecido como fatura', parseOfxFile(OFX_CARTAO).kind, 'invoice');
eq('OFX de cartão: lançamentos com o sinal do arquivo', parseOfx(OFX_CARTAO).map(shape), [
  { date: '2026-07-05', description: 'NETFLIX.COM', cents: -3990, source: 'ofx', id: 'C1' },
  { date: '2026-07-09', description: 'ESTORNO DE COMPRA', cents: 1990, source: 'ofx', id: 'C2' },
]);

// Validação em cadeia: saldo inicial + lançamentos = <LEDGERBAL>. É a mesma
// ideia do assertTotals do Mercado Pago, e aqui pega também a linha de saldo
// que vem travestida de transação.
const ofxCadeia = (saldoFinal) => `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL
<BANKTRANLIST>
<STMTTRN><DTPOSTED>20260701<TRNAMT>1000.00<FITID>S0<MEMO>SALDO ANTERIOR</STMTTRN>
<STMTTRN><DTPOSTED>20260702<TRNAMT>-45.90<FITID>T1<MEMO>PADARIA CENTRAL</STMTTRN>
<STMTTRN><DTPOSTED>20260703<TRNAMT>500.00<FITID>T2<MEMO>DEPOSITO</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>${saldoFinal}<DTASOF>20260731</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

eq('OFX com saldo: linha "SALDO ANTERIOR" não vira lançamento',
  parseOfx(ofxCadeia('1454.10')).map(shape), [
    { date: '2026-07-02', description: 'PADARIA CENTRAL', cents: -4590, source: 'ofx', id: 'T1' },
    { date: '2026-07-03', description: 'DEPOSITO', cents: 50000, source: 'ofx', id: 'T2' },
  ]);
eq('OFX com saldo: saldo final exposto', parseOfxFile(ofxCadeia('1454.10')).balance, 1454.1);
ok('OFX com cadeia fechando: sem aviso de conferência',
  !parseOfxFile(ofxCadeia('1454.10')).warnings.some(w => /cadeia/.test(w)));

let ofxExplodiu = null;
try { parseOfx(ofxCadeia('1400.00')); } catch (e) { ofxExplodiu = e.message; }
ok('OFX: cadeia de saldos que não fecha lança erro explícito',
  ofxExplodiu && /cadeia de saldos não fecha/.test(ofxExplodiu),
  ofxExplodiu ? `mensagem: ${ofxExplodiu}` : 'não lançou nada');

// Sem saldo inicial não há o que conferir — e recusar o arquivo por causa de
// informação que o banco nunca mandou seria pior que importar.
ok('OFX com saldo final mas sem saldo inicial: aviso, não erro',
  parseOfxFile(ofxCadeia('1454.10').replace(/<STMTTRN><DTPOSTED>20260701[^\n]*\n/, ''))
    .warnings.some(w => /cadeia/.test(w)));
ok('OFX sem saldo declarado não inventa conferência',
  parseOfxFile(OFX).warnings.length === 0);

// Moeda diferente da instância (BRL ou ARS, conforme o locale): importar sem
// avisar somaria laranja com banana na projeção do mês.
ok('OFX em outra moeda avisa',
  parseOfxFile(OFX_CARTAO.replace('<CURDEF>BRL', '<CURDEF>USD')).warnings
    .some(w => /USD/.test(w)));

// Detecção de banco em OFX: o arquivo declara a instituição, e isso é evidência
// melhor que o nome do arquivo. O `source` gravado continua sendo 'ofx'.
const ofxDe = (org, bankId) =>
  `OFXHEADER:100\n<OFX><SIGNONMSGSRSV1><SONRS><FI><ORG>${org}</ORG><FID>1</FID></FI></SONRS></SIGNONMSGSRSV1>` +
  `<BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><BANKID>${bankId}</BANKID></BANKACCTFROM></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
eq('OFX do Itaú é reconhecido pelo <ORG>',
  detectBank(ofxDe('Banco Itau SA', '341'), 'extrato.ofx', 'ofx')?.id ?? null, 'itau-csv');
eq('OFX do Bradesco é reconhecido pelo código COMPE',
  detectBank(ofxDe('BANCO', '237'), 'extrato.ofx', 'ofx')?.id ?? null, 'bradesco-csv');
ok('OFX de banco desconhecido continua genérico',
  detectBank(ofxDe('BANCO XPTO', '999'), 'extrato.ofx', 'ofx') === null);

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

// O resumo de cartão argentino saiu daqui na v4.3.3. O fixture que existia
// neste ponto descrevia um documento que NÃO EXISTE: era o layout brasileiro
// traduzido ("Movimientos del resumen", "Tarjeta Visa [1234]", "Cuota 2 de 6"
// separado por espaço). Ele passava havia meses e não protegia nada — o resumo
// real do Mercado Pago Argentina não tem um único desses marcadores.
//
// É o risco de testar contra uma suposição: o verde do teste vira argumento
// para confiar num parser que nunca leu um documento. O caso agora é coberto
// contra o layout real, no bloco "Resumen de tarjeta AR" mais abaixo.

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
// `source` NÃO é único, e a partir da v5 isso é de propósito: a mesma conta do
// mundo real pode ser exportada em dois formatos. A Conta Global do Inter sai em
// PDF e em CSV, e os dois perfis PRECISAM compartilhar o source — é ele que
// vincula os lançamentos à conta e é ele que entra no hash de deduplicação. Com
// sources diferentes, importar os dois formatos criaria duas contas e duplicaria
// tudo.
//
// O que continua tendo de valer: quem compartilha source descreve a MESMA conta.
{
  const porSource = new Map();
  for (const p of BANK_PROFILES) {
    porSource.set(p.source, [...(porSource.get(p.source) ?? []), p]);
  }
  const divergentes = [...porSource.entries()]
    .filter(([, ps]) => ps.length > 1)
    .filter(([, ps]) => new Set(ps.map(p => `${p.name}|${p.kind}|${p.currency ?? ''}`)).size > 1)
    .map(([src]) => src);
  ok('perfis que compartilham source descrevem a mesma conta',
    divergentes.length === 0,
    divergentes.length ? `nome, tipo ou moeda divergem em: ${divergentes.join(', ')}` : '');
}
eq('source do Mercado Pago BR não mudou (source_bindings existentes)',
  BANK_PROFILES.filter(p => p.id.startsWith('mp-br')).map(p => p.source).sort(),
  ['mp-extrato', 'mp-fatura']);
ok('todo perfil CSV tem mapeamento csv', BANK_PROFILES
  .filter(p => p.formats.includes('csv')).every(p => p.csv));
ok('todo perfil de confiança baixa exige marcador ou é PDF', BANK_PROFILES
  .filter(p => p.confidence === 'baixa')
  .every(p => p.requireMarker || p.formats.includes('pdf')));


section('Extrato "Últimos movimientos" — banco argentino (VALIDADO)');

// Fixture SINTÉTICA com a estrutura do documento real: dados inventados, layout
// observado. Reproduz as três armadilhas do arquivo de verdade:
//   1. data com BARRA (dd/mm/aaaa), não hífen como no Mercado Pago;
//   2. sinal negativo ANTES do "$" — ler errado importa despesa como receita;
//   3. descrição quebrada em várias linhas, e às vezes o valor em linha própria.
// Os saldos foram calculados à mão para a cadeia fechar; é o que o parser confere.
const AR_CUENTA = [
  '',
  'Últimos movimientos de CUENTA SUELDO / DE LA SEGURIDAD SOCIAL',
  'Número de cuenta 000000000000000',
  'Fecha',
  'Nro.',
  'Transacción',
  'DescripciónImporteSaldo',
  '29/08/20251000000001CAPITALIZACION AH$ 0,50$ 1.500,50',
  '20/08/2025200001MONOTRIBUTO FISICAS-$ 500,00$ 1.500,00',
  '18/08/2025200002',
  'TPUSH ALGUIEN DE ALGUN LADO',
  'DOC00000000000',
  '$ 2.000,00$ 2.000,00',
  '04/08/20251000000002DB TARJETA DE CREDITO VISA',
  '-$ 300,00',
  '$ 0,00',
].join('\n');

eq('extracto AR: detecção', detectExtractoAr(AR_CUENTA), true);
eq('extracto AR: não rouba um PDF do Mercado Pago', detectExtractoAr(MP_BR_EXTRATO), false);

const arCuenta = parseExtractoAr(AR_CUENTA);
eq('extracto AR', arCuenta.transactions.map(shape), [
  { date: '2025-08-29', description: 'CAPITALIZACION AH', cents: 50, source: 'ar-cuenta', id: '1000000001' },
  // sinal ANTES do $: se lido errado, viraria +500 e a cadeia de saldos não fecharia
  { date: '2025-08-20', description: 'MONOTRIBUTO FISICAS', cents: -50000, source: 'ar-cuenta', id: '200001' },
  { date: '2025-08-18', description: 'TPUSH ALGUIEN DE ALGUN LADO DOC00000000000', cents: 200000, source: 'ar-cuenta', id: '200002' },
  // débito da fatura do cartão = transferência interna (a despesa está na fatura)
  { date: '2025-08-04', description: 'DB TARJETA DE CREDITO VISA', cents: -30000, source: 'ar-cuenta', transfer: true, id: '1000000002' },
]);
ok('extracto AR: cadeia de saldos fecha, sem avisos', arCuenta.warnings.length === 0);
ok('extracto AR: saldo não vaza para a transação',
  !('balance' in arCuenta.transactions[0]));
ok('extracto AR: cabeçalho não entra na descrição',
  !arCuenta.transactions.some(t => /Fecha|Nro|Importe|Saldo|Último|Número de cuenta/i.test(t.description)));

// CAPITALIZACION é juro de poupança: RECEITA, não transferência. Errar aqui
// tiraria uma entrada do total do mês.
ok('extracto AR: CAPITALIZACION não é transferência',
  arCuenta.transactions.find(t => /CAPITALIZACION/.test(t.description)).transfer === false);
eq('extracto AR: CAPITALIZACION cai em renda',
  categorize('CAPITALIZACION AH', [], KEYWORD_DICTS.ar), CAT.INCOME);
eq('extracto AR: MONOTRIBUTO cai em financeiro',
  categorize('MONOTRIBUTO FISICAS', [], KEYWORD_DICTS.ar), CAT.FINANCIAL);
eq('extracto AR: IMP. AFIP cai em financeiro',
  categorize('IMP. AFIP', [], KEYWORD_DICTS.ar), CAT.FINANCIAL);
eq('extracto AR: SUPER MAMI cai em comida',
  categorize('SUPER MAMI', [], KEYWORD_DICTS.ar), CAT.FOOD);

// A validação forte: adulterar UM saldo tem de explodir, não passar batido.
// É o que pega sinal invertido, movimento perdido e movimento duplicado — erros
// que a simples contagem de linhas não vê.
const AR_TORTO = AR_CUENTA.replace('$ 0,50$ 1.500,50', '$ 0,50$ 9.999,99');
let arExplodiu = null;
try { parseExtractoAr(AR_TORTO); } catch (e) { arExplodiu = e.message; }
ok('extracto AR: cadeia adulterada lança erro explícito',
  arExplodiu && /cadeia de saldos.*não fecha/i.test(arExplodiu),
  arExplodiu ? `mensagem: ${arExplodiu.slice(0, 90)}…` : 'não lançou');
ok('extracto AR: o erro diz QUAL movimento divergiu',
  arExplodiu && /9999,99|9999\.99|9\.999,99/.test(arExplodiu.replace(/\s/g, '')) === false
    ? /MONOTRIBUTO|CAPITALIZACION/.test(arExplodiu) : true);

// Sinal invertido numa linha: o teste que prova que a cadeia serve para algo.
const AR_SINAL = AR_CUENTA.replace('-$ 500,00$ 1.500,00', '$ 500,00$ 1.500,00');
let sinalExplodiu = false;
try { parseExtractoAr(AR_SINAL); } catch { sinalExplodiu = true; }
ok('extracto AR: sinal invertido é pego pela cadeia', sinalExplodiu);

// ═════════════════════════════════════════════════════════════════════════════
// Resumo de cartão argentino (Mercado Pago)
// ═════════════════════════════════════════════════════════════════════════════
section('Resumen de tarjeta AR');

// Fixture SINTÉTICO: mesma estrutura do documento real, comércios e valores
// inventados. Nenhum dado de pessoa real entra no repositório — o resumo de
// verdade traz nome, CUIT, DNI e endereço do titular.
//
// O que este fixture preserva do original, porque é o que quebra o parser:
//   · colunas coladas sem separador nenhum;
//   · datas sem ano, com mês abreviado em três letras;
//   · pesos e dólares na mesma tabela;
//   · o bloco do período anterior, que soma zero e não pode ser importado;
//   · cuota grudada no número de operação ("8 de 9678488").
const RESUMEN_AR = `
Tarjeta de crédito
Este es tu resumen de julio
Total a pagar
$ 100.000,00
US$ 30
00
Fecha de cierre
18 de julio
Fecha de vencimiento
23 de julio
Consolidado
Saldo del periodo anterior$ 0,00
Consumos$ 90.000,00US$ 30,00
Impuestos e intereses$ 10.000,00
Total a pagar$ 100.000,00US$ 30,00

DETALLE DE MOVIMIENTOS
Composición del saldo del periodo anterior
FechaDescripciónPesosDólares
18/junTotal a pagar del periodo anterior$ 55.000,00US$ 0,00
26/junPago de tarjeta-$ 55.000,00
Subtotal$ 0,00US$ 0,00
Consumos
Con tarjeta virtual
FechaDescripciónCuotaOperaciónPesosDólares
2/dicTIENDA EJEMPLO8 de 9678488$ 20.000,00
3/maySERVICIO EJEMPLO3 de 3108764$ 10.000,00
19/junSUSCRIPCION EJEMPLO529124US$ 30,00
5/julKIOSCO EJEMPLO25469834$ 30.000,00
Con tarjeta física
FechaDescripciónCuotaOperaciónPesosDólares
6/julPARRILLA EJEMPLO620823$ 30.000,00
Subtotal$ 90.000,00US$ 30,00
Impuestos e intereses
1
FechaDescripciónPesosDólares
18/julIVA servicios digitales RG 4240$ 7.000,00
19/julIntereses de financiación$ 3.000,00
¹ Los impuestos por consumos en moneda extranjera incluyen a todos.
Subtotal$ 10.000,00US$ 0,00
Pagos anticipados
No realizaste pagos anticipados
Ajustes y reembolsos
No tenés ajustes ni reembolsos
Total a pagar$ 100.000,00US$ 30,00
`.trim();

// Relógio fixo: o ano é INFERIDO do relógio de quem importa, então um teste
// que use `new Date()` passa hoje e falha em janeiro.
const HOJE = new Date(2026, 7, 1);   // 1º de agosto de 2026
const resumen = parseResumenTarjetaAr(RESUMEN_AR, { today: HOJE });
const rtx = resumen.transactions;

ok('resumen AR: detectado', detectResumenTarjetaAr(RESUMEN_AR));
ok('resumen AR: não rouba o extrato de conta',
  detectResumenTarjetaAr('RESUMEN DE CUENTA\nTotal a pagar\nComposición del saldo del periodo anterior') === false);
eq('resumen AR: 6 lançamentos em pesos (2 do período anterior fora, 1 em dólar fora)',
  rtx.length, 6);

// O total é o teste que importa: se uma linha se perder, ele muda.
const rsoma = rtx.reduce((s, x) => s + x.amount, 0);
eq('resumen AR: soma bate com "Total a pagar" do documento', rsoma.toFixed(2), '-100000.00');

// O período anterior soma zero, mas importá-lo duplicaria a fatura passada:
// o teste é que ele não aparece, não que a soma continue certa.
ok('resumen AR: período anterior fica de fora',
  !rtx.some(x => /periodo anterior|Pago de tarjeta/i.test(x.description)),
  JSON.stringify(rtx.map(x => x.description)));

// Regressão do bug do mês guloso: com `[a-z]{3,4}` o motor lia "junT" como mês,
// a linha inteira era descartada e o total ficava MENOR — em silêncio.
const anterior = rtx.filter(x => x.date.startsWith('2026-06'));
eq('resumen AR: mês abreviado não engole a primeira letra da descrição',
  rtx.filter(x => /^EJEMPLO|^IENDA|^ERVICIO/.test(x.description)).length, 0);

// Datas: sem ano no documento, tudo é inferido do fechamento (18/jul).
const porDesc = Object.fromEntries(rtx.map(x => [x.description, x]));
eq('resumen AR: cuota antiga cai no ano anterior',
  porDesc['TIENDA EJEMPLO (cuota 8/9)'].date, '2025-12-02');
eq('resumen AR: mês antes do fechamento fica no mesmo ano',
  porDesc['SERVICIO EJEMPLO (cuota 3/3)'].date, '2026-05-03');
eq('resumen AR: cuota vira sufixo legível',
  porDesc['TIENDA EJEMPLO (cuota 8/9)'].description, 'TIENDA EJEMPLO (cuota 8/9)');
eq('resumen AR: competência da fatura', rtx[0].invoiceRef, '2026-07');

// Descrição que termina em dígito é o caso que mais tenta o parser a errar o
// corte entre nome e número de operação.
ok('resumen AR: descrição com dígito no fim sobrevive ao corte',
  !!porDesc['KIOSCO EJEMPLO25'], JSON.stringify(Object.keys(porDesc)));

// Dólar: fora, e DITO. Somar 30 "pesos" onde o documento diz US$ 30 seria o
// tipo de erro que ninguém percebe.
eq('resumen AR: consumo em dólar não vira peso', resumen.foreign.length, 1);
ok('resumen AR: avisa quanto ficou de fora em dólar',
  resumen.warnings.some(w => /30,00/.test(w)), JSON.stringify(resumen.warnings));
ok('resumen AR: avisa que o ano foi suposto',
  resumen.warnings.some(w => /2026/.test(w)), JSON.stringify(resumen.warnings));

// Inferência de ano: fechamento que ainda não chegou pertence ao ano passado.
eq('anoDoCiclo: fechamento já passou', anoDoCiclo(7, 18, new Date(2026, 7, 1)), 2026);
eq('anoDoCiclo: fechamento ainda no futuro', anoDoCiclo(12, 18, new Date(2026, 7, 1)), 2025);
eq('anoDoCiclo: fechamento é hoje', anoDoCiclo(8, 1, new Date(2026, 7, 1)), 2026);

// A checagem de totais é o que separa "importou" de "importou certo".
let resumenExplodiu = null;
try {
  parseResumenTarjetaAr(RESUMEN_AR.replace('6/julPARRILLA EJEMPLO620823$ 30.000,00', ''), { today: HOJE });
} catch (e) { resumenExplodiu = e.message; }
ok('resumen AR: linha perdida cancela a importação',
  resumenExplodiu && /consumos/i.test(resumenExplodiu),
  resumenExplodiu ? resumenExplodiu.slice(0, 120) : 'não lançou');

let semCiclo = null;
try {
  parseResumenTarjetaAr(RESUMEN_AR.replace(/Fecha de cierre\n18 de julio\n/, ''), { today: HOJE });
} catch (e) { semCiclo = e.message; }
ok('resumen AR: sem data de fechamento não inventa ano', !!semCiclo,
  semCiclo ? semCiclo.slice(0, 90) : 'não lançou');

// O perfil de banco precisa reconhecer o mesmo documento que o parser lê —
// senão a tela diz "origem desconhecida" para algo que foi lido com precisão.
eq('resumen AR: perfil de banco casa',
  detectBank(RESUMEN_AR, 'resumen.pdf', 'pdf')?.id, 'mp-ar-resumen');

// ═════════════════════════════════════════════════════════════════════════════
// Cadeia de saldos em CSV
// ═════════════════════════════════════════════════════════════════════════════
section('CSV: cadeia de saldos');

// Do mais ANTIGO para o mais novo: saldo[i] = saldo[i-1] + valor[i]
const CSV_SALDO_ASC = [
  'data;descricao;valor;saldo',
  '01/03/2026;SALARIO;3000,00;3000,00',
  '02/03/2026;MERCADO;-250,00;2750,00',
  '03/03/2026;FARMACIA;-50,00;2700,00',
].join('\n');

// Mesmo extrato, do mais NOVO para o mais antigo — banco também faz assim.
const CSV_SALDO_DESC = [
  'data;descricao;valor;saldo',
  '03/03/2026;FARMACIA;-50,00;2700,00',
  '02/03/2026;MERCADO;-250,00;2750,00',
  '01/03/2026;SALARIO;3000,00;3000,00',
].join('\n');

const asc = parseCsvFile(CSV_SALDO_ASC);
const dsc = parseCsvFile(CSV_SALDO_DESC);

eq('CSV asc: 3 lançamentos', asc.transactions.length, 3);
ok('CSV asc: cadeia fecha, nenhum aviso',
  asc.warnings.length === 0, JSON.stringify(asc.warnings));
ok('CSV desc: a direção é descoberta, não presumida',
  dsc.warnings.length === 0, JSON.stringify(dsc.warnings));

// O saldo serviu para conferir e não vira dado de transação: se vazasse para o
// banco, entraria no hash de deduplicação e mudaria a identidade da linha.
ok('CSV: saldo não vaza para a transação',
  asc.transactions.every(t => !('balance' in t)),
  JSON.stringify(asc.transactions[0]));

// O que a soma de totais NÃO pega: sinal invertido numa linha só. O total muda,
// mas nada no arquivo declara o total — só o saldo denuncia.
const CSV_SINAL = CSV_SALDO_ASC.replace('MERCADO;-250,00', 'MERCADO;250,00');
const sinal = parseCsvFile(CSV_SINAL);
ok('CSV: sinal invertido é pego pela cadeia',
  sinal.warnings.some(w => /MERCADO/.test(w)), JSON.stringify(sinal.warnings));

// Valor certo, saldo adulterado: prova que a checagem olha os dois lados.
const CSV_QUEBRADO = CSV_SALDO_ASC.replace('2750,00', '2999,99');
const quebrado = parseCsvFile(CSV_QUEBRADO);
ok('CSV: elo quebrado vira aviso', quebrado.warnings.length > 0);
ok('CSV: o aviso nomeia a linha e os dois números',
  quebrado.warnings.some(w => /MERCADO/.test(w) && /2750/.test(w) && /2999/.test(w)),
  JSON.stringify(quebrado.warnings));

// Diferente do OFX e do extrato argentino, aqui NÃO aborta: export filtrado
// quebra a cadeia sem que a leitura esteja errada.
eq('CSV: mesmo com a cadeia quebrada, importa', quebrado.transactions.length, 3);

// Sem coluna de saldo não há o que conferir — e isso não é motivo de aviso.
const semSaldo = parseCsvFile([
  'data;descricao;valor',
  '01/03/2026;SALARIO;3000,00',
  '02/03/2026;MERCADO;-250,00',
].join('\n'));
eq('CSV sem saldo: nenhum aviso', semSaldo.warnings.length, 0);
eq('CSV sem saldo: conferirCadeiaSaldo devolve null',
  conferirCadeiaSaldo([{ balance: null, amount: 1 }, { balance: null, amount: 2 }]), null);

// ═════════════════════════════════════════════════════════════════════════════
// Extrato de conta do Nubank (PDF)
// ═════════════════════════════════════════════════════════════════════════════
section('Extrato Nubank');

// Fixture SINTÉTICO. O extrato real traz CPF mascarado, agência, conta e nomes
// de terceiros — nada disso entra no repositório.
//
// O que o fixture preserva, porque é o que quebra o parser:
//   · o valor NÃO tem sinal: quem manda é o marcador do grupo;
//   · as duas formas de linha misturadas — valor colado na descrição e valor
//     sozinho depois de uma descrição de várias linhas;
//   · o resumo do topo, cujos números parecem lançamentos.
const NUBANK = [
  'Fulano de Tal', 'VALORES EM R$',
  'Saldo inicial', 'Rendimento líquido', 'Total de entradas', 'Total de saídas',
  '0,00', '+0,00', '+500,00', '-500,00',
  'Movimentações',
  '10 JUL 2026',
  'Total de entradas+ 500,00',
  'Transferência recebida pelo PixNOME EXEMPLO - •••.000.000-•• - BANCO',
  'EXEMPLO Agência: 1 Conta: 1234-5',
  '500,00',
  '12 JUL 2026',
  'Total de saídas- 500,00',
  'Pagamento de fatura300,00',
  'Transferência enviada pelo PixOUTRO EXEMPLO - •••.111.111-••',
  '200,00',
  'Extrato gerado dia 04 de agosto de 2026 às 18:48',
  '1 de 1',
].join('\n') + '\nnubank.com.br';

ok('Nubank: detectado', detectNubankExtrato(NUBANK));
const nu = parseNubankExtrato(NUBANK);
eq('Nubank: 3 lançamentos', nu.transactions.length, 3);

// O resumo do topo tem números idênticos a lançamentos. Se entrasse, o total
// dobraria — e continuaria "plausível".
ok('Nubank: o resumo do topo não vira lançamento',
  nu.transactions.every(t => t.date >= '2026-07-10'),
  JSON.stringify(nu.transactions.map(t => t.date)));

const entradas = nu.transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
const saidas = nu.transactions.filter(t => t.amount < 0).reduce((s, t) => s - t.amount, 0);
eq('Nubank: entradas somam o que o grupo declara', entradas.toFixed(2), '500.00');
eq('Nubank: saídas somam o que o grupo declara', saidas.toFixed(2), '500.00');

// O caso que a primeira versão perdia: descrição e valor colados na linha.
const colado = nu.transactions.find(t => /Pagamento de fatura/.test(t.description));
ok('Nubank: lê o lançamento com valor colado na descrição', !!colado);
eq('Nubank: e com o sinal do grupo', colado?.amount.toFixed(2), '-300.00');

// O sinal é inferido: se o agrupamento for lido errado, metade do extrato
// inverte. Por isso aqui ABORTA, e não avisa.
let nuExplodiu = null;
try { parseNubankExtrato(NUBANK.replace('Pagamento de fatura300,00', '')); }
catch (e) { nuExplodiu = e.message; }
ok('Nubank: lançamento perdido cancela a importação',
  nuExplodiu && /2026-07-12/.test(nuExplodiu), nuExplodiu?.slice(0, 90));

// Palavra e símbolo do marcador discordando = formato mudou. Adivinhar o sinal
// num extrato é escolher entre receita e despesa no cara ou coroa.
let nuSinal = null;
try { parseNubankExtrato(NUBANK.replace('Total de saídas- 500,00', 'Total de saídas+ 500,00')); }
catch (e) { nuSinal = e.message; }
ok('Nubank: marcador contraditório cancela a importação', !!nuSinal);

// ═════════════════════════════════════════════════════════════════════════════
// Conta Global do Inter (CSV em dólar)
// ═════════════════════════════════════════════════════════════════════════════
section('Inter Global (dólar)');

const GLOBAL = [
  'Extrato Global Account',
  'Nome;NOME EXEMPLO',
  'Account number;0000000000',
  'Saldo Inicial Período Solicitado;$ 10,00',
  'Saldo Final Período Solicitado;$ 25,00',
  '',
  'Data da Transação;Valor da Transação;Tipo da Operação;Tipo da Transação;Nome do Beneficiário;Estabelecimento',
  '03/08/2026 10:44:03;US$ 5,00;Débito;Compra no Cartão Global;;LOJA EXEMPLO',
  '01/08/2026 10:39:22;US$ 20,00;Crédito;Carregamento recebido;;',
].join('\n');

const ig = parseCsvFile(GLOBAL, { fileName: 'global.csv' });
eq('Inter Global: perfil reconhecido', ig.profile?.id, 'inter-global-csv');
eq('Inter Global: 2 lançamentos', ig.transactions.length, 2);

// A moeda é o ponto todo: sem ela, 25 dólares viram 25 reais em silêncio.
ok('Inter Global: cada lançamento sai marcado como USD',
  ig.transactions.every(t => t.currency === 'USD'),
  JSON.stringify(ig.transactions.map(t => t.currency)));

// O sinal vem da coluna "Tipo da Operação" — o valor é sempre positivo.
eq('Inter Global: Débito vira negativo',
  ig.transactions.find(t => /LOJA/.test(t.description))?.amount.toFixed(2), '-5.00');
eq('Inter Global: Crédito vira positivo',
  ig.transactions.find(t => /Carregamento/.test(t.description))?.amount.toFixed(2), '20.00');

// Metade das linhas tem "Estabelecimento" vazio. Sem reserva por linha elas
// virariam "Sem descrição" — que não casa com regra nenhuma e cai em "a
// revisar" todo mês, para sempre.
eq('Inter Global: descrição cai no tipo quando não há estabelecimento',
  ig.transactions.find(t => t.amount > 0)?.description, 'Carregamento recebido');

eq('Inter Global: 10 + 15 = 25, fecha com o declarado', ig.warnings.length, 0);

const igTorto = parseCsvFile(GLOBAL.replace(';$ 25,00', ';$ 99,00'), { fileName: 'global.csv' });
ok('Inter Global: saldo final que não fecha vira aviso',
  igTorto.warnings.some(w => /99|saldo/i.test(w)), JSON.stringify(igTorto.warnings));

// ═════════════════════════════════════════════════════════════════════════════
// Conta Global do Inter (PDF em dólar)
// ═════════════════════════════════════════════════════════════════════════════
section('Inter Global (PDF)');

// Fixture SINTÉTICO — o extrato real traz nome e número de conta.
// Cadeia: 10,00 → +20,00 = 30,00 (dia 1) → −5,00 = 25,00 (dia 3).
const IG_PDF = [
  'NOME EXEMPLO', 'Conta Cayman', 'Cartão Global',
  'Saldo Inicial:$ 10,00',
  'Saldo Final:$ 25,00',
  '3 de agosto de 2026',
  'Saldo do dia:$ 25,00Taxas mensais totais:$ 0,00',
  'TransaçãoBeneficiário / RemetenteQuantia',
  'Compra no Cartão GlobalLOJA EXEMPLO',
  'Beneficiário',
  '$ 5,00',
  '1 de agosto de 2026',
  'Saldo do dia:$ 30,00',
  'TransaçãoBeneficiário / RemetenteQuantia',
  'Carregamento recebidoNOME EXEMPLO',
  'Remetente',
  '$ 20,00',
].join('\n');

ok('Inter PDF: detectado', detectInterGlobalPdf(IG_PDF));
const igp = parseInterGlobalPdf(IG_PDF);
eq('Inter PDF: 2 lançamentos', igp.transactions.length, 2);
ok('Inter PDF: em dólar', igp.transactions.every(t => t.currency === 'USD'));

// O sinal vem do TIPO; a cadeia de saldos é quem confere.
eq('Inter PDF: compra sai', igp.transactions[0].amount.toFixed(2), '-5.00');
eq('Inter PDF: carregamento entra', igp.transactions[1].amount.toFixed(2), '20.00');

// "Beneficiário" e "Remetente" NÃO indicam direção — aparecem nos dois casos.
// Este teste existe para impedir que alguém "conserte" o parser usando eles.
ok('Inter PDF: Beneficiário/Remetente não invertem nada',
  igp.transactions[0].amount < 0 && igp.transactions[1].amount > 0);

// A prova de que a conferência não é decorativa: um tipo classificado com o
// sinal trocado tem de derrubar a importação inteira.
let igQuebrou = null;
try {
  parseInterGlobalPdf(IG_PDF.replace('Carregamento recebidoNOME', 'Chip InternacionalNOME'));
} catch (e) { igQuebrou = e.message; }
ok('Inter PDF: sinal errado derruba a cadeia e cancela',
  igQuebrou && /cadeia de saldos/i.test(igQuebrou), igQuebrou?.slice(0, 80));

// Sem saldo inicial não há como conferir nada, e aí o sinal seria palpite puro.
let igSemSaldo = null;
try { parseInterGlobalPdf(IG_PDF.replace('Saldo Inicial:$ 10,00', '')); }
catch (e) { igSemSaldo = e.message; }
ok('Inter PDF: sem saldo inicial, recusa em vez de adivinhar', !!igSemSaldo);

// ─── resultado ───────────────────────────────────────────────────────────────
console.log(`  \x1b[32m${pass - mark} ok\x1b[0m`);
console.log(`\n${'─'.repeat(72)}`);
if (fails.length) {
  console.log(`\x1b[31m${fails.length} falha(s)\x1b[0m de ${pass + fails.length} verificações:\n`);
  fails.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  process.exit(1);
}
console.log(`\x1b[32mtudo certo\x1b[0m — ${pass} verificações`);
