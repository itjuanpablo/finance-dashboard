#!/usr/bin/env node
// Teste do PIPELINE de importação: `node scripts/testar-importacao.mjs`.
// Exit 1 se falhar. Roda sobre banco descartável em /tmp — nunca toca data/fluxo.db.
//
// POR QUE ESTE ARQUIVO EXISTE
//
// A suíte cobria parser (testar-parsers) e rotas (testar-api-categorias), mas
// não o caminho do meio: parse → categoriza → deduplica → grava. Dois defeitos
// reais passaram exatamente por esse vão, e nenhum dos outros testes os pegaria,
// porque os parsers estavam corretos:
//
//  1. `t.description` no lugar de `tx.description` dentro de lib/importer.js.
//     Neste arquivo `t` é a FUNÇÃO DE TRADUÇÃO importada — `t.description` não
//     dá erro, devolve undefined. O categorizador recebia string vazia e TODA
//     transação ia para "a revisar". O app parecia funcionar: importava, somava
//     certo, e simplesmente "não reconhecia nada".
//
//  2. `ACTIVE_KEYWORDS` resolvido na carga do módulo. Quando o idioma vem do
//     banco (a pessoa escolhe no seletor, que é o caminho normal desde a v4.1),
//     o módulo já havia sido avaliado e o dicionário continuava sendo o
//     brasileiro. Uma instalação argentina categorizava com palavras-chave do
//     Brasil e o dono concluía que a função não serve.
//
// A lição que estes testes travam: verificar que o parser acerta NÃO é verificar
// que a importação acerta.

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const TMP = fs.mkdtempSync('/tmp/fluxo-teste-import-');
process.env.FLUXO_DATA_DIR = path.join(TMP, 'data');
fs.mkdirSync(process.env.FLUXO_DATA_DIR, { recursive: true });

const DB_REAL = path.join(ROOT, 'data', 'fluxo.db');
const antes = fs.existsSync(DB_REAL) ? fs.statSync(DB_REAL) : null;

const { getDb, setSetting, ACTIVE_TX } = await import(path.join(ROOT, 'lib/db.js'));
const { importFile } = await import(path.join(ROOT, 'lib/importer.js'));
const { CAT } = await import(path.join(ROOT, 'lib/categories.js'));

let pass = 0;
const fails = [];
const eq = (nome, a, e) => {
  const A = typeof a === 'string' ? a : JSON.stringify(a);
  const E = typeof e === 'string' ? e : JSON.stringify(e);
  if (A === E) { pass++; return; }
  fails.push(`${nome}\n      esperado: ${E}\n      obtido:   ${A}`);
};
const ok = (nome, cond, detalhe = '') => {
  if (cond) { pass++; return; }
  fails.push(nome + (detalhe ? `\n      ${detalhe}` : ''));
};
const sec = (s) => console.log(`\n\x1b[1m${s}\x1b[0m`);

const db = getDb();
const buf = (s) => Buffer.from(s, 'utf8');
const contar = (sql, ...a) => db.prepare(sql).get(...a);

// ─────────────────────────────────────────────────────────────────────────────
sec('CSV brasileiro: a importação CATEGORIZA (regressão do t. × tx.)');

// Descrições escolhidas para casar com o dicionário BR: se o categorizador
// receber string vazia — o defeito nº 1 — tudo cai em "a revisar" e o teste
// falha apontando exatamente isso.
const CSV_BR = [
  'data;descricao;valor',
  '01/07/2026;SUPERMERCADO BOM PRECO;-150,00',
  '02/07/2026;UBER VIAGEM CENTRO;-32,50',
  '03/07/2026;NETFLIX.COM ASSINATURA;-39,90',
  '05/07/2026;SALARIO JULHO;5000,00',
  '06/07/2026;XPTO COISA DESCONHECIDA;-10,00',
].join('\n');

const r1 = await importFile('extrato.csv', buf(CSV_BR));
eq('importou as 5 linhas', r1.inserted, 5);

const porCat = Object.fromEntries(
  db.prepare('SELECT category, COUNT(*) n FROM transactions GROUP BY category')
    .all().map(r => [r.category, r.n]));

ok('supermercado → alimentação', porCat[CAT.FOOD] === 1, JSON.stringify(porCat));
ok('uber → transporte', porCat[CAT.TRANSPORT] === 1);
ok('netflix → assinaturas', porCat[CAT.SUBSCRIPTIONS] === 1);
ok('salário → renda', porCat[CAT.INCOME] === 1);
ok('desconhecido → a revisar', porCat[CAT.TO_REVIEW] === 1);
ok('NÃO caiu tudo em "a revisar" (o defeito nº 1)',
  (porCat[CAT.TO_REVIEW] || 0) === 1,
  `a revisar = ${porCat[CAT.TO_REVIEW]} de 5 — categorizador recebeu descrição vazia?`);
