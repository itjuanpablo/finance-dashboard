#!/usr/bin/env node
// Subcategorias: a dobra, as guardas, e o erro que este arquivo existe para
// impedir — contar o mesmo dinheiro duas vezes.
//
// O perigo aqui não é a soma errar por pouco. É o total do gráfico deixar de
// bater com o total do mês e ninguém notar, porque os dois números moram em
// telas diferentes. Foi assim que a contagem por categoria ficou meses
// filtrando moeda enquanto a exclusão não filtrava.

import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const {
  dobrar, apenasRaizes, paisDe, filhosDe, ordenarComFilhos,
  rotuloCompleto, problemaComPai, opcoesDeCategoria,
} = await import(pathToFileURL(path.join(ROOT, 'lib/arvore-categorias.js')).href);

let falhas = 0;
const ok = (nome, cond, extra) => {
  if (!cond) falhas++;
  console.log(`  ${cond ? 'ok  ' : 'FALHA'} ${nome}${cond || extra === undefined ? '' : `  → ${JSON.stringify(extra)}`}`);
};

// Árvore de teste: Alimentação com dois filhos, Transporte sozinho.
const CATS = [
  { key: 'alimentacao', label: 'Alimentação', emoji: '🍔' },
  { key: 'mercado', label: 'Mercado', emoji: '🛒', parent_key: 'alimentacao' },
  { key: 'restaurante', label: 'Restaurante', emoji: '🍽', parent_key: 'alimentacao' },
  { key: 'transporte', label: 'Transporte', emoji: '🚗' },
  { key: 'transfers', label: 'Transferências', system: true },
];

console.log('\n1. A dobra soma o filho no pai');
const gasto = { alimentacao: 5000, mercado: 30000, restaurante: 12000, transporte: 8000 };
const d = dobrar(gasto, CATS);
ok('pai recebe o próprio + os filhos', d.alimentacao === 47000, d.alimentacao);
ok('filho preserva o valor dele', d.mercado === 30000 && d.restaurante === 12000);
ok('quem não tem filho não muda', d.transporte === 8000);
ok('o mapa original não é tocado', gasto.alimentacao === 5000);

console.log('\n2. O ERRO QUE ISTO IMPEDE: contar duas vezes');
const totalReal = Object.values(gasto).reduce((a, b) => a + b, 0);
const somaDobradaInteira = Object.values(d).reduce((a, b) => a + b, 0);
ok('somar o mapa dobrado inteiro DÁ ERRADO (é o erro esperado)',
  somaDobradaInteira !== totalReal, { somaDobradaInteira, totalReal });
const raizes = apenasRaizes(gasto, CATS);
const somaRaizes = Object.values(raizes).reduce((a, b) => a + b, 0);
ok('somar só as raízes bate com o total real', somaRaizes === totalReal,
  { somaRaizes, totalReal });
ok('as raízes não incluem os filhos como linha',
  !('mercado' in raizes) && !('restaurante' in raizes), Object.keys(raizes));
ok('a raiz carrega o ramo inteiro', raizes.alimentacao === 47000);

console.log('\n3. Casos de borda que quebrariam a conta');
ok('mapa vazio', Object.keys(dobrar({}, CATS)).length === 0);
ok('sem categorias, devolve igual', dobrar({ a: 5 }, []).a === 5);
ok('categoria que não está na lista sobrevive', dobrar({ fantasma: 9 }, CATS).fantasma === 9);
ok('pai apontando para si mesmo não soma em dobro',
  dobrar({ x: 10 }, [{ key: 'x', parent_key: 'x' }]).x === 10);
ok('pai inexistente não cria chave nova',
  !('sumiu' in dobrar({ y: 3 }, [{ key: 'y', parent_key: 'sumiu' }])));
ok('valor negativo dobra igual', dobrar({ mercado: -500 }, CATS).alimentacao === -500);

console.log('\n4. Ordenação e exibição');
const ord = ordenarComFilhos(CATS);
ok('pai vem antes dos filhos',
  ord.findIndex(c => c.key === 'alimentacao') < ord.findIndex(c => c.key === 'mercado'));
