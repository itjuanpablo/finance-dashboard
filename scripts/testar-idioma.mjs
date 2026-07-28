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

const ROOT = path.resolve(import.meta.dirname, '..');
const TMP = fs.mkdtempSync('/tmp/fluxo-teste-idioma-');
process.env.FLUXO_DATA_DIR = path.join(TMP, 'data');
fs.mkdirSync(process.env.FLUXO_DATA_DIR, { recursive: true });

const DB_REAL = path.join(ROOT, 'data', 'fluxo.db');
const antes = fs.existsSync(DB_REAL) ? fs.statSync(DB_REAL) : null;

const { getDb, setSetting, getSetting, localeSettings } =
  await import(path.join(ROOT, 'lib/db.js'));
const { t } = await import(path.join(ROOT, 'lib/i18n/index.js'));
const { fmtMoney, fmtMonthLong, fmtDate, currencySymbol } =
  await import(path.join(ROOT, 'lib/format.js'));
const { resolveLocale, resolveCurrency, DEFAULT_LOCALE } =
  await import(path.join(ROOT, 'lib/config.js'));

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
eq('semeia locale a partir do .env/padrão', getSetting(db, 'locale'), DEFAULT_LOCALE);
eq('semeia moeda derivada do idioma', getSetting(db, 'currency'), 'BRL');
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
setSetting(db, 'locale', 'xx-YY');
eq('idioma desconhecido cai no padrão', resolveLocale(), DEFAULT_LOCALE);
ok('e ainda traduz', t('dash.income') === 'Entradas');
setSetting(db, 'locale', 'pt-BR');

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
