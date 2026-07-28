import { NextResponse } from 'next/server';
import { t } from '@/lib/i18n';
import { getDb, categoryRows } from '@/lib/db';
import { SYSTEM_CATEGORIES, slugifyCategory, normalizeName } from '@/lib/categories';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Contrato v4: `category` é sempre CHAVE (categories.key), nunca nome.
// O nome de exibição vai como `label` — traduzido quando a chave é canônica,
// digitado pelo usuário quando é customizada ou quando ele renomeou uma
// canônica. Quem decide é catLabel() em lib/i18n, via categoryRows().

export async function GET() {
  const db = getDb();
  // includeArchived: a tela de gerenciar precisa listar as arquivadas para
  // poder restaurá-las.
  const cats = categoryRows(db, { includeArchived: true });

  // Estatísticas agregadas por CHAVE — é o que transactions.category guarda.
  const stats = {};
  db.prepare(`
    SELECT category,
           COUNT(*) AS n,
           SUM(CASE WHEN amount_cents < 0 AND transfer = 0 THEN -amount_cents ELSE 0 END) AS spent,
           COUNT(DISTINCT substr(date, 1, 7)) AS months
    FROM transactions WHERE deleted_at IS NULL GROUP BY category
  `).all().forEach(r => { stats[r.category] = r; });
  db.prepare('SELECT category, COUNT(*) AS rules FROM rules GROUP BY category')
    .all().forEach(r => { (stats[r.category] = stats[r.category] || {}).rules = r.rules; });

  const categories = cats.map(c => ({
    ...c,
    txCount: stats[c.key]?.n || 0,
    monthlyAvg: stats[c.key]?.months ? Math.round(stats[c.key].spent / stats[c.key].months) : 0,
    rulesCount: stats[c.key]?.rules || 0,
  }));
  return NextResponse.json({ categories });
}

// POST: cria categoria do usuário. A chave vem do slug do nome e `custom = 1`:
// nome digitado por gente não se traduz.
export async function POST(request) {
  const { name, color, emoji } = await request.json();
  const n = String(name || '').trim();
  if (n.length < 2 || !/^#[0-9a-fA-F]{6}$/.test(color || '')) {
    return NextResponse.json({ error: t('manage.catErrName') }, { status: 400 });
  }
  const db = getDb();
  const key = slugifyCategory(n);

  // Colisão por chave OU por nome EXIBIDO. Comparar só contra categories.name
  // não basta: numa instância es-AR a canônica `food` tem name 'Alimentação' no
  // banco mas aparece como "Comida" — criar "Comida" geraria duas categorias
  // indistinguíveis na tela.
  const clash = categoryRows(db, { includeArchived: true }).some(c =>
    c.key === key ||
    normalizeName(c.label) === normalizeName(n) ||
    normalizeName(c.name) === normalizeName(n));
  if (clash) {
    return NextResponse.json({ error: t('manage.catErrDuplicate') }, { status: 409 });
  }

  try {
    const max = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM categories').get().m;
    db.prepare(
      'INSERT INTO categories (key, name, color, emoji, sort_order, custom) VALUES (?, ?, ?, ?, ?, 1)')
      .run(key, n, color, String(emoji || '').trim(), max + 1);
  } catch {
    // rede de segurança para o UNIQUE de name/key (corrida entre duas abas)
    return NextResponse.json({ error: t('manage.catErrDuplicate') }, { status: 409 });
  }
  return NextResponse.json({ ok: true, key });
}

// PATCH: renomear, mudar cor/emoji, arquivar.
// Renomear NÃO cascateia mais: transações, regras e metas guardam a chave, e a
// chave nunca muda. Numa canônica, renomear marca `custom = 1` — a tradução
// deixa de se aplicar e o nome digitado passa a valer, com o dado intacto.
export async function PATCH(request) {
  const { id, name, color, emoji, archived } = await request.json();
  const db = getDb();
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  if (!cat) return NextResponse.json({ error: t('manage.catNotFound') }, { status: 404 });
  // bloqueio de sistema por CHAVE: o nome é editável (e traduzível), a chave não.
  const isSystem = SYSTEM_CATEGORIES.includes(cat.key);

  db.exec('BEGIN');
  try {
    if (name !== undefined && String(name).trim() !== cat.name) {
      if (isSystem) throw new Error(t('manage.catSystemRename'));
      const n = String(name).trim();
      if (n.length < 2) throw new Error(t('manage.catErrShortName'));
      db.prepare('UPDATE categories SET name = ?, custom = 1 WHERE id = ?').run(n, id);
    }
    if (color !== undefined) {
      if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error(t('manage.catErrColor'));
      db.prepare('UPDATE categories SET color = ? WHERE id = ?').run(color, id);
    }
    if (emoji !== undefined) {
      db.prepare('UPDATE categories SET emoji = ? WHERE id = ?').run(String(emoji).trim(), id);
    }
    if (archived !== undefined) {
      if (isSystem) throw new Error(t('manage.catSystemArchive'));
      db.prepare('UPDATE categories SET archived = ? WHERE id = ?').run(archived ? 1 : 0, id);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

// DELETE: excluir categoria. Se tiver transações, exige destino — `moveTo` é
// CHAVE de outra categoria, não nome.
export async function DELETE(request) {
  const { id, moveTo } = await request.json();
  const db = getDb();
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  if (!cat) return NextResponse.json({ error: t('manage.catNotFound') }, { status: 404 });
  if (SYSTEM_CATEGORIES.includes(cat.key)) {
    return NextResponse.json({ error: t('manage.catSystemDelete') }, { status: 400 });
  }
  const txCount = db.prepare(
    'SELECT COUNT(*) AS n FROM transactions WHERE category = ?').get(cat.key).n;

  db.exec('BEGIN');
  try {
    if (txCount > 0) {
      const dest = db.prepare(
        'SELECT key FROM categories WHERE key = ? AND id != ?').get(moveTo || '', id);
      if (!dest) throw new Error(`${txCount} transações usam esta categoria — informe para onde movê-las`);
      db.prepare('UPDATE transactions SET category = ? WHERE category = ?').run(dest.key, cat.key);
      db.prepare('UPDATE rules SET category = ? WHERE category = ?').run(dest.key, cat.key);
    } else {
      db.prepare('DELETE FROM rules WHERE category = ?').run(cat.key);
    }
    db.prepare('DELETE FROM goals WHERE category = ?').run(cat.key);
    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, moved: txCount });
}
