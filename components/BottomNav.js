'use client';

import { usePathname } from 'next/navigation';

// Navegação inferior fixa — só aparece no celular (CSS).
const ITEMS = [
  ['/', '🏠', 'Início'],
  ['/cartoes', '💳', 'Faturas'],
  ['/evoluir', '🌱', 'Evoluir'],
  ['/gerenciar', '⚙️', 'Gerenciar'],
];

export default function BottomNav() {
  const path = usePathname();
  return (
    <nav className="bottom-nav no-print">
      {ITEMS.map(([href, ico, label]) => (
        <a key={href} href={href} className={path === href ? 'active' : ''}>
          <span className="bn-ico">{ico}</span>
          {label}
        </a>
      ))}
    </nav>
  );
}
