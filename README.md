# 💰 Finance Dashboard

> Aplicação web de controle financeiro pessoal — 100% client-side, sem servidor, com sincronização via GitHub e importação inteligente de extratos por IA.

[![Version](https://img.shields.io/badge/versão-1.2.0-blue)](#changelog)
[![Stack](https://img.shields.io/badge/stack-HTML%20%2F%20CSS%20%2F%20JS-yellow)](#tecnologias)
[![License](https://img.shields.io/badge/licença-MIT-green)](#)

---

## 📌 Sobre o projeto

Sistema de gestão financeira pessoal desenvolvido para substituir planilhas e apps genéricos. Roda inteiramente no navegador — sem backend, sem banco de dados remoto, sem mensalidade. Os dados ficam persistidos no `localStorage` do browser e podem ser sincronizados entre dispositivos via um repositório privado do GitHub.

A interface foi construída com foco em clareza e velocidade de uso: lançar uma transação leva menos de 10 segundos.

---

## 🚀 Funcionalidades

### 📊 Dashboard
- Métricas do mês em destaque: total de gastos, receitas, saldo e valor fixo mensal
- Gráfico de barras de gastos por categoria com marcação visual do limite definido
- Gráfico de linha com evolução dos últimos 6 meses (gastos vs receitas)
- Lista das últimas transações do mês
- Navegação por mês com setas (◁ ▷)

### 💸 Lançamentos
- Formulário rápido: data, descrição, valor, categoria, tipo (gasto/receita) e cartão
- Lista filtrável por tipo (Todos / Gastos / Receitas) com busca por texto
- Exclusão individual de transações
- Identificação visual de transações fixas com badge "fixa"
- **Importação de extratos bancários** via modal:
  - **CSV** — compatível com Nubank, Inter, C6, Itaú, Bradesco e Mercado Pago (detecta automaticamente o separador e ignora linhas de cabeçalho/resumo antes da tabela de dados)
  - **OFX** — padrão bancário universal
  - **PDF** — usa a *API Claude (Anthropic) para extrair transações visualmente, funciona com qualquer layout de extrato, inclusive PDFs escaneados
  - Preview editável antes de confirmar: ajuste de categoria e cartão por linha
  - Detecção automática de duplicatas (ignora transações já existentes)
  - Auto-categorização por palavras-chave (Uber → Transporte, Netflix → Assinatura, iFood → Alimentação etc.)

### 🔁 Fixas (Recorrentes)
- Cadastro de transações fixas com dia do mês de vencimento
- Resumo de comprometimento fixo mensal (gastos fixos, receitas fixas, saldo fixo)
- Botão para lançar automaticamente todas as fixas do mês corrente sem duplicatas

### 🎯 Metas
- Definição de limite de gasto mensal por categoria
- Definição de meta de receita por categoria
- Barra de progresso visual com cores dinâmicas:
  - 🟢 Verde — abaixo de 80%
  - 🟡 Âmbar — entre 80% e 100%
  - 🔴 Vermelho — acima do limite
- **Sistema de alertas em 3 camadas:**
  - Banner permanente no topo ao carregar a página
  - Toast flutuante no canto inferior ao lançar ou importar
  - Notificação nativa do browser (requer permissão)
- Alerta por email via `mailto:` pré-preenchido ao ultrapassar o limite

### 🏷️ Categorias
- 9 categorias padrão com ícones e cores: Alimentação, Supermercado, Transporte, Saúde, Lazer, Assinatura, Cartão Crédito, Pix/Transfer, Outro
- Criação de categorias personalizadas com emoji e 8 paletas de cor
- Exclusão de categorias customizadas

### 💳 Cartões
- Cadastro de cartões/contas (Crédito, Débito, Pix/Conta) com cor personalizada
- Gráfico de rosca com distribuição de gastos por cartão no mês
- Total gasto por cartão no mês atual

### 📤 Exportar
- Seleção de período personalizado
- Exportação em **CSV** (compatível com Excel, com BOM UTF-8)
- Exportação em **JSON** (com metadados de exportação)
- Resumo do período: nº de lançamentos, total de gastos e receitas

### ⚙️ Config (GitHub Sync)
- Sincronização dos dados com repositório privado do GitHub via API
- Salvar no GitHub: empurra todos os dados como `data.json`
- Carregar do GitHub: restaura dados em qualquer dispositivo novo
- **Auto-sync**: salva automaticamente em background após cada alteração
- Registro de data/hora do último sync
- Token armazenado localmente no browser (nunca enviado para terceiros além do GitHub)

---

## 🛡️ Privacidade e segurança

- Nenhum dado é enviado para servidores externos (exceto GitHub Sync, que vai para o seu próprio repositório privado)
- A chave da API Anthropic (para importação PDF) é salva apenas no `localStorage` do seu browser
- O token do GitHub é salvo apenas no `localStorage` do seu browser
- Todo o processamento é feito localmente no navegador

---

## 🛠️ Tecnologias

| Tecnologia | Uso |
|---|---|
| HTML5 / CSS3 / JavaScript (ES2020+) | Interface e lógica principal |
| [Chart.js 4.4](https://www.chartjs.org/) | Gráficos (linha e rosca) |
| [API Anthropic Claude](https://docs.anthropic.com) | Extração de transações de PDFs |
| [API GitHub Contents](https://docs.github.com/en/rest/repos/contents) | Sincronização de dados entre dispositivos |
| localStorage | Persistência local dos dados |

---

## 📁 Estrutura do projeto

```
financas-pessoais/
├── index.html       # Estrutura HTML, todas as páginas e modal de importação
├── style.css        # Estilos, tema claro/escuro (prefers-color-scheme), responsivo
├── app.js           # Toda a lógica: estado, renderização, importação, sync
└── README.md        # Este arquivo
```
---

## 👤 Autor

**Juan Pablo Ladeira**
- GitHub: [@itjuanpablo](https://github.com/itjuanpablo)

---

