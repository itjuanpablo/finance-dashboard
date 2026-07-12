// Parsers para PDFs do Mercado Pago (extrato de conta e fatura de cartão).
// Calibrados contra a saída do pdf-parse (pdfjs) usando os arquivos reais do usuário.
// Validação: totais parseados batem ao centavo com "Entradas/Saidas" declarados
// no cabeçalho dos extratos e com "Consumos" do resumo das faturas.

const MONEY = 'R\\$\\s?(-?[\\d.]+,\\d{2})';

export function parseMoney(s) {
  return Math.round(parseFloat(s.replace(/\./g, '').replace(',', '.')) * 100) / 100;
}

const HEADER_NOISE = [
  /^\d+\/\d+$/,                                  // marcador de página "2/7"
  /^DataDescriçãoID da operaçãoValorSaldo$/,
  /^Saldo (inicial|final):/,
  /^Entradas: /, /^Saidas: /,
  /^DETALHE DOS MOVIMENTOS$/,
  // rodapé/ajuda do PDF que às vezes cola na descrição
  /Você tem alguma dúvida|Portal de ajuda|SAC[,.: ]|ouvidoria|0800[\s\d]|mercadopago\.com|Central de atendimento/i,
];

function cleanDesc(raw) {
  const d = raw.split('\n')
    .filter(l => !HEADER_NOISE.some(rx => rx.test(l.trim())))
    .join(' ').replace(/\s+/g, ' ').trim();
  // descrição de verdade nunca é um parágrafo
  return d.length > 120 ? d.slice(0, 120).trim() + '…' : d;
}

/** Extrato de conta MP: blocos "DD-MM-YYYY \n descrição... \n <id>R$ valor R$ saldo" */
export function parseExtrato(text) {
  const txs = [];
  const rx = new RegExp(
    String.raw`(\d{2})-(\d{2})-(\d{4})\n([\s\S]*?)(\d{9,16})${MONEY}${MONEY}`, 'g');
  let m;
  while ((m = rx.exec(text)) !== null) {
    const [, dd, mm, yyyy, rawDesc, opId, val] = m;
    const desc = cleanDesc(rawDesc);
    if (!desc) continue;
    txs.push({
      date: `${yyyy}-${mm}-${dd}`,
      description: desc,
      amount: parseMoney(val),
      externalId: opId,
      source: 'mp-extrato',
      // pagamento de fatura do cartão e reserva de dinheiro são movimentações
      // internas — não são receita nem despesa
      transfer: /^Pagamento Cartão de crédito|^Dinheiro (reservado|retirado)/i.test(desc),
    });
  }
  return txs;
}

/** Fatura de cartão MP: linhas "DD/MM<descrição>[Parcela X de Y]R$ valor" */
export function parseFatura(text) {
  const venc = text.match(/Venc(?:e em|imento):\s*(\d{2})\/(\d{2})\/(\d{4})/);
  const vencMonth = venc ? parseInt(venc[2]) : null;
  const vencYear = venc ? parseInt(venc[3]) : new Date().getFullYear();
  // mês de competência da fatura (o documento inteiro pertence a este ciclo)
  const invoiceRef = vencMonth
    ? `${vencYear}-${String(vencMonth).padStart(2, '0')}` : null;

  const txs = [];
  let section = null; // 'resumo' | 'cartao'
  const lineRx = new RegExp(
    String.raw`^(\d{2})\/(\d{2})(.+?)(?:Parcela (\d+) de (\d+))?${MONEY}$`);

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (/^Movimentações na fatura$/.test(line)) { section = 'resumo'; continue; }
    if (/^Cartão \w+ \[/.test(line)) { section = 'cartao'; continue; }
    if (!section || /^Total/.test(line) || /^DataMovimentaçõesValor/.test(line)) continue;

    const m = line.match(lineRx);
    if (!m) continue;
    const [, dd, mm, desc, pNum, pTot, val] = m;
    const month = parseInt(mm);
    // Parcelas mostram a data da compra original: se o mês impresso é maior
    // que o mês do vencimento, a compra foi no ano anterior.
    const year = vencMonth && month > vencMonth ? vencYear - 1 : vencYear;
    const amount = parseMoney(val);
    const isPayment = /^Pagamento da fatura/i.test(desc.trim());

    txs.push({
      date: `${year}-${String(month).padStart(2, '0')}-${dd}`,
      description: desc.trim() + (pNum ? ` (parcela ${pNum}/${pTot})` : ''),
      // pagamento de fatura = transferência interna; o resto = despesa
      amount: isPayment ? amount : -amount,
      externalId: null,
      source: 'mp-fatura',
      transfer: isPayment,
      invoiceRef,
    });
  }
  return txs;
}

/** Detecta o tipo do PDF do Mercado Pago pelo conteúdo */
export function parseMercadoPagoPdf(text) {
  if (/EXTRATO DE CONTA/i.test(text) && /DETALHE DOS MOVIMENTOS/i.test(text))
    return { kind: 'extrato', transactions: parseExtrato(text) };
  if (/Movimentações na fatura/i.test(text)) {
    const transactions = parseFatura(text);
    if (!transactions.length) {
      // Há linhas de transação (datas), mas nenhum valor "R$" parseável:
      // camada de texto corrompida (fonte com mapa de caracteres embaralhado).
      const dateLines = (text.match(/^\d{2}\/\d{2}/gm) || []).length;
      if (dateLines >= 5) return { kind: 'corrompido', transactions: [] };
    }
    return { kind: 'fatura', transactions };
  }
  return { kind: 'desconhecido', transactions: [] };
}
