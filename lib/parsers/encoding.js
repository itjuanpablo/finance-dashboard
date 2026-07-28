// Bytes → texto. Um passo que o importador fazia às cegas e que custa caro.
//
// `buffer.toString('utf8')` em um extrato Windows-1252 (o que o Excel e boa
// parte dos internet bankings brasileiros cospem) não falha: ele troca cada
// byte inválido por U+FFFD. "Transferência" vira "Transfer<?>ncia" e isso
// entra na descrição, no hash de deduplicação e na tela. Depois de corrigido o
// encoding o mesmo arquivo gera OUTRO hash — ou seja, o erro se paga duas
// vezes: uma na leitura, outra na reimportação.
//
// A decisão é em cascata, do indício mais forte para o mais fraco, e cada
// degrau fica observável no resultado (`detectedBy`) para o importador poder
// dizer ao usuário o que foi feito:
//
//   1. BOM             — declaração explícita de quem gravou o arquivo, manda
//   2. UTF-16 sem BOM  — export "Unicode" do Excel; passa no UTF-8 estrito
//   3. cabeçalho OFX   — `ENCODING:`/`CHARSET:` (e `<?xml encoding=?>` no 2.x)
//   4. UTF-8 estrito   — TextDecoder com fatal: true; se lança, não é UTF-8
//   5. mojibake        — UTF-8 válido mas duplamente codificado ("TransferÃªncia")
//   6. windows-1252    — último recurso; nunca falha, todo byte tem letra
//
// Sem dependência nova: Node 22 traz windows-1252, utf-16le e utf-16be no
// TextDecoder (ICU completo — conferido em runtime abaixo). Ainda assim a
// tabela manual de 0x80–0x9F fica aqui como rede, porque build small-icu
// existe no mundo real e um parser financeiro não pode quebrar por causa disso.

/**
 * Único trecho em que windows-1252 difere de ISO-8859-1: 0x80–0x9F.
 * As cinco posições sem caractere definido (0x81, 0x8D, 0x8F, 0x90, 0x9D)
 * ficam como o próprio ponto de código, igual ao que o TextDecoder faz.
 * Em escapes de propósito: isto é TABELA, não texto — tem de sobreviver a um
 * editor que abra este arquivo no encoding errado.
 */
const CP1252_80_9F =
  '€‚ƒ„…†‡' +
  'ˆ‰Š‹ŒŽ' +
  '‘’“”•–—' +
  '˜™š›œžŸ';

/** windows-1252 existe neste runtime? (checado uma vez, não a cada arquivo) */
const HAS_WIN1252 = (() => {
  try {
    return new TextDecoder('windows-1252').decode(Uint8Array.of(0x93)) === '“';
  } catch {
    return false;
  }
})();

const utf8Strict = new TextDecoder('utf-8', { fatal: true });

/** Decodifica com o rótulo pedido; 'windows-1252' tem plano B sem ICU. */
function decodeAs(encoding, bytes) {
  if (encoding === 'windows-1252' && !HAS_WIN1252) {
    let out = '';
    for (const b of bytes) {
      out += b >= 0x80 && b <= 0x9f ? CP1252_80_9F[b - 0x80] : String.fromCharCode(b);
    }
    return out;
  }
  return new TextDecoder(encoding).decode(bytes);
}

/** UTF-8 estrito: texto, ou null quando há byte que não é UTF-8 válido. */
function tryUtf8(bytes) {
  try {
    return utf8Strict.decode(bytes);
  } catch {
    return null;
  }
}

// ─── mojibake ────────────────────────────────────────────────────────────────
//
// O caso que o UTF-8 estrito NÃO pega: o texto já chegou duplamente codificado.
// Alguém leu bytes UTF-8 como Latin-1 ("Transferência" → "TransferÃªncia") e
// salvou de novo em UTF-8. O arquivo é UTF-8 *válido*, e mesmo assim errado.
//
// Assinatura: um byte inicial de sequência UTF-8 comum em português/espanhol
// (C2, C3) ou de pontuação/emoji (E2, F0), seguido de byte de continuação
// (0x80–0xBF), ambos vistos como caracteres cp1252. Restringir a esses quatro
// líderes é de propósito — "À" seguido de acento existe em texto de verdade,
// "Ã" seguido de "©" não.

