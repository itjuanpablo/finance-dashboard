#!/usr/bin/env node
// Roda a suíte inteira — é o que `npm test` chama.
//
// Por que um runner em vez de sete comandos: um teste que ninguém lembra de
// rodar não é teste, é arquivo. Antes disto a suíte só rodava porque alguém
// digitava seis caminhos na ordem certa; bastava esquecer um para a rede de
// segurança ter um buraco exatamente no lugar que ninguém olhou.
//
// Cada script é um processo SEPARADO, de propósito. Eles mexem em cópias do
// banco, em variáveis de ambiente (FLUXO_DATA_DIR) e no dicionário de idioma;
// no mesmo processo, um contaminaria o outro e o resultado dependeria da ordem.
// Um teste cujo resultado depende da ordem é pior que teste nenhum, porque
// mente com confiança.

import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';

const AQUI = import.meta.dirname;

// Descobre os arquivos em vez de listá-los à mão: uma lista fixa envelhece
// calada — o teste novo é criado, ninguém acrescenta na lista, e a suíte segue
// dizendo "tudo certo" sem nunca ter rodado ele.
const testes = readdirSync(AQUI)
  .filter(f => /^(testar|verificar)-.*\.mjs$/.test(f))
  .sort();

if (!testes.length) {
  console.error('✗ Nenhum teste encontrado em scripts/testes/ — isso é um defeito, não um sucesso.');
  process.exit(1);
}

const falharam = [];
for (const arquivo of testes) {
  process.stdout.write(`\n── ${arquivo} ${'─'.repeat(Math.max(0, 60 - arquivo.length))}\n`);
  const r = spawnSync(process.execPath, [path.join(AQUI, arquivo)], {
    stdio: 'inherit',
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });
  if (r.status !== 0) falharam.push(arquivo);
}

console.log('\n' + '═'.repeat(64));
if (falharam.length) {
  console.log(`✗ ${falharam.length} de ${testes.length} falharam: ${falharam.join(', ')}`);
  process.exit(1);
}
console.log(`✓ ${testes.length} arquivos de teste, todos passaram.`);
