#!/usr/bin/env node
// Agrupamento por estabelecimento (lib/merchant.js) + escape do LIKE.
//
// Os casos abaixo NÃO são inventados: são as descrições que apareceram na tela
// de "Revisão em massa" produzindo grupos sem sentido. Nomes de pessoa foram
// trocados; a FORMA de cada descrição é a real, que é o que o parser enxerga.

import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const { merchantKey } = await import(pathToFileURL(path.join(ROOT, 'lib/merchant.js')).href);

let falhas = 0;
const eq = (nome, obtido, esperado) => {
  const ok = obtido === esperado;
  if (!ok) falhas++;
  console.log(`  ${ok ? 'ok  ' : 'FALHA'} ${nome}${ok ? '' : `\n        obtido:   ${JSON.stringify(obtido)}\n        esperado: ${JSON.stringify(esperado)}`}`);
};

console.log('\n1. Casos que estavam quebrados na tela');
eq('prefixo não engole a frase inteira',
  merchantKey('Pagamento de fatura'), 'Pagamento de fatura');
eq('sobra o nome do credor, não "de conta"',
  merchantKey('Pagamento de conta BANCO BRADESCARD S A'), 'BANCO BRADESCARD');
eq('CPF do Pix não vira nome',
  merchantKey('Pagamento com QR Pix 13 566 909 PAULO ROBERT'), 'PAULO ROBERT');
eq('id da operadora sai do nome (1)',
  merchantKey('EBN *Canva04906'), 'Canva');
eq('id da operadora sai do nome (2)',
  merchantKey('EBN *Canva04814'), 'Canva');
eq('as duas cobranças do Canva caem no MESMO grupo',
  merchantKey('EBN *Canva04906'), merchantKey('EBN *Canva04814'));
eq('id numérico solto é descartado',
  merchantKey('JIM.COM 64589893'), 'JIM.COM');
eq('intermediário de pagamento sai',
  merchantKey('PayU *ADIDAS'), 'ADIDAS');
eq('token único sobrevive',
  merchantKey('MPYUANPABLO'), 'MPYUANPABLO');

console.log('\n2. O que NÃO pode ser estragado pelo conserto');
eq('"99" é nome de empresa, não id — não pode sumir',
  merchantKey('DL *99 Ride'), '99 Ride');
eq('número curto colado ao nome fica (Loja 25)',
  merchantKey('Compra LOJA 25'), 'LOJA 25');
eq('descrição comum passa intacta',
  merchantKey('Supermercado Center Box'), 'Supermercado Center');
eq('parcela é removida antes de tudo',
  merchantKey('Assinatura Canva (parcela 2/3)'), 'Assinatura Canva');
eq('descrição vazia devolve vazio', merchantKey(''), '');
eq('nulo não explode', merchantKey(null), '');

console.log('\n3. Regra nunca vira curinga de SQL');
// `%` e `_` são curingas do LIKE. Sem escape, uma regra "100%" recategoriza
// tudo o que estiver em revisão — em massa, silenciosamente, e sem desfazer.
// Varredura do texto, não import: a rota importa `next/server`, que só
// resolve dentro do Next. Um teste que precisa subir meio framework para
// conferir uma linha de SQL não é rodado — e teste que não roda não existe.
const { readFileSync } = await import('node:fs');
const src = readFileSync(path.join(ROOT, 'app/api/rules/route.js'), 'utf8');

eq('o LIKE declara ESCAPE', /LIKE\s+\?\s+ESCAPE/i.test(src), true);
eq('o padrão é escapado antes de entrar no LIKE',
  /replace\(\/\[\\\\%_\]\/g/.test(src), true);
eq('nenhum LIKE usa o padrão cru',
  /LIKE[^`;]*\n?[^`;]*`%\$\{p\}%`/.test(src), false);

console.log(falhas ? `\n✗ ${falhas} falha(s).` : '\ntudo certo — agrupamento e escape.');
process.exit(falhas ? 1 : 0);
