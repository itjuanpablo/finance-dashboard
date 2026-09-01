#!/usr/bin/env node
// Componente definido DENTRO de componente — o defeito que come acentos.
//
// ─── O sintoma, e por que ele não parece um bug de React ─────────────────────
// Ao criar uma categoria chamada "Família", o campo gravava "Fam'ilia". Nem
// todo teclado: só quando o acento é composto em dois tempos (´ e depois i),
// que é o caso do teclado brasileiro e do espanhol.
//
// ─── A causa ─────────────────────────────────────────────────────────────────
// O editor era `const Editor = () => (…)`, declarado dentro do componente da
// página. A cada tecla o estado muda, a página re-renderiza, e essa função é
// RECRIADA — uma referência nova. O React compara tipos por identidade, vê um
// tipo diferente, e conclui que é outro componente: desmonta a árvore e monta
// outra, com um <input> novo em folha.
//
// A composição do acento vive no elemento do DOM, entre uma tecla e a outra.
// Com o elemento destruído no meio, o navegador desiste da composição e grava
// o acento como caractere solto.
//
// O mesmo padrão também apaga a seleção de texto, tira o foco e faz o cursor
// pular para o fim — sintomas que a gente atribui a "coisa de navegador".
//
// ─── Por que um teste estático ───────────────────────────────────────────────
// Não dá para reproduzir tecla morta sem navegador de verdade. Mas a CAUSA é
// visível no texto: uma constante em MaiúsculaInicial recebendo função, com
// indentação de dentro de outra função. Isso o regex pega.

import path from 'node:path';
import fs from 'node:fs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

let falhas = 0;
const ok = (nome, cond, extra) => {
  if (!cond) falhas++;
  console.log(`  ${cond ? 'ok  ' : 'FALHA'} ${nome}${cond || extra === undefined ? '' : `\n        ${JSON.stringify(extra, null, 2)}`}`);
};

const arquivos = [];
for (const dir of ['app', 'components']) {
  (function varrer(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!/node_modules|\.next/.test(p)) varrer(p); }
      else if (e.name.endsWith('.js')) arquivos.push(p);
    }
  })(path.join(ROOT, dir));
}

const semComentarios = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

console.log('\n1. Nenhum componente é declarado dentro de outro');
// Indentado (não começa na coluna 0) + nome MaiúsculaInicial + recebe função.
// Componente de topo começa na coluna 0 e não casa.
const RX = /^[ \t]+const\s+([A-Z][A-Za-z0-9]*)\s*=\s*(\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/gm;
const suspeitos = [];
for (const f of arquivos) {
  const src = semComentarios(fs.readFileSync(f, 'utf8'));
  for (const m of src.matchAll(RX)) {
    const linha = src.slice(0, m.index).split('\n').length;
    // Só é componente se for USADO como <Tag />. `const Foo = () => …` que
    // vira handler não devolve JSX e não sofre do problema.
    if (new RegExp(`<${m[1]}[\\s/>]`).test(src)) {
      suspeitos.push(`${path.relative(ROOT, f)}:${linha} — ${m[1]}`);
    }
  }
}
ok('nenhum componente aninhado usado como <Tag />', suspeitos.length === 0, suspeitos);

console.log('\n2. Os dois que já morderam continuam consertados');
const ger = semComentarios(fs.readFileSync(path.join(ROOT, 'app/gerenciar/page.js'), 'utf8'));
ok('o editor de categoria é valor JSX, não componente',
  /const editorCategoria = \(/.test(ger) && !/const Editor\s*=\s*\(\)\s*=>/.test(ger));
ok('o seletor de origens também',
  /const seletorOrigens = \(/.test(ger) && !/const SourcePicker\s*=\s*\(\)\s*=>/.test(ger));
ok('nenhum uso de <Editor /> sobrou', !/<Editor[\s/>]/.test(ger));
ok('nenhum uso de <SourcePicker /> sobrou', !/<SourcePicker[\s/>]/.test(ger));

console.log('\n3. Campos de TEXTO não transformam o que o usuário digita');
// Normalizar dentro do onChange (maiúsculas, tirar acento, slug) quebra a
// composição pelo mesmo motivo: o valor volta diferente do que o campo tem.
//
// EXCEÇÃO deliberada: campo que descarta tudo que não é dígito. Nele não há
// acento a compor — é o caso do PIN. Marcar isso como defeito seria o teste
// gritando onde não dói, e teste que grita à toa é teste que se desliga.
const SO_DIGITOS = /replace\(\s*\/(\\D|\[\^0-9\])\/[gimsuy]*\s*,\s*''\s*\)/;
const transforma = [];
for (const f of arquivos) {
  const src = semComentarios(fs.readFileSync(f, 'utf8'));
  for (const m of src.matchAll(/onChange=\{[\s\S]{0,200}?e\.target\.value\s*\.\s*(toUpperCase|toLowerCase|normalize|replace)\s*\([^)]*\)/g)) {
    if (SO_DIGITOS.test(m[0])) continue;
    transforma.push(`${path.relative(ROOT, f)} — ${m[1]}()`);
  }
}
ok('nenhum onChange transforma texto digitado', transforma.length === 0, transforma);

console.log(falhas ? `\n✗ ${falhas} falha(s).` : '\ntudo certo — componentes.');
process.exit(falhas ? 1 : 0);
