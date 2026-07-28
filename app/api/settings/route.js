import { NextResponse } from 'next/server';
import { getDb, getSetting, setSetting, localeSettings } from '@/lib/db';
import { LOCALES, CURRENCIES, isSupportedLocale } from '@/lib/config';
import { t } from '@/lib/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Preferências da instalação. Hoje: idioma e moeda; a tabela é genérica para
// receber tema e nome do usuário, hoje presos no localStorage do navegador.

export async function GET() {
  const db = getDb();
  const { locale, currency } = localeSettings(db);
  return NextResponse.json({
    locale,
    currency,
    locales: Object.keys(LOCALES).map(code => ({
      code,
      // Nome do idioma NA PRÓPRIA LÍNGUA: quem abriu o app numa língua que não
      // entende precisa reconhecer a sua na lista para conseguir sair de lá.
      label: new Intl.DisplayNames([code], { type: 'language' }).of(code),
      defaultCurrency: LOCALES[code].currency,
    })),
    currencies: Object.entries(CURRENCIES).map(([code, c]) => ({ code, ...c })),
  });
}

export async function PUT(request) {
  const { locale, currency } = await request.json();
  const db = getDb();

  if (locale !== undefined) {
    if (!isSupportedLocale(locale)) {
      return NextResponse.json({ error: t('api.invalidParams') }, { status: 400 });
    }
    setSetting(db, 'locale', locale);
  }

  if (currency !== undefined) {
    // Código ISO de 3 letras. Não restrinjo à lista de CURRENCIES: Intl aceita
    // qualquer código válido, e limitar só criaria um teto artificial.
    if (!/^[A-Za-z]{3}$/.test(String(currency))) {
      return NextResponse.json({ error: t('api.invalidParams') }, { status: 400 });
    }
    setSetting(db, 'currency', String(currency).toUpperCase());
  }

  // A resposta já sai traduzida no idioma NOVO: setSetting republicou o locale.
  return NextResponse.json({ ok: true, ...localeSettings(db) });
}
