# Design: Gerenciamento de Lançamentos e Configurações

Especificação de UX/arquitetura para a área de gerenciamento do Fluxo. Documento de referência para implementação — nada aqui está codado ainda.

## Princípio organizador

O app passa a ter **duas superfícies com papéis distintos**:

| Superfície | Papel | Frequência de uso |
|---|---|---|
| **Dashboard** (`/`) | *Consumir*: ver resumos, importar, corrigir uma categoria pontual | Diária |
| **Gerenciar** (`/gerenciar`) | *Manter*: editar histórico, estruturar categorias, configurar contas | Semanal/mensal |

Essa separação evita o erro clássico de entulhar o dashboard com ferramentas de manutenção. A regra de bolso: se a ação é sobre **uma** transação, ela cabe no dashboard; se é sobre **estrutura ou lote**, vai para Gerenciar.

## Arquitetura de informação

**Uma página (`/gerenciar`) com navegação lateral fixa** — não modais, não páginas separadas:

```
┌──────────────────────────────────────────────────────┐
│ ← Fluxo          GERENCIAR                       ◐   │
├───────────┬──────────────────────────────────────────┤
│ Lançamentos│                                          │
│ Categorias │         (conteúdo da seção ativa)        │
│ Contas &   │                                          │
│  Cartões   │                                          │
│ Regras     │                                          │
│ Importações│                                          │
└───────────┴──────────────────────────────────────────┘
```

Por quê assim:

- **Sidebar > abas**: são 5 seções e vão crescer; abas horizontais estouram no mobile e escondem contexto. No mobile a sidebar vira um select no topo.
- **Página > modal**: edição de histórico exige espaço (tabela larga, filtros) e estado persistente (filtros não podem sumir ao fechar). Modal é para *sub-tarefas* dentro da seção (ex: editar uma categoria), nunca para a seção inteira.
- **Regras e Importações migram para cá**: hoje são modais no dashboard; passam a ser seções irmãs, e os botões do dashboard viram atalhos que abrem `/gerenciar?tab=regras`.
- **Rota com estado na URL** (`/gerenciar?tab=lancamentos&mes=2026-06&cat=Transporte`): filtros compartilháveis, botão voltar funciona, F5 não perde nada.

---

## 1. Lançamentos

### Layout

Barra de filtros persistente + tabela densa + barra de ações em lote flutuante.

```
[Período ▾] [Categorias ▾] [Conta/Cartão ▾] [Tipo ▾] [🔍 busca]   [⬇ CSV]
   chips ativos:  jun/2026 ✕   Transporte ✕                    limpar tudo
┌─┬────────┬──────────────────────────┬────────────┬──────────┐
│☐│ Data   │ Descrição                │ Categoria  │ Valor    │
│☐│ 03/06  │ 99* ↻                    │ Transporte │ -R$ 12,50│
└─┴────────┴──────────────────────────┴────────────┴──────────┘
        ┌────────────────────────────────────────────┐
        │ 14 selecionadas: [Categoria ▾] [Excluir] ✕ │  ← flutuante
        └────────────────────────────────────────────┘
```

### Decisões de UX

- **Edição inline, célula a célula.** Clique (ou `Enter`) na célula → vira input; `Enter` salva, `Esc` cancela, `Tab` pula para a próxima célula editável. Sem modal de edição, sem botão "salvar" — cada célula persiste sozinha (autosave otimista).
- **Desfazer em vez de confirmar.** Toda edição/exclusão mostra toast "Alterado · Desfazer" (8s). Confirmação modal só para ações em lote destrutivas (excluir >10 itens).
- **Seleção em lote esperta**: checkbox por linha, `shift+clique` seleciona intervalo, cabeçalho seleciona a página visível, e link "selecionar todas as N que casam com o filtro" (padrão Gmail). A barra flutuante só aparece com seleção ativa — custo zero quando não usada.
- **Ações em lote**: mudar categoria, marcar/desmarcar transferência, excluir. Mudar categoria em lote oferece "criar regra com base nisso?" quando as descrições compartilham um prefixo.
- **Filtros como chips removíveis** — o estado do filtro fica visível e desmontável peça por peça. Período com presets (este mês, mês passado, 3 meses, ano, personalizado).
- **Teclado**: `↑/↓` navega linhas, `espaço` seleciona, `Enter` edita, `c` abre o select de categoria, `⌘Z` desfaz a última ação da sessão.
- **Marca de edição manual**: linha editada ganha um ponto discreto "editada" com tooltip mostrando o valor original e ação "restaurar".

### Implicações técnicas (importantes!)

- **O `hash` de deduplicação NÃO é recalculado ao editar.** Ele é a identidade do documento importado, não do estado atual. Assim, reimportar o extrato de um mês com transações editadas continua deduplicando corretamente (senão a edição "ressuscitaria" a versão original).
- Guardar `original_description`, `original_amount_cents`, `original_date` (preenchidos só na primeira edição) — habilita o "restaurar" e a auditoria.
- Exclusão é *soft delete* (`deleted_at`) pelo mesmo motivo do hash: a linha excluída segue bloqueando reimportação. "Excluído" vira um filtro em Importações para inspeção.
- Novos endpoints: `PATCH /api/transactions` estendido (date/description/amount), `POST /api/transactions/bulk` (ação + ids | filtro).

