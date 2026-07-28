import crypto from 'crypto';
import { getDb, backupDb } from './db.js';
import { CAT } from './categories.js';
import { t } from './i18n/index.js';
import { categorize } from './categorizer.js';
import { detectBank } from './banks/index.js';
import { parseMercadoPagoPdf } from './parsers/mercadopago.js';
import { parseOfx } from './parsers/ofx.js';
import { parseCsvFile } from './parsers/csv.js';
// (categorias válidas e vínculo de contas são lidos do banco a cada importação)

async function extractPdfText(buffer) {
  const { default: pdf } = await import('pdf-parse/lib/pdf-parse.js');
  const data = await pdf(buffer);
  return data.text;
}

/** Nome do banco para exibir ("Nubank · fatura"), a partir do perfil detectado. */
function bankLabel(profile, fallbackKey) {
  if (!profile) return t(fallbackKey);
  const kind = profile.kind === 'invoice' ? t('bank.invoice')
    : profile.kind === 'statement' ? t('bank.statement') : null;
  // Nome de instituição é nome próprio: não passa por tradução (docs/i18n.md).
  return kind ? `${profile.name} · ${kind}` : profile.name;
}

/**
 * Arquivo → transações. `kind` é gravado em batches.kind e alimenta a lista de
 * origens em Gerenciar › Contas, então tem de ser igual ao `source` gravado nas
 * transações — senão o usuário vê duas entradas para a mesma coisa.
 */
async function parseFile(fileName, buffer) {
  const ext = (fileName.split('.').pop() || '').toLowerCase();

  if (ext === 'pdf') {
    const text = await extractPdfText(buffer);
    const { kind, source, transactions, warnings } = parseMercadoPagoPdf(text);
    if (kind === 'corrompido') throw new Error(t('import.err.corrupt'));
    if (kind === 'desconhecido') throw new Error(t('import.err.unknownPdf'));
    if (warnings?.length) console.warn(`[import] ${fileName}: ${warnings.join(' | ')}`);
    const profile = detectBank(text, fileName, 'pdf');
    return { kind: source, transactions, bank: bankLabel(profile, 'bank.unknown') };
  }

  const text = buffer.toString('utf8');

  if (ext === 'ofx') {
    // OFX já vem normalizado e traz FITID, que é a chave de deduplicação.
    // O `source` fica 'ofx' de propósito: trocá-lo por banco reimportaria como
    // novo tudo o que já está no banco de dados. O perfil serve só para exibir.
    const profile = detectBank(text, fileName, 'ofx');
    return { kind: 'ofx', transactions: parseOfx(text), bank: bankLabel(profile, 'bank.generic.ofx') };
  }

  if (ext === 'csv' || ext === 'txt') {
    const { profile, transactions } = parseCsvFile(text, { fileName });
    if (!transactions.length && !profile) {
      // Distingue "arquivo vazio" de "não achei as colunas": a segunda tem
      // conserto do lado do usuário (renomear cabeçalho, exportar em OFX).
      const hasRows = text.split(/\r?\n/).filter(l => l.trim()).length > 1;
      if (hasRows) throw new Error(t('import.err.noColumns'));
    }
    return {
      kind: profile?.source || 'csv',
      transactions,
      bank: bankLabel(profile, 'bank.generic.csv'),
      fallbackSource: profile?.fallbackSource || null,
    };
  }

  throw new Error(t('import.err.unsupported', { ext }));
}

/**
 * Importa um arquivo: parse → categorização → deduplicação → SQLite.
 * Idempotente: reimportar o mesmo arquivo não duplica nada.
 */
export async function importFile(fileName, buffer) {
  const { kind, transactions, bank, fallbackSource } = await parseFile(fileName, buffer);
  if (!transactions.length) {
    throw new Error(t('import.err.empty'));
  }

  const db = getDb();
  const rules = db.prepare('SELECT pattern, category FROM rules').all();
  const insertBatch = db.prepare(
    'INSERT INTO batches (file_name, kind) VALUES (?, ?)');
  const insertTx = db.prepare(`
    INSERT OR IGNORE INTO transactions
      (date, description, amount_cents, category, transfer, source, external_id, hash, batch_id, account_id, invoice_ref)
    VALUES (@date, @description, @amount_cents, @category, @transfer, @source, @external_id, @hash, @batch_id, @account_id, @invoice_ref)`);

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
    for (const tx of transactions) {
      const cents = Math.round(tx.amount * 100);
      const key = `${tx.date}|${cents}|${tx.description}`;
      const occ = (seen.get(key) || 0) + 1;
      seen.set(key, occ);

      // extrato MP tem ID de operação único; nos demais, hash do conteúdo
      const hash = tx.externalId
        ? `${tx.source}:${tx.externalId}`
        : crypto.createHash('sha1').update(`${tx.source}|${key}|${occ}`).digest('hex');

      let category = tx.transfer ? CAT.TRANSFERS : categorize(tx.description, rules);
      if (!validCats.has(category)) category = CAT.TO_REVIEW;
      if (category === CAT.TO_REVIEW) toReview++;

      const res = insertTx.run({
        date: tx.date,
        description: tx.description,
        amount_cents: cents,
        category,
        transfer: tx.transfer ? 1 : 0,
        source: tx.source,
        external_id: tx.externalId,
        hash,
        batch_id: batchId,
        account_id: accountFor(tx.source),
        invoice_ref: tx.invoiceRef ?? null,
      });
      res.changes ? inserted++ : skipped++;
    }

    db.prepare('UPDATE batches SET inserted = ?, skipped = ? WHERE id = ?')
      .run(inserted, skipped, batchId);
    db.exec('COMMIT');
    if (inserted > 0) backupDb(db);
    return { fileName, kind, bank, inserted, skipped, toReview };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
