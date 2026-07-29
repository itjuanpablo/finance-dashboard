#!/usr/bin/env node
// Testes das correções da auditoria v4.1: `node scripts/testar-correcoes.mjs`
// Sem framework — só Node e asserções explícitas. Exit 1 se algo falhar.
//
// Roda sempre sobre um banco DESCARTÁVEL em /tmp (FLUXO_DATA_DIR). data/fluxo.db
// é apenas COPIADO, e o tamanho/mtime dele é conferido no fim: se algum dia
// alguém errar o caminho, o teste denuncia em vez de estragar o banco de verdade.
//
// O que está sendo protegido, por que cada coisa importa em dinheiro:
//
//  1. PARCELAS FUTURAS. A projeção ancorava em `date` (data da COMPRA, repetida
//     em todas as parcelas) somando 1 mês, então os meses caíam no passado e o
//     filtro os descartava: o painel subestimava o compromisso já contratado.
//     Aqui a mesma lógica do dashboard roda sobre fixture sintético com resposta
//     conhecida na mão — incluindo o caso da contagem dupla, que é o erro que
//     inflaria o número no sentido oposto.
//  2. DATA LOCAL vs UTC. `toISOString()` em UTC−3 depois das 21h já é amanhã.
//     O teste fixa TZ=America/Sao_Paulo e 23h30 para provar que o helper devolve
//     o dia LOCAL — é o que decide "vence hoje" e o mês do relatório.
//  3. busy_timeout. Com dev na 3000 e serviço na 3210 no mesmo arquivo, 0 dá
//     SQLITE_BUSY na hora, no meio de uma importação.
//  4. ÍNDICES. Confere com EXPLAIN QUERY PLAN que as três consultas quentes
//     usam índice em vez de varrer a tabela.
//  5. VALIDAÇÃO do PUT /api/bills. FK ligada + id inexistente = 500 com stack.
//  6. BACKUP. Falha visível (não `catch { return null }`) e nome com segundos,
//     senão cinco arquivos importados juntos geram um backup só.
//
// Este arquivo se reexecuta com TZ=America/Sao_Paulo se não estiver nesse fuso:
// o teste de data precisa de um fuso negativo para ter sentido.

import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const TZ_ALVO = 'America/Sao_Paulo';
if (process.env.TZ !== TZ_ALVO) {
  // Reexecuta em UTC−3: sem fuso negativo o teste de data passaria por acidente
  // em qualquer máquina configurada em UTC.
  const r = spawnSync(process.execPath, [import.meta.filename], {
    stdio: 'inherit',
    env: { ...process.env, TZ: TZ_ALVO },
  });
  process.exit(r.status ?? 1);
}

const ROOT = path.resolve(import.meta.dirname, '..');
const ROOT_URL = pathToFileURL(ROOT + '/').href;
const SRC_DB = path.join(ROOT, 'data', 'fluxo.db');

// ── sandbox ────────────────────────────────────────────────────────────────
const TMP = fs.mkdtempSync('/tmp/fluxo-teste-correcoes-');
const DATA = path.join(TMP, 'data');
fs.mkdirSync(DATA, { recursive: true });
if (!DATA.startsWith('/tmp/')) throw new Error('sandbox fora de /tmp — abortando');

const srcStat = fs.existsSync(SRC_DB) ? fs.statSync(SRC_DB) : null;
if (srcStat) {
  // db + -wal, sem -shm: o SQLite reconstrói o shm a partir do wal ao abrir
  fs.copyFileSync(SRC_DB, path.join(DATA, 'fluxo.db'));
  if (fs.existsSync(SRC_DB + '-wal')) {
    fs.copyFileSync(SRC_DB + '-wal', path.join(DATA, 'fluxo.db-wal'));
  }
}
process.env.FLUXO_DATA_DIR = DATA;

