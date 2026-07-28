# Bancos e formatos de arquivo

`lib/banks/index.js` é um **registry declarativo**: cada perfil descreve como
ler o arquivo (separador, ordem da data, decimal, onde está o valor), não contém
código de parsing. Quem lê é `lib/parsers/csv.js`; quem lê PDF do Mercado Pago é
`lib/parsers/mercadopago.js`.

```js
{
  id: 'nubank-fatura-csv',
  name: 'Nubank',            // nome próprio: NÃO entra no dicionário de i18n
  kind: 'statement' | 'invoice',
  country: 'BR' | 'AR',
  formats: ['csv'],
  source: 'nubank-fatura',   // vai para transactions.source e batches.kind
  fallbackSource: 'csv',     // vínculo de conta herdado enquanto não há o novo
  confidence: 'alta' | 'media' | 'baixa',
  requireMarker: true,       // só aceita com o nome do banco no arquivo
  csv: { sep, dateFormat, decimal, amountSign, columns, positions },
  detect(text, fileName) -> boolean,
  skipRow: /^saldo/i,        // linha que parece transação e não é
}
```

## Detecção

É por **conteúdo**: cabeçalho do CSV (sinônimos, em qualquer ordem, pt/es/en) e
marcadores do texto do PDF. O nome do arquivo é só reforço, e o nome do banco é
procurado apenas no **preâmbulo** — no corpo ele aparece dentro de descrição
("PIX ITAU"), o que seria falso positivo.

Em **OFX** a evidência é melhor: o arquivo declara a instituição em `<ORG>` e o
código COMPE em `<BANKID>` (341 Itaú, 237 Bradesco, 001 BB, 077 Inter). Isso vem
do banco, não do nome do arquivo, e não pode dar falso positivo em CSV — CSV não
tem tag. Antes disso nenhum perfil casava com OFX (todos os `detect` procuram
cabeçalho de CSV) e todo OFX aparecia como "OFX genérico". O `source` gravado
continua sendo `ofx` de qualquer forma: isto muda o que se **mostra**, não o que
se grava.

Nada casou? Cai no parser genérico, que é o comportamento anterior à
internacionalização e funciona. **Um perfil que erra calado é pior que o
genérico** — por isso perfil de confiança baixa exige marcador, e o mapeamento
de coluna é por sinônimo de cabeçalho, nunca por índice fixo.

## Confiança dos perfis

| Perfil | País | Formato | Confiança | Base |
|---|---|---|---|---|
| Mercado Pago extrato/fatura | BR | PDF | **alta** | validado ao centavo contra documentos reais |
| Nubank extrato | BR | CSV | alta | cabeçalho `Data,Valor,Identificador,Descrição` |
| Nubank fatura | BR | CSV | alta | cabeçalho `date,title,amount` |
| Bradesco | BR | CSV | média | preâmbulo + `Data;Histórico;Docto.;Crédito;Débito;Saldo` |
| Banco do Brasil | BR | CSV | média | cabeçalho com aspas e `Data do Balancete` |
| C6 Bank fatura | BR | CSV | média | duas colunas "Valor" (US$ e R$) |
| Itaú | BR | CSV | média (layout) / baixa (detecção) | sem cabeçalho: depende do nome do arquivo |
| Inter | BR | CSV | baixa | cabeçalho genérico, exige marcador |
| Mercado Pago extracto | AR | PDF | **alta** | validado: entradas, saídas e cadeia de saldos fecham ao centavo |
| Mercado Pago resumen (tarjeta) | AR | PDF | baixa | **não validado**; confere totais e falha ruidoso |
| Galicia, Santander AR, BBVA AR, Brubank, Ualá, Naranja X | AR | CSV | baixa | inferido, exige marcador |

| Itaú / Bradesco / BB / Inter | BR | OFX | média | `<ORG>`/`<BANKID>` declarados pelo próprio arquivo |

