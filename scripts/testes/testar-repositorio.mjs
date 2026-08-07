#!/usr/bin/env node
// A suíte defende a própria existência.
//
// ─── Por que este arquivo existe ─────────────────────────────────────────────
// Os testes foram movidos para scripts/testes/ e, sem ninguém notar, saíram do
// repositório: `.gitignore` tinha `scripts/*`, que casa a PASTA `testes`
// também, e o git não entra em pasta ignorada — então a exceção
// `!scripts/*.mjs` nunca alcançava o conteúdo dela.
//
// O commit dizia "agrupa os testes e cria npm test". O push funcionou. E o que
// subiu foi um projeto sem suíte nenhuma. Localmente tudo continuou verde,
// porque os arquivos estavam no disco — só não estavam versionados.
//
// É o pior formato de defeito que este projeto conhece: aquele em que todo
// sinal disponível diz que deu certo. Daí este teste, que roda a cada `npm
// test` e pergunta uma coisa que nenhum outro pergunta: "eu existo para quem
// clonar isto?"

import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const AQUI = import.meta.dirname;

let falhas = 0;
const ok = (nome, cond, extra) => {
  if (!cond) falhas++;
  console.log(`  ${cond ? 'ok  ' : 'FALHA'} ${nome}${cond || extra === undefined ? '' : `  → ${JSON.stringify(extra)}`}`);
};

const git = (...args) => {
  try {
    return { saida: execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim(), codigo: 0 };
  } catch (e) {
    return { saida: String(e.stdout || '').trim(), codigo: e.status ?? 1 };
  }
};

const temGit = fs.existsSync(path.join(ROOT, '.git'));
if (!temGit) {
  // Instalação do usuário final não tem .git — e aí não há o que conferir.
  console.log('  (sem repositório git aqui; nada a verificar)');
  console.log('\ntudo certo — repositório.');
  process.exit(0);
}

const testes = fs.readdirSync(AQUI).filter(f => f.endsWith('.mjs'));

console.log('\n1. Todo arquivo de teste é versionável');
const ignorados = testes.filter(f => git('check-ignore', '-q', `scripts/testes/${f}`).codigo === 0);
ok('nenhum teste está no .gitignore', ignorados.length === 0, ignorados);

console.log('\n2. O runner existe e é o que o npm test chama');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
ok('package.json declara o script de teste', typeof pkg.scripts?.test === 'string', pkg.scripts?.test);
const alvo = String(pkg.scripts?.test || '').match(/scripts\/\S+\.mjs/)?.[0];
ok('o caminho que o npm test chama existe', alvo && fs.existsSync(path.join(ROOT, alvo)), alvo);

console.log('\n3. Quem instala NÃO recebe os testes');
// `git check-attr` responde "unspecified" para padrão de diretório mesmo com a
// regra valendo — quem diz a verdade é o próprio `git archive`, que é o que o
// GitHub serve em /tarball/. Conferir pela ferramenta errada já me fez anunciar
// um defeito que não existia.
const arq = git('archive', 'HEAD');
if (arq.codigo !== 0) {
  console.log('  (sem commit ainda; pulando a conferência do tarball)');
} else {
  const lista = git('archive', 'HEAD', '--format=tar').saida;
  const nomes = execFileSync('bash', ['-c', 'git archive HEAD | tar t'],
    { cwd: ROOT, encoding: 'utf8' }).split('\n');
  const vazados = nomes.filter(n => /^scripts\/testes\//.test(n) && n.endsWith('.mjs'));
  ok('nenhum teste vai no tarball da release', vazados.length === 0, vazados);
  ok('os .sh de instalação VÃO no tarball',
    nomes.some(n => n === 'scripts/criar-atalho.sh'));
}

console.log('\n4. Nada de pessoal pode ser versionado');
for (const proibido of ['data/fluxo.db', 'extrato.pdf', 'fatura.csv', '.env']) {
  ok(`${proibido} está ignorado`, git('check-ignore', '-q', proibido).codigo === 0);
}

console.log(falhas ? `\n✗ ${falhas} falha(s).` : '\ntudo certo — repositório.');
process.exit(falhas ? 1 : 0);
