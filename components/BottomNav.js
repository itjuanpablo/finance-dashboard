'use client';

import { usePathname } from 'next/navigation';
import { t } from '@/lib/i18n';

// Navegação inferior fixa — só aparece no celular (CSS).
const ITEMS = [
  ['/', '🏠', 'nav.home'],
  ['/cartoes', '💳', 'nav.cards'],
  ['/evoluir', '🌱', 'nav.evolve'],
  ['/gerenciar', '⚙️', 'nav.manage'],
];

export default function BottomNav() {
  const path = usePathname();
  return (
    <nav className="bottom-nav no-print">
      {ITEMS.map(([href, ico, key]) => (
        <a key={href} href={href} className={path === href ? 'active' : ''}>
          <span className="bn-ico">{ico}</span>
          {t(key)}
        </a>
      ))}
    </nav>
  );
}
