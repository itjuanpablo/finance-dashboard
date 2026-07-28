# Fluxo — Finanças Pessoais

Dashboard local de finanças: importa extratos e faturas (PDF, OFX, CSV), categoriza automaticamente e aprende com suas correções. Dados 100% na sua máquina (`data/fluxo.db`), nada sai do seu computador.

> Sucessor do Finance Dashboard v1.2.0 (HTML + localStorage), preservado no histórico (tags `v1.0.0` e `v1.2.0`).

## Requisitos

- **Node.js 22.13 ou superior** (usa o SQLite embutido do Node — sem compilação nativa).
  Verifique com `node -v`. Para atualizar: https://nodejs.org

## Como rodar

```bash
npm install
cp .env.example .env.local   # escolha idioma e moeda (opcional; padrão pt-BR)
npm run dev
```

Abra http://localhost:3000 e arraste seus arquivos na área de upload.

> O aviso "SQLite is an experimental feature" no terminal é normal e inofensivo.

## Idioma e moeda

O Fluxo fala **português (pt-BR)** e **Espanhol**. Como cada pessoa roda
a sua instância com o próprio banco, o idioma é fixo por instalação: não há seletor na tela, e por isso nada de login, sessão ou hidratação.

```bash
# .env.local
NEXT_PUBLIC_FLUXO_LOCALE=es-AR   # pt-BR (padrão) | es-AR
```

Verificação: `node scripts/verificar-i18n.mjs` confere que toda chave usada no código existe nos dois idiomas e avisa sobre tradução esquecida ou tuteo onde deveria haver voseo. Detalhes de arquitetura em [`docs/i18n.md`](docs/i18n.md).

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
lib/config.js       locale e moeda da instância
lib/format.js       moeda, data e número no formato local
lib/importer.js     pipeline: parse → categoriza → deduplica → SQLite
data/fluxo.db       seu banco (criado no primeiro uso; está no .gitignore)
```

## Testes

Sem framework, sem dependência: cada um é um `.mjs` executável que imprime o que
verificou e devolve exit 1 se falhar.

```bash
node scripts/testar-parsers.mjs        # parsers, perfis de banco, categorizador
node scripts/testar-api-categorias.mjs # rotas de categoria sobre cópia do banco
node scripts/verificar-i18n.mjs        # paridade das chaves de tradução
```

Nenhum deles toca `data/fluxo.db`: os que precisam de banco copiam para `/tmp`
via `FLUXO_DATA_DIR` e conferem no fim que o original não mudou.

## Privacidade e segurança

Todo o processamento é local. O repositório contém apenas código: o banco (`data/`), logs e builds estão no `.gitignore`. **Nunca comite extratos ou faturas reais** — nem como arquivo de teste.

## Backup

Copie o arquivo `data/fluxo.db`. Isso é tudo.

## Histórico

Veja as notas das versões em:
[Releases - Fluxo](https://github.com/itjuanpablo/finance-dashboard/releases)

## Licença

[MIT](./LICENSE)
