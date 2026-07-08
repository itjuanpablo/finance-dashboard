import { NextResponse } from 'next/server';
import { getDb, SYSTEM_CATEGORIES } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDb();
  const cats = db.prepare(
    'SELECT id, name, color, emoji, archived, sort_order FROM categories ORDER BY sort_order, id').all();
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
    system: SYSTEM_CATEGORIES.includes(c.name),
    txCount: stats[c.name]?.n || 0,
    monthlyAvg: stats[c.name]?.months ? Math.round(stats[c.name].spent / stats[c.name].months) : 0,
    rulesCount: stats[c.name]?.rules || 0,
  }));
  return NextResponse.json({ categories });
}

export async function POST(request) {
  const { name, color, emoji } = await request.json();
  const n = String(name || '').trim();
  if (n.length < 2 || !/^#[0-9a-fA-F]{6}$/.test(color || '')) {
    return NextResponse.json({ error: 'Nome (mín. 2 letras) e cor são obrigatórios' }, { status: 400 });
  }
  const db = getDb();
  try {
    const max = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM categories').get().m;
    db.prepare('INSERT INTO categories (name, color, emoji, sort_order) VALUES (?, ?, ?, ?)')
      .run(n, color, String(emoji || '').trim(), max + 1);
  } catch {
    return NextResponse.json({ error: 'Já existe uma categoria com esse nome' }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}

// PATCH: renomear (com cascata para transações, regras e metas), mudar cor/emoji, arquivar.
export async function PATCH(request) {
  const { id, name, color, emoji, archived } = await request.json();
  const db = getDb();
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  if (!cat) return NextResponse.json({ error: 'Categoria não encontrada' }, { status: 404 });
  const isSystem = SYSTEM_CATEGORIES.includes(cat.name);

  db.exec('BEGIN');
  try {
    if (name !== undefined && name.trim() !== cat.name) {
      if (isSystem) throw new Error('Categoria de sistema não pode ser renomeada');
      const n = name.trim();
      if (n.length < 2) throw new Error('Nome muito curto');
      db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(n, id);
      db.prepare('UPDATE transactions SET category = ? WHERE category = ?').run(n, cat.name);
      db.prepare('UPDATE rules SET category = ? WHERE category = ?').run(n, cat.name);
      db.prepare('UPDATE goals SET category = ? WHERE category = ?').run(n, cat.name);
    }
    if (color !== undefined) {
      if (!/^#[0-9a-fA-F]{6}$/.test(color)) throw new Error('Cor inválida');
      db.prepare('UPDATE categories SET color = ? WHERE id = ?').run(color, id);
    }
    if (emoji !== undefined) {
      db.prepare('UPDATE categories SET emoji = ? WHERE id = ?').run(String(emoji).trim(), id);
    }
    if (archived !== undefined) {
      if (isSystem) throw new Error('Categoria de sistema não pode ser arquivada');
      db.prepare('UPDATE categories SET archived = ? WHERE id = ?').run(archived ? 1 : 0, id);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

// DELETE: excluir categoria. Se tiver transações, exige destino (moveTo).
export async function DELETE(request) {
  const { id, moveTo } = await request.json();
  const db = getDb();
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  if (!cat) return NextResponse.json({ error: 'Categoria não encontrada' }, { status: 404 });
  if (SYSTEM_CATEGORIES.includes(cat.name)) {
    return NextResponse.json({ error: 'Categoria de sistema não pode ser excluída' }, { status: 400 });
  }
  const txCount = db.prepare(
    'SELECT COUNT(*) AS n FROM transactions WHERE category = ?').get(cat.name).n;

  db.exec('BEGIN');
  try {
    if (txCount > 0) {
      const dest = db.prepare(
        'SELECT name FROM categories WHERE name = ? AND id != ?').get(moveTo || '', id);
      if (!dest) throw new Error(`${txCount} transações usam esta categoria — informe para onde movê-las`);
      db.prepare('UPDATE transactions SET category = ? WHERE category = ?').run(dest.name, cat.name);
      db.prepare('UPDATE rules SET category = ? WHERE category = ?').run(dest.name, cat.name);
    } else {
      db.prepare('DELETE FROM rules WHERE category = ?').run(cat.name);
    }
    db.prepare('DELETE FROM goals WHERE category = ?').run(cat.name);
    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, moved: txCount });
}
