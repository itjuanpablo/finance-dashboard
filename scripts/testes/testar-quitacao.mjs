#!/usr/bin/env node
// Quitação de fatura de cartão e conciliação sugerida (lib/quitacao.js).
//
// Todos os dados aqui são INVENTADOS, num banco temporário. O banco real do
// usuário não é aberto em momento algum — ver a checagem final.
//
// O teste que mais importa neste arquivo é o do FALSO POSITIVO: um Pix do
// mesmo valor, na mesma janela, NÃO pode virar "sua fatura foi paga". Se um
// dia alguém afrouxar a regra achando que está sendo prestativo, é aqui que
// isso trava.

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fluxo-quit-'));
process.env.FLUXO_DATA_DIR = tmp;

const { quitacoesDo, sugerirPagamento, statusDaFatura } =
  await import(pathToFileURL(path.join(ROOT, 'lib/quitacao.js')).href);

let falhas = 0;
const ok = (nome, cond, extra) => {
  if (!cond) falhas++;
  console.log(`  ${cond ? 'ok  ' : 'FALHA'} ${nome}${cond || extra === undefined ? '' : `  → ${JSON.stringify(extra)}`}`);
};

// ── banco sintético ────────────────────────────────────────────────────────
const db = new DatabaseSync(path.join(tmp, 'teste.db'));
db.exec(`
  CREATE TABLE cards (id INTEGER PRIMARY KEY, name TEXT, closing_day INT, due_day INT);
  CREATE TABLE transactions (
    id INTEGER PRIMARY KEY, date TEXT, description TEXT, amount_cents INT,
    source TEXT, currency TEXT, deleted_at TEXT, has_children INT DEFAULT 0);
  CREATE TABLE invoice_settlements (
    card_id INT, ref TEXT, paid_cents INT, paid_on TEXT, tx_id INT,
    created_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (card_id, ref));
  INSERT INTO cards VALUES (1, 'Cartão', 9, 15);
`);
const inserir = (id, date, desc, cents, source) =>
  db.prepare('INSERT INTO transactions (id,date,description,amount_cents,source,currency) VALUES (?,?,?,?,?,NULL)')
    .run(id, date, desc, cents, source);

const FATURA = { closing_date: '2026-01-09', due_date: '2026-01-15', total_cents: 260534 };
const SRC_CARTAO = ['mp-fatura'];

console.log('\n1. Encontra o pagamento certo');
inserir(1, '2026-01-15', 'Pagamento de fatura cartão de crédito', -260534, 'mp-extrato');
let s = sugerirPagamento(db, FATURA, SRC_CARTAO);
ok('sugere o débito do extrato', s?.tx_id === 1, s);
ok('devolve data, descrição e valor', s?.date === '2026-01-15' && s?.amount_cents === -260534, s);

console.log('\n2. NÃO confunde com outra coisa do mesmo valor');
db.exec('DELETE FROM transactions');
inserir(2, '2026-01-14', 'Transferência Pix enviada FULANO DE TAL', -260534, 'mp-extrato');
ok('Pix do mesmo valor na mesma janela NÃO é sugerido',
  sugerirPagamento(db, FATURA, SRC_CARTAO) === null);

db.exec('DELETE FROM transactions');
inserir(3, '2026-01-15', 'Pagamento de fatura cartão', -180000, 'mp-extrato');
ok('valor muito diferente não é sugerido', sugerirPagamento(db, FATURA, SRC_CARTAO) === null);

db.exec('DELETE FROM transactions');
inserir(4, '2026-03-20', 'Pagamento de fatura cartão', -260534, 'mp-extrato');
ok('fora da janela de vencimento não é sugerido', sugerirPagamento(db, FATURA, SRC_CARTAO) === null);

db.exec('DELETE FROM transactions');
inserir(5, '2026-01-15', 'Pagamento de fatura cartão', -260534, 'mp-fatura');
ok('lançamento do PRÓPRIO cartão nunca é o pagamento dele',
  sugerirPagamento(db, FATURA, SRC_CARTAO) === null);