Tudo que não é "alta" precisa de **um export real** para subir de confiança. O
caminho: pegar o arquivo, ajustar o fixture correspondente em
`scripts/testar-parsers.mjs` (com dados inventados, nunca reais), rodar
`node scripts/testar-parsers.mjs` e corrigir o perfil até fechar.

## Argentina: o que está validado e o que não

O **extrato** ("RESUMEN DE CUENTA EN PESOS") foi calibrado contra um documento
real de 48 movimentos: entradas, saídas e a cadeia de saldos linha a linha
fecham ao centavo. O **resumo de tarjeta** segue não visto, e por isso continua
sendo melhor esforço.

Em ambos, o parser compara a soma com os totais declarados no documento e
**lança erro** quando não fecham, em vez de gravar duzentos lançamentos
silenciosamente errados. A checagem fica ligada mesmo no que já foi validado: é
o documento auditando o parser a cada importação, de graça — se o Mercado Pago
mudar o layout, aparece um erro em vez de números errados.

### Lição do documento real: total certo não é garantia

O rodapé do extrato traz `Fecha de generación: dd-mm-aaaa`, com o mesmo formato
de uma data de transação. A regex de bloco casava com ela e engolia a transação
seguinte, gravando a data de emissão do PDF e o endereço jurídico do Mercado
Libre no lugar da data e do estabelecimento reais — **e os totais continuavam
fechando ao centavo**, porque o valor estava correto.

Duas consequências no código: o ruído é removido ANTES de casar os blocos
(`stripNoise`), não só filtrado da descrição depois; e a validação confere
também a cadeia de saldos e o intervalo de datas, não apenas as somas.

## Encoding: `lib/parsers/encoding.js`

O importador fazia `buffer.toString('utf8')`. Extrato de banco brasileiro sai
com frequência em **Windows-1252**, e nesse caminho cada byte acentuado vira
U+FFFD: "Transferência" entra no banco de dados como "Transfer�ncia" — e no
**hash de deduplicação** junto. Depois de corrigido, o mesmo arquivo gera outro
hash; o erro se paga duas vezes.

`decodeBuffer(buffer, { format })` devolve `{ text, encoding, detectedBy,
warnings }` decidindo em cascata, do indício mais forte ao mais fraco:

| # | indício | decisão |
|---|---|---|
| 1 | BOM (UTF-8, UTF-16LE/BE) | manda; o BOM é removido do texto |
| 2 | ≥¼ dos bytes 0x00, todos na mesma paridade | UTF-16 sem BOM (export "Unicode" do Excel) |
| 3 | `ENCODING:`/`CHARSET:` do OFX, `<?xml encoding=?>` | segue a declaração |
| 4 | `TextDecoder('utf-8', {fatal:true})` lança | windows-1252 |
| 5 | passa, mas tem marca de mojibake | desfaz o mojibake (ver abaixo) |
| 6 | — | UTF-8 |

**Mojibake** é o caso que o UTF-8 estrito não pega: alguém já leu bytes UTF-8
como Latin-1 e regravou ("Transferência" → "TransferÃªncia"). O arquivo é UTF-8
*válido* e mesmo assim errado. A reversão é escrever o texto de volta como bytes
cp1252 e relê-lo como UTF-8 — e ela **só é aceita se fechar**: se algum
caractere não couber em cp1252, ou se os bytes de volta não formarem UTF-8
válido, o texto fica como está e sai um aviso. Isso cobre de graça o caso do
arquivo meio certo meio errado, em que desfazer estragaria a parte boa.

`CHARSET:1252` num arquivo que na verdade é UTF-8 acontece. A declaração é
indício, mojibake é prova: quando ler pelo cabeçalho produz mojibake **e** o
UTF-8 estrito passa limpo, o conteúdo ganha do cabeçalho — com aviso.

U+FFFD que já veio no arquivo não tem conserto (o byte se perdeu antes). Vira
aviso; trocar de encoding ali só pioraria.

## CSV: o que é decidido pela coluna, não pela célula

