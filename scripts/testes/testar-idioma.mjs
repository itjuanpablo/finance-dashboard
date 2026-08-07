#!/usr/bin/env node
// Testes da troca de idioma em runtime: `node scripts/testar-idioma.mjs`.
// Exit 1 se algo falhar. Roda sobre um banco descartável em /tmp — nunca toca
// data/fluxo.db.
//
// O que está sendo protegido aqui:
//
//  1. Trocar o idioma muda texto, mês e ordem de data — mas NÃO a moeda. Os
//     valores no banco são centavos sem moeda; se a moeda seguisse o idioma, um
//     saldo de R$ 1.000 viraria $ 1.000 em pesos sem conversão nenhuma. É o erro
//     mais caro que esta funcionalidade poderia introduzir.
//  2. Nada de formatação pode ser calculado na carga do módulo. Um `const` com
//     Intl no topo do arquivo passa nos testes na primeira execução e mente na
//     segunda — por isso os testes abaixo trocam o locale VÁRIAS vezes e
//     conferem o resultado a cada troca.
//  3. Idioma inválido no banco cai no padrão em vez de quebrar a tela.

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const TMP = fs.mkdtempSync('/tmp/fluxo-teste-idioma-');
process.env.FLUXO_DATA_DIR = path.join(TMP, 'data');
fs.mkdirSync(process.env.FLUXO_DATA_DIR, { recursive: true });

const DB_REAL = path.join(ROOT, 'data', 'fluxo.db');
const antes = fs.existsSync(DB_REAL) ? fs.statSync(DB_REAL) : null;

const { getDb, setSetting, getSetting, localeSettings, localeWasChosen } =
  await import(path.join(ROOT, 'lib/db.js'));
const { t } = await import(path.join(ROOT, 'lib/i18n/index.js'));
const { fmtMoney, fmtMonthLong, fmtDate, currencySymbol } =
  await import(path.join(ROOT, 'lib/format.js'));
const { resolveLocale, resolveCurrency, DEFAULT_LOCALE, localeFromAcceptLanguage } =
  await import(path.join(ROOT, 'lib/config.js'));
const { setBrowserLocale } = await import(path.join(ROOT, 'lib/locale-state.js'));

// Lido do próprio db.js: o teste da migração v7 fixava o número 7 e passou a
// falhar na v8 sem que nada estivesse errado. Um teste que quebra a cada
// esquema novo treina a pessoa a ignorá-lo.
const SCHEMA_ATUAL = Number(
  fs.readFileSync(path.join(ROOT, 'lib/db.js'), 'utf8')
    .match(/const SCHEMA_VERSION = (\d+)/)[1]);

let pass = 0;
const fails = [];

// O Intl separa símbolo e número com ESPAÇO NÃO SEPARÁVEL (U+00A0), e algumas
// versões do ICU usam o estreito (U+202F). Comparar com espaço comum falha por
// um caractere invisível — erro que custa meia hora para enxergar. Normaliza-se
// só o espaço; o resto é comparado literalmente.
const norm = (v) => typeof v === 'string' ? v.replace(/[  ]/g, ' ') : v;

const eq = (nome, a, e) => {
  if (norm(a) === norm(e)) { pass++; return; }
  fails.push(`${nome}\n      esperado: ${JSON.stringify(e)}\n      obtido:   ${JSON.stringify(a)}`);
};
const ok = (nome, cond, detalhe = '') => {
  if (cond) { pass++; return; }
  fails.push(nome + (detalhe ? `\n      ${detalhe}` : ''));
};
const sec = (s) => console.log(`\n\x1b[1m${s}\x1b[0m`);

const db = getDb();

sec('Estado inicial');
// A instalação nova nasce SEM idioma gravado. A ausência é o que permite seguir
// o navegador; gravar o padrão no primeiro boot transformaria palpite em
// decisão e obrigaria quem fala espanhol a desfazer na mão.
ok('não grava idioma no primeiro boot', getSetting(db, 'locale') == null);
ok('não grava moeda no primeiro boot', getSetting(db, 'currency') == null);
ok('e sabe que ninguém escolheu ainda', localeWasChosen(db) === false);
eq('sem nada, cai no padrão', resolveLocale(), DEFAULT_LOCALE);
eq('e a moeda acompanha o padrão', resolveCurrency(), 'BRL');