// Mesmo hook de ~8 linhas dos outros testes: as rotas usam o alias `@/…` do
// jsconfig e `next/server`, que o Node não resolve sozinho. Assim o teste
// exercita a ROTA de verdade, não uma reimplementação da lógica.
register('data:text/javascript,' + encodeURIComponent(`
  import { existsSync } from 'node:fs';
  import { fileURLToPath } from 'node:url';
  const ROOT = ${JSON.stringify(ROOT_URL)};
  export function resolve(spec, ctx, next) {
    if (spec === 'next/server') return next('next/server.js', ctx);
    if (spec.startsWith('@/')) {
      const p = ROOT + spec.slice(2);
      if (/\\.(js|mjs|json)$/.test(p)) return next(p, ctx);
      if (existsSync(fileURLToPath(p + '/index.js'))) return next(p + '/index.js', ctx);
      return next(p + '.js', ctx);
    }
    return next(spec, ctx);
  }
`));

const { getDb, backupDb, dataDir } = await import(path.join(ROOT, 'lib/db.js'));
const { localIsoDate, localIsoMonth, computeInsights } =
  await import(path.join(ROOT, 'lib/insights.js'));
const { installmentOf, stripInstallment } =
  await import(path.join(ROOT, 'lib/parsers/labels.js'));
const billsRoute = await import(path.join(ROOT, 'app/api/bills/route.js'));
const batchesRoute = await import(path.join(ROOT, 'app/api/batches/route.js'));
const txRoute = await import(path.join(ROOT, 'app/api/transactions/route.js'));
const { CAT } = await import(path.join(ROOT, 'lib/categories.js'));

const db = getDb();

// ── utilitários ────────────────────────────────────────────────────────────
let falhas = 0;
const ok = (cond, msg, detalhe) => {
  if (cond) { console.log(`  ok   ${msg}`); return true; }
  falhas++;
  console.error(`  FALHA ${msg}${detalhe !== undefined ? ` → ${JSON.stringify(detalhe)}` : ''}`);
  return false;
};
const eq = (a, e, msg) => ok(
  JSON.stringify(a) === JSON.stringify(e), msg, { obtido: a, esperado: e });
const secao = (s) => console.log(`\n${s}`);
const req = (url, body, method = 'POST') => new Request(url, {
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});
const call = async (handler, body, url = 'http://local/api/x', method = 'POST') => {
  const res = await handler(req(url, body, method));
  return { status: res.status, body: await res.json() };
};

console.log(`TZ=${process.env.TZ} · sandbox: ${DATA}${srcStat ? ' (cópia de data/fluxo.db)' : ' (banco novo)'}`);

// ═══════════════════════════════════════════════════════════════════════════
// 1. PARCELAS FUTURAS — a correção mais cara da lista
// ═══════════════════════════════════════════════════════════════════════════
//
// Réplica EXATA do cálculo de app/page.js. Fica duplicada aqui de propósito: o
// dashboard é componente cliente com hooks do React, e subir React só para
// testar aritmética sairia mais caro do que manter 20 linhas em sincronia. Se
// alguém mexer numa das duas cópias sem mexer na outra, é este teste que
// denuncia — os números conferidos abaixo são calculados na mão.
const addMonths = (ym, k) => {
  const y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + k;
  return `${y + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}`;
};

function projetarParcelas(txs, nowYm) {
  const perPurchase = new Map();
  for (const tx of txs) {
    const parc = installmentOf(tx.description);
    if (!parc || tx.amount_cents >= 0) continue;
    const key = `${tx.date}|${stripInstallment(tx.description).toLowerCase()}|${parc.total}`;
    const cur = perPurchase.get(key);
    if (!cur || parc.n > cur.parc.n) perPurchase.set(key, { tx, parc });
  }
  const map = {};
  let approx = 0;
  for (const { tx, parc } of perPurchase.values()) {
    const anchor = tx.invoice_ref || addMonths(tx.date.slice(0, 7), parc.n);
    if (!tx.invoice_ref) approx++;
    for (let k = 1; k <= parc.total - parc.n; k++) {
      const ym = addMonths(anchor, k);
      if (ym <= nowYm) continue;
      map[ym] = map[ym] || { cents: 0, n: 0 };
      map[ym].cents += -tx.amount_cents;
      map[ym].n++;
    }
  }
  return {
    months: Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).slice(0, 4),
    approx,
  };
}

/** Como era antes da correção — só para PROVAR que o número mudou. */
function projetarAntigo(txs, nowYm) {
  const map = {};
  for (const tx of txs) {
    const parc = installmentOf(tx.description);
    if (!parc || tx.amount_cents >= 0) continue;
    for (let k = 1; k <= parc.total - parc.n; k++) {
      const ym = addMonths(tx.date.slice(0, 7), k);
      if (ym <= nowYm) continue;
      map[ym] = map[ym] || { cents: 0, n: 0 };
      map[ym].cents += -tx.amount_cents;
      map[ym].n++;
    }
  }
  return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).slice(0, 4);
}

