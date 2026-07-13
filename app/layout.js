import './globals.css';
import PinGate from '@/components/PinGate';

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
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <PinGate>{children}</PinGate>
      </body>
    </html>
  );
}