| variação | como é resolvida |
|---|---|
| separador `;` `,` tab `\|` | pela **consistência** do número de colunas entre as linhas. Contar ocorrências erra: um preâmbulo com um `;` solto ganhava da vírgula que separa as colunas de verdade |
| aspas | RFC 4180 — separador dentro de aspas, `""` escapado, e aspas no meio do campo (`TV 50" SAMSUNG`) que antes engoliam o resto da linha |
| decimal | pela **coluna inteira**: qualquer célula com vírgula decimal → BR/AR; qualquer uma com ponto decimal → US; sem nenhuma, quem agrupa milhar decide |
| ordem da data | pela **coluna inteira**: um único dia > 12 fixa a posição do mês para todas as linhas |
| linha que não é transação | preâmbulo, cabeçalho repetido, saldo, subtotal, total, rodapé, linha em branco |
| sujeira | CRLF, CR solto, BOM residual, U+00A0 |

**"1.234" é o caso que exige a coluna**: sozinho pode ser 1234 (BR/AR) ou 1,234
(US), e não há como saber. Se qualquer outra célula da mesma coluna trouxer
"45,90", a coluna é BR/AR; se trouxer "45.90", é US.

**Empate** (a coluna tem as duas formas decimais, ou as duas ordens de data): o
parser **não escolhe** — cai na leitura célula a célula, que acerta "1.234,56" e
"1,234.56" individualmente, e **avisa**. O que continua sem resposta nesse caso
é justamente o "1.234" puro, e é sobre isso que o aviso serve. Errar calado em
dado financeiro é pior que não reconhecer.

O padrão de "total" é fechado de propósito (`Total`, `Total do mês`, `Totales`)
em vez de `^total`: "TOTAL EXPRESS TRANSPORTES" é estabelecimento, e engolir uma
despesa real seria pior que importar um subtotal.

## OFX

Além de `<STMTTRN>`, agora são lidos:

- **`<CURDEF>`** — moeda declarada. Diferente da moeda da instância, sai aviso;
  importar USD dentro de uma base em BRL soma laranja com banana.
- **`<CCSTMTRS>`** — fatura de cartão, antes tratada como extrato de conta. O
  **sinal não é mexido**: no OFX o consumo do cartão já vem negativo, e inverter
  aqui trocaria o valor de tudo que já foi importado.
- **`<LEDGERBAL><BALAMT>`** — saldo final, usado para a mesma validação em
  cadeia que `lib/parsers/mercadopago.js` faz.

A cadeia é `saldo inicial + lançamentos = saldo final`. O saldo inicial vem da
linha "SALDO ANTERIOR" que Itaú e Bradesco emitem **como se fosse `<STMTTRN>`** —
com TRNAMT igual ao saldo. Ela não é transação (importá-la cria uma despesa do
tamanho do saldo da conta) e serve de âncora. Quando a cadeia fecha, a leitura
está conferida linha a linha: pega transação perdida, transação lida duas vezes
e sinal trocado. Quando não fecha, **lança** — nada é importado.

Sem âncora não há o que conferir: o OFX não declara saldo inicial, e recusar um
arquivo por informação que o banco nunca mandou seria pior que importar. Nesse
caso sai aviso, não erro.

## Deduplicação

`transactions.hash` é `source:external_id` quando existe id de operação, senão
sha1 de `source|data|valor|descrição`. Como o `source` entra no hash, um arquivo
já importado como `csv` genérico e reimportado depois de o perfil passar a ser
reconhecido conta como novo. Acontece uma vez por arquivo, e só para quem
reimporta o mesmo export.

A **descrição** entra no hash, então qualquer conserto de leitura tem o mesmo
efeito: o que foi importado com "Transfer�ncia" e é reimportado agora como
"Transferência" entra como novo. Vale para os três consertos desta rodada
(encoding, `""` escapado e aspas no meio do campo). É uma vez por arquivo
afetado, e o alternativo — continuar gravando texto errado para preservar o
hash — é pior.
