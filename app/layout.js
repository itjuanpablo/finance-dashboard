import './globals.css';
import { Inter } from 'next/font/google';
import PinGate from '@/components/PinGate';
import BottomNav from '@/components/BottomNav';

// Fonte oficial do app, embutida no build (sem requisições externas em runtime).
const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const metadata = {
  title: 'Fluxo — Finanças Pessoais',
  description: 'Controle de gastos local, automatizado e minimalista',
  appleWebApp: { capable: true, title: 'Fluxo', statusBarStyle: 'black-translucent' },
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
    <html lang="pt-BR" suppressHydrationWarning>
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
