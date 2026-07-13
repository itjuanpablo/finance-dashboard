// PWA: permite "Adicionar à Tela de Início" no celular com ícone e atalhos.
export default function manifest() {
  return {
    name: 'Fluxo — Finanças Pessoais',
    short_name: 'Fluxo',
    description: 'Controle de gastos local, automatizado e minimalista',
    start_url: '/',
    display: 'standalone',
    background_color: '#0e0f13',
    theme_color: '#4f46e5',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
    // pressionar e segurar o ícone do app → lançamento em 2 toques
    shortcuts: [
      { name: 'Lançar despesa', url: '/?add=despesa', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
      { name: 'Lançar receita', url: '/?add=receita', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
