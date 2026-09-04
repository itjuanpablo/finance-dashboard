import { NextResponse } from 'next/server';
import { parseFile } from '@/lib/importer';
import { getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Prévia não grava nada. Ela existe para que a pessoa veja o banco/formato e
// quantas linhas com ID externo já estão no Fluxo antes de confirmar a ação.
export async function POST(request) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file.arrayBuffer !== 'function') {
      return NextResponse.json({ error: 'Envie um arquivo para visualizar.' }, { status: 400 });
    }
    const parsed = await parseFile(file.name, Buffer.from(await file.arrayBuffer()));
    const db = getDb();
    const exists = db.prepare('SELECT 1 FROM transactions WHERE hash = ? LIMIT 1');
    let knownDuplicates = 0;
    for (const tx of parsed.transactions) {
      if (tx.externalId && exists.get(`${tx.source}:${tx.externalId}`)) knownDuplicates++;
    }
    return NextResponse.json({
      fileName: file.name,
      bank: parsed.bank,
      kind: parsed.kind,
      confidence: parsed.confidence,
      warnings: parsed.warnings || [],
      transactions: parsed.transactions.length,
      knownDuplicates,
      sample: parsed.transactions.slice(0, 4).map(tx => ({
        date: tx.date, description: tx.description, amount: tx.amount,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Não foi possível ler este arquivo.' }, { status: 400 });
  }
}
