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

## Deduplicação

`transactions.hash` é `source:external_id` quando existe id de operação, senão
sha1 de `source|data|valor|descrição`. Como o `source` entra no hash, um arquivo
já importado como `csv` genérico e reimportado depois de o perfil passar a ser
reconhecido conta como novo. Acontece uma vez por arquivo, e só para quem
reimporta o mesmo export.