/** Os 27 caracteres de 0x80–0x9F que cp1252 realmente define. */
const CP1252_PUNCT = [...CP1252_80_9F]
  .filter((ch) => ch.charCodeAt(0) > 0x9f)
  .map((ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`)
  .join('');

const MOJIBAKE_RX = new RegExp(
  // "ï¿½" é o próprio U+FFFD já codificado duas vezes — o caso mais explícito
  `\\u00EF\\u00BF\\u00BD|[\\u00C2\\u00C3\\u00E2\\u00F0][\\u0080-\\u00BF${CP1252_PUNCT}]`,
  'g');

/** Quantas marcas de mojibake o texto tem. Zero = provavelmente está certo. */
export const countMojibake = (text) =>
  (String(text ?? '').match(MOJIBAKE_RX) || []).length;

/** char → byte cp1252 (inverso de CP1252_80_9F, só o trecho que difere). */
const CP1252_REVERSE = new Map(
  [...CP1252_80_9F].map((ch, i) => [ch, 0x80 + i]));

/**
 * Desfaz o mojibake: escreve o texto de volta como bytes cp1252 e relê como
 * UTF-8 — exatamente a operação inversa da que o estragou.
 *
 * Devolve null quando a reversão não fecha (algum caractere não cabe em cp1252,
 * ou os bytes resultantes não formam UTF-8 válido). Isso é uma PROVA barata: se
 * a volta não é UTF-8 legítimo, o texto não era mojibake, e mexer nele seria
 * chute. Preferir não mexer é o comportamento certo em dado financeiro.
 */
export function undoMojibake(text) {
  const s = String(text ?? '');
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code <= 0xff) bytes[i] = code;
    else {
      const b = CP1252_REVERSE.get(s[i]);
      if (b === undefined) return null;   // não veio de um byte cp1252
      bytes[i] = b;
    }
  }
  return tryUtf8(bytes);
}

// ─── BOM ─────────────────────────────────────────────────────────────────────

const BOMS = [
  { size: 3, encoding: 'utf-8', bytes: [0xef, 0xbb, 0xbf] },
  { size: 2, encoding: 'utf-16le', bytes: [0xff, 0xfe] },
  { size: 2, encoding: 'utf-16be', bytes: [0xfe, 0xff] },
];

const bomOf = (b) =>
  BOMS.find((bom) => bom.bytes.every((byte, i) => b[i] === byte)) || null;

// ─── encoding declarado no cabeçalho (OFX 1.x SGML e 2.x XML) ────────────────

/**
 * OFX 1.x abre com um cabeçalho de texto puro:
 *
 *   OFXHEADER:100
 *   ENCODING:USASCII
 *   CHARSET:1252
 *
 * `CHARSET` é quem descreve os bytes altos, então ganha de `ENCODING` quando
 * diz algo útil — "USASCII + CHARSET:1252" é a combinação mais comum nos
 * bancos brasileiros e significa, na prática, windows-1252.
 *
 * @param {string} head primeiros bytes do arquivo, já em texto
 * @returns {string|null} rótulo de encoding, ou null se nada foi declarado
 */
export function declaredEncoding(head) {
  const h = String(head ?? '');
  const charset = h.match(/^\s*CHARSET\s*:\s*([\w-]+)/im)?.[1];
  const encoding = h.match(/^\s*ENCODING\s*:\s*([\w-]+)/im)?.[1];
  const xml = h.match(/<\?xml[^>]*\bencoding\s*=\s*["']([\w-]+)["']/i)?.[1];
  return labelOf(charset) || labelOf(encoding) || labelOf(xml);
}

/** Rótulo declarado → rótulo que sabemos decodificar (null = não diz nada). */
function labelOf(raw) {
  const s = String(raw ?? '').toLowerCase();
  if (!s) return null;
  if (/utf-?8/.test(s)) return 'utf-8';
  if (/utf-?16le/.test(s)) return 'utf-16le';
  if (/utf-?16be|utf-?16/.test(s)) return 'utf-16be';
  // ISO-8859-1 é subconjunto de windows-1252 nos bytes que texto usa: ler como
  // 1252 decodifica Latin-1 corretamente e ainda salva quem declarou 8859-1 e
  // gravou aspas curvas (0x93/0x94), que é o erro mais comum do Windows.
  if (/1252|windows|cp-?125|8859-?1|latin-?1/.test(s)) return 'windows-1252';
  // USASCII / NONE não dizem nada sobre os bytes altos: segue a heurística.
  return null;
}

// ─── UTF-16 sem BOM ──────────────────────────────────────────────────────────
//
// Export "Unicode" do Excel sai em UTF-16LE, às vezes sem BOM. Isso PASSA no
// UTF-8 estrito (0x00 é UTF-8 válido!) e produz texto salpicado de NUL, que
// depois quebra tudo em silêncio. Um quarto dos bytes ser 0x00, todos do mesmo
// lado da paridade, não acontece em texto de verdade — assinatura suficiente.

/** @returns {'utf-16le'|'utf-16be'|null} */
function sniffUtf16(bytes) {
  const n = Math.min(bytes.length, 512);
  if (n < 8) return null;
  let even = 0, odd = 0;
  for (let i = 0; i < n; i++) {
    if (bytes[i] !== 0) continue;
    if (i % 2 === 0) even++; else odd++;
  }
  if (odd > n * 0.25 && even === 0) return 'utf-16le';   // NUL nas posições ímpares
  if (even > n * 0.25 && odd === 0) return 'utf-16be';
  return null;
}

// ─── entrada principal ───────────────────────────────────────────────────────

const asBytes = (input) =>
  input instanceof Uint8Array ? input
    : ArrayBuffer.isView(input)
      ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
      : new Uint8Array(input);

function done(text, encoding, detectedBy, warnings) {
  // BOM que sobrou (arquivo concatenado, export dentro de zip) atrapalha o
  // primeiro cabeçalho do CSV — some aqui, não em cada parser.
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  if (clean.includes('�')) {
    // Já veio quebrado do outro lado: nenhuma releitura traz o byte de volta.
    // Avisar é o máximo honesto.
    warnings.push('o arquivo já contém caractere de substituição (U+FFFD): houve perda antes da importação');
  }
  return { text: clean, encoding, detectedBy, warnings };
}

/**
 * Decodifica o conteúdo de um arquivo de extrato/fatura.
 *
 * @param {Buffer|Uint8Array|ArrayBuffer} input
 * @param {{format?: 'csv'|'ofx'|'txt'|null}} [opts]
 * @returns {{text: string, encoding: string, detectedBy: string, warnings: string[]}}
 */
export function decodeBuffer(input, { format = null } = {}) {
  const bytes = asBytes(input);
  const warnings = [];
  if (!bytes.length) return { text: '', encoding: 'utf-8', detectedBy: 'vazio', warnings };

  // 1. BOM manda: quem gravou disse o que gravou.
  const bom = bomOf(bytes);
  if (bom) {
    const text = decodeAs(bom.encoding, bytes.subarray(bom.size));
    const fixed = countMojibake(text) ? undoMojibake(text) : null;
    if (fixed != null) {
      warnings.push(`o BOM declara ${bom.encoding} e o texto está duplamente codificado; mojibake desfeito`);
      return done(fixed, `${bom.encoding}+mojibake`, 'bom-mojibake', warnings);
    }
    return done(text, bom.encoding, 'bom', warnings);
  }

  // 2. UTF-16 sem BOM.
  const u16 = sniffUtf16(bytes);
  if (u16) return done(decodeAs(u16, bytes), u16, 'utf16-sem-bom', warnings);

  const strict = tryUtf8(bytes);

  // 3. Cabeçalho declarado (OFX). Indício forte, mas não é prova.
  const head = decodeAs('windows-1252', bytes.subarray(0, 2048));
  const declared = (format === 'ofx' || /OFXHEADER|<OFX[\s>]|<\?xml/i.test(head))
    ? declaredEncoding(head) : null;

  if (declared) {
    if (declared === 'utf-8') {
      if (strict != null) return done(strict, 'utf-8', 'cabecalho', warnings);
      warnings.push('o cabeçalho declara UTF-8 mas há byte inválido; lido como windows-1252');
      return done(decodeAs('windows-1252', bytes), 'windows-1252', 'cabecalho-invalido', warnings);
    }
    const asDeclared = decodeAs(declared, bytes);
    // Banco que declara CHARSET:1252 e grava UTF-8 existe. A declaração é
    // indício; mojibake é prova. Só desmente o cabeçalho quando a leitura
    // declarada produz mojibake E a UTF-8 estrita passa limpa.
    if (strict != null && countMojibake(asDeclared) > 0 && countMojibake(strict) === 0) {
      warnings.push(`o cabeçalho declara ${declared} mas o conteúdo é UTF-8 válido; seguindo o conteúdo`);
      return done(strict, 'utf-8', 'cabecalho-desmentido', warnings);
    }
    return done(asDeclared, declared, 'cabecalho', warnings);
  }

  // 4. UTF-8 estrito falhou: é windows-1252 (ou Latin-1, que ela contém).
  if (strict == null) {
    return done(decodeAs('windows-1252', bytes), 'windows-1252', 'utf8-invalido', warnings);
  }

  // 5. UTF-8 válido, porém duplamente codificado.
  if (countMojibake(strict) > 0) {
    const fixed = undoMojibake(strict);
    if (fixed != null) {
      warnings.push('texto duplamente codificado ("Ã©", "Â "): mojibake desfeito');
      return done(fixed, 'utf-8+mojibake', 'mojibake', warnings);
    }
    // Marcas de mojibake mas a reversão não fecha: pode ser texto legítimo.
    // Mantém o UTF-8 e avisa, em vez de adivinhar.
    warnings.push('há marcas de mojibake mas a reversão não fecha; mantido UTF-8 sem alterar o texto');
  }

  return done(strict, 'utf-8', 'utf8', warnings);
}
