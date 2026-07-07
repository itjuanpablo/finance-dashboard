# Finance Dashboard — Arquitetura

Plataforma local de finanças pessoais. Stack: **Next.js 14 (App Router) + CSS próprio + SQLite embutido do Node (`node:sqlite`)**. Roda com `npm run dev`, sem servidor externo, dados 100% na sua máquina.

> Decisões revisadas na implementação: Prisma/better-sqlite3 → `node:sqlite` (zero dependência nativa, zero codegen); Tailwind → CSS do protótipo aprovado (portado 1:1, menos uma camada de build). PDF via `pdf-parse`, com parsers calibrados nos arquivos reais do Mercado Pago.

## Visão geral do fluxo

```
[PDF / OFX / CSV]
      │  drag & drop
      ▼
POST /api/import  ──►  Detecção de formato
      │                 ├─ OFX  → parser nativo (xml/sgml)
      │                 ├─ CSV  → papaparse + heurística de colunas
      │                 └─ PDF  → pdf-parse + regex por layout de banco
      ▼
Normalização (data, valor, descrição, tipo)
      ▼
Deduplicação (hash: data+valor+descrição)
      ▼
Categorização automática
      ├─ 1º: regras do usuário (ex: "UBER" → Transporte)
      ├─ 2º: dicionário de palavras-chave embutido
      └─ 3º: sem match → categoria "A revisar" (única intervenção manual)
      ▼
SQLite (prisma/dev.db)
      ▼
Dashboard (gráficos, resumo, tabela)
```

## Estrutura de pastas

```
finance-dashboard/
├── app/
│   ├── page.tsx              # Dashboard principal
│   ├── layout.tsx            # Tema claro/escuro, fontes
│   └── api/
│       ├── import/route.ts   # Upload + parsing + persistência
│       ├── transactions/     # CRUD, busca, filtros
│       └── categories/       # Categorias e regras
├── lib/
│   ├── parsers/              # ofx.ts, csv.ts, pdf/ (um módulo por banco)
│   ├── categorizer.ts        # Motor de regras + palavras-chave
│   └── dedupe.ts
├── components/               # UploadZone, DonutChart, SummaryCards, TxTable
├── prisma/schema.prisma
└── package.json
```

## Modelo de dados (SQLite)

| Tabela | Campos principais |
|---|---|
| `Transaction` | id, date, description, amount, type (in/out), categoryId, sourceFile, hash (unique) |
| `Category` | id, name, color, icon |
| `Rule` | id, pattern (contém/regex), categoryId — aprende quando você recategoriza |
| `ImportBatch` | id, fileName, importedAt, count — permite desfazer uma importação |

## Decisões-chave

1. **Aprendizado por regras, não ML**: quando você corrige a categoria de "PADARIA STELLA", o app oferece criar a regra `PADARIA STELLA → Alimentação`. Determinístico, transparente, zero dependência externa.
2. **Hash de deduplicação**: reimportar o mesmo extrato não duplica nada.
3. **PDF é o formato frágil**: cada banco tem layout próprio. Por isso `lib/parsers/pdf/` é modular — um arquivo por banco (nubank.ts, itau.ts...). *Preciso dos seus arquivos reais para escrever esses parsers.* OFX é sempre preferível quando o banco oferece.
4. **Projeção de gastos**: média diária do mês corrente × dias restantes, ponderada excluindo lançamentos atípicos (> 2 desvios-padrão).

## Fases

1. ✅ Protótipo do frontend (`prototipo.html`)
2. ✅ Scaffold Next.js + SQLite + CRUD
3. ✅ Parsers PDF Mercado Pago (calibrados nos arquivos reais) + OFX/CSV genéricos
4. ✅ Motor de categorização + regras aprendidas (retroativas)
5. ✅ Polimento: metas por categoria, evolução mensal, parcelas futuras, recorrências, desfazer importação, exportar CSV
6. Possível futuro: autenticação + banco gerenciado para acesso remoto