eq('o contador toReview do retorno confere', r1.toReview, 1);

// ─────────────────────────────────────────────────────────────────────────────
sec('Dicionário segue o idioma ESCOLHIDO NA TELA (regressão do dicionário congelado)');

// O locale vem do BANCO, não do .env: é o caminho de quem clica no seletor 🌐.
// Como os módulos já foram avaliados acima em pt-BR, é aqui que o defeito nº 2
// aparecia — o dicionário brasileiro continuava ativo numa instância argentina.
setSetting(db, 'locale', 'es-AR');

const CSV_AR = [
  'fecha;descripcion;importe',
  '01/08/2026;MONOTRIBUTO FISICAS;-63357,80',
  '02/08/2026;SUPER MAMI ALMACEN;-19804,00',
  '03/08/2026;CAPITALIZACION AH;0,09',
  '04/08/2026;EPEC FACTURA AGOSTO;-8500,00',
  '05/08/2026;YPF ESTACION SERVICIO;-12000,00',
].join('\n');

const r2 = await importFile('extracto.csv', buf(CSV_AR));
eq('importou as 5 linhas argentinas', r2.inserted, 5);

const arCat = (desc) => contar(
  'SELECT category FROM transactions WHERE description LIKE ?', `%${desc}%`)?.category;

eq('MONOTRIBUTO → financeiro', arCat('MONOTRIBUTO'), CAT.FINANCIAL);
eq('SUPER MAMI → comida', arCat('SUPER MAMI'), CAT.FOOD);
eq('CAPITALIZACION → renda (é juro de poupança, não transferência)',
  arCat('CAPITALIZACION'), CAT.INCOME);
eq('EPEC (luz de Córdoba) → moradia', arCat('EPEC'), CAT.HOUSING);
eq('YPF → transporte', arCat('YPF'), CAT.TRANSPORT);
ok('o dicionário argentino foi usado, não o brasileiro (o defeito nº 2)',
  contar(`SELECT COUNT(*) n FROM transactions
          WHERE category = ? AND description LIKE 'MONOTRIBUTO%'`, CAT.TO_REVIEW).n === 0);

// ─────────────────────────────────────────────────────────────────────────────
sec('Categoria "Transferências" liga a bandeira de transferência interna');

// Sem esta simetria não havia como ensinar ao app que um lançamento é dinheiro
// trocando de bolso: `transfer` só era escrito pelos parsers. O sintoma era duas
// telas discordando — o gráfico mudava de categoria e o total do mês não.
const antesTransfer = contar(
  'SELECT COUNT(*) n FROM transactions WHERE transfer = 1').n;

db.prepare(`UPDATE transactions SET category = ?, transfer = 1
            WHERE description LIKE '%CAPITALIZACION%'`).run(CAT.TRANSFERS);
const depoisTransfer = contar(
  'SELECT COUNT(*) n FROM transactions WHERE transfer = 1').n;
eq('marcar como transferência tira do total', depoisTransfer, antesTransfer + 1);

// E na PRÓXIMA importação a regra do usuário tem de valer sozinha
db.prepare('INSERT OR REPLACE INTO rules (pattern, category) VALUES (?, ?)')
  .run('COISA QUE EU DISSE QUE E TRANSFERENCIA', CAT.TRANSFERS);
const r3 = await importFile('outro.csv', buf([
  'fecha;descripcion;importe',
  '10/08/2026;COISA QUE EU DISSE QUE E TRANSFERENCIA;-1000,00',
].join('\n')));
eq('importou 1', r3.inserted, 1);
const nova = contar(
  'SELECT category, transfer FROM transactions WHERE description LIKE ?',
  '%QUE E TRANSFERENCIA%');
eq('regra do usuário aponta para Transferências', nova.category, CAT.TRANSFERS);
ok('…e a bandeira acompanha na importação', nova.transfer === 1,
  'sem isto a lição do usuário valeria só para o passado');

// ─────────────────────────────────────────────────────────────────────────────
sec('Deduplicação e integridade');

const totalAntes = contar('SELECT COUNT(*) n FROM transactions').n;
const rDup = await importFile('extrato.csv', buf(CSV_BR));
eq('reimportar o mesmo arquivo não insere nada', rDup.inserted, 0);
eq('…e conta todas como puladas', rDup.skipped, 5);
eq('total de transações não mudou',
  contar('SELECT COUNT(*) n FROM transactions').n, totalAntes);