ok('filhos ficam colados no pai',
  ord[1].key === 'mercado' && ord[2].key === 'restaurante', ord.map(c => c.key));
ok('nível marcado', ord[0].nivel === 0 && ord[1].nivel === 1);
ok('ninguém some da lista', ord.length === CATS.length, ord.length);
// Filho órfão (mãe apagada) tem de continuar visível: ele ainda tem dinheiro.
const orfao = ordenarComFilhos([{ key: 'sozinho', parent_key: 'nao-existe' }]);
ok('filho órfão aparece como raiz', orfao.length === 1 && orfao[0].nivel === 0);
ok('rótulo completo mostra a mãe',
  rotuloCompleto('mercado', CATS) === 'Alimentação › Mercado');
ok('rótulo de raiz não inventa mãe', rotuloCompleto('transporte', CATS) === 'Transporte');
const ops = opcoesDeCategoria(CATS);
// O recuo usa espaço SEM QUEBRA (U+00A0), porque `<option>` colapsa espaço
// comum. Conferir por '↳' em vez de contar espaços evita um teste que quebra
// se alguém ajustar o recuo em um caractere.
ok('opção de filho vem recuada', ops.find(o => o.key === 'mercado').texto.includes('↳'));
ok('opção de raiz não vem recuada', !ops.find(o => o.key === 'transporte').texto.includes('↳'));

console.log('\n5. Guardas: o que NÃO pode virar hierarquia');
ok('sem pai é sempre válido', problemaComPai('mercado', null, CATS) === null);
ok('pai válido passa', problemaComPai('novo', 'transporte', CATS) === null);
ok('ela mesma como mãe', problemaComPai('mercado', 'mercado', CATS) === 'manage.parentSelf');
ok('mãe que já é filha (dois níveis)',
  problemaComPai('novo', 'mercado', CATS) === 'manage.parentTooDeep');
ok('quem já tem filhos não vira filha',
  problemaComPai('alimentacao', 'transporte', CATS) === 'manage.parentHasKids');
ok('categoria de sistema fica fora',
  problemaComPai('novo', 'transfers', CATS) === 'manage.parentSystem');
ok('mãe inexistente', problemaComPai('novo', 'nada', CATS) === 'manage.parentNotFound');

console.log('\n6. Todo lugar que agrupa por categoria aplica a dobra');
// Varredura: quem monta um mapa `x[tx.category] = …` e depois exibe TEM de
// passar pela dobra. Sem isto, basta uma tela nova esquecer para o app voltar
// a mostrar dois números diferentes para a mesma pergunta.
const alvos = [
  ['app/page.js', /apenasRaizes\(spent, catList\)/, 'rosca do painel'],
  ['app/page.js', /return dobrar\(map, catList\)/, 'gasto por categoria (metas)'],
  ['app/relatorio/page.js', /apenasRaizes\(bruto, catList\)/, 'tabela do relatório'],
  ['app/relatorio/page.js', /catsDetalhe\[g\.category\]/, 'orçado × real'],
  ['app/cartoes/page.js', /apenasRaizes\(invoice\.by_category/, 'categorias da fatura'],
  ['lib/insights.js', /dobrar\(byMonthCat\[ym\], categorias\)/, 'insights por categoria'],
];
for (const [arquivo, rx, oque] of alvos) {
  const src = fs.readFileSync(path.join(ROOT, arquivo), 'utf8');
  ok(`${oque} (${arquivo})`, rx.test(src));
}

console.log('\n7. O esquema acompanha');
const db = fs.readFileSync(path.join(ROOT, 'lib/db.js'), 'utf8');
ok('SCHEMA_VERSION subiu para 11', /const SCHEMA_VERSION = 11;/.test(db));
ok('parent_key é criada por migração', /parent_key: 'TEXT'/.test(db));
ok('categoryRows devolve parent_key', /custom, parent_key\s*\n?\s*FROM categories/.test(db));

console.log(falhas ? `\n✗ ${falhas} falha(s).` : '\ntudo certo — subcategorias.');
process.exit(falhas ? 1 : 0);
