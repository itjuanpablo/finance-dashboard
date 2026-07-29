#!/usr/bin/env node
// Remapeia uma categoria customizada para uma chave canônica — e vice-versa.
//
// Para que serve: a migração v4 reconhece os nomes ORIGINAIS do Fluxo. Se você
// renomeou uma categoria antes disso (ex.: "Renda" → "Salário"), a migração não
// tinha como saber que era a mesma coisa e marcou como customizada. Funciona,
// mas a categoria perde o significado que o motor conhece: `income` é excluída
// das sugestões de meta e é o padrão do lançamento rápido de receita.
//
// Uso:
//   node scripts/remapear-categoria.mjs --listar
//   node scripts/remapear-categoria.mjs salario income
//   node scripts/remapear-categoria.mjs salario income --aplicar
//
// Sem --aplicar é ENSAIO: mostra o que mudaria e não grava nada.
// Com --aplicar, grava data/backups/fluxo-pre-remap-*.db antes de mexer.
//
// Por padrão o NOME que você escolheu é preservado (custom = 1): só o
// significado interno muda, a tela continua igual. Com --traduzir, a categoria
// volta a usar o nome do dicionário ("Renda" / "Ingresos").

import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const { getDb, backupDb, categoryRows } = await import(path.join(ROOT, 'lib/db.js'));
const { CANONICAL_KEYS, isCanonicalKey } = await import(path.join(ROOT, 'lib/categories.js'));

const args = process.argv.slice(2);
const aplicar = args.includes('--aplicar');
const traduzir = args.includes('--traduzir');
const [de, para] = args.filter(a => !a.startsWith('--'));
const db = getDb();

const contar = (key) => ({
  transactions: db.prepare(
    'SELECT COUNT(*) n FROM transactions WHERE category = ?').get(key).n,
  rules: db.prepare('SELECT COUNT(*) n FROM rules WHERE category = ?').get(key).n,
  goals: db.prepare('SELECT COUNT(*) n FROM goals WHERE category = ?').get(key).n,
  bills: db.prepare('SELECT COUNT(*) n FROM bills WHERE category = ?').get(key).n,
});

if (args.includes('--listar') || !de || !para) {
  console.log('Categorias no banco:\n');
  console.log('  chave              tipo     nome         exibido      tx');
  for (const c of categoryRows(db, { includeArchived: true })) {
    console.log(`  ${c.key.padEnd(18)} ${(c.custom ? 'custom' : 'canônica').padEnd(8)} ` +
      `${String(c.name).padEnd(12)} ${String(c.label).padEnd(12)} ${contar(c.key).transactions}`);
  }
  console.log('\nChaves canônicas disponíveis:');
  console.log('  ' + [...CANONICAL_KEYS].join(', '));
  console.log('\nUso: node scripts/remapear-categoria.mjs <de> <para> [--aplicar]');
  process.exit(0);
}

const origem = db.prepare('SELECT * FROM categories WHERE key = ?').get(de);
if (!origem) {
  console.error(`✗ não existe categoria com a chave '${de}'. Rode com --listar.`);
  process.exit(1);
}
const destino = db.prepare('SELECT * FROM categories WHERE key = ?').get(para);

// Destino canônico já existente E com dados: fundir exigiria decidir o que
// fazer com metas duplicadas. Prefiro parar e deixar a decisão com quem sabe.
if (destino) {
  const d = contar(para);
  const total = d.transactions + d.rules + d.goals + d.bills;
  if (total > 0) {
    console.error(
      `✗ a chave '${para}' já existe e tem dados (${d.transactions} tx, ${d.rules} regras, ` +
      `${d.goals} metas, ${d.bills} contas). Fundir duas categorias com dados não é\n` +
      '  automático — mova as transações pela tela de Gerenciar › Categorias e rode de novo.');
    process.exit(1);
  }
}
if (!isCanonicalKey(para) && !destino) {
  console.error(`✗ '${para}' não é chave canônica nem categoria existente.`);
  process.exit(1);
}

const antes = contar(de);
console.log(`${aplicar ? 'APLICANDO' : 'ENSAIO (nada será gravado)'}\n`);
console.log(`  ${de} → ${para}`);
const novoCustom = traduzir ? 0 : 1;
console.log(`  nome final: ${traduzir ? 'do dicionário (--traduzir)' : `"${origem.name}" (preservado)`}`);
console.log(`  registros a reapontar: ${antes.transactions} transações, ${antes.rules} regras, ` +
  `${antes.goals} metas, ${antes.bills} contas a pagar`);

if (!aplicar) {
  console.log('\nRode de novo com --aplicar para gravar.');
  process.exit(0);
}

// backupDb devolve { path, error } desde a correção do backup silencioso:
// agora dá para dizer POR QUE falhou, em vez de só "falhou".
const copia = backupDb(db, 'pre-remap');
console.log(`\n  backup: ${copia.path || `(falhou: ${copia.error} — abortando)`}`);
if (!copia.path) process.exit(1);

db.exec('BEGIN');
try {
  if (destino) {
    // destino existe e está vazio: reaponta os dados e remove a origem
    for (const tb of ['transactions', 'rules', 'goals', 'bills']) {
      db.prepare(`UPDATE ${tb} SET category = ? WHERE category = ?`).run(para, de);
    }
    // preserva a escolha de nome/cor/emoji do usuário no destino canônico
    db.prepare('UPDATE categories SET name = ?, color = ?, emoji = ?, custom = ? WHERE key = ?')
      .run(origem.name, origem.color, origem.emoji, novoCustom, para);
    db.prepare('DELETE FROM categories WHERE key = ?').run(de);
  } else {
    // destino não existe: só troca a chave da própria linha
    db.prepare('UPDATE categories SET key = ?, custom = ? WHERE key = ?')
      .run(para, isCanonicalKey(para) ? novoCustom : 1, de);
    for (const tb of ['transactions', 'rules', 'goals', 'bills']) {
      db.prepare(`UPDATE ${tb} SET category = ? WHERE category = ?`).run(para, de);
    }
  }
  db.exec('COMMIT');
} catch (e) {
  db.exec('ROLLBACK');
  console.error(`✗ falhou, nada foi alterado: ${e.message}`);
  process.exit(1);
}

const depois = contar(para);
const ok = depois.transactions === antes.transactions
  && depois.rules === antes.rules
  && depois.goals === antes.goals;
console.log(`  depois: ${depois.transactions} transações, ${depois.rules} regras, ` +
  `${depois.goals} metas em '${para}'`);
console.log(ok ? '\nOK — remapeado, nada perdido.' : '\n✗ contagem não fechou; restaure o backup.');
process.exit(ok ? 0 : 1);
