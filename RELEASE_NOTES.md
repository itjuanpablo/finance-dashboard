# Notas de versão

## v4.1.0 — Trocar de idioma pela tela e ler arquivo de qualquer banco

### Botão de idioma no cabeçalho

O 🌐 no topo abre idioma e moeda. A escolha vale na hora — sem editar arquivo,
sem reiniciar o servidor — e fica salva no seu banco, então continua valendo na
próxima vez que abrir.

**A moeda é um campo separado, e isso é de propósito.** Seus lançamentos são
guardados em centavos, sem moeda nenhuma junto. Se trocar o idioma trocasse a
moeda automaticamente, um saldo de R$ 1.000 passaria a aparecer como $ 1.000 em
pesos: o mesmo número, com outro significado, sem nada ter sido convertido.
Trocar o idioma muda texto, mês e formato de data; a moeda só muda se você
mudar.

### Lê arquivo de banco brasileiro e argentino sem tropeçar na formatação

Um punhado de detalhes chatos que faziam extrato bom ser lido errado:

**Acentuação.** Extrato de banco costuma vir em Windows-1252, não em UTF-8.
Antes, "Transferência" virava "TransferÃªncia" — e entrava assim no banco de
dados. Agora a codificação é detectada (inclusive quando o arquivo *mente*
sobre qual usa) e o texto entra íntegro.

**Separadores e datas.** O leitor de CSV decide o formato olhando a coluna
inteira, não cada célula isolada: se qualquer valor da coluna usa vírgula
decimal, a coluna toda é lida no padrão brasileiro/argentino; se alguma data tem
dia acima de 12, a ordem dia/mês fica definida para todas as linhas. Também
aceita ponto e vírgula, vírgula, tabulação e barra vertical como separador,
campo entre aspas com vírgula dentro, valor negativo entre parênteses ou com
sinal à direita, colunas separadas de débito e crédito, e o espaço invisível que
alguns bancos colocam no meio dos números.

**Linhas que não são transação.** Preâmbulo, cabeçalho repetido a cada página,
saldo, subtotal e rodapé deixam de ser importados como lançamento. No OFX, a
linha "SALDO ANTERIOR" que alguns bancos emitem disfarçada de transação
aparecia como uma receita do tamanho do seu saldo.

**Conferência por saldo.** Quando o arquivo traz saldo, o app reconstrói a
sequência inteira e confere: saldo inicial + lançamentos = saldo final. Se não
fechar, ele avisa em vez de gravar. Foi esse tipo de checagem que pegou um erro
que a simples soma de totais deixava passar.

**Você vê quem leu o arquivo.** A importação informa qual banco foi reconhecido,
com que confiança e em que codificação — para você saber quando desconfiar.

### Correção

Renomear uma categoria padrão passou a valer também na resposta da API, que
antes podia mostrar o nome traduzido enquanto a tela mostrava o seu.

### Para quem mexe no código

Idioma e moeda vivem na tabela `settings` (esquema v5, criada automaticamente).
Nada de formatação pode ser calculado na carga do módulo — um `Intl` no topo do
arquivo passa no teste da primeira execução e mente na segunda;
`node scripts/testar-idioma.mjs` existe justamente para pegar isso. A suíte dos
leitores de arquivo foi de 166 para 229 verificações.

Detalhes em [`docs/i18n.md`](docs/i18n.md) e [`lib/banks/README.md`](lib/banks/README.md).

---

## v4.0.0 — Espanhol, mais bancos e categorias que não quebram ao renomear

Esta versão faz três coisas: ensina o Fluxo a falar espanhol, amplia bastante os
bancos reconhecidos na importação e conserta um problema antigo de arquitetura
que só aparecia quando você renomeava uma categoria.

### O Fluxo passou a falar espanhol