---

## 2. Categorias

### Layout

Lista simples (não grid): cada linha = pastilha de cor + emoji + nome + estatísticas + ações.

```
● 🍔 Alimentação      65 transações · R$ 513/mês médio   [editar] [⋯]
● 🚗 Transporte       76 transações · R$ 290/mês médio   [editar] [⋯]
○ 🎮 Games (arquivada)                                    [restaurar]
                                              [+ Nova categoria]
```

### Decisões de UX

- **Editar num popover pequeno** (nome, emoji, paleta de 12 cores) — não modal cheio; a mudança reflete na lista em tempo real.
- **Excluir exige destino.** Categoria com transações não pode simplesmente sumir: o diálogo pergunta "mover as 132 transações para: [seletor]" ou oferece **arquivar** (some dos seletores, histórico intacto). Arquivar é o padrão sugerido; excluir de verdade só para categoria vazia.
- **Mesclar categorias** (ação no menu ⋯): move transações + regras da categoria A para B e arquiva A. Resolve o caso "criei 'Mercado' e 'Supermercado' sem querer".
- **Mostrar regras vinculadas** na linha (ex: "3 regras") — excluir/mesclar avisa o que acontece com elas.
- Estatísticas na própria lista (nº de transações, média mensal) transformam a tela de "cadastro chato" em "raio-x das categorias".

### Implicações técnicas

- Categorias saem do código (`CATEGORIES` hardcoded) e viram tabela: `categories(id, name UNIQUE, color, emoji, archived, sort_order)`. Seed inicial = as 12 atuais.
- `transactions.category` (texto) passa a `category_id` — migração simples por nome.
- Cores/emoji chegam ao front pela API que já entrega `categories`.

---

## 3. Contas & Cartões

### Layout

Duas fileiras de cards visuais (contas em cima, cartões embaixo), + card fantasma "+ adicionar".

```
CONTAS
┌───────────────┐ ┌───────────────┐ ┌ ─ ─ ─ ─┐
│ Mercado Pago  │ │ Nubank        │   + conta
│ conta pagto   │ │ corrente      │ └ ─ ─ ─ ─┘
│ R$ 1.234,56   │ │ R$ 987,00     │
└───────────────┘ └───────────────┘
CARTÕES
┌────────────────────────┐
│ MP Visa ····0007       │
│ limite R$ 3.100        │
│ fecha dia 9 · vence 15 │
│ fatura aberta: R$ 890  │
└────────────────────────┘
```

### Decisões de UX

- **Conta**: nome, instituição, tipo (corrente/pagamento/poupança), **saldo inicial + data do saldo**. O saldo atual é *calculado*: inicial + Σ movimentos da conta desde a data. Nunca pedir "saldo atual" (apodrece na hora).
- **Cartão**: nome, final do número, limite, dia de fechamento, dia de vencimento. Com isso o app passa a saber: fatura aberta vs fechada, limite disponível estimado, e o painel "Parcelas contratadas" ganha datas de cobrança reais.
- **Vínculo automático na importação**: cada arquivo importado tem origem (`mp-extrato`, `mp-fatura`, `ofx`...). Na primeira importação de uma origem nova, um passo único pergunta "de qual conta/cartão é este arquivo?" e memoriza. Zero fricção depois.
- Editar no próprio card (clique → campos viram inputs), consistente com a edição inline da tabela.
- Arquivar conta/cartão encerrado (mantém histórico, some dos seletores).

### Implicações técnicas

- Tabelas: `accounts(id, name, institution, kind, initial_cents, initial_date, archived)` e `cards(id, name, last4, limit_cents, closing_day, due_day, account_id?, archived)`.
- `transactions.account_id` + tabela `source_bindings(source_kind → account/card)` para o vínculo automático.
- Saldo calculado numa query (`initial + SUM(amount_cents) WHERE date >= initial_date`), nada armazenado.

---

## Padrões transversais

1. **Autosave otimista + desfazer** em tudo. Botão "Salvar" global não existe.
2. **URL carrega o estado** (aba + filtros) — compartilhável, F5-proof.
3. **Empty states que ensinam**: cada seção vazia explica o que ela faz e oferece a primeira ação.
4. **⌘K / Ctrl+K** (fase futura): paleta de comandos para pular entre seções e agir ("categorizar selecionadas como...").
5. **Mobile**: sidebar vira select; tabela de lançamentos vira lista de cards com swipe para ações.

## Ordem de implementação sugerida

1. **Lançamentos** (maior dor: hoje não dá para editar valor/data/descrição nem agir em lote)
2. **Categorias** (destrava personalização; migração de schema pequena)
3. **Contas & Cartões** (maior valor novo: saldo real e fatura aberta; depende de vínculo de origem)
4. Migrar Regras e Importações dos modais para a página
