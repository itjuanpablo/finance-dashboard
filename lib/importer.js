import crypto from 'crypto';
import { getDb } from './db.js';
import { categorize } from './categorizer.js';
import { parseMercadoPagoPdf } from './parsers/mercadopago.js';
import { parseOfx } from './parsers/ofx.js';
import { parseCsv } from './parsers/csv.js';

async function extractPdfText(buffer) {
  const { default: pdf } = await import('pdf-parse/lib/pdf-parse.js');
  const data = await pdf(buffer);
  return data.text;
}

async function parseFile(fileName, buffer) {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  if (ext === 'pdf') {
    const text = await extractPdfText(buffer);
    const { kind, transactions } = parseMercadoPagoPdf(text);
    if (kind === 'desconhecido') {
      throw new Error(
        'Layout de PDF não reconhecido. Suportados: extrato de conta e fatura de cartão do Mercado Pago. ' +
        'Para outros bancos, prefira OFX ou CSV.');
    }
    return { kind: `mp-${kind}`, transactions };
  }
  const text = buffer.toString('utf8');
  if (ext === 'ofx') return { kind: 'ofx', transactions: parseOfx(text) };
  if (ext === 'csv' || ext === 'txt') return { kind: 'csv', transactions: parseCsv(text) };
  throw new Error(`Formato não suportado: .${ext} (use PDF, OFX ou CSV)`);
}

/**
 * Importa um arquivo: parse → categorização → deduplicação → SQLite.
 * Idempotente: reimportar o mesmo arquivo não duplica nada.
 */
export async function importFile(fileName, buffer) {
  const { kind, transactions } = await parseFile(fileName, buffer);
  if (!transactions.length) {
    throw new Error('Nenhuma transação encontrada no arquivo.');
  }

  const db = getDb();
  const rules = db.prepare('SELECT pattern, category FROM rules').all();
  const insertBatch = db.prepare(
    'INSERT INTO batches (file_name, kind) VALUES (?, ?)');
  const insertTx = db.prepare(`
    INSERT OR IGNORE INTO transactions
      (date, description, amount_cents, category, transfer, source, external_id, hash, batch_id)
    VALUES (@date, @description, @amount_cents, @category, @transfer, @source, @external_id, @hash, @batch_id)`);

  db.exec('BEGIN');
  try {
    const batchId = insertBatch.run(fileName, kind).lastInsertRowid;
    let inserted = 0, skipped = 0, toReview = 0;
    const seen = new Map(); // desambigua tuplas idênticas dentro do mesmo arquivo

    for (const t of transactions) {
      const cents = Math.round(t.amount * 100);
      const key = `${t.date}|${cents}|${t.description}`;
      const occ = (seen.get(key) || 0) + 1;
      seen.set(key, occ);

      // extrato MP tem ID de operação único; nos demais, hash do conteúdo
      const hash = t.externalId
        ? `${t.source}:${t.externalId}`
        : crypto.createHash('sha1').update(`${t.source}|${key}|${occ}`).digest('hex');

      const category = t.transfer ? 'Transferências' : categorize(t.description, rules);
      if (category === 'A revisar') toReview++;

      const res = insertTx.run({
        date: t.date,
        description: t.description,
        amount_cents: cents,
        category,
        transfer: t.transfer ? 1 : 0,
        source: t.source,
        external_id: t.externalId,
        hash,
        batch_id: batchId,
      });
      res.changes ? inserted++ : skipped++;
    }

    db.prepare('UPDATE batches SET inserted = ?, skipped = ? WHERE id = ?')
      .run(inserted, skipped, batchId);
    db.exec('COMMIT');
    return { fileName, kind, inserted, skipped, toReview };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
