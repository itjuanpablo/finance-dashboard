// PWA: permite "Adicionar à Tela de Início" no celular com ícone e atalhos.
import { t } from '@/lib/i18n';

export default function manifest() {
  return {
    name: t('app.title'),
    short_name: t('app.name'),
    description: t('app.description'),
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
      { name: t('app.shortcut.expense'), url: '/?add=despesa', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
      { name: t('app.shortcut.income'), url: '/?add=receita', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