ok('nenhuma transação com categoria inexistente',
  contar(`SELECT COUNT(*) n FROM transactions
          WHERE category NOT IN (SELECT key FROM categories)`).n === 0);
ok('todo lote tem transações ou zero declarado',
  db.prepare('SELECT id, inserted FROM batches').all().every(b =>
    contar('SELECT COUNT(*) n FROM transactions WHERE batch_id = ?', b.id).n === b.inserted));
eq('integridade do SQLite', db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');


// ─────────────────────────────────────────────────────────────────────────────
sec('Dividir lançamento: o total do app NÃO pode mudar');

// Esta é a invariante que justifica a coluna `has_children` e o `ACTIVE_TX`.
// Dividir é REORGANIZAR um gasto entre categorias — nunca criar nem sumir com
// dinheiro. Se alguma query esquecer de excluir o lançamento-pai, o valor conta
// duas vezes e o erro é invisível: o total só fica maior.
const somaTudo = () => contar(
  `SELECT COALESCE(SUM(amount_cents),0) n FROM transactions WHERE ${ACTIVE_TX}`).n;
const contaTudo = () => contar(
  `SELECT COUNT(*) n FROM transactions WHERE ${ACTIVE_TX}`).n;

await importFile('mercado.csv', buf([
  'data;descricao;valor',
  '10/07/2026;SUPERMERCADO DIVIDIR TESTE;-200,00',
].join('\n')));

const alvo = contar(
  "SELECT id, amount_cents FROM transactions WHERE description LIKE '%DIVIDIR TESTE%'");
const somaAntes = somaTudo();
const contaAntes = contaTudo();

// divide 200 em 150 (comida) + 50 (compras)
db.exec('BEGIN');
db.prepare(`INSERT INTO transactions
  (date, description, amount_cents, category, transfer, source, hash, parent_id)
  SELECT date, description, -15000, ?, 0, source, 'split:t:0', id FROM transactions WHERE id = ?`)
  .run(CAT.FOOD, alvo.id);
db.prepare(`INSERT INTO transactions
  (date, description, amount_cents, category, transfer, source, hash, parent_id)
  SELECT date, description, -5000, ?, 0, source, 'split:t:1', id FROM transactions WHERE id = ?`)
  .run(CAT.SHOPPING, alvo.id);
db.prepare('UPDATE transactions SET has_children = 1 WHERE id = ?').run(alvo.id);
db.exec('COMMIT');

eq('a soma de TODOS os lançamentos não mudou', somaTudo(), somaAntes);
eq('o pai saiu da contagem e entraram 2 partes', contaTudo(), contaAntes + 1);
ok('o pai não aparece mais nas listagens',
  contar(`SELECT COUNT(*) n FROM transactions WHERE ${ACTIVE_TX} AND id = ?`, alvo.id).n === 0);
ok('o pai continua no banco (guarda o hash da deduplicação)',
  contar('SELECT COUNT(*) n FROM transactions WHERE id = ?', alvo.id).n === 1);
eq('as partes somam o valor do original',
  contar('SELECT COALESCE(SUM(amount_cents),0) n FROM transactions WHERE parent_id = ?', alvo.id).n,
  alvo.amount_cents);

// Reimportar o mesmo arquivo NÃO pode trazer a compra de volta: é para isso que
// o pai continua existindo com o hash.
const rRe = await importFile('mercado.csv', buf([
  'data;descricao;valor',
  '10/07/2026;SUPERMERCADO DIVIDIR TESTE;-200,00',
].join('\n')));
eq('reimportar o arquivo do lançamento dividido não duplica', rRe.inserted, 0);
eq('e a soma segue igual', somaTudo(), somaAntes);

// desfaz
db.exec('BEGIN');
db.prepare('DELETE FROM transactions WHERE parent_id = ?').run(alvo.id);
db.prepare('UPDATE transactions SET has_children = 0 WHERE id = ?').run(alvo.id);
db.exec('COMMIT');
eq('desfazer a divisão devolve a contagem original', contaTudo(), contaAntes);
eq('e a soma continua a mesma', somaTudo(), somaAntes);

// ─────────────────────────────────────────────────────────────────────────────
sec('Nenhuma query esqueceu de excluir o lançamento-pai');

// Varredura estática: qualquer WHERE que filtre `deleted_at` sem `has_children`
// é um lugar onde um lançamento dividido contaria em dobro. Este teste existe
// porque o erro é silencioso — não quebra nada, só infla o número.
{
  const dirs = ['app', 'lib'];
  const suspeitas = [];
  const varrer = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { varrer(p); continue; }
      if (!e.name.endsWith('.js')) continue;
      const src = fs.readFileSync(p, 'utf8');
      src.split('\n').forEach((linha, i) => {
        if (!/deleted_at\s+IS\s+NULL/i.test(linha)) return;
        if (/ACTIVE_TX|has_children|^\s*[/*]/.test(linha)) return;
        suspeitas.push(`${path.relative(ROOT, p)}:${i + 1}`);
      });
    }
  };
  dirs.forEach(d => varrer(path.join(ROOT, d)));
  ok('nenhuma query filtra deleted_at sem ACTIVE_TX', suspeitas.length === 0,
    suspeitas.length ? `contariam em dobro: ${suspeitas.join(', ')}` : '');
}

// ─────────────────────────────────────────────────────────────────────────────
sec('Nenhuma soma cruza moeda');

// Mesma varredura estática do bloco acima, pela mesma razão: um SUM(amount_cents)
// que esqueça `BASE_CURRENCY` soma dólar com real e devolve um número plausível
// — 86,69 dólares viram 86,69 reais e ninguém percebe. Não quebra, não avisa,
// só mente.
{
  const suspeitas = [];
  const varrer = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { varrer(p); continue; }
      if (!e.name.endsWith('.js')) continue;
      const src = fs.readFileSync(p, 'utf8');
      // Só consultas que SOMAM. Listar sem o predicado é legítimo (a tela mostra
      // as duas moedas); somar sem ele nunca é.
      // `SUM\(\s*-?\s*amount_cents` era estreito demais: não pegava
      // `SUM(CASE WHEN amount_cents < 0 …)`, que é como a soma por categoria é
      // escrita. Aquela consulta ficou fora do teste desde o começo e passou
      // verde o tempo todo — um teste que não cobre o caso é indistinguível de
      // um teste que passa.
      for (const m of src.matchAll(/SUM\([^)]*amount_cents[\s\S]{0,400}?(?=`|;)/g)) {
        // Vale qualquer forma que RESTRINJA a moeda: o predicado compartilhado,
        // um `currency = ?` explícito (saldo de conta em moeda estrangeira) ou
        // um GROUP BY que separe as moedas no resultado. O que não vale é somar
        // sem mencionar moeda nenhuma.
        const restringe = /BASE_CURRENCY|FOREIGN_CURRENCY|currency\s*(=|IS)|GROUP BY[^`;]*currency/;
        if (!restringe.test(m[0])) {
          suspeitas.push(path.relative(ROOT, p));
        }
      }
    }
  };
  for (const d of ['app', 'lib']) varrer(path.join(ROOT, d));
  ok('nenhum SUM(amount_cents) sem o predicado de moeda',
    suspeitas.length === 0,
    suspeitas.length ? `somariam moedas diferentes: ${[...new Set(suspeitas)].join(', ')}` : '');
}

// ─────────────────────────────────────────────────────────────────────────────
sec('Dólar não entra no total de real');
{
  const antesReal = contar(
    `SELECT COALESCE(SUM(amount_cents),0) n FROM transactions WHERE ${ACTIVE_TX} AND currency IS NULL`).n;

  db.prepare(`INSERT INTO transactions
      (date, description, amount_cents, category, transfer, source, hash, currency)
    VALUES (?,?,?,?,0,?,?,?)`)
    .run('2026-07-15', 'COMPRA EM DOLAR', -1000, 'to_review', 'inter-global', 'usd-teste-1', 'USD');

  const depoisReal = contar(
    `SELECT COALESCE(SUM(amount_cents),0) n FROM transactions WHERE ${ACTIVE_TX} AND currency IS NULL`).n;
  eq('o total em moeda base não se mexe', depoisReal, antesReal);

  const emDolar = contar(
    `SELECT COALESCE(SUM(amount_cents),0) n FROM transactions WHERE ${ACTIVE_TX} AND currency = 'USD'`).n;
  eq('e o dólar é contado à parte', emDolar, -1000);

  db.prepare("DELETE FROM transactions WHERE hash = 'usd-teste-1'").run();
}

// ─────────────────────────────────────────────────────────────────────────────
sec('data/fluxo.db intacto');
const depois = fs.existsSync(DB_REAL) ? fs.statSync(DB_REAL) : null;
ok('o banco real não foi tocado',
  (antes === null && depois === null) ||
  (antes && depois && antes.size === depois.size && +antes.mtime === +depois.mtime));

fs.rmSync(TMP, { recursive: true, force: true });

console.log(`\n${'─'.repeat(72)}`);
if (fails.length) {
  console.log(`\x1b[31m${fails.length} falha(s)\x1b[0m de ${pass + fails.length} verificações:\n`);
  fails.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  process.exit(1);
}
console.log(`\x1b[32mtudo certo\x1b[0m — ${pass} verificações`);