secao('1. Parcelas futuras — fixture sintético (dados inventados)');
{
  // GELADEIRA 6x de R$ 300,00, comprada em 2026-01-10. As duas primeiras
  // parcelas já vieram em fatura: competências 2026-02 e 2026-03.
  // "Hoje" = 2026-03. Faltam 4 parcelas: 04, 05, 06 e 07 de 2026.
  // Resposta na mão: 4 meses × R$ 300,00 = R$ 1.200,00, uma parcela por mês.
  const geladeira = [
    { date: '2026-01-10', description: 'LOJA X GELADEIRA (parcela 1/6)', amount_cents: -30000, invoice_ref: '2026-02' },
    { date: '2026-01-10', description: 'LOJA X GELADEIRA (parcela 2/6)', amount_cents: -30000, invoice_ref: '2026-03' },
  ];
  const r = projetarParcelas(geladeira, '2026-03');
  eq(r.months.map(([ym, f]) => [ym, f.cents, f.n]), [
    ['2026-04', 30000, 1], ['2026-05', 30000, 1],
    ['2026-06', 30000, 1], ['2026-07', 30000, 1],
  ], 'âncora em invoice_ref: 4 parcelas de R$ 300 nos 4 meses seguintes');
  eq(r.approx, 0, 'nenhuma linha estimada (todas têm invoice_ref)');

  const totalNovo = r.months.reduce((s, [, f]) => s + f.cents, 0);
  eq(totalNovo, 120000, 'total futuro = R$ 1.200,00, conferido na mão');

  // O cálculo antigo errava por DOIS caminhos ao mesmo tempo, e é por isso que
  // não dá para dizer "subestima X%" em geral: o sinal do erro depende dos dados.
  //   · ancorando em compra + 1, os meses caem no passado e o filtro os joga
  //     fora — a última parcela simplesmente desaparece do painel;
  //   · projetando a partir de TODA parcela importada, os meses que sobram são
  //     contados uma vez por parcela — inflados.
  const antigo = projetarAntigo(geladeira, '2026-03');
  const mesesAntigos = new Set(antigo.map(([ym]) => ym));
  ok(!mesesAntigos.has('2026-07'),
    'cálculo antigo perdia a última parcela (2026-07 nem aparecia)', antigo);
  const abr = Object.fromEntries(antigo)['2026-04'];
  ok(abr?.cents === 60000 && abr?.n === 2,
    'cálculo antigo contava a MESMA compra duas vezes em 2026-04 (R$ 600 de R$ 300)', abr);
  const totalAntigo = antigo.reduce((s, [, f]) => s + f.cents, 0);
  ok(totalAntigo !== totalNovo,
    `número muda: antes R$ ${(totalAntigo / 100).toFixed(2)}, depois R$ ${(totalNovo / 100).toFixed(2)}`,
    { antigo, novo: r.months });
}

secao('2. Parcelas futuras — a mesma compra não é contada duas vezes');
{
  // NOTEBOOK 3x de R$ 1.000,00 comprado em 2026-05-02, duas parcelas já em
  // fatura (2026-06 e 2026-07). "Hoje" = 2026-07. Falta UMA parcela, em 2026-08:
  // R$ 1.000,00. Projetar a partir das duas linhas contaria R$ 2.000,00 — o
  // dobro do compromisso real, que é o erro que a versão ingênua comete.
  const notebook = [
    { date: '2026-05-02', description: 'LOJA Y NOTEBOOK (parcela 1/3)', amount_cents: -100000, invoice_ref: '2026-06' },
    { date: '2026-05-02', description: 'LOJA Y NOTEBOOK (parcela 2/3)', amount_cents: -100000, invoice_ref: '2026-07' },
  ];
  const r = projetarParcelas(notebook, '2026-07');
  eq(r.months.map(([ym, f]) => [ym, f.cents, f.n]), [['2026-08', 100000, 1]],
    'uma parcela de R$ 1.000 em 2026-08, não duas');

  // duas compras DIFERENTES na mesma loja não podem ser fundidas
  const duas = [
    ...notebook,
    { date: '2026-06-02', description: 'LOJA Y NOTEBOOK (parcela 1/3)', amount_cents: -100000, invoice_ref: '2026-07' },
  ];
  const r2 = projetarParcelas(duas, '2026-07');
  eq(r2.months.map(([ym, f]) => [ym, f.cents, f.n]),
    [['2026-08', 200000, 2], ['2026-09', 100000, 1]],
    'compras em datas diferentes seguem separadas (a data entra na chave)');
}