sec('Accept-Language → idioma');
const al = localeFromAcceptLanguage;
eq('exato', al('es-AR,es;q=0.9,en;q=0.8'), 'es-AR');
eq('caixa alta/baixa não importa', al('ES-ar'), 'es-AR');
eq('espanhol de outro país cai no espanhol que existe', al('es-MX,es;q=0.9'), 'es-AR');
eq('espanhol genérico também', al('es'), 'es-AR');
eq('português de Portugal cai no português que existe', al('pt-PT'), 'pt-BR');
// Peso (q=) manda: o navegador diz o que prefere, e a ordem do texto pode mentir.
eq('respeita o peso q=, não a ordem', al('en;q=0.5,es-AR;q=0.9'), 'es-AR');
eq('idioma não suportado não vira palpite', al('en-US,en;q=0.9'), null);
eq('curinga é ignorado', al('*'), null);
eq('cabeçalho vazio', al(''), null);
eq('cabeçalho ausente', al(undefined), null);

sec('Detecção na primeira execução');
setBrowserLocale('es-AR');
eq('sem escolha gravada, o navegador decide', localeSettings(db).locale, 'es-AR');
eq('e a moeda vem junto do idioma detectado', localeSettings(db).currency, 'ARS');
ok('texto sai em espanhol', t('dash.income') === 'Ingresos', t('dash.income'));
ok('ainda assim nada foi gravado', localeWasChosen(db) === false);

// O ponto que separa palpite de decisão: uma vez escolhido, o navegador perde.
setSetting(db, 'locale', 'pt-BR');
eq('escolha da tela vence o navegador', localeSettings(db).locale, 'pt-BR');
ok('e texto acompanha', t('dash.income') === 'Entradas');
db.prepare("DELETE FROM settings WHERE key = 'locale'").run();
eq('apagando a escolha, o palpite volta', localeSettings(db).locale, 'es-AR');
setSetting(db, 'locale', 'pt-BR');
setSetting(db, 'currency', 'BRL');
eq('resolveLocale concorda com o banco', resolveLocale(), DEFAULT_LOCALE);

sec('Troca de idioma');
setSetting(db, 'locale', 'es-AR');
eq('locale ativo mudou', resolveLocale(), 'es-AR');
eq('texto mudou', t('dash.income'), 'Ingresos');
eq('mês mudou', fmtMonthLong('2026-07'), 'Julio 2026');
eq('categoria canônica mudou', t('cat.food'), 'Comida');

setSetting(db, 'locale', 'pt-BR');
eq('volta para português', t('dash.income'), 'Entradas');
eq('mês volta', fmtMonthLong('2026-07'), 'Julho 2026');

// Ida e volta várias vezes: pega formatador que ficou preso na carga do módulo
sec('Idempotência (formatador não pode ficar preso)');
for (let i = 0; i < 3; i++) {
  setSetting(db, 'locale', 'es-AR');
  eq(`ciclo ${i + 1}: es-AR`, t('dash.expenses'), 'Egresos');
  setSetting(db, 'locale', 'pt-BR');
  eq(`ciclo ${i + 1}: pt-BR`, t('dash.expenses'), 'Saídas');
}

sec('Moeda é independente do idioma');
setSetting(db, 'locale', 'pt-BR');
setSetting(db, 'currency', 'BRL');
eq('base: real em português', fmtMoney(123456), 'R$ 1.234,56');
setSetting(db, 'locale', 'es-AR');
ok('trocar idioma NÃO troca a moeda', resolveCurrency() === 'BRL',
  `moeda virou ${resolveCurrency()} — valores em reais seriam lidos como pesos`);
ok('valor segue identificado como real', fmtMoney(123456).includes('BRL') || fmtMoney(123456).includes('R$'),
  `formatou como "${fmtMoney(123456)}"`);

setSetting(db, 'currency', 'ARS');
eq('trocar a moeda explicitamente funciona', currencySymbol(), '$');
eq('valor em pesos', fmtMoney(123456), '$ 1.234,56');

