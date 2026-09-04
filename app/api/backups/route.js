import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { backupDb, dataDir, getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const backupsDir = () => path.join(dataDir(), 'backups');
const safeName = name => typeof name === 'string' && /^fluxo-[A-Za-z0-9-]+\.db$/.test(name);

export async function GET() {
  try {
    const dir = backupsDir();
    if (!fs.existsSync(dir)) return NextResponse.json({ backups: [] });
    const backups = fs.readdirSync(dir).filter(safeName).map(name => {
      const stat = fs.statSync(path.join(dir, name));
      return { name, bytes: stat.size, modifiedAt: stat.mtime.toISOString() };
    }).sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
    return NextResponse.json({ backups });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Restauração é propositalmente uma operação separada e protegida: antes de
// substituir o banco ativo, cria uma cópia independente que o usuário poderá
// restaurar novamente caso tenha escolhido o arquivo errado.
export async function POST(request) {
  try {
    const { name } = await request.json();
    if (!safeName(name)) return NextResponse.json({ error: 'Backup inválido.' }, { status: 400 });
    const source = path.join(backupsDir(), name);
    if (!fs.existsSync(source)) return NextResponse.json({ error: 'Backup não encontrado.' }, { status: 404 });
    const db = getDb();
    const safety = backupDb(db, 'pre-restore');
    if (!safety.path) return NextResponse.json({ error: `Não foi possível criar cópia de segurança: ${safety.error}` }, { status: 500 });
    db.close();
    delete globalThis.__fluxoDb;
    const target = path.join(dataDir(), 'fluxo.db');
    fs.copyFileSync(source, target);
    for (const suffix of ['-wal', '-shm']) {
      const sidecar = `${target}${suffix}`;
      if (fs.existsSync(sidecar)) fs.unlinkSync(sidecar);
    }
    return NextResponse.json({ ok: true, safetyBackup: path.basename(safety.path) });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Não foi possível restaurar o backup.' }, { status: 500 });
  }
}
