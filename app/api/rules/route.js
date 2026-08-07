import { NextResponse } from 'next/server';
import { t } from '@/lib/i18n';
import { getDb, isValidCategory, ACTIVE_TX } from '@/lib/db';
import { CAT } from '@/lib/categories';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Contrato v4: rules.category guarda a CHAVE da categoria.

export async function GET() {
  const db = getDb();
  const rules = db.prepare(
    'SELECT id, pattern, category, created_at FROM rules ORDER BY id DESC'
  ).all();
  return NextResponse.json({ rules });
}

// POST: cria ou edita uma regra (upsert por padrão de texto).
// apply: true também recategoriza retroativamente tudo que está em CAT.TO_REVIEW.
export async function POST(request) {
  const { pattern, category, apply } = await request.json();
  const db = getDb();
  if (!pattern || pattern.trim().length < 3 || !isValidCategory(db, category)) {
    return NextResponse.json({ error: t('api.invalidParams') }, { status: 400 });
  }
  const p = pattern.trim();
  // `%` e `_` são CURINGAS do LIKE, e `p` vem de texto do banco — um
  // estabelecimento chamado "100% Saúde" viraria `LIKE '%100%_Saúde%'` e
  // recategorizaria em massa coisa nenhuma a ver, sem erro e sem desfazer.
  // Escapar é obrigatório aqui: o mesmo caractere que é dado para o usuário é
  // sintaxe para o SQLite.
  const literal = p.replace(/[\\%_]/g, c => '\\' + c);
  db.prepare(
    'INSERT INTO rules (pattern, category) VALUES (?, ?) ON CONFLICT(pattern) DO UPDATE SET category = excluded.category'
  ).run(p, category);
  let applied = 0;
  if (apply) {
    // A regra também liga/desliga a bandeira de transferência interna: é assim
    // que o usuário ensina "TPUSH <meu nome> é dinheiro meu trocando de conta,
    // não receita" e o app passa a acertar o total do mês — inclusive nas
    // próximas importações (ver lib/importer.js).
    applied = db.prepare(
      `UPDATE transactions SET category = ?, transfer = ${category === CAT.TRANSFERS ? 1 : 0}
       WHERE category = ? AND ${ACTIVE_TX} AND description LIKE ? ESCAPE '\\' COLLATE NOCASE`
    ).run(category, CAT.TO_REVIEW, `%${literal}%`).changes;
  }
  return NextResponse.json({ ok: true, applied });
}

// DELETE: remove uma regra. Transações já categorizadas não são alteradas.
export async function DELETE(request) {
  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: t('api.idRequired') }, { status: 400 });
  const db = getDb();
  db.prepare('DELETE FROM rules WHERE id = ?').run(id);
  return NextResponse.json({ ok: true });
}
