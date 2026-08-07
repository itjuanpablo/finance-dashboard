#!/usr/bin/env node
// Conversor de moedas: cache, modo offline, e a garantia de que ele NÃO
// encosta no dinheiro guardado.
//
// A última seção é a que importa de verdade. O Fluxo promete que soma nunca
// cruza moeda — é isso que faz um saldo em dólar estar certo. Um conversor no
// app é a tentação óbvia para alguém "melhorar" um total um dia. A varredura
// abaixo é o que trava isso, e vale mais que todos os testes de aritmética
// deste arquivo.

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fluxo-fx-'));
process.env.FLUXO_DATA_DIR = tmp;

// Varredura tem de olhar CÓDIGO, não prosa. A primeira versão deste arquivo
// acusou app/api/rates/route.js de "tocar em transactions" — a palavra estava
// num comentário explicando justamente que ele NÃO toca. Um teste que lê
// comentário reprova a documentação e aprova o bug.
const semComentarios = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

let falhas = 0;
const ok = (nome, cond, extra) => {
  if (!cond) falhas++;
  console.log(`  ${cond ? 'ok  ' : 'FALHA'} ${nome}${cond || extra === undefined ? '' : `  → ${JSON.stringify(extra)}`}`);
};

const { getDb, getSetting, setSetting } =
  await import(pathToFileURL(path.join(ROOT, 'lib/db.js')).href);
const db = getDb();

const codigoRota = semComentarios(
  fs.readFileSync(path.join(ROOT, 'app/api/rates/route.js'), 'utf8'));

const CACHE = {
  v: 2, base: 'EUR', date: '2026-08-07',
  rates: { EUR: 1, USD: 1.1535, BRL: 5.8826, GBP: 0.85765 },
  fetched_at: Date.now(), source: 'ECB/Frankfurter',
};

console.log('\n1. Regra de três entre pares (a conta do conversor)');
const taxa = (de, para) => CACHE.rates[para] / CACHE.rates[de];
ok('USD → BRL bate com a razão das bases',
  Math.abs(taxa('USD', 'BRL') - 5.0998) < 0.001, taxa('USD', 'BRL').toFixed(4));
ok('BRL → USD é o inverso',
  Math.abs(taxa('BRL', 'USD') * taxa('USD', 'BRL') - 1) < 1e-9);
ok('mesma moeda dá 1', taxa('BRL', 'BRL') === 1);
ok('par sem passar por EUR também funciona',
  Math.abs(taxa('USD', 'GBP') - (0.85765 / 1.1535)) < 1e-12);

console.log('\n1b. Moeda de fonte complementar entra pelo eixo certo');
// A fonte extra diz "quanto vale 1 USD"; a base guardada é EUR. Converter pela
// ponte USD é o que mantém tudo num eixo só — misturar bases é como uma taxa
// fica sutilmente errada sem ninguém perceber.
const ARS_POR_USD = 1496.21712208;
const arsEmEur = CACHE.rates.USD * ARS_POR_USD;
const comArs = { ...CACHE.rates, ARS: arsEmEur };
const taxaArs = (de, para) => comArs[para] / comArs[de];
ok('USD → ARS devolve o valor da fonte, não outro',
  Math.abs(taxaArs('USD', 'ARS') - ARS_POR_USD) < 0.01, taxaArs('USD', 'ARS').toFixed(2));
ok('BRL → ARS é coerente com o par USD',
  Math.abs(taxaArs('BRL', 'ARS') - (ARS_POR_USD / taxa('USD', 'BRL'))) < 0.01);
ok('ARS → USD é o inverso exato',
  Math.abs(taxaArs('ARS', 'USD') * taxaArs('USD', 'ARS') - 1) < 1e-9);

console.log('\n1c. Cache sabe de que época é');
// Sem versão no cache, acrescentar uma moeda não tem efeito nenhum para quem
// já tinha cotação salva: o app serve a lista antiga até expirar. Foi assim que
// o peso argentino entrou no código e não apareceu na tela.
ok('a rota versiona o cache', /VERSAO_CACHE/.test(codigoRota));
ok('cache de versão diferente NÃO é considerado fresco',
  /cache\?\.v === VERSAO_CACHE/.test(codigoRota));
