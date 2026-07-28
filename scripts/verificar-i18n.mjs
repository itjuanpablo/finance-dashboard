#!/usr/bin/env node
// Verificador de i18n: roda com `node scripts/verificar-i18n.mjs`.
//
// Por que existe: `t()` cai no dicionário pt-BR quando a chave falta no locale
// ativo. Isso evita tela quebrada, mas esconde tradução esquecida: quem usa o
// app em espanhol veria uma frase em português no meio da tela e pensaria que é
// assim mesmo. Este script transforma esse silêncio em erro de CI.
//
// Confere:
//   1. toda chave usada no código existe nos dois dicionários
//   2. os dois dicionários têm exatamente o mesmo conjunto de chaves
//   3. as 12 categorias canônicas têm nome em todos os locales
//   4. nenhuma tradução es-AR ficou idêntica ao português (cópia esquecida)
//   5. imperativo em espanhol no voseo (não "arrastra"/"elige"/"guarda")
//
// Exit 1 se algo falhar.

import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const rel = (p) => path.relative(ROOT, p);

const LOCALES = ['pt-BR', 'es-AR'];
const dicts = {};
for (const loc of LOCALES) {
  dicts[loc] = (await import(path.join(ROOT, 'lib/i18n', `${loc}.js`))).default;
}
const { CATEGORY_SEED } = await import(path.join(ROOT, 'lib/categories.js'));

// ── coleta das chaves usadas no código ─────────────────────────────────────
const files = [];
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      // os dicionários em si não são "uso" de chave
      if (!/node_modules|\.next|lib\/i18n/.test(p)) walk(p);
    } else if (e.name.endsWith('.js')) files.push(p);
  }
}
['app', 'components', 'lib'].forEach(d => walk(path.join(ROOT, d)));

const used = new Map(); // chave → primeiro arquivo que a usa
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/\bt\(\s*'([^']+)'/g)) {
    if (!used.has(m[1])) used.set(m[1], f);
  }
  // tn(n, 'chave') expande para chave.one / chave.other
  for (const m of src.matchAll(/\btn\(\s*[^,]+,\s*'([^']+)'/g)) {
    for (const s of ['one', 'other']) {
      if (!used.has(`${m[1]}.${s}`)) used.set(`${m[1]}.${s}`, f);
    }
  }
}

// ── verificações ───────────────────────────────────────────────────────────
const falhas = [];
const avisos = [];

for (const loc of LOCALES) {
  for (const [key, file] of used) {
    if (!(key in dicts[loc])) {
      falhas.push(`chave '${key}' usada em ${rel(file)} não existe em ${loc}`);
    }
  }
}

const [a, b] = LOCALES;
for (const k of Object.keys(dicts[a])) {
  if (!(k in dicts[b])) falhas.push(`chave '${k}' existe em ${a} mas falta em ${b}`);
}
for (const k of Object.keys(dicts[b])) {
  if (!(k in dicts[a])) falhas.push(`chave '${k}' existe em ${b} mas falta em ${a}`);
}

for (const [key] of CATEGORY_SEED.map(s => [s[0]])) {
  for (const loc of LOCALES) {
    if (!dicts[loc][`cat.${key}`]) falhas.push(`categoria '${key}' sem nome em ${loc}`);
  }
}

// Tradução idêntica ao português: pode ser legítima (nome próprio, "Total",
// "Transporte") — daí ser AVISO, não falha. Uma lista de exceções conhecidas
// evita ruído.
const IGUAL_OK = new Set([
  'app.name', 'export.csvHead', 'bank.generic.ofx', 'bank.generic.csv',
]);
const iguaisEsperados = /^(cat\.|month\.|bank\.)/;
for (const [k, v] of Object.entries(dicts['pt-BR'])) {
  if (IGUAL_OK.has(k) || iguaisEsperados.test(k)) continue;
  if (typeof v === 'string' && dicts['es-AR'][k] === v && v.length > 3) {
    avisos.push(`'${k}' idêntica nos dois idiomas: ${JSON.stringify(v.slice(0, 50))}`);
  }
}

// Voseo: o imperativo argentino é "arrastrá", não "arrastra".
//
// A fronteira é `(?<![\p{L}])…(?![\p{L}])` e não `\b`: o `\b` do JS é ASCII, então
// "poné" casaria com `\bpon\b` (o "é" conta como fronteira) e o verificador
// acusaria de tuteo exatamente a forma correta de voseo. Também evita pegar
// "editar" dentro de `\bedita`.
//
// Fica de fora o indicativo, que é legítimo: "Deshacer borra solo…" descreve o
// que o botão faz, não manda ninguém fazer nada. Por isso a lista traz apenas
// verbos cujo imperativo de tuteo difere do voseo, e o resultado é AVISO — quem
// lê decide.
const TUTEO = new RegExp(
  '(?<![\\p{L}])(arrastra|elige|guarda|corrige|revisa|agrega|ingresa|escribe|' +
  'selecciona|confirma|carga|edita|desliza|presiona|marca|ordena)(?![\\p{L}])',
  'iu');
for (const [k, v] of Object.entries(dicts['es-AR'])) {
  if (typeof v === 'string' && TUTEO.test(v)) {
    avisos.push(`'${k}' parece tuteo (esperado voseo): ${JSON.stringify(v.slice(0, 60))}`);
  }
}

// ── relatório ──────────────────────────────────────────────────────────────
const nChaves = Object.keys(dicts['pt-BR']).length;
console.log(`chaves usadas no código: ${used.size}`);
LOCALES.forEach(l => console.log(`dicionário ${l}: ${Object.keys(dicts[l]).length} chaves`));

if (avisos.length) {
  console.log(`\navisos (${avisos.length}) — não falham o build, revise com olho humano:`);
  console.log('  · "idêntica nos dois idiomas" costuma ser cognato legítimo (Total, Saldo).');
  console.log('  · "parece tuteo" pega também o INDICATIVO, que é correto:');
  console.log('    "shift+clic selecciona un rango" descreve, não manda — está certo.');
  avisos.forEach(m => console.log('  ~', m));
}
if (falhas.length) {
  console.log(`\nFALHAS (${falhas.length}):`);
  falhas.forEach(m => console.log('  ✗', m));
  process.exit(1);
}
console.log(`\nOK — ${used.size} chaves usadas, ${nChaves} definidas nos ${LOCALES.length} idiomas, nenhuma faltando.`);