secao('3. Parcelas futuras — sem invoice_ref cai em compra + n, e AVISA');
{
  // Linha importada antes da v4.1: sem competência gravada. A parcela n é
  // suposta na fatura de compra + n. Compra 2026-01-20, parcela 2/4 → âncora
  // 2026-03; faltam 3/4 e 4/4 em 2026-04 e 2026-05.
  const legado = [
    { date: '2026-01-20', description: 'SEM REF (parcela 2/4)', amount_cents: -25000, invoice_ref: null },
  ];
  const r = projetarParcelas(legado, '2026-03');
  eq(r.months.map(([ym, f]) => [ym, f.cents, f.n]),
    [['2026-04', 25000, 1], ['2026-05', 25000, 1]],
    'fallback ancora em compra + n (não compra + 1)');
  eq(r.approx, 1, 'conta quantas linhas foram estimadas — o número diz seu grau de certeza');
}

secao('4. Parcelas futuras — a regra do fallback bate no banco real');
{
  // Prova empírica de que "parcela n cai na fatura de compra + n" não é chute:
  // toda linha do banco real que TEM invoice_ref concorda com a suposição. Se um
  // dia um parser gravar competência com outra convenção, este teste avisa.
  const reais = db.prepare(`
    SELECT date, description, invoice_ref FROM transactions
    WHERE deleted_at IS NULL AND invoice_ref IS NOT NULL
  `).all().map(tx => ({ ...tx, parc: installmentOf(tx.description) }))
    .filter(tx => tx.parc);
  const divergentes = reais.filter(tx =>
    addMonths(tx.date.slice(0, 7), tx.parc.n) !== tx.invoice_ref);
  if (reais.length === 0) {
    console.log('  --   banco sem parcelas com invoice_ref (nada a conferir)');
  } else {
    ok(divergentes.length === 0,
      `compra + n == invoice_ref nas ${reais.length} parcelas com competência gravada`,
      divergentes.slice(0, 5));
  }

  // Antes/depois medido sobre a cópia do banco real, só para o número ficar
  // registrado: com estes dados o cálculo antigo SUBESTIMAVA (perdia meses).
  const todas = db.prepare(`
    SELECT date, description, amount_cents, invoice_ref FROM transactions
    WHERE deleted_at IS NULL ORDER BY date DESC, id DESC`).all();
  const nowYm = localIsoMonth();
  const nv = projetarParcelas(todas, nowYm);
  const vl = projetarAntigo(todas, nowYm);
  const tNovo = nv.months.reduce((s, [, f]) => s + f.cents, 0);
  const tVelho = vl.reduce((s, [, f]) => s + f.cents, 0);
  console.log(`  --   banco real (${nowYm}): antes R$ ${(tVelho / 100).toFixed(2)}` +
    ` → depois R$ ${(tNovo / 100).toFixed(2)}` +
    ` · meses ${vl.map(([m]) => m).join(',') || '—'} → ${nv.months.map(([m]) => m).join(',') || '—'}`);
  if (nv.months.length) {
    ok(nv.months.length >= vl.length,
      'correção não esconde mês nenhum que o cálculo antigo mostrava',
      { antes: vl.map(([m]) => m), depois: nv.months.map(([m]) => m) });
  }
}

