# Fluxo — Finanças Pessoais

Dashboard local de finanças: importa extratos e faturas (PDF do Mercado Pago, OFX, CSV), categoriza automaticamente e aprende com suas correções. Dados 100% na sua máquina (`data/fluxo.db`) — nada sai do seu computador.

> Sucessor do Finance Dashboard v1.2.0 (HTML + localStorage), preservado no histórico do git (tags `v1.0.0` e `v1.2.0`).

## Requisitos

- **Node.js 22.13 ou superior** (usa o SQLite embutido do Node — sem compilação nativa).
  Verifique com `node -v`. Para atualizar: https://nodejs.org

## Como rodar

```bash
npm install
npm run dev
```

Abra http://localhost:3000 e arraste seus arquivos na área de upload.

> O aviso "SQLite is an experimental feature" no terminal é normal e inofensivo.

## Funcionalidades

**Importação e dados**

- PDF do Mercado Pago (extrato de conta e fatura de cartão), com parsers validados ao centavo contra os totais declarados nos documentos; OFX e CSV genéricos de qualquer banco.
- Deduplicação: reimportar o mesmo arquivo ou períodos sobrepostos não duplica nada (ID de operação do banco no extrato, hash de conteúdo no resto).
- Desfazer importação: cada arquivo vira um lote que pode ser revertido em um clique (menu **Importações**).
- Transferências internas (pagamento de fatura, reservas) ficam fora dos totais — sem contagem dupla entre extrato e fatura.

**Categorização**

- Automática por dicionário de palavras-chave; o que não for reconhecido cai em "A revisar".
- Ao corrigir uma transação, o app cria uma regra, aplica retroativamente às parecidas e usa nas próximas importações.
- Menu **Regras** para ver, editar ou excluir as regras aprendidas.

**Análise**

- Entradas, saídas, saldo e projeção do mês; gráfico de rosca por categoria.
- **Metas** de gasto por categoria com barra de progresso (verde/âmbar/vermelho).
- **Evolução mensal** dos últimos 6 meses (entradas × saídas).
- **Parcelas já contratadas**: compromissos futuros do cartão detectados a partir das parcelas das faturas.
- Detecção de **despesas recorrentes** (↻) com alerta quando o valor muda (assinatura que subiu de preço, por exemplo).
- Exportação **CSV** das transações filtradas; busca, filtro por mês, categoria e tipo; tema claro/escuro.

## Estrutura

```
app/                páginas e API (Next.js App Router)
lib/parsers/        mercadopago.js (PDF), ofx.js, csv.js
lib/categorizer.js  dicionário de categorias + regras aprendidas
lib/importer.js     pipeline: parse → categoriza → deduplica → SQLite
data/fluxo.db       seu banco (criado no primeiro uso; está no .gitignore)
```

## Privacidade

Todo o processamento é local. O repositório contém apenas código: o banco (`data/`), logs e builds estão no `.gitignore`. **Nunca comite extratos ou faturas reais** — nem como arquivo de teste.

## Backup

Copie o arquivo `data/fluxo.db`. Isso é tudo.

## Licença

[MIT](./LICENSE)