console.log('\n3. Ambiguidade não vira escolha');
db.exec('DELETE FROM transactions');
inserir(6, '2026-01-14', 'Pagamento de fatura cartão', -260534, 'mp-extrato');
inserir(7, '2026-01-15', 'Pagamento fatura cartão de crédito', -260500, 'mp-extrato');
ok('dois candidatos plausíveis → não sugere nenhum',
  sugerirPagamento(db, FATURA, SRC_CARTAO) === null);

console.log('\n4. Pagamento já usado não é reoferecido');
db.exec('DELETE FROM transactions');
inserir(8, '2026-01-15', 'Pagamento de fatura cartão', -260534, 'mp-extrato');
ok('sem vínculo, sugere', sugerirPagamento(db, FATURA, SRC_CARTAO)?.tx_id === 8);
ok('vinculado a outra fatura, não sugere',
  sugerirPagamento(db, FATURA, SRC_CARTAO, [8]) === null);

console.log('\n5. Tolerância: R$ 1,00, nem mais');
db.exec('DELETE FROM transactions');
inserir(9, '2026-01-15', 'Pagamento de fatura cartão', -260634, 'mp-extrato');   // +1,00
ok('diferença de exatamente R$ 1,00 ainda casa',
  sugerirPagamento(db, FATURA, SRC_CARTAO)?.tx_id === 9);
db.exec('DELETE FROM transactions');
inserir(10, '2026-01-15', 'Pagamento de fatura cartão', -260700, 'mp-extrato');  // +1,66
ok('diferença maior não casa', sugerirPagamento(db, FATURA, SRC_CARTAO) === null);

console.log('\n6. Status: a afirmação do usuário tem a última palavra');
const inv = { ref: '2026-01', total_cents: 260534, paid_cents: 0 };
ok('sem quitação, fatura antiga é "fechada"',
  statusDaFatura(inv, '2026-08', null) === 'fechada');
ok('com quitação, vira "paga"',
  statusDaFatura(inv, '2026-08', { paid_cents: 260534 }) === 'paga');
ok('quitação parcial não vira "paga"',
  statusDaFatura(inv, '2026-08', { paid_cents: 100000 }) === 'parcial');
// Antes, a checagem de ciclo vinha primeiro e a fatura do mês corrente NUNCA
// podia aparecer como paga, mesmo com o pagamento registrado.
ok('fatura do mês corrente PODE ser paga (quem paga adiantado merece ver)',
  statusDaFatura(inv, '2026-01', { paid_cents: 260534 }) === 'paga');
ok('mês corrente sem quitação continua "aberta"',
  statusDaFatura(inv, '2026-01', null) === 'aberta');
ok('fatura futura sem quitação continua "futura"',
  statusDaFatura({ ...inv, ref: '2026-12' }, '2026-01', null) === 'futura');
ok('fatura zerada não vira "paga" por vacuidade',
  statusDaFatura({ ref: '2026-01', total_cents: 0, paid_cents: 0 }, '2026-08', null) !== 'paga');

console.log('\n7. Leitura das quitações gravadas');
db.prepare('INSERT INTO invoice_settlements (card_id,ref,paid_cents,paid_on,tx_id) VALUES (?,?,?,?,?)')
  .run(1, '2026-01', 260534, '2026-01-15', 8);
const q = quitacoesDo(db, 1);
ok('indexa por competência', q['2026-01']?.paid_cents === 260534, q);
ok('guarda o lançamento conciliado', q['2026-01']?.tx_id === 8);
ok('cartão sem quitação devolve vazio', Object.keys(quitacoesDo(db, 99)).length === 0);

console.log('\n8. O banco real não foi tocado');
const real = path.join(ROOT, 'data', 'fluxo.db');
ok('data/fluxo.db não foi aberto por este teste',
  !fs.existsSync(real) || fs.statSync(real).mtimeMs < Date.now() - 5000);

db.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(falhas ? `\n✗ ${falhas} falha(s).` : '\ntudo certo — quitação e conciliação.');
process.exit(falhas ? 1 : 0);
