// Parsers para PDFs do Mercado Pago (extrato de conta e fatura de cartão).
//
// ─── Brasil: VALIDADO ────────────────────────────────────────────────────────
// Calibrados contra a saída do pdf-parse (pdfjs) usando os arquivos reais do
// usuário. Validação: totais parseados batem ao centavo com "Entradas/Saidas"
// declarados no cabeçalho dos extratos e com "Consumos" do resumo das faturas.
// É a funcionalidade mais valiosa do app. As expressões do layout BR estão
// isoladas em LAYOUTS.BR e NÃO foram alteradas pela internacionalização —
// nem o regex de dinheiro, que continua exigindo "R$".
//
// ─── Argentina, extrato ("RESUMEN DE CUENTA"): VALIDADO ──────────────────────
// Calibrado contra um extrato real de conta em pesos (abril/2025, 48
// movimentos): as somas fecham ao centavo com "Entradas" e "Salidas" declarados
// no cabeçalho. A estrutura é a mesma do Brasil — bloco
// "DD-MM-YYYY \n descrição \n <id><valor><saldo>" — mudam os rótulos e o
// símbolo ("$" em vez de "R$").
//
// A checagem de totais (`totals`) fica LIGADA mesmo depois de validado: é o
// documento conferindo o parser a cada importação, de graça. Se o Mercado Pago
// mexer no layout, o usuário vê um erro em vez de números errados.
//
// ─── Argentina, resumo de cartão: NÃO VALIDADO ───────────────────────────────
// Nenhum resumo de tarjeta argentino foi visto. LAYOUTS.AR.invoice segue sendo
// tradução estrutural do layout brasileiro, com a checagem de totais ligada
// para quebrar barulhento em vez de gravar lançamentos silenciosamente errados.

/** "1.234,56" → 1234.56 (o app converte para centavos na borda de entrada). */
export function parseMoney(s) {
  return Math.round(parseFloat(s.replace(/\./g, '').replace(',', '.')) * 100) / 100;
}

// Dinheiro por país. O padrão BR é literalmente o de antes da i18n.
const MONEY_BR = 'R\\$\\s?(-?[\\d.]+,\\d{2})';
// AR: "$ 1.234,56". Os lookbehinds bloqueiam exatamente os três prefixos que
// NÃO são o valor da linha — "R$", "US$" e "U$S" (compra internacional) — e
// nada além disso: no PDF a descrição cola no valor ("NETFLIX.COM$ 39.900,00"),
// então proibir "qualquer letra antes do $" faria o parser não achar nada.
const MONEY_AR = '(?:AR\\$|(?<![Rr])(?<![Uu][Ss])(?<![Uu])\\$)\\s?(-?[\\d.]+,\\d{2})';

const NOISE_COMMON = [
  /^\d+\/\d+$/,                 // marcador de página "2/7"
  /^Saldo (inicial|final):/,
  // A DATA DE GERAÇÃO DO PDF, no rodapé, é uma armadilha: tem o mesmo formato
  // dd-mm-aaaa das transações, então a regex de bloco a confundia com o começo
  // de uma transação e engolia a seguinte — gravando a data de emissão do
  // documento e o endereço jurídico do rodapé no lugar da data e do
  // estabelecimento reais. Os totais continuavam fechando (o valor estava
  // certo), que é justamente o que torna esse erro difícil de ver.
  /^(Fecha de generaci[oó]n|Data de gera[çc][ãa]o):/i,
];

