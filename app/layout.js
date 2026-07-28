import './globals.css';
import { Inter } from 'next/font/google';
import PinGate from '@/components/PinGate';
import BottomNav from '@/components/BottomNav';
import { t } from '@/lib/i18n';
import { REGION } from '@/lib/config';

// Fonte oficial do app, embutida no build (sem requisições externas em runtime).
const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const metadata = {
  title: t('app.title'),
  description: t('app.description'),
  appleWebApp: { capable: true, title: t('app.name'), statusBarStyle: 'black-translucent' },
};

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
  return (
    // lang vem do locale da instância: muda o hífen, a leitura de tela e o Intl.
    <html lang={REGION.htmlLang} suppressHydrationWarning>
      <body className={inter.className}>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <PinGate>
          {children}
          <BottomNav />
        </PinGate>
      </body>
    </html>
  );
}
