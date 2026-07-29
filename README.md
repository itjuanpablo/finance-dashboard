# Fluxo — Finanças Pessoais

Dashboard local de finanças: importa extratos e faturas (PDF, OFX, CSV), categoriza automaticamente e aprende com suas correções. Dados 100% na sua máquina (`data/fluxo.db`), nada sai do seu computador.

> Sucessor do Finance Dashboard v1.2.0 (HTML + localStorage), preservado no histórico (tags `v1.0.0` e `v1.2.0`).

## Requisitos

- **Node.js 22.13 ou superior** (usa o SQLite embutido do Node — sem compilação nativa).
  Verifique com `node -v`. Para atualizar: https://nodejs.org

## Como rodar

```bash
bash scripts/instalar.sh
```

Confere o Node, instala as dependências travadas no lock, pergunta o idioma
inicial e roda a suíte de testes antes de liberar o uso — um app de finanças que
não passa nos próprios testes pode mostrar número errado sem avisar.

Manualmente, se preferir:

```bash
npm ci                       # `ci`, não `install`: usa as versões do lock
cp .env.example .env.local   # idioma inicial (opcional; padrão pt-BR)
npm run dev
```

Abra http://localhost:3000 e arraste seus arquivos na área de upload.

> O aviso "SQLite is an experimental feature" no terminal é normal e inofensivo.

## Idioma e moeda

O Fluxo fala **português (pt-BR)** e **espanhol (es-AR)**. Troque pelo botão 🌐
no cabeçalho — a escolha fica salva no seu banco e vale na hora, sem editar
arquivo nem reiniciar o servidor.

Muda de uma vez: textos da interface, formato de número e data, nomes das
categorias, o dicionário de categorização automática (comércios do país) e os
perfis de banco preferidos na detecção do arquivo importado.

**Moeda é um campo separado, de propósito.** Os lançamentos são guardados em
centavos, sem moeda: se trocar o idioma trocasse a moeda junto, um saldo de
R$ 1.000 viraria $ 1.000 em pesos — mesmo número, outro significado, sem
conversão nenhuma. Uma instalação nova deriva a moeda do idioma inicial; depois
disso, só muda quem mexer explicitamente.

Para semear a primeira execução (útil ao instalar para outra pessoa):

```bash
# .env.local — só o valor INICIAL; a partir da primeira troca na tela, o banco manda
NEXT_PUBLIC_FLUXO_LOCALE=es-AR
```

Verificação: `node scripts/verificar-i18n.mjs` confere que nenhuma frase ficou
sem tradução; `node scripts/testar-idioma.mjs` garante que a troca funciona e
que a moeda não muda junto. Arquitetura em [`docs/i18n.md`](docs/i18n.md).

### Segunda instância

O Fluxo não é multiusuário. Para outra pessoa (ou para separar contas), rode uma
segunda cópia com o próprio banco:

```bash
git clone <repo> fluxo-2 && cd fluxo-2
npm install
npm run dev -- -p 3001
```

O banco nasce vazio; o idioma se escolhe na tela. Nada é compartilhado entre
instâncias — inclusive de propósito.

## Rodar sempre, sem terminal (macOS)

```bash
bash scripts/instalar-autostart.sh
```

Isso registra o Fluxo no launchd: ele sobe sozinho no login, reinicia se cair, e fica sempre disponível em **http://localhost:3210** — salve nos favoritos e lance seus gastos quando quiser, sem `npm run dev`.

Comandos úteis: `bash scripts/atualizar.sh` (após mudar o código) e `bash scripts/desinstalar-autostart.sh` (remove o serviço; app e dados ficam intactos). Logs em `~/Library/Logs/fluxo.log`.

## Funcionalidades

**Importação e dados**

- PDF do Mercado Pago (extrato de conta e fatura de cartão), com parsers validados ao centavo contra os totais declarados nos documentos; OFX e CSV de qualquer banco.
- **Perfis de banco** (`lib/banks/`): registry declarativo que reconhece o layout do arquivo pelo cabeçalho — Nubank, Itaú, Bradesco, Banco do Brasil, Inter, C6 no Brasil; Mercado Pago AR, Galicia, Santander, BBVA, Brubank, Ualá, Naranja X na Argentina. Cada perfil declara seu grau de confiança; o que não é reconhecido cai no parser genérico em vez de errar calado. Ver [`lib/banks/README.md`](lib/banks/README.md).
- Deduplicação: reimportar o mesmo arquivo ou períodos sobrepostos não duplica nada (ID de operação do banco no extrato, hash de conteúdo no resto).
- Desfazer importação: cada arquivo vira um lote que pode ser revertido em um clique (menu **Importações**).
- Transferências internas (pagamento de fatura, reservas) ficam fora dos totais — sem contagem dupla entre extrato e fatura.