setSetting(db, 'locale', 'pt-BR');
ok('moeda continua ARS depois de voltar o idioma', resolveCurrency() === 'ARS');

sec('Formato de data e persistência');
setSetting(db, 'currency', 'BRL');
eq('data no formato local', fmtDate('2026-07-26'), '26/07/2026');
eq('settings sobrevivem', JSON.stringify(localeSettings(db)),
  JSON.stringify({ locale: 'pt-BR', currency: 'BRL' }));

sec('Valor inválido não quebra a tela');
setBrowserLocale(null);   // sem palpite de navegador para atrapalhar a leitura
setSetting(db, 'locale', 'xx-YY');
eq('idioma desconhecido cai no padrão', resolveLocale(), DEFAULT_LOCALE);
ok('e ainda traduz', t('dash.income') === 'Entradas');
setSetting(db, 'locale', 'pt-BR');

sec('Migração v7 — instalação antiga volta a detectar');
// Reproduz uma instalação da v4.3.1: idioma semeado no primeiro boot, esquema
// na versão 6. Precisa de OUTRO processo porque getDb() é singleton de módulo.
{
  const dir = path.join(TMP, 'antiga');
  fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
  const rodar = (codigo) => execFileSync(
    process.execPath, ['--input-type=module', '-e', codigo],
    { cwd: ROOT, env: { ...process.env, FLUXO_DATA_DIR: path.join(dir, 'data') }, encoding: 'utf8' },
  ).trim();

  // passo 1: nasce "antiga" — locale gravado, user_version = 6
  rodar(`
    const { getDb, setSetting } = await import('${ROOT}/lib/db.js');
    const db = getDb();
    setSetting(db, 'locale', 'pt-BR');
    db.exec('PRAGMA user_version = 6');
  `);

  // passo 2: abre com a v7 — a semente sai, a escolha humana fica
  const depoisDaMigracao = rodar(`
    const { getDb, getSetting } = await import('${ROOT}/lib/db.js');
    const db = getDb();
    console.log(JSON.stringify({
      locale: getSetting(db, 'locale') ?? null,
      versao: db.prepare('PRAGMA user_version').get().user_version,
    }));
  `);
  const m = JSON.parse(depoisDaMigracao);
  eq('semente de idioma foi removida', m.locale, null);
  eq('esquema subiu para a versão atual', m.versao, SCHEMA_ATUAL);

  // passo 3: quem ESCOLHEU outro idioma não é tocado pela migração
  const dir2 = path.join(TMP, 'escolhida');
  fs.mkdirSync(path.join(dir2, 'data'), { recursive: true });
  const rodar2 = (codigo) => execFileSync(
    process.execPath, ['--input-type=module', '-e', codigo],
    { cwd: ROOT, env: { ...process.env, FLUXO_DATA_DIR: path.join(dir2, 'data') }, encoding: 'utf8' },
  ).trim();
  rodar2(`
    const { getDb, setSetting } = await import('${ROOT}/lib/db.js');
    const db = getDb();
    setSetting(db, 'locale', 'es-AR');
    db.exec('PRAGMA user_version = 6');
  `);
  const preservado = rodar2(`
    const { getDb, getSetting } = await import('${ROOT}/lib/db.js');
    console.log(getSetting(getDb(), 'locale') ?? 'null');
  `);
  eq('escolha humana sobrevive à migração', preservado, 'es-AR');
}

sec('data/fluxo.db intacto');
const depois = fs.existsSync(DB_REAL) ? fs.statSync(DB_REAL) : null;
ok('banco real não foi tocado',
  (antes === null && depois === null) ||
  (antes && depois && antes.size === depois.size && +antes.mtime === +depois.mtime));

fs.rmSync(TMP, { recursive: true, force: true });

console.log('\n' + '─'.repeat(72));
if (fails.length) {
  console.log(`\x1b[31m${fails.length} falha(s)\x1b[0m de ${pass + fails.length} verificações:\n`);
  fails.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  process.exit(1);
}
console.log(`\x1b[32mtudo certo\x1b[0m — ${pass} verificações`);