Espanhol rioplatense de verdade (voseo: *arrastrá*, *elegí*, *cargá*) e
vocabulário financeiro correto — a fatura do cartão é *resumen*, lançamento é
*movimiento*, parcela é *cuota*. Junto com o texto muda a moeda, o formato de
número e data, os nomes das categorias, o **dicionário de categorização
automática** (o app não vai adivinhar "Ecogas" com um dicionário brasileiro) e
os perfis de banco preferidos na detecção.

> Na v4.0 o idioma era escolhido num arquivo de configuração. Desde a v4.1 há um
> botão na tela.

### Muito mais bancos reconhecidos

Antes, só o PDF do Mercado Pago era entendido de verdade; o resto caía num
leitor genérico de CSV que funcionava "na sorte" do cabeçalho. Agora existe uma
lista de perfis, e o Fluxo identifica o arquivo pelo conteúdo:

- **Brasil:** Nubank (extrato e fatura, que têm formatos diferentes), Itaú,
  Bradesco, Banco do Brasil, Inter, C6 e o Mercado Pago.
- **Argentina:** Mercado Pago, Galicia, Santander, BBVA, Brubank, Ualá e
  Naranja X.

**Cada perfil é honesto sobre o quanto se pode confiar nele.** Os conferidos
contra um arquivo real estão marcados como confiança alta. Os montados a partir
da documentação do formato só são aceitos quando o nome do banco aparece no
arquivo — e, se nada casar, o Fluxo usa o leitor genérico em vez de arriscar. A
regra que guiou tudo: em dado financeiro, **errar calado é pior do que não
reconhecer**.

### Renomear categoria não bagunça mais nada

Até então o nome da categoria era também o identificador dela. Renomear "Renda"
para "Salário" obrigava o Fluxo a reescrever o nome em todas as transações,
regras e metas — e qualquer parte do programa que ainda esperasse "Renda"
parava de funcionar em silêncio.

Agora cada categoria tem um identificador interno que nunca muda:

- renomear é instantâneo e não toca em nenhum lançamento;
- as categorias que você criou nunca são traduzidas — o nome que você escolheu
  é o que fica;
- renomear uma categoria padrão faz o Fluxo entender que a sua escolha vale mais
  que a tradução dele.

**A conversão do banco é automática**, numa única operação, depois de salvar uma
cópia em `data/backups/fluxo-pre-v4-*.db`. Se algo der errado, nada é alterado.

A conversão reconhece os nomes originais do Fluxo. Se você renomeou uma
categoria padrão antes de atualizar, ela vira categoria sua — funciona, mas o
app perde o significado dela. Para corrigir:

```bash
node scripts/remapear-categoria.mjs --listar        # ver o que tem
node scripts/remapear-categoria.mjs salario income  # ensaio, não grava
node scripts/remapear-categoria.mjs salario income --aplicar
```

### Correções

**Transferência para você mesmo não é despesa.** Dinheiro que você manda da sua
conta para outra conta sua era contado como gasto e inflava a projeção do mês.

**Parcelas em extratos em espanhol.** O rótulo era procurado só em português;
num extrato em espanhol ("cuota 2/6"), as parcelas futuras não eram detectadas,
o ciclo da fatura saía errado e o agrupamento de regras falhava — sem dar erro.

**Data de geração do PDF virando transação.** O rodapé do extrato traz a data em
que o arquivo foi gerado, no mesmo formato de uma data de lançamento. O leitor
confundia as duas e engolia a transação seguinte, gravando a data de emissão e o
endereço da empresa no lugar da data e do estabelecimento reais. O mais
desconfortável: **as somas continuavam corretas**, porque o valor estava certo —
o erro passava por qualquer conferência de total.

---

## Próxima versão — planejado

**Mais bancos**, à medida que houver extratos reais para conferir. A estrutura já
aceita: adicionar banco é acrescentar um perfil declarativo, não escrever código
de leitura. O que falta é arquivo — a prioridade é **fatura de cartão**, que é o
que o app entende menos e onde estão as parcelas. Roteiro em
[`docs/roadmap.md`](docs/roadmap.md).