**Categorização**

- Automática por dicionário de palavras-chave; o que não for reconhecido cai em "A revisar".
- Ao corrigir uma transação, o app cria uma regra, aplica retroativamente às parecidas e usa nas próximas importações.
- Menu **Regras** para ver, editar ou excluir as regras aprendidas.

**Gerenciamento** (página `/gerenciar`)

- Lançamentos: edição inline de data, descrição e valor (Enter salva, Esc cancela), com original preservado e "restaurar"; seleção em lote (shift+clique para intervalo) para recategorizar ou excluir; toda ação tem "Desfazer".
- Categorias: criar, editar (nome, cor, emoji), arquivar ou excluir movendo as transações para outra categoria. Renomear não move dado nenhum: cada categoria tem uma chave estável e o nome é só exibição — renomear uma categoria padrão apenas desliga a tradução dela e passa a usar o seu nome.
- Contas: saldo calculado (inicial + movimentos das origens vinculadas), nunca digitado.
- Cartões: limite, dias de fechamento/vencimento, fatura aberta e limite disponível estimados.
- Exclusões são reversíveis (soft delete) e não quebram a deduplicação de reimportações.

**Análise e insights**

- Motor de insights com regras transparentes: gasto acima da média histórica, assinatura que subiu de preço, meta em risco, fatura perto de fechar e sugestão de corte com impacto anualizado — cada card mostra o número que o gerou e é dispensável.
- Entradas, saídas, saldo e projeção do mês; gráfico de rosca por categoria.
- **Metas** de gasto por categoria com barra de progresso (verde/âmbar/vermelho).
- **Evolução mensal** dos últimos 6 meses (entradas × saídas).
- **Parcelas já contratadas**: compromissos futuros do cartão detectados a partir das parcelas das faturas.
- Detecção de **despesas recorrentes** (↻) com alerta quando o valor muda (assinatura que subiu de preço, por exemplo).
- Exportação **CSV** das transações filtradas; busca, filtro por mês, categoria e tipo; tema claro/escuro.

## Estrutura

```
app/                páginas e API (Next.js App Router)
lib/parsers/        mercadopago.js (PDF), ofx.js, csv.js, labels.js
lib/banks/          perfis de banco por país (detecção e mapeamento de colunas)
lib/categorizer.js  dicionário de categorias (BR e AR) + regras aprendidas
lib/categories.js   chaves estáveis de categoria (independentes de idioma)
lib/i18n/           dicionários pt-BR e es-AR + t()
lib/config.js       resolve idioma e moeda ativos (banco → .env → padrão)
lib/locale-state.js estado do locale no servidor (sem ciclo de import)
lib/parsers/encoding.js  detecta UTF-8, UTF-16 e Windows-1252 (e mojibake)
lib/format.js       moeda, data e número no formato local
lib/importer.js     pipeline: parse → categoriza → deduplica → SQLite
data/fluxo.db       seu banco (criado no primeiro uso; está no .gitignore)
```

## Testes

Sem framework, sem dependência: cada um é um `.mjs` executável que imprime o que
verificou e devolve exit 1 se falhar.

```bash
node scripts/testar-parsers.mjs        # parsers, perfis de banco, categorizador
node scripts/testar-importacao.mjs     # pipeline: parse → categoriza → deduplica → grava
node scripts/testar-api-categorias.mjs # rotas de categoria sobre cópia do banco
node scripts/verificar-i18n.mjs        # paridade das chaves de tradução
node scripts/testar-idioma.mjs         # troca de idioma; moeda não segue junto
```

Nenhum deles toca `data/fluxo.db`: os que precisam de banco copiam para `/tmp`
via `FLUXO_DATA_DIR` e conferem no fim que o original não mudou.

## Privacidade e segurança

Todo o processamento é local. O repositório contém apenas código: o banco (`data/`), logs e builds estão no `.gitignore`.

## Backup

Copie o arquivo `data/fluxo.db`. Isso é tudo.

## Histórico

Veja as notas das versões em:
[Releases - Fluxo](https://github.com/itjuanpablo/finance-dashboard/releases)

## Licença

[MIT](./LICENSE)
