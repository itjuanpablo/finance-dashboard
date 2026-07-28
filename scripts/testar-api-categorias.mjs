#!/usr/bin/env node
// Teste executável das rotas de categoria no contrato v4 (chave estável).
// Sem framework: é só Node + asserções explícitas. Exit code 1 se algo falhar.
//
//   node scripts/testar-api-categorias.mjs
//
// Roda sempre sobre uma CÓPIA do banco em /tmp (FLUXO_DATA_DIR). data/fluxo.db
// nunca é aberto para escrita — só lido para a cópia — e o tamanho/mtime dele é
// conferido no fim, para o teste denunciar se algum dia alguém errar o caminho.

import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

const ROOT = path.resolve(import.meta.dirname, '..');
const ROOT_URL = pathToFileURL(ROOT + '/').href;
const SRC_DB = path.join(ROOT, 'data', 'fluxo.db');

// ── sandbox ────────────────────────────────────────────────────────────────
const TMP = fs.mkdtempSync('/tmp/fluxo-teste-api-');
const DATA = path.join(TMP, 'data');
fs.mkdirSync(DATA, { recursive: true });
if (!DATA.startsWith('/tmp/')) throw new Error('sandbox fora de /tmp — abortando');

// Cópia do banco real quando existe (exercita também a migração v3 → v4).
// db + -wal, sem -shm: o SQLite reconstrói o shm a partir do wal ao abrir.
const srcStat = fs.existsSync(SRC_DB) ? fs.statSync(SRC_DB) : null;
if (srcStat) {
  fs.copyFileSync(SRC_DB, path.join(DATA, 'fluxo.db'));
  if (fs.existsSync(SRC_DB + '-wal')) {
    fs.copyFileSync(SRC_DB + '-wal', path.join(DATA, 'fluxo.db-wal'));
  }
}
process.env.FLUXO_DATA_DIR = DATA;

// ── carregamento dos módulos do app ────────────────────────────────────────
// As rotas usam o alias `@/…` do jsconfig.json e `next/server`, que o Node não
// resolve sozinho. Um hook de resolução de ~8 linhas evita ter que subir o Next
// só para testar — e garante que o teste exercita a ROTA de verdade, não uma
// reimplementação da lógica dentro do teste.
register('data:text/javascript,' + encodeURIComponent(`
  import { existsSync } from 'node:fs';
  import { fileURLToPath } from 'node:url';
  const ROOT = ${JSON.stringify(ROOT_URL)};
  export function resolve(spec, ctx, next) {
    if (spec === 'next/server') return next('next/server.js', ctx);
    if (spec.startsWith('@/')) {
      const p = ROOT + spec.slice(2);
      if (/\\.(js|mjs|json)$/.test(p)) return next(p, ctx);
      // o webpack do Next resolve pasta por index.js ('@/lib/i18n'); o Node não
      if (existsSync(fileURLToPath(p + '/index.js'))) return next(p + '/index.js', ctx);
      return next(p + '.js', ctx);
    }
    return next(spec, ctx);
  }
`));

const cats = await import(path.join(ROOT, 'app/api/categories/route.js'));
const txRoute = await import(path.join(ROOT, 'app/api/transactions/route.js'));
const rulesRoute = await import(path.join(ROOT, 'app/api/rules/route.js'));
const { getDb } = await import(path.join(ROOT, 'lib/db.js'));
const { CAT, SYSTEM_CATEGORIES, isCanonicalKey } =
  await import(path.join(ROOT, 'lib/categories.js'));

const db = getDb();