secao('5. GET /api/transactions devolve invoice_ref e batch_id');
{
  const { transactions } = await (await txRoute.GET()).json();
  ok(transactions.length > 0, 'devolve transações', transactions.length);
  const t0 = transactions[0];
  ok('invoice_ref' in t0, 'campo invoice_ref presente (é a âncora da projeção)', Object.keys(t0));
  ok('batch_id' in t0, 'campo batch_id presente (para avisar do desfazer)', Object.keys(t0));
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. DATA LOCAL vs UTC
// ═══════════════════════════════════════════════════════════════════════════
secao('6. Helper de data usa o dia LOCAL, não o UTC');
{
  // 23h30 de 31/12/2026 em São Paulo = 02h30 de 01/01/2027 em UTC.
  const noite = new Date(2026, 11, 31, 23, 30, 0);
  eq(noite.toISOString().slice(0, 10), '2027-01-01',
    'confirmação do fuso: toISOString() nesse instante já é o ano seguinte');
  eq(localIsoDate(noite), '2026-12-31', 'localIsoDate devolve o dia local (31/12)');
  eq(localIsoMonth(noite), '2026-12', 'localIsoMonth devolve dezembro — relatório não abre vazio em janeiro');

  // 21h de um dia comum: o caso "vence amanhã" virando "vence hoje".
  const vinteEUma = new Date(2026, 6, 15, 21, 30, 0);
  eq(vinteEUma.toISOString().slice(0, 10), '2026-07-16', 'confirmação: UTC já virou o dia');
  eq(localIsoDate(vinteEUma), '2026-07-15', 'localIsoDate mantém 15/07');

  // meia-noite e um minuto: a borda do outro lado, que UTC acerta por acaso
  eq(localIsoDate(new Date(2026, 6, 15, 0, 1, 0)), '2026-07-15', 'borda 00:01 local');
}

secao('7. Insight de vencimento respeita o dia local às 21h');
{
  // Conta vencendo em 16/07. Às 21h30 do dia 15, o certo é "vence amanhã".
  // Com todayIso em UTC (já 16/07), a diferença dava 0 dia → "vence hoje".
  const agora = new Date(2026, 6, 15, 21, 30, 0);
  const ins = computeInsights({
    transactions: [],
    billOccurrences: [{
      bill_id: 1, ref: '2026-07', description: 'Condomínio',
      due_date: '2026-07-16', amount_cents: 50000, status: 'proxima',
    }],
    now: agora,
  });
  const conta = ins.find(i => i.kind === 'conta_proxima');
  ok(!!conta, 'insight de conta próxima gerado', ins);
  // whenIn(1) → 'insight.when.tomorrow'; whenIn(0) → '…today'. Comparamos com o
  // dicionário para não fixar a frase no teste.
  const { t } = await import(path.join(ROOT, 'lib/i18n/index.js'));
  ok(conta?.title.includes(t('insight.when.tomorrow')),
    'diz "amanhã", não "hoje", às 21h30 do dia anterior', conta?.title);
  ok(!conta?.title.includes(t('insight.when.today')),
    'não diz "hoje" para conta que vence amanhã', conta?.title);
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. PRAGMAs e índices
// ═══════════════════════════════════════════════════════════════════════════
secao('8. PRAGMA busy_timeout');
{
  const bt = db.prepare('PRAGMA busy_timeout').get();
  const v = bt.timeout ?? Object.values(bt)[0];
  ok(Number(v) >= 5000, `busy_timeout = ${v} ms (0 daria SQLITE_BUSY imediato com dois processos)`, bt);
}

secao('9. Índices que evitam varredura da tabela');
{
  const idx = new Set(db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'transactions'")
    .all().map(r => r.name));
  for (const nome of ['idx_tx_batch', 'idx_tx_category', 'idx_tx_source_date']) {
    ok(idx.has(nome), `índice ${nome} criado`, [...idx]);
  }
  // EXPLAIN QUERY PLAN é a prova real: nome de índice não garante que o
  // planejador vai usá-lo.
  const plano = (sql) => db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all()
    .map(r => r.detail).join(' | ');
  const p1 = plano('SELECT id FROM transactions WHERE batch_id = 1');
  ok(/USING (COVERING )?INDEX idx_tx_batch/.test(p1), 'desfazer importação usa índice', p1);
  const p2 = plano('SELECT category, COUNT(*) FROM transactions GROUP BY category');
  ok(/idx_tx_category/.test(p2) && !/TEMP B-TREE/.test(p2),
    'GROUP BY category usa índice e dispensa B-tree temporária', p2);
  const p3 = plano(
    "SELECT id FROM transactions WHERE source = 'ofx' AND date > '2026-01-01'");
  ok(/idx_tx_source_date/.test(p3), 'filtro por origem + janela de data usa (source, date)', p3);
}

// ═══════════════════════════════════════════════════════════════════════════
// 10. Backup
// ═══════════════════════════════════════════════════════════════════════════
secao('10. backupDb: falha visível e nome com resolução de segundo');
{
  const b = backupDb(db, 'teste');
  ok(b && typeof b === 'object' && 'path' in b && 'error' in b,
    'devolve { path, error } — quem chama pode abortar e avisar', b);
  ok(b.path && fs.existsSync(b.path), 'arquivo de backup existe', b);
  ok(b.error === null, 'sem erro no caminho feliz', b.error);
  ok(/fluxo-teste-\d{14}\.db$/.test(path.basename(b.path || '')),
    'carimbo com 14 dígitos (AAAAMMDDHHMMSS) — inclui segundos', path.basename(b.path || ''));

  // Falha real: diretório de backups substituído por um ARQUIVO. mkdirSync
  // estoura EEXIST/ENOTDIR e o erro tem de aparecer, não virar null silencioso.
  const bdir = path.join(dataDir(), 'backups');
  fs.rmSync(bdir, { recursive: true, force: true });
  fs.writeFileSync(bdir, 'nao sou um diretorio');
  const falho = backupDb(db, 'teste-falha');
  ok(falho.path === null, 'falha devolve path null', falho);
  ok(typeof falho.error === 'string' && falho.error.length > 0,
    'falha devolve a MENSAGEM do erro (antes era engolida por catch {})', falho.error);
  fs.rmSync(bdir, { force: true });
}

secao('11. DELETE /api/batches faz backup antes e conta edição manual');
{
  // lote sintético: 3 transações, 2 delas "editadas à mão"
  const batchId = db.prepare("INSERT INTO batches (file_name, kind) VALUES ('teste.csv', 'teste')")
    .run().lastInsertRowid;
  const ins = db.prepare(`INSERT INTO transactions
    (date, description, amount_cents, category, transfer, source, hash, batch_id,
     original_description, original_amount_cents)
    VALUES (?, ?, ?, ?, 0, 'teste', ?, ?, ?, ?)`);
  ins.run('2026-03-01', 'A', -1000, CAT.TO_REVIEW, `t:${randomUUID()}`, batchId, 'A velho', null);
  ins.run('2026-03-02', 'B', -2000, CAT.TO_REVIEW, `t:${randomUUID()}`, batchId, null, -1500);
  ins.run('2026-03-03', 'C', -3000, CAT.TO_REVIEW, `t:${randomUUID()}`, batchId, null, null);

  const antes = fs.existsSync(path.join(dataDir(), 'backups'))
    ? fs.readdirSync(path.join(dataDir(), 'backups')).length : 0;
  const r = await call(batchesRoute.DELETE, { id: batchId },
    'http://local/api/batches', 'DELETE');
  ok(r.status === 200, 'desfazer respondeu 200', r);
  eq(r.body.removed, 3, 'removeu as 3 transações do lote');
  eq(r.body.manuallyEdited, 2, 'avisa que 2 tinham edição manual (essas não voltam do arquivo)');
  ok(/^fluxo-pre-undo-\d{14}\.db$/.test(r.body.backup || ''),
    'devolve o nome do backup pré-undo', r.body.backup);
  const depois = fs.readdirSync(path.join(dataDir(), 'backups')).length;
  ok(depois > antes, 'backup foi criado ANTES do delete', [antes, depois]);
  ok(!db.prepare('SELECT 1 FROM batches WHERE id = ?').get(batchId), 'lote removido');

  const semId = await call(batchesRoute.DELETE, {}, 'http://local/api/batches', 'DELETE');
  eq(semId.status, 400, 'DELETE sem id → 400');
}

secao('12. Vários backups no mesmo minuto não se sobrescrevem');
{
  // Era o caso real: arrastar cinco arquivos de uma vez roda cinco importações
  // no mesmo minuto. Com carimbo de minuto sobrava UM backup.
  const bdir = path.join(dataDir(), 'backups');
  fs.rmSync(bdir, { recursive: true, force: true });
  const nomes = new Set();
  for (let i = 0; i < 3; i++) {
    // segundos distintos: o carimbo tem resolução de segundo, então o teste
    // espera 1 s entre cópias em vez de fingir que resolve colisão sub-segundo
    const b = backupDb(db, `lote${i}`);
    nomes.add(path.basename(b.path));
  }
  eq(nomes.size, 3, 'três tags distintas geram três arquivos');
  // mesma tag, segundos diferentes
  const a = backupDb(db, 'mesmo');
  await new Promise(r => setTimeout(r, 1100));
  const b2 = backupDb(db, 'mesmo');
  ok(path.basename(a.path) !== path.basename(b2.path),
    'mesma tag em segundos diferentes gera arquivos diferentes',
    [path.basename(a.path), path.basename(b2.path)]);
}

// ═══════════════════════════════════════════════════════════════════════════
// 13. PUT /api/bills
// ═══════════════════════════════════════════════════════════════════════════
secao('13. PUT /api/bills valida bill_id e ref (antes: 500 com stack de FK)');
{
  const criada = await call(billsRoute.POST, {
    description: 'Conta de teste', amount_cents: 12345, category: CAT.HOUSING,
    due_day: 10, frequency: 'mensal', match_pattern: '', tolerance_pct: 10,
  }, 'http://local/api/bills');
  ok(criada.status === 200, 'conta a pagar criada para o teste', criada.status);
  const conta = (criada.body.bills || []).find(b => b.description === 'Conta de teste');
  ok(!!conta, 'conta encontrada na resposta', criada.body.bills?.length);

  const chamar = (body) => call(billsRoute.PUT, body, 'http://local/api/bills', 'PUT');

  const inexistente = await chamar({ bill_id: 999999, ref: '2026-07', paid: true });
  eq(inexistente.status, 404, 'bill_id inexistente → 404 (não 500)');
  ok(typeof inexistente.body.error === 'string' && inexistente.body.error.length > 0,
    'devolve mensagem via t(), não stack trace', inexistente.body.error);

  eq((await chamar({ ref: '2026-07', paid: true })).status, 400, 'sem bill_id → 400');
  eq((await chamar({ bill_id: 'abc', ref: '2026-07', paid: true })).status, 400,
    'bill_id não numérico → 400');
  eq((await chamar({ bill_id: conta?.id, paid: true })).status, 400, 'sem ref → 400');
  eq((await chamar({ bill_id: conta?.id, ref: 'julho', paid: true })).status, 400,
    'ref fora do formato AAAA-MM → 400');
  eq((await chamar({ bill_id: conta?.id, ref: '2026-13', paid: true })).status, 400,
    'mês 13 → 400');

  const bom = await chamar({ bill_id: conta?.id, ref: '2026-07', paid: true });
  eq(bom.status, 200, 'competência válida → 200');
  ok(!!db.prepare('SELECT 1 FROM bill_payments WHERE bill_id = ? AND ref = ?')
    .get(conta?.id, '2026-07'), 'pagamento gravado');
  const anual = await chamar({ bill_id: conta?.id, ref: '2026', paid: true });
  eq(anual.status, 200, 'ref anual (AAAA) também é válida');
  await chamar({ bill_id: conta?.id, ref: '2026-07', paid: false });
  ok(!db.prepare('SELECT 1 FROM bill_payments WHERE bill_id = ? AND ref = ?')
    .get(conta?.id, '2026-07'), 'desmarcar apaga o pagamento');

  // GET não deve estourar e traz o campo de erro de conciliação
  const g = await (await billsRoute.GET()).json();
  ok(Array.isArray(g.occurrences), 'GET /api/bills devolve occurrences');
  ok(g.reconcileError === null || g.reconcileError === undefined,
    'conciliação gravou sem erro (campo existe para poder avisar quando falhar)',
    g.reconcileError);

  const semId = await call(billsRoute.DELETE, {}, 'http://local/api/bills', 'DELETE');
  eq(semId.status, 400, 'DELETE /api/bills sem id → 400 (não 200 caladamente)');
  await call(billsRoute.DELETE, { id: conta?.id }, 'http://local/api/bills', 'DELETE');
}

// ═══════════════════════════════════════════════════════════════════════════
// 14. Conciliação de contas a pagar é transacional e idempotente
// ═══════════════════════════════════════════════════════════════════════════
secao('14. GET /api/bills concilia dentro de transação e é idempotente');
{
  const { computeBills } = await import(path.join(ROOT, 'lib/bills.js'));
  const hoje = new Date(2026, 6, 15); // 15/07/2026 local
  const bid = db.prepare(`INSERT INTO bills
    (description, amount_cents, category, due_day, frequency, match_pattern, tolerance_pct)
    VALUES ('Condominio teste', 50000, ?, 10, 'mensal', 'condominio teste', 10)`)
    .run(CAT.HOUSING).lastInsertRowid;
  db.prepare(`INSERT INTO transactions
    (date, description, amount_cents, category, transfer, source, hash)
    VALUES ('2026-07-09', 'CONDOMINIO TESTE JUL', -50000, ?, 0, 'teste', ?)`)
    .run(CAT.HOUSING, `t:${randomUUID()}`);

  const r1 = computeBills(db, hoje);
  const o1 = r1.occurrences.find(o => o.bill_id === bid && o.ref === '2026-07');
  eq(o1?.status, 'paga', 'conciliação automática marca a competência como paga');
  eq(r1.reconcileError, null, 'gravação da conciliação sem erro');
  const n1 = db.prepare('SELECT COUNT(*) AS n FROM bill_payments WHERE bill_id = ?').get(bid).n;
  const r2 = computeBills(db, hoje);
  const n2 = db.prepare('SELECT COUNT(*) AS n FROM bill_payments WHERE bill_id = ?').get(bid).n;
  eq(n2, n1, 'repetir a leitura não grava de novo — é idempotente');
  eq(r2.occurrences.find(o => o.bill_id === bid && o.ref === '2026-07')?.status, 'paga',
    'status estável entre leituras');

  db.prepare('DELETE FROM bill_payments WHERE bill_id = ?').run(bid);
  db.prepare('DELETE FROM bills WHERE id = ?').run(bid);
}

// ═══════════════════════════════════════════════════════════════════════════
// 15. Ideias de renda não congelam o idioma
// ═══════════════════════════════════════════════════════════════════════════
secao('15. lib/ideias-renda resolve o texto no render, não no import');
{
  const { getIdeias } = await import(path.join(ROOT, 'lib/ideias-renda.js'));
  const mod = await import(path.join(ROOT, 'lib/ideias-renda.js'));
  ok(typeof getIdeias === 'function', 'exporta função, não constante já resolvida');
  ok(mod.IDEIAS === undefined,
    'não exporta mais IDEIAS congelado na carga do módulo', Object.keys(mod));
  const { setSetting } = await import(path.join(ROOT, 'lib/db.js'));
  setSetting(db, 'locale', 'pt-BR');
  const pt = getIdeias();
  setSetting(db, 'locale', 'es-AR');
  const es = getIdeias();
  setSetting(db, 'locale', 'pt-BR');
  eq(pt.length, 9, 'catálogo com 9 ideias');
  ok(pt[0].titulo !== es[0].titulo,
    'trocar o idioma em runtime troca o texto de /evoluir', [pt[0].titulo, es[0].titulo]);
  ok(pt.every(i => i.titulo && i.investimento && i.esforco && i.passos.length === 3),
    'estrutura completa em cada ideia');
}

// ═══════════════════════════════════════════════════════════════════════════
// 16. O banco de produção não foi tocado
// ═══════════════════════════════════════════════════════════════════════════
secao('16. data/fluxo.db intacto');
{
  if (srcStat) {
    const agora = fs.statSync(SRC_DB);
    ok(agora.size === srcStat.size && agora.mtimeMs === srcStat.mtimeMs,
      'tamanho e mtime de data/fluxo.db inalterados',
      { antes: [srcStat.size, srcStat.mtimeMs], depois: [agora.size, agora.mtimeMs] });
  } else {
    ok(!fs.existsSync(SRC_DB), 'data/fluxo.db não foi criado pelo teste');
  }
  ok(dataDir().startsWith('/tmp/'), 'FLUXO_DATA_DIR aponta para /tmp', dataDir());
}

// ── fim ────────────────────────────────────────────────────────────────────
db.close?.();
fs.rmSync(TMP, { recursive: true, force: true });
console.log(falhas === 0
  ? '\nOK — todas as correções verificadas.'
  : `\nFALHOU — ${falhas} asserção(ões).`);
process.exit(falhas === 0 ? 0 : 1);
