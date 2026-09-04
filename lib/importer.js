import crypto from 'crypto';
import { getDb, backupDb } from './db.js';
import { CAT } from './categories.js';
import { t } from './i18n/index.js';
import { categorize } from './categorizer.js';
import { detectBank } from './banks/index.js';
import { parseMercadoPagoPdf } from './parsers/mercadopago.js';
import { detectExtractoAr, parseExtractoAr } from './parsers/extracto-ar.js';
import { detectResumenTarjetaAr, parseResumenTarjetaAr } from './parsers/resumen-tarjeta-ar.js';
import { detectNubankExtrato, parseNubankExtrato } from './parsers/nubank-extrato.js';
import { detectInterGlobalPdf, parseInterGlobalPdf } from './parsers/inter-global-pdf.js';
import { parseOfxFile } from './parsers/ofx.js';
import { parseCsvFile } from './parsers/csv.js';
import { decodeBuffer } from './parsers/encoding.js';
// (categorias válidas e vínculo de contas são lidos do banco a cada importação)

async function extractPdfText(buffer) {
  const { default: pdf } = await import('pdf-parse/lib/pdf-parse.js');
  const data = await pdf(buffer);
  return data.text;
}

/**
 * Nome do banco para exibir ("Nubank · fatura"), a partir do perfil detectado.
 * `kindOverride` existe para o OFX: o mesmo perfil de banco serve para conta e
 * cartão, e quem sabe qual é dos dois é o arquivo (<CCSTMTRS>), não o registry.
 */
function bankLabel(profile, fallbackKey, kindOverride) {
  if (!profile) return t(fallbackKey);
  const k = kindOverride || profile.kind;
  const kind = k === 'invoice' ? t('bank.invoice')
    : k === 'statement' ? t('bank.statement') : null;
  // Nome de instituição é nome próprio: não passa por tradução (docs/i18n.md).
  return kind ? `${profile.name} · ${kind}` : profile.name;
}

/**
 * Ficha do que foi reconhecido, para a tela poder ser honesta sobre o quanto
 * confiar no que acabou de entrar: qual perfil casou, com que confiança
 * declarada (lib/banks/README.md) e como os bytes foram decodificados.
 *
 * TODO i18n: import.confidence.alta / .media / .baixa — `confidence` viaja como
 * o token cru do registry ('alta'|'media'|'baixa'), que é português; a tela
 * precisa de chave para exibi-lo em es-AR.
 */
const provenance = (profile, encoding, detectedBy) => ({
  profileId: profile?.id ?? null,
  confidence: profile?.confidence ?? null,
  country: profile?.country ?? null,
  encoding: encoding ?? null,
  encodingDetectedBy: detectedBy ?? null,
});

/**
 * Arquivo → transações. `kind` é gravado em batches.kind e alimenta a lista de
 * origens em Gerenciar › Contas, então tem de ser igual ao `source` gravado nas
 * transações — senão o usuário vê duas entradas para a mesma coisa.
 */