// ── utilitários ────────────────────────────────────────────────────────────
const json = (body) => new Request('http://local/api/categories', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
const call = async (handler, body) => {
  const res = await handler(json(body));
  return { status: res.status, body: await res.json() };
};
const listCats = async () => (await (await cats.GET()).json()).categories;
const byKey = async (key) => (await listCats()).find(c => c.key === key);

let falhas = 0;
const ok = (cond, msg, detalhe) => {
  if (cond) { console.log(`  ok   ${msg}`); return true; }
  falhas++;
  console.error(`  FALHA ${msg}${detalhe !== undefined ? ` → ${JSON.stringify(detalhe)}` : ''}`);
  return false;
};
const secao = (s) => console.log(`\n${s}`);

// snapshot id → category de todas as transações (para provar que nada mexeu)
const snapshotTx = () => new Map(
  db.prepare('SELECT id, category FROM transactions').all().map(r => [r.id, r.category]));
const diffTx = (a, b) => {
  const d = [];
  for (const [id, c] of a) if (b.get(id) !== c) d.push({ id, de: c, para: b.get(id) });
  for (const [id, c] of b) if (!a.has(id)) d.push({ id, de: null, para: c });
  return d;
};
const txTotal = () => db.prepare('SELECT COUNT(*) AS n FROM transactions').get().n;
const inserirTx = (categoria, quantas) => {
  const st = db.prepare(`INSERT INTO transactions
    (date, description, amount_cents, category, transfer, source, hash)
    VALUES (?, ?, ?, ?, 0, 'teste', ?)`);
  for (let i = 0; i < quantas; i++) {
    st.run('2026-03-1' + (i % 9), `teste ${i}`, -1000 - i, categoria, `teste:${randomUUID()}`);
  }
};

console.log(`sandbox: ${DATA}${srcStat ? ' (cópia de data/fluxo.db)' : ' (banco novo)'}`);
const totalInicial = txTotal();

// ── 1. contrato do GET ─────────────────────────────────────────────────────
secao('1. GET /api/categories devolve o contrato v4');
{
  const lista = await listCats();
  ok(lista.length > 0, 'devolve categorias', lista.length);
  const campos = ['id', 'key', 'name', 'label', 'color', 'emoji', 'archived',
    'sort_order', 'custom', 'system', 'txCount', 'monthlyAvg', 'rulesCount'];
  const faltando = lista.flatMap(c => campos.filter(f => c[f] === undefined).map(f => `${c.key}.${f}`));
  ok(faltando.length === 0, 'todo campo do contrato presente', faltando);
  ok(lista.every(c => c.key), 'toda categoria tem chave');
  ok(new Set(lista.map(c => c.key)).size === lista.length, 'chaves são únicas');
  ok(lista.every(c => c.label && String(c.label).trim()), 'label sempre preenchido');
  const sist = lista.filter(c => c.system).map(c => c.key).sort();
  ok(JSON.stringify(sist) === JSON.stringify([...SYSTEM_CATEGORIES].sort()),
    'system marcado por chave', sist);
  // estatística tem que bater com o agregado por chave, não por nome
  const food = lista.find(c => c.key === CAT.FOOD);
  const esperado = db.prepare(
    'SELECT COUNT(*) AS n FROM transactions WHERE category = ? AND deleted_at IS NULL')
    .get(CAT.FOOD).n;
  ok(food && food.txCount === esperado, 'txCount agregado por chave', [food?.txCount, esperado]);
}

// ── 2. mapas de apoio das transações são indexados por chave ───────────────
secao('2. GET /api/transactions indexa cores e emojis por chave');
{
  const payload = await (await txRoute.GET()).json();
  const chaves = new Set((await listCats()).map(c => c.key));
  const cor = Object.keys(payload.categories);
  const emo = Object.keys(payload.categoryEmojis);
  ok(cor.length > 0 && cor.every(k => chaves.has(k)), 'categories é chave → cor', cor.slice(0, 3));
  ok(emo.length > 0 && emo.every(k => chaves.has(k)), 'categoryEmojis é chave → emoji', emo.slice(0, 3));
  ok(payload.transactions.every(t => chaves.has(t.category) || t.category),
    'transactions.category é chave');
}

// ── 3. criar categoria customizada ─────────────────────────────────────────
secao('3. POST cria categoria do usuário com chave derivada do nome');
let idDizimo;
{
  const r = await call(cats.POST, { name: 'Dízimo do Mês', color: '#123456', emoji: '🙏' });
  ok(r.status === 200 && r.body.ok, 'criada', r);
  ok(r.body.key === 'dizimo-do-mes', 'chave é o slug do nome', r.body.key);
  const c = await byKey('dizimo-do-mes');
  idDizimo = c?.id;
  ok(c?.custom === 1, 'marcada como custom', c?.custom);
  ok(c?.label === 'Dízimo do Mês', 'label é o nome digitado (não traduzido)', c?.label);
  ok(c?.system === false, 'não é de sistema');
}

secao('4. POST rejeita colisão de chave e de nome exibido');
{
  const r1 = await call(cats.POST, { name: 'dizimo do mes', color: '#abcdef' });
  ok(r1.status === 409, 'colisão de chave (mesmo slug) → 409', r1.status);

  // colidir com o LABEL de uma canônica: em es-AR o label difere de name, então
  // comparar só contra categories.name deixaria passar duas "Comida".
  const canon = (await listCats()).find(c => isCanonicalKey(c.key) && !c.system);
  const r2 = await call(cats.POST, { name: canon.label.toUpperCase(), color: '#abcdef' });
  ok(r2.status === 409, `colisão com o label de "${canon.key}" → 409`, r2.status);

  const r3 = await call(cats.POST, { name: 'X', color: '#abcdef' });
  ok(r3.status === 400, 'nome curto → 400', r3.status);
  const r4 = await call(cats.POST, { name: 'Sem Cor', color: 'azul' });
  ok(r4.status === 400, 'cor inválida → 400', r4.status);
}

// ── 5. renomear canônica: vira custom, chave intacta, dado intacto ─────────
secao('5. PATCH renomeando canônica mantém a chave e não toca em transação');
{
  inserirTx(CAT.FOOD, 3);
  const antes = snapshotTx();
  const food = await byKey(CAT.FOOD);
  const nomeAntigo = food.name;
  const idAntigo = food.id;

  const r = await call(cats.PATCH, { id: food.id, name: 'Rango' });
  ok(r.status === 200, 'renomeada', r);

  const depois = await byKey(CAT.FOOD);
  ok(!!depois, 'a chave food continua existindo');
  ok(depois?.id === idAntigo, 'mesma linha (id preservado)', [idAntigo, depois?.id]);
  ok(depois?.name === 'Rango', 'name é o nome digitado', depois?.name);
  ok(depois?.custom === 1, 'canônica renomeada vira custom = 1', depois?.custom);
  ok(depois?.label === 'Rango', 'label deixa de ser traduzido', depois?.label);
  ok(nomeAntigo !== 'Rango', 'o nome realmente mudou', nomeAntigo);

  const d = diffTx(antes, snapshotTx());
  ok(d.length === 0, 'nenhuma transação alterada pela renomeação', d.slice(0, 5));
  const semChave = db.prepare(
    'SELECT COUNT(*) AS n FROM transactions WHERE category = ?').get('Rango').n;
  ok(semChave === 0, 'nada passou a apontar para o nome novo', semChave);
  const emRegras = db.prepare('SELECT COUNT(*) AS n FROM rules WHERE category = ?').get('Rango').n
    + db.prepare('SELECT COUNT(*) AS n FROM goals WHERE category = ?').get('Rango').n;
  ok(emRegras === 0, 'nenhuma regra/meta alterada pela renomeação', emRegras);
}

// ── 6. categoria de sistema é intocável (por CHAVE) ────────────────────────
secao('6. PATCH/DELETE em categoria de sistema falham');
{
  const rev = await byKey(CAT.TO_REVIEW);
  ok(!!rev, 'to_review existe');
  const r1 = await call(cats.PATCH, { id: rev.id, name: 'Pendentes' });
  ok(r1.status === 400, 'renomear → 400', r1);
  const r2 = await call(cats.PATCH, { id: rev.id, archived: 1 });
  ok(r2.status === 400, 'arquivar → 400', r2);
  const r3 = await call(cats.DELETE, { id: rev.id, moveTo: CAT.LEISURE });
  ok(r3.status === 400, 'excluir → 400', r3);
  const ainda = await byKey(CAT.TO_REVIEW);
  ok(ainda && ainda.name === rev.name && ainda.archived === rev.archived,
    'to_review saiu ilesa', ainda);

  // cor e emoji continuam editáveis: o bloqueio é sobre identidade, não estética
  const r4 = await call(cats.PATCH, { id: rev.id, color: '#010203' });
  ok(r4.status === 200 && (await byKey(CAT.TO_REVIEW)).color === '#010203',
    'cor de categoria de sistema ainda é editável', r4);
}

// ── 7. excluir categoria com transações movendo para outra CHAVE ───────────
secao('7. DELETE move transações e regras para a chave de destino');
{
  const criada = await call(cats.POST, { name: 'Categoria Temporária', color: '#ff00ff' });
  const chave = criada.body.key;
  const cat = await byKey(chave);
  inserirTx(chave, 5);
  db.prepare('INSERT INTO rules (pattern, category) VALUES (?, ?)').run('padrao-teste', chave);
  db.prepare('INSERT INTO goals (category, limit_cents) VALUES (?, ?)').run(chave, 50000);

  const totalAntes = txTotal();
  const destinoAntes = db.prepare(
    'SELECT COUNT(*) AS n FROM transactions WHERE category = ?').get(CAT.LEISURE).n;

  const semDestino = await call(cats.DELETE, { id: cat.id });
  ok(semDestino.status === 400, 'sem moveTo e com transações → 400', semDestino.status);
  ok(!!(await byKey(chave)), 'categoria continua lá depois do 400');

  const nomeComoDestino = await call(cats.DELETE, { id: cat.id, moveTo: 'Lazer' });
  ok(nomeComoDestino.status === 400, 'moveTo com NOME em vez de chave → 400', nomeComoDestino.status);

  const r = await call(cats.DELETE, { id: cat.id, moveTo: CAT.LEISURE });
  ok(r.status === 200 && r.body.moved === 5, 'excluída movendo 5 transações', r.body);
  ok(!(await byKey(chave)), 'categoria sumiu da listagem');
  ok(txTotal() === totalAntes, 'nenhuma transação foi perdida', [txTotal(), totalAntes]);
  const destinoDepois = db.prepare(
    'SELECT COUNT(*) AS n FROM transactions WHERE category = ?').get(CAT.LEISURE).n;
  ok(destinoDepois === destinoAntes + 5, 'as 5 transações estão no destino',
    [destinoAntes, destinoDepois]);
  ok(db.prepare('SELECT COUNT(*) AS n FROM transactions WHERE category = ?').get(chave).n === 0,
    'nada aponta mais para a chave excluída');
  const regra = db.prepare('SELECT category FROM rules WHERE pattern = ?').get('padrao-teste');
  ok(regra?.category === CAT.LEISURE, 'regra migrou para a chave de destino', regra);
  ok(db.prepare('SELECT COUNT(*) AS n FROM goals WHERE category = ?').get(chave).n === 0,
    'meta da categoria excluída foi removida');
  db.prepare('DELETE FROM rules WHERE pattern = ?').run('padrao-teste');
}

// ── 8. excluir categoria vazia apaga as regras órfãs ──────────────────────
secao('8. DELETE de categoria sem transações remove as regras dela');
{
  const criada = await call(cats.POST, { name: 'Vazia Teste', color: '#00ff00' });
  const chave = criada.body.key;
  const cat = await byKey(chave);
  db.prepare('INSERT INTO rules (pattern, category) VALUES (?, ?)').run('padrao-vazio', chave);
  const r = await call(cats.DELETE, { id: cat.id });
  ok(r.status === 200 && r.body.moved === 0, 'excluída sem destino', r.body);
  ok(db.prepare('SELECT COUNT(*) AS n FROM rules WHERE pattern = ?').get('padrao-vazio').n === 0,
    'regra órfã removida');
}

// ── 9. regra retroativa só pega o que está em CAT.TO_REVIEW ───────────────
secao('9. POST /api/rules recategoriza apenas a chave to_review');
{
  inserirTx(CAT.TO_REVIEW, 2);
  db.prepare("UPDATE transactions SET description = 'MERCADINHO ALFA' WHERE category = ? AND source = 'teste'")
    .run(CAT.TO_REVIEW);
  const pendentes = db.prepare(
    "SELECT COUNT(*) AS n FROM transactions WHERE category = ? AND description LIKE '%MERCADINHO ALFA%'")
    .get(CAT.TO_REVIEW).n;
  const r = await call(rulesRoute.POST,
    { pattern: 'MERCADINHO ALFA', category: CAT.FOOD, apply: true });
  ok(r.status === 200, 'regra criada', r);
  ok(r.body.applied === pendentes, `aplicou nas ${pendentes} pendentes`, r.body);
  ok(db.prepare(
    "SELECT COUNT(*) AS n FROM transactions WHERE category = ? AND description LIKE '%MERCADINHO ALFA%'")
    .get(CAT.TO_REVIEW).n === 0, 'não sobrou pendente com esse padrão');
  db.prepare('DELETE FROM rules WHERE pattern = ?').run('MERCADINHO ALFA');
}

// ── 10. o banco de produção não foi tocado ────────────────────────────────
secao('10. data/fluxo.db intacto');
{
  if (srcStat) {
    const agora = fs.statSync(SRC_DB);
    ok(agora.size === srcStat.size && agora.mtimeMs === srcStat.mtimeMs,
      'tamanho e mtime de data/fluxo.db inalterados',
      [srcStat.size, agora.size, srcStat.mtimeMs, agora.mtimeMs]);
  } else {
    ok(!fs.existsSync(SRC_DB), 'data/fluxo.db não foi criado pelo teste');
  }
  ok(txTotal() >= totalInicial, 'contagem de transações fecha', [totalInicial, txTotal()]);
}

// ── fim ───────────────────────────────────────────────────────────────────
db.close?.();
fs.rmSync(TMP, { recursive: true, force: true });
console.log(falhas === 0
  ? '\nOK — todos os testes passaram.'
  : `\nFALHOU — ${falhas} asserção(ões).`);
process.exit(falhas === 0 ? 0 : 1);
