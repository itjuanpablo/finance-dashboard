import { NextResponse } from 'next/server';
import { t } from '@/lib/i18n';
import { getDb, backupDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDb();
  const batches = db.prepare(
    'SELECT id, file_name, kind, inserted, skipped, imported_at FROM batches ORDER BY id DESC'
  ).all();
  return NextResponse.json({ batches });
}

// DELETE: desfaz uma importação — remove as transações daquele lote.
//
// É a ÚNICA operação do app que apaga lançamento de verdade (o resto usa
// deleted_at ou reaponta categoria). Reimportar o arquivo recupera as linhas
// como vieram do banco, mas NÃO recupera as edições manuais. Daí as duas
// travas: backup obrigatório antes, e contagem do que tinha edição à mão no
// retorno, para a tela poder dizer o que se perdeu.
export async function DELETE(request) {
  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: t('api.idRequired') }, { status: 400 });
  const db = getDb();

  const manuallyEdited = db.prepare(`
    SELECT COUNT(*) AS n FROM transactions
    WHERE batch_id = ?
      AND (original_date IS NOT NULL
           OR original_description IS NOT NULL
           OR original_amount_cents IS NOT NULL)
  `).get(id).n;

  // Backup ANTES do DELETE e no mesmo fluxo. Se falhar, aborta: apagar sem cópia
  // é irreversível, e "backup falhou mas apaguei igual" é o pior dos mundos.
  const backup = backupDb(db, 'pre-undo');
  if (!backup.path) {
    return NextResponse.json(
      { error: t('api.backupFailed', { msg: backup.error }) }, { status: 500 });
  }

  db.exec('BEGIN');
  try {
    const res = db.prepare('DELETE FROM transactions WHERE batch_id = ?').run(id);
    db.prepare('DELETE FROM batches WHERE id = ?').run(id);
    db.exec('COMMIT');
    return NextResponse.json({
      ok: true,
      removed: res.changes,
      manuallyEdited,
      backup: backup.path.split('/').pop(),
    });
  } catch (e) {
    db.exec('ROLLBACK');
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