ok('a lista de moedas mora em um lugar só',
  /const MOEDAS = \[/.test(codigoRota)
  && !/const (DESTAQUE|MOEDAS) = \[/.test(semComentarios(
      fs.readFileSync(path.join(ROOT, 'components/Conversor.js'), 'utf8'))));
ok('ARS está na lista oferecida', /'ARS'/.test(codigoRota));

console.log('\n2. Cache sobrevive em disco');
setSetting(db, 'fx_cache', JSON.stringify(CACHE));
const lido = JSON.parse(getSetting(db, 'fx_cache'));
ok('grava e lê de volta', lido.rates.BRL === 5.8826);
ok('guarda o DIA da cotação, não só a hora do fetch', lido.date === '2026-08-07');
ok('guarda a fonte', lido.source === 'ECB/Frankfurter');

console.log('\n3. Cache corrompido não derruba o app');
setSetting(db, 'fx_cache', '{isto não é json');
let quebrou = false;
try { JSON.parse(getSetting(db, 'fx_cache')); } catch { quebrou = true; }
ok('JSON inválido é detectável (a rota trata com try/catch)', quebrou);
const src = fs.readFileSync(path.join(ROOT, 'app/api/rates/route.js'), 'utf8');
ok('a rota realmente protege a leitura do cache', /catch\s*\{?\s*return null/.test(src));

console.log('\n4. Offline é caso comum, não erro');
ok('há timeout na busca', /AbortController|signal/.test(src));
ok('sem rede, serve o cache marcando stale', /stale:\s*true/.test(src));
ok('sem rede E sem cache, devolve erro em vez de número inventado',
  /status:\s*503/.test(src));
ok('nenhum valor padrão de cotação no código',
  !/rates\s*=\s*\{[^}]*BRL\s*:\s*[\d.]/.test(src));

console.log('\n5. Nada do usuário atravessa a rede');
const codigo = semComentarios(src);
// Duas fontes: o BCE (principal) e a complementar, que cobre as moedas que o
// BCE não publica — peso argentino entre elas. A checagem que importa não é
// "quantas", é: toda URL é literal e nenhuma carrega dado do usuário.
const urls = codigo.match(/https?:\/\/[^'"`\s]+/g) || [];
ok('só as duas fontes conhecidas', urls.length === 2, urls);
ok('nenhuma URL é montada com interpolação', !/https?:\/\/[^'"`]*\$\{/.test(codigo));
ok('nenhum fetch recebe variável de conteúdo',
  (codigo.match(/fetch\(\s*([A-Z_]+|'https)/g) || []).length ===
  (codigo.match(/fetch\(/g) || []).length);
ok('a fonte complementar falha sem derrubar a principal',
  /catch\s*\{\s*\/\*[^*]*\*\/\s*\}|catch\s*\{[^}]*\}/.test(codigo)
  && /let extra = \[\]/.test(codigo));

console.log('\n6. A LINHA: o conversor não encosta no dinheiro guardado');
const conv = fs.readFileSync(path.join(ROOT, 'components/Conversor.js'), 'utf8');
ok('o conversor não escreve em lugar nenhum',
  !/method:\s*'(POST|PATCH|PUT|DELETE)'/.test(conv));
ok('o conversor não lê transações', !/api\/transactions|api\/accounts/.test(conv));
ok('a rota de cotação não toca em transactions',
  !/transactions/.test(semComentarios(src)));

// Varredura ampla: nenhuma query de soma pode ter passado a usar taxa.
const arquivos = [];
(function varrer(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!/node_modules|\.next/.test(p)) varrer(p); }
    else if (e.name.endsWith('.js')) arquivos.push(p);
  }
})(path.join(ROOT, 'app'));
(function varrer(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) varrer(p); else if (e.name.endsWith('.js')) arquivos.push(p);
  }
})(path.join(ROOT, 'lib'));

const contaminados = arquivos.filter(f => {
  if (/api[\/\\]rates[\/\\]route\.js$/.test(f)) return false;  // a própria fonte
  const s = semComentarios(fs.readFileSync(f, 'utf8'));
  // Taxa de câmbio perto de soma de dinheiro é o padrão proibido.
  return /fx_cache|frankfurter/i.test(s) && /amount_cents|balance_cents|SUM\(/.test(s);
});
ok('nenhum arquivo mistura cotação com soma de centavos', contaminados.length === 0,
  contaminados.map(f => path.relative(ROOT, f)));

console.log('\n7. O banco real não foi tocado');
const real = path.join(ROOT, 'data', 'fluxo.db');
ok('data/fluxo.db intacto',
  !fs.existsSync(real) || fs.statSync(real).mtimeMs < Date.now() - 5000);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(falhas ? `\n✗ ${falhas} falha(s).` : '\ntudo certo — cotação e conversor.');
process.exit(falhas ? 1 : 0);
