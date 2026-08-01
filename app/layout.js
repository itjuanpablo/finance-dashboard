import './globals.css';
import { Inter } from 'next/font/google';
import PinGate from '@/components/PinGate';
import BottomNav from '@/components/BottomNav';
import OfflineAviso from '@/components/OfflineAviso';
import Rodape from '@/components/Rodape';
import { t } from '@/lib/i18n';
import { LOCALES } from '@/lib/config';
import { getDb, localeSettings } from '@/lib/db';

// Fonte oficial do app, embutida no build (sem requisições externas em runtime).
const inter = Inter({ subsets: ['latin'], display: 'swap' });

// O idioma vem do banco e pode mudar a qualquer momento pelo seletor, então
// nada aqui pode ser pré-renderizado com o idioma congelado no build.
export const dynamic = 'force-dynamic';

/**
 * Lê a preferência e a publica para o código de servidor desta requisição.
 * `getDb()` já chama publishLocale ao abrir o banco; repetir aqui garante que o
 * layout — a raiz da árvore — resolva o idioma antes de qualquer página.
 */
function currentSettings() {
  return localeSettings(getDb());
}

// generateMetadata, e não `export const metadata`: constante é avaliada uma vez
// na carga do módulo e ficaria presa no idioma daquele instante.
export async function generateMetadata() {
  currentSettings();
  return {
    title: t('app.title'),
    description: t('app.description'),
    appleWebApp: { capable: true, title: t('app.name'), statusBarStyle: 'black-translucent' },
  };
}

export const viewport = {
  themeColor: '#4f46e5',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover', // respeita o entalhe do iPhone no modo app
};

const themeInit = `
try {
  var t = localStorage.getItem('fluxo-theme');
  if (t === 'dark' || (!t && matchMedia('(prefers-color-scheme: dark)').matches))
    document.documentElement.classList.add('dark');
  if (localStorage.getItem('fluxo-privacy') === '1')
    document.documentElement.classList.add('privacy');
} catch (e) {}
`;

export default function RootLayout({ children }) {
  const { locale, currency } = currentSettings();

  // Este <script> é o que faz a troca de idioma funcionar sem mismatch de
  // hidratação: ele roda durante o parse do HTML, ANTES do React hidratar, e é
  // de onde lib/config.js lê no navegador. Servidor e cliente passam a decidir
  // o idioma pelo mesmo valor — se o cliente adivinhasse sozinho, o React
  // reidrataria com texto diferente do que veio no HTML.
  const localeInit =
    `window.__FLUXO_LOCALE__=${JSON.stringify(locale)};` +
    `window.__FLUXO_CURRENCY__=${JSON.stringify(currency)};`;

  return (
    // lang muda hifenização, leitor de tela e o Intl do navegador
    <html lang={LOCALES[locale]?.htmlLang || locale} suppressHydrationWarning>
      <body className={inter.className}>
        <script dangerouslySetInnerHTML={{ __html: localeInit + themeInit }} />
        <PinGate>
          <OfflineAviso />
          {children}
          <Rodape />
          <BottomNav />
        </PinGate>
      </body>
    </html>
  );
}
