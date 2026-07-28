import { NextResponse } from 'next/server';
import { t } from '@/lib/i18n';
import { importFile } from '@/lib/importer';

export const runtime = 'nodejs';

export async function POST(request) {
  const form = await request.formData();
  const files = form.getAll('files');
  if (!files.length) {
    return NextResponse.json({ error: t('api.noFile') }, { status: 400 });
  }

  const results = [];
  for (const file of files) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      results.push(await importFile(file.name, buffer));
    } catch (e) {
      results.push({ fileName: file.name, error: e.message });
    }
  }
  return NextResponse.json({ results });
}