export async function parseFile(fileName, buffer) {
  const ext = (fileName.split('.').pop() || '').toLowerCase();

  if (ext === 'pdf') {
    const text = await extractPdfText(buffer);

    // Extrato "Últimos movimientos" de banco argentino. Vem ANTES do Mercado
    // Pago porque é o layout mais específico: exige dois marcadores próprios,
    // então não há risco de roubar um documento do MP.
    if (detectExtractoAr(text)) {
      const { transactions, warnings } = parseExtractoAr(text);
      const profile = detectBank(text, fileName, 'pdf');
      return {
        kind: 'ar-cuenta',
        transactions,
        bank: bankLabel(profile, 'bank.unknown'),
        warnings: warnings || [],
        ...provenance(profile, 'pdf', 'pdf-parse'),
      };
    }

    // Conta Global do Inter (dólar). Marcadores próprios; não disputa arquivo.
    if (detectInterGlobalPdf(text)) {
      const { transactions, warnings } = parseInterGlobalPdf(text);
      const profile = detectBank(text, fileName, 'pdf');
      return {
        kind: 'inter-global',
        transactions,
        bank: bankLabel(profile, 'bank.unknown'),
        warnings: warnings || [],
        ...provenance(profile, 'pdf', 'pdf-parse'),
      };
    }

    // Extrato de conta do Nubank. Marcadores próprios e específicos, então não
    // disputa arquivo com nenhum outro perfil.
    if (detectNubankExtrato(text)) {
      const { transactions, warnings } = parseNubankExtrato(text);
      const profile = detectBank(text, fileName, 'pdf');
      return {
        kind: 'nubank-extrato',
        transactions,
        bank: bankLabel(profile, 'bank.unknown'),
        warnings: warnings || [],
        ...provenance(profile, 'pdf', 'pdf-parse'),
      };
    }

    // Resumo de cartão argentino do Mercado Pago. Vem ANTES de
    // parseMercadoPagoPdf porque o layout adivinhado que vivia lá dentro
    // (LAYOUTS.AR.invoice) não corresponde ao documento real — ver o cabeçalho
    // de lib/parsers/resumen-tarjeta-ar.js.
    if (detectResumenTarjetaAr(text)) {
      const { transactions, warnings } = parseResumenTarjetaAr(text);
      const profile = detectBank(text, fileName, 'pdf');
      return {
        kind: 'mp-ar-fatura',
        transactions,
        bank: bankLabel(profile, 'bank.unknown'),
        warnings: warnings || [],
        ...provenance(profile, 'pdf', 'pdf-parse'),
      };
    }

    const { kind, source, transactions, warnings } = parseMercadoPagoPdf(text);
    if (kind === 'corrompido') throw new Error(t('import.err.corrupt'));
    if (kind === 'desconhecido') throw new Error(t('import.err.unknownPdf'));
    const profile = detectBank(text, fileName, 'pdf');
    return {
      kind: source,
      transactions,
      bank: bankLabel(profile, 'bank.unknown'),
      warnings: warnings || [],
      // PDF não passa por decodeBuffer: quem extrai o texto é o pdf-parse.
      ...provenance(profile, 'pdf', 'pdf-parse'),
    };
  }

  // Nada de `buffer.toString('utf8')`: extrato em Windows-1252 vira U+FFFD na
  // descrição, e a descrição entra no hash de deduplicação (ver encoding.js).
  const { text, encoding, detectedBy, warnings: encWarnings } =
    decodeBuffer(buffer, { format: ext === 'ofx' ? 'ofx' : 'csv' });

  if (ext === 'ofx') {
    // OFX já vem normalizado e traz FITID, que é a chave de deduplicação.
    // O `source` fica 'ofx' de propósito: trocá-lo por banco reimportaria como
    // novo tudo o que já está no banco de dados. O perfil serve só para exibir.
    const profile = detectBank(text, fileName, 'ofx');
    const { transactions, kind, warnings } = parseOfxFile(text);
    return {
      kind: 'ofx',
      transactions,
      bank: bankLabel(profile, 'bank.generic.ofx', kind),
      warnings: [...encWarnings, ...warnings],
      ...provenance(profile, encoding, detectedBy),
    };
  }

  if (ext === 'csv' || ext === 'txt') {
    const { profile, transactions, warnings } = parseCsvFile(text, { fileName });
    if (!transactions.length && !profile) {
      // Distingue "arquivo vazio" de "não achei as colunas": a segunda tem
      // conserto do lado do usuário (renomear cabeçalho, exportar em OFX).
      const hasRows = text.split(/\r\n|\r|\n/).filter(l => l.trim()).length > 1;
      if (hasRows) throw new Error(t('import.err.noColumns'));
    }
    return {
      kind: profile?.source || 'csv',
      transactions,
      bank: bankLabel(profile, 'bank.generic.csv'),
      fallbackSource: profile?.fallbackSource || null,
      warnings: [...encWarnings, ...warnings],
      ...provenance(profile, encoding, detectedBy),
    };
  }

  throw new Error(t('import.err.unsupported', { ext }));
}

/**
 * Importa um arquivo: parse → categorização → deduplicação → SQLite.
 * Idempotente: reimportar o mesmo arquivo não duplica nada.
 */
