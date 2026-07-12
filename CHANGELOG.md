# Changelog

Todas as mudanças relevantes do projeto. Formato inspirado em [Keep a Changelog](https://keepachangelog.com/pt-BR/); versões seguem [SemVer](https://semver.org/lang/pt-BR/).

## [2.2.0] — 2026-07-12

### Adicionado
- **Motor de insights** no dashboard (`lib/insights.js`): regras transparentes que mostram o número que as gerou — gasto acima da média histórica (pró-rateado pelo dia do mês), assinatura/recorrência que subiu de preço, meta em risco com dia projetado de estouro, fatura próxima do fechamento e sugestão de corte com maior impacto anualizado. Máximo de 3 cards, dispensáveis por mês, ordenados por impacto em R$.
- Salvaguarda estatística: a regra de média só dispara com 3+ lançamentos no mês (projeção de lançamento único não é tendência).

### Alterado
- **Nova identidade visual**: favicon e logo redesenhados — marca da "confluência" (dois fluxos convergindo num traço ascendente), aplicada no favicon (`app/icon.svg`) e nos headers.
- `.gitignore` reforçado: extratos/faturas (`*.pdf`, `*.ofx`, `*.csv`), banco de dados e documentos de trabalho nunca sobem ao remoto.

## [2.1.0] — 2026-07-12

### Adicionado
- Página **Gerenciar** (`/gerenciar`): edição inline de lançamentos (data, descrição, valor) com original preservado e "restaurar"; seleção em lote com shift+clique (recategorizar/excluir); CRUD de categorias com cores, emoji, arquivamento e exclusão com migração de transações; contas com saldo calculado (inicial + movimentos das origens vinculadas); cartões com limite, ciclo de fechamento e fatura aberta.
- Exclusão reversível (soft delete) que preserva a deduplicação de reimportações.
- Migração automática de schema para bancos de versões anteriores.
- Favicon inicial e scripts de execução como serviço no macOS (launchd).

## [2.0.0] — 2026-07-12

### Adicionado
- Reescrita completa: Next.js 14 + SQLite embutido do Node (`node:sqlite`), dados 100% locais.
- Importação de extratos e faturas: PDF (Mercado Pago, parsers validados ao centavo), OFX e CSV genéricos.
- Deduplicação por ID de operação/hash de conteúdo — reimportar nunca duplica.
- Categorização automática com regras que aprendem das correções (aplicação retroativa).
- Transferências internas fora dos totais (sem contagem dupla extrato × fatura).
- Dashboard: resumo do mês, projeção de gastos, rosca por categoria, metas com progresso, evolução de 6 meses, parcelas futuras contratadas, detecção de recorrências, busca/filtros, exportação CSV, desfazer importação, tema claro/escuro.

## [1.x] — legado

Versão original em HTML + localStorage (tags `v1.0.0` e `v1.2.0` no histórico).
