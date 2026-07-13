import './globals.css';

export const metadata = {
  title: 'Fluxo — Finanças Pessoais',
  description: 'Controle de gastos local, automatizado e minimalista',
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
        {children}
      </body>
    </html>
  );
}