const LAYOUTS = {
  BR: {
    country: 'BR',
    money: MONEY_BR,
    noise: [
      ...NOISE_COMMON,
      /^DataDescriçãoID da operaçãoValorSaldo$/,
      /^Entradas: /, /^Saidas: /,
      /^DETALHE DOS MOVIMENTOS$/,
      // rodapé/ajuda do PDF que às vezes cola na descrição
      /Você tem alguma dúvida|Portal de ajuda|SAC[,.: ]|ouvidoria|0800[\s\d]|mercadopago\.com|Central de atendimento/i,
    ],
    statement: {
      id: 'mp-br-extrato',
      source: 'mp-extrato',       // NÃO MUDAR: source_bindings dependem disto
      detect: (t) => /EXTRATO DE CONTA/i.test(t) && /DETALHE DOS MOVIMENTOS/i.test(t),
      // pagamento de fatura do cartão e reserva de dinheiro são movimentações
      // internas — não são receita nem despesa
      transferRx: /^Pagamento Cartão de crédito|^Dinheiro (reservado|retirado)/i,
      totals: null,               // dispensado: conferido à mão nos arquivos reais
    },
    invoice: {
      id: 'mp-br-fatura',
      source: 'mp-fatura',        // NÃO MUDAR: source_bindings dependem disto
      detect: (t) => /Movimentações na fatura/i.test(t),
      dueRx: /Venc(?:e em|imento):\s*(\d{2})\/(\d{2})\/(\d{4})/,
      sectionSummary: /^Movimentações na fatura$/,
      sectionCard: /^Cartão \w+ \[/,
      skipLine: /^Total|^DataMovimentaçõesValor/,
      installmentRx: 'Parcela (\\d+) de (\\d+)',
      installmentLabel: (n, tot) => ` (parcela ${n}/${tot})`,
      paymentRx: /^Pagamento da fatura/i,
      totals: null,
    },
  },

  AR: {
    country: 'AR',
    money: MONEY_AR,
    noise: [
      ...NOISE_COMMON,
      // O cabeçalho da tabela vem QUEBRADO em quatro linhas na saída do
      // pdf-parse, e reaparece a cada página — então cai dentro da descrição da
      // transação que vem logo depois da quebra. Daí uma regex por linha.
      /^FechaDescripci[oó]n$/,
      /^ID de la$/,
      /^operaci[oó]n$/,
      /^ValorSaldo$/,
      /^Entradas: /, /^Salidas: /,
      /^Periodo:/, /^ Del \d+ al \d+ de /,
      /^CVU:/, /CUIT\/ ?CUIL:/,
      /^RESUMEN DE CUENTA/i,
      /^DETALLE DE (LOS )?MOVIMIENTOS$/,
      // rodapé jurídico, que vem quebrado em duas linhas
      /^Mercado Libre S\.?R\.?L\.?/i,
      /^de consulta en:/i,
      /Ten[eé]s alguna duda|Centro de ayuda|Atenci[oó]n al cliente|mercadopago\.com|Defensa del Consumidor/i,
    ],
    statement: {
      id: 'mp-ar-extracto',
      // Source próprio: mantém os vínculos de conta do lado brasileiro
      // separados dos argentinos, que são outra conta de outra pessoa.
      source: 'mp-ar-extrato',
      // VALIDADO contra documento real: "RESUMEN DE CUENTA EN PESOS" +
      // "DETALLE DE MOVIMIENTOS".
      detect: (t) =>
        /RESUMEN DE CUENTA/i.test(t) && /DETALLE DE (LOS )?MOVIMIENTOS/i.test(t),
      transferRx: /^Pago (de |de tu )?tarjeta de cr[eé]dito|^Dinero (reservado|retirado)|^Transferencia a tu cuenta remunerada/i,
      // O titular assina o cabeçalho na linha seguinte ao título. Serve para
      // reconhecer transferência para a própria conta (ver isSelfTransfer).
      holderRx: /^RESUMEN DE CUENTA[^\n]*\n([^\n]+)\n/im,
      selfTransferRx: /^Transferencia (enviada|recibida)\s+(.+)$/i,
      // Rótulos reais do cabeçalho. Ficam ligados de propósito: é o documento
      // conferindo o parser a cada importação.
      totals: {
        in: /Entradas:?\s*(?:AR)?\$?\s*([\d.]+,\d{2})/i,
        out: /Salidas:?\s*(?:AR)?\$?\s*(-?[\d.]+,\d{2})/i,
      },
    },
    invoice: {
      id: 'mp-ar-resumen',
      source: 'mp-ar-fatura',
      detect: (t) => /Movimientos del resumen|Movimientos de tu resumen/i.test(t),
      dueRx: /Venc(?:e el|imiento):\s*(\d{2})\/(\d{2})\/(\d{4})/,
      sectionSummary: /^Movimientos (del|de tu) resumen$/,
      sectionCard: /^Tarjeta \w+ \[/,
      skipLine: /^Total|^FechaMovimientosValor/,
      installmentRx: 'Cuota (\\d+) de (\\d+)',
      // TODO i18n: import.installment ("parcela {n}/{total}") — este rótulo
      // entra na DESCRIÇÃO gravada no banco, não é texto de tela, e hoje não
      // existe chave para ele.
      installmentLabel: (n, tot) => ` (cuota ${n}/${tot})`,
      paymentRx: /^Pago de tu resumen|^Pago recibido/i,
      totals: { out: /Consumos(?: del per[ií]odo)?:?\s*(?:AR)?\$?\s*([\d.]+,\d{2})/i },
    },
  },
};

const layoutOf = (country) => LAYOUTS[country] || LAYOUTS.BR;

const deaccent = (s) =>
  String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * "Transferencia enviada <nome do titular>" na conta desse mesmo titular é
 * dinheiro trocando de bolso, não despesa. Sem isto o extrato conta como gasto
 * o que a pessoa mandou para a própria conta em outro banco, e a projeção do
 * mês fica inflada.
 *
 * A comparação é por CONJUNTO de nomes, não por igualdade de string: o mesmo
 * documento escreve o titular como "Ana Maria Gomez" no cabeçalho e como
 * "Gomez Ana Maria" ou "GOMEZ ANA MARIA" na descrição — ordem e caixa mudam.
 * Exige que TODOS os nomes do titular apareçam, para "Ana Gomez" não casar com
 * uma transferência para "Ana Ferreyra".
 *
 * Falso positivo possível: um homônimo exato do titular. Preferi assumir esse
 * risco em vez do oposto, que é somar como gasto o que não é.
 *
 * @param {string} desc descrição da transação
 * @param {string[]} holderTokens nomes do titular, já normalizados
 * @param {RegExp} rx captura o "para quem" da descrição
 */
function isSelfTransfer(desc, holderTokens, rx) {
  if (!holderTokens?.length || !rx) return false;
  const m = desc.match(rx);
  if (!m) return false;
  const target = new Set(
    deaccent(m[2]).split(/[^a-z0-9]+/).filter(w => w.length >= 3));
  if (!target.size) return false;
  return holderTokens.every(tok => target.has(tok));
}

/** Nomes do titular a partir do cabeçalho, normalizados; [] se não achar. */
function holderTokens(text, rx) {
  const m = rx && String(text).match(rx);
  if (!m) return [];
  return deaccent(m[1]).split(/[^a-z0-9]+/).filter(w => w.length >= 3);
}

/**
 * Remove as linhas de ruído ANTES de casar os blocos de transação.
 *
 * Filtrar só a descrição (o que este parser fazia) não basta: cabeçalho de
 * página e rodapé podem conter algo que PARECE o início de uma transação — a
 * data de geração do documento é o caso real — e aí a regex casa no lugar
 * errado e consome a transação seguinte. Limpar antes elimina a classe toda.
 */
function stripNoise(text, noise) {
  return String(text)
    .split('\n')
    .filter(l => !noise.some(rx => rx.test(l.trim())))
    .join('\n');
}

function cleanDesc(raw, noise) {
  const d = raw.split('\n')
    .filter(l => !noise.some(rx => rx.test(l.trim())))
    .join(' ').replace(/\s+/g, ' ').trim();
  // descrição de verdade nunca é um parágrafo
  return d.length > 120 ? d.slice(0, 120).trim() + '…' : d;
}

/**
 * Soma parseada × total declarado no documento. Só roda onde o layout declara
 * `totals` (hoje: Argentina), porque é ali que a suposição é frágil.
 * Lança em vez de devolver: este erro tem de chegar ao usuário.
 */
function assertTotals(text, txs, spec, label) {
  if (!spec) return [];
  const declared = (rx) => {
    const m = rx && text.match(rx);
    return m ? Math.abs(parseMoney(m[1])) : null;
  };
  const round = (n) => Math.round(n * 100) / 100;
  const got = {
    in: round(txs.filter(t => t.amount > 0).reduce((a, t) => a + t.amount, 0)),
    out: round(txs.filter(t => t.amount < 0).reduce((a, t) => a - t.amount, 0)),
  };
  const problems = [];
  let checked = false;
  for (const side of ['in', 'out']) {
    const exp = declared(spec[side]);
    if (exp == null) continue;
    checked = true;
    if (Math.abs(exp - got[side]) > 0.01) {
      problems.push(
        `${side === 'in' ? 'entradas' : 'saídas'}: documento diz ${exp}, parser somou ${got[side]}`);
    }
  }
  if (problems.length) {
    // TODO i18n: import.err.mpTotalsMismatch — mensagem técnica de propósito
    // enquanto o layout AR não for validado contra um PDF real.
    throw new Error(
      `[Mercado Pago ${label}] os totais não fecham com o documento (${problems.join('; ')}). ` +
      'O layout argentino ainda não foi validado contra um PDF real — nada foi importado. ' +
      'Prefira OFX ou CSV até isto ser corrigido.');
  }
  return checked ? [] : [`totais não declarados no PDF: layout ${label} não pôde ser conferido`];
}

/**
 * Extrato de conta MP: blocos "DD-MM-YYYY \n descrição... \n <id>$ valor $ saldo".
 * @param {string} text
 * @param {{country?: 'BR'|'AR'}} [opts]
 */
export function parseExtrato(text, { country = 'BR' } = {}) {
  const L = layoutOf(country);
  const S = L.statement;
  const holder = holderTokens(text, S.holderRx);
  // limpa o ruído antes de casar: ver stripNoise
  const clean = stripNoise(text, L.noise);
  const txs = [];
  const rx = new RegExp(
    String.raw`(\d{2})-(\d{2})-(\d{4})\n([\s\S]*?)(\d{9,16})${L.money}${L.money}`, 'g');
  let m;
  while ((m = rx.exec(clean)) !== null) {
    const [, dd, mm, yyyy, rawDesc, opId, val] = m;
    const desc = cleanDesc(rawDesc, L.noise);
    if (!desc) continue;
    txs.push({
      date: `${yyyy}-${mm}-${dd}`,
      description: desc,
      amount: parseMoney(val),
      externalId: opId,
      source: S.source,
      transfer: S.transferRx.test(desc)
        || isSelfTransfer(desc, holder, S.selfTransferRx),
    });
  }
  return txs;
}

/**
 * Fatura de cartão MP: linhas "DD/MM<descrição>[Parcela X de Y]$ valor".
 * @param {string} text
 * @param {{country?: 'BR'|'AR'}} [opts]
 */
export function parseFatura(text, { country = 'BR' } = {}) {
  const L = layoutOf(country);
  const I = L.invoice;
  const venc = text.match(I.dueRx);
  const vencMonth = venc ? parseInt(venc[2]) : null;
  const vencYear = venc ? parseInt(venc[3]) : new Date().getFullYear();
  // mês de competência da fatura (o documento inteiro pertence a este ciclo)
  const invoiceRef = vencMonth
    ? `${vencYear}-${String(vencMonth).padStart(2, '0')}` : null;

  const txs = [];
  let section = null; // 'resumo' | 'cartao'
  const lineRx = new RegExp(
    String.raw`^(\d{2})\/(\d{2})(.+?)(?:${I.installmentRx})?${L.money}$`);

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (I.sectionSummary.test(line)) { section = 'resumo'; continue; }
    if (I.sectionCard.test(line)) { section = 'cartao'; continue; }
    if (!section || I.skipLine.test(line)) continue;

    const m = line.match(lineRx);
    if (!m) continue;
    const [, dd, mm, desc, pNum, pTot, val] = m;
    const month = parseInt(mm);
    // Parcelas mostram a data da compra original: se o mês impresso é maior
    // que o mês do vencimento, a compra foi no ano anterior.
    const year = vencMonth && month > vencMonth ? vencYear - 1 : vencYear;
    const amount = parseMoney(val);
    const isPayment = I.paymentRx.test(desc.trim());

    txs.push({
      date: `${year}-${String(month).padStart(2, '0')}-${dd}`,
      description: desc.trim() + (pNum ? I.installmentLabel(pNum, pTot) : ''),
      // pagamento de fatura = transferência interna; o resto = despesa
      amount: isPayment ? amount : -amount,
      externalId: null,
      source: I.source,
      transfer: isPayment,
      invoiceRef,
    });
  }
  return txs;
}

/**
 * Só a DETECÇÃO do layout, sem parsear — usada por lib/banks para montar o
 * registry sem duplicar marcadores (o conhecimento do layout mora aqui).
 *
 * @returns {{id: string|null, kind: 'extrato'|'fatura'|null,
 *            country: 'BR'|'AR'|null, source: string|null}}
 */
export function detectMercadoPago(text) {
  const t = String(text ?? '');
  // Brasil primeiro: é o layout validado. O inferido só entra se o BR não casar.
  for (const L of [LAYOUTS.BR, LAYOUTS.AR]) {
    if (L.statement.detect(t)) {
      return { id: L.statement.id, kind: 'extrato', country: L.country, source: L.statement.source };
    }
    if (L.invoice.detect(t)) {
      return { id: L.invoice.id, kind: 'fatura', country: L.country, source: L.invoice.source };
    }
  }
  return { id: null, kind: null, country: null, source: null };
}

/**
 * Detecta o tipo do PDF do Mercado Pago pelo conteúdo e parseia.
 *
 * @returns {{kind: 'extrato'|'fatura'|'corrompido'|'desconhecido',
 *            country: 'BR'|'AR'|null, source: string|null,
 *            transactions: Array, warnings: string[]}}
 */
export function parseMercadoPagoPdf(text) {
  const hit = detectMercadoPago(text);
  if (!hit.kind) {
    return { kind: 'desconhecido', country: null, source: null, transactions: [], warnings: [] };
  }
  const L = layoutOf(hit.country);
  const spec = hit.kind === 'extrato' ? L.statement : L.invoice;
  const transactions = hit.kind === 'extrato'
    ? parseExtrato(text, { country: hit.country })
    : parseFatura(text, { country: hit.country });

  if (!transactions.length && hit.kind === 'fatura') {
    // Há linhas de transação (datas), mas nenhum valor parseável: camada de
    // texto corrompida (fonte com mapa de caracteres embaralhado).
    const dateLines = (text.match(/^\d{2}\/\d{2}/gm) || []).length;
    if (dateLines >= 5) {
      return { kind: 'corrompido', country: hit.country, source: hit.source, transactions: [], warnings: [] };
    }
  }

  const warnings = assertTotals(text, transactions, spec.totals, `${hit.country} ${hit.kind}`);
  return { kind: hit.kind, country: hit.country, source: hit.source, transactions, warnings };
}