export async function importFile(fileName, buffer) {
  const parsed = await parseFile(fileName, buffer);
  const { kind, transactions, bank, fallbackSource, warnings } = parsed;
  if (warnings?.length) console.warn(`[import] ${fileName}: ${warnings.join(' | ')}`);
  if (!transactions.length) {
    throw new Error(t('import.err.empty'));
  }

  const db = getDb();
  const rules = db.prepare('SELECT pattern, category FROM rules').all();
  const insertBatch = db.prepare(
    'INSERT INTO batches (file_name, kind) VALUES (?, ?)');
  const insertTx = db.prepare(`
    INSERT OR IGNORE INTO transactions
      (date, description, amount_cents, category, transfer, source, external_id, hash, batch_id, account_id, invoice_ref, currency)
    VALUES (@date, @description, @amount_cents, @category, @transfer, @source, @external_id, @hash, @batch_id, @account_id, @invoice_ref, @currency)`);

  // vínculo de origem → conta (definido em Gerenciar › Contas)
  const bindingStmt = db.prepare(
    'SELECT account_id FROM source_bindings WHERE source = ?');
  const accountCache = new Map();
  const accountFor = source => {
    if (!accountCache.has(source)) {
      // Perfil de banco novo ainda não tem vínculo: cai no vínculo genérico
      // ('csv') que o usuário já configurou, em vez de chegar sem conta.
      const bound = bindingStmt.get(source)?.account_id
        ?? (fallbackSource ? bindingStmt.get(fallbackSource)?.account_id : null)
        ?? null;
      accountCache.set(source, bound);
    }
    return accountCache.get(source);
  };
  // categoria é CHAVE desde a v4 (docs/i18n.md)
  const validCats = new Set(
    db.prepare('SELECT key FROM categories WHERE archived = 0').all().map(c => c.key));

  db.exec('BEGIN');
  try {
    const batchId = insertBatch.run(fileName, kind).lastInsertRowid;
    let inserted = 0, skipped = 0, toReview = 0;
    const seen = new Map(); // desambigua tuplas idênticas dentro do mesmo arquivo

    // `tx`, não `t`: `t` aqui é a função de tradução.
    // ─── Limite de sanidade ────────────────────────────────────────────────
    // Um extrato que o leitor não reconhece cai no caminho posicional, e ali a
    // COLUNA DE DATA pode ser lida como valor: "31/07/2026 15:19:31" virou
    // R$ 31.072.026.151.931,00 num arquivo real. Não deu erro, importou 8
    // linhas e disse que estava tudo bem — e os números ficaram tão grandes que
    // o próprio SQLite não conseguia mais devolvê-los ao JavaScript, deixando o
    // app preso em "Carregando…".
    //
    // Um trilhão de centavos (10 bilhões na moeda) é grande o bastante para não
    // atrapalhar ninguém e pequeno o bastante para pegar data lida como
    // dinheiro. Cancelar a importação inteira é de propósito: se uma linha veio
    // assim, o arquivo foi lido pela coluna errada e as outras também estão.
    const LIMITE_CENTAVOS = 1e12;
    for (const tx of transactions) {
      const cents = Math.round(tx.amount * 100);
      if (!Number.isFinite(cents) || Math.abs(cents) > LIMITE_CENTAVOS) {
        throw new Error(t('import.err.absurdAmount', {
          desc: String(tx.description).slice(0, 60),
          value: String(tx.amount),
        }));
      }
      const key = `${tx.date}|${cents}|${tx.description}`;
      const occ = (seen.get(key) || 0) + 1;
      seen.set(key, occ);

      // extrato MP tem ID de operação único; nos demais, hash do conteúdo
      const hash = tx.externalId
        ? `${tx.source}:${tx.externalId}`
        : crypto.createHash('sha1').update(`${tx.source}|${key}|${occ}`).digest('hex');

      // `tx`, NUNCA `t`: neste arquivo `t` é a função de tradução importada de
      // lib/i18n. Escrever `t.description` não dá erro — devolve undefined — e o
      // categorizador então recebe string vazia, não casa com nada e joga TODA
      // transação em "a revisar". Nenhum teste de parser pega isso, porque o
      // parser está certo; o defeito mora no pipeline.
      let category = tx.transfer ? CAT.TRANSFERS : categorize(tx.description, rules);

      // Regra do usuário apontando para "Transferências" ganha do parser: é como
      // ele ensina que uma descrição que o parser não reconhece (transferência
      // da própria conta em outro banco, por exemplo) é dinheiro trocando de
      // bolso, e não receita. Sem isto a lição valia só para o passado.
      const isTransfer = tx.transfer || category === CAT.TRANSFERS;

      if (!validCats.has(category)) category = CAT.TO_REVIEW;
      if (category === CAT.TO_REVIEW) toReview++;

      const res = insertTx.run({
        date: tx.date,
        description: tx.description,
        amount_cents: cents,
        category,
        transfer: isTransfer ? 1 : 0,
        source: tx.source,
        external_id: tx.externalId,
        hash,
        batch_id: batchId,
        account_id: accountFor(tx.source),
        invoice_ref: tx.invoiceRef ?? null,
        // Nulo = moeda da instalação. Só extrato em moeda estrangeira preenche,
        // e é o parser quem sabe — ver transactions.currency em lib/db.js.
        currency: tx.currency ?? null,
      });
      res.changes ? inserted++ : skipped++;
    }

    db.prepare('UPDATE batches SET inserted = ?, skipped = ? WHERE id = ?')
      .run(inserted, skipped, batchId);
    db.exec('COMMIT');
    // Backup falho NÃO derruba a importação (o dado já está gravado), mas tem
    // que APARECER: `warnings` já viaja para a tela e vira toast. Antes isso era
    // engolido e a pessoa seguia meses acreditando ter cópia diária.
    const avisos = [...(warnings || [])];
    if (inserted > 0) {
      const bkp = backupDb(db);
      if (!bkp.path) avisos.push(t('import.backupFailed', { msg: bkp.error }));
    }
    // Além do resultado, a PROCEDÊNCIA: qual perfil casou, com que confiança e
    // como o arquivo foi decodificado. A tela mostra "Detectado: {bank}" hoje;
    // com isto ela pode qualificar a afirmação em vez de só afirmar.
    return {
      fileName, kind, bank, inserted, skipped, toReview,
      profileId: parsed.profileId,
      confidence: parsed.confidence,
      country: parsed.country,
      encoding: parsed.encoding,
      encodingDetectedBy: parsed.encodingDetectedBy,
      warnings: avisos,
    };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
