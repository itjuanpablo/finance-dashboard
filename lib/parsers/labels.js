// Rótulos que os parsers GRAVAM dentro de transactions.description.
//
// Por que isso existe: a descrição entra no hash de deduplicação, então o texto
// gravado não pode mudar de forma retroativa — reimportar o mesmo extrato
// duplicaria tudo. Consequência: o sufixo de parcela fica no idioma do
// documento ("(parcela 2/6)" no Brasil, "(cuota 2/6)" na Argentina) e QUEM LÊ
// precisa aceitar as duas grafias.
//
// Havia seis regex `\(parcela \d+\/\d+\)` espalhadas pelo código. Em uma
// instância argentina todas falhariam caladas: parcela futura não detectada,
// ciclo de fatura errado, agrupamento de regra e de revisão em massa furados.
// Erro silencioso em dado financeiro é o pior tipo. Agora há um lugar só.

/** Grafias aceitas do rótulo de parcela, por idioma do documento. */
const INSTALLMENT_WORDS = ['parcela', 'cuota'];

const WORDS = INSTALLMENT_WORDS.join('|');

/** Casa o sufixo no fim da descrição, capturando número e total. */
export const INSTALLMENT_RX = new RegExp(`\\((?:${WORDS}) (\\d+)\\/(\\d+)\\)$`, 'i');

/** Mesma coisa, para remoção (aceita o espaço que antecede). */
export const INSTALLMENT_STRIP_RX = new RegExp(`\\s*\\((?:${WORDS}) \\d+\\/\\d+\\)$`, 'i');

/** Descrição sem o sufixo de parcela — a "compra" por trás das parcelas. */
export const stripInstallment = (desc) =>
  String(desc || '').replace(INSTALLMENT_STRIP_RX, '').trim();

/** `{ n, total }` da parcela, ou null. */
export function installmentOf(desc) {
  const m = String(desc || '').match(INSTALLMENT_RX);
  return m ? { n: +m[1], total: +m[2] } : null;
}

/**
 * Nomes de mês em português e espanhol → índice (1–12).
 *
 * Usado para ler o mês citado na descrição de um pagamento de fatura, que é
 * texto do BANCO, não da interface: um extrato brasileiro diz "julho" mesmo
 * numa instância em espanhol. Por isso as duas línguas são aceitas sempre, em
 * vez de escolher pelo locale.
 */
const MONTH_NAMES = {
  // pt-BR
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
  // es
  enero: 1, febrero: 2, marzo: 3, mayo: 5, junio: 6,
  julio: 7, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
  // abril e agosto são iguais nas duas línguas (já acima)

  // Abreviações de três letras. O resumo de cartão do Mercado Pago Argentina
  // data cada linha como "2/dic", "19/jun" — sem ano e sem o nome inteiro.
  // As formas curtas coincidem nas duas línguas onde existem nas duas
  // ("abr", "jun", "jul", "ago", "nov"), então não há ambiguidade a resolver.
  ene: 1, jan: 1,
  feb: 2, fev: 2,
  mar: 3,
  abr: 4,
  may: 5, mai: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  sep: 9, set: 9,
  oct: 10, out: 10,
  nov: 11,
  dic: 12, dez: 12,
};

const deaccent = (s) =>
  String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Nome de mês (pt ou es, com ou sem acento) → 1–12, ou null. */
export const monthIndexOf = (name) => MONTH_NAMES[deaccent(name)] ?? null;

/**
 * Descrição de pagamento de fatura → competência "AAAA-MM", ou null.
 *
 *   "Pagamento da fatura de julho/2026"  → "2026-07"   (Mercado Pago BR)
 *   "Pago del resumen de julio/2026"     → "2026-07"   (suposição AR)
 *
 * Confiança: ALTA no português (validado contra extratos reais); BAIXA no
 * espanhol — a frase exata do Mercado Pago Argentina não foi verificada. O
 * padrão é frouxo de propósito (qualquer coisa + mês/ano) para errar por
 * excesso de tolerância em vez de não casar nada; o casamento só é usado
 * quando a transação já está marcada como transferência.
 */
export function invoicePaymentRef(description) {
  const m = String(description || '').match(
    /(?:pagamento|pago|pagto)\b[^\d]*?(\p{L}+)\s*[\/\-]\s*(\d{4})/iu);
  if (!m) return null;
  const mi = monthIndexOf(m[1]);
  return mi ? `${m[2]}-${String(mi).padStart(2, '0')}` : null;
}
