'use client';

// Registra o service worker e mostra a tarja de "sem conexão".
//
// A tarja é a parte que importa. Um app de finanças mostrando número velho sem
// avisar é pior do que um app que não abre: a pessoa toma decisão com saldo de
// três dias atrás achando que é de agora. Offline aqui é modo de LEITURA, e a
// tela tem de dizer isso o tempo todo que durar.

import { useEffect, useState } from 'react';
import { t } from '@/lib/i18n';

export default function OfflineAviso() {
  const [offline, setOffline] = useState(false);
  const [desde, setDesde] = useState(null);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      // `catch` silencioso: sem service worker o app funciona igual, só perde o
      // offline. Não é motivo para poluir o console de quem usa em http.
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    // `navigator.onLine` só sabe se existe rede, não se o SERVIDOR responde —
    // e o caso comum aqui é justamente esse: wi-fi ligado, Mac desligado. Por
    // isso a verdade vem do cabeçalho que o service worker carimba quando
    // serviu do cache.
    const checar = async () => {
      try {
        const res = await fetch('/api/settings', { cache: 'no-store' });
        const doCache = res.headers.get('X-Fluxo-Offline') === '1';
        setOffline(doCache || !res.ok);
        setDesde(doCache ? res.headers.get('X-Fluxo-Cached-At') : null);
      } catch {
        setOffline(true);
      }
    };
    checar();
    const id = setInterval(checar, 30000);
    window.addEventListener('online', checar);
    window.addEventListener('offline', () => setOffline(true));
    return () => {
      clearInterval(id);
      window.removeEventListener('online', checar);
    };
  }, []);

  if (!offline) return null;

  const quando = desde
    ? new Date(desde).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
    : null;

  return (
    <div className="offline-bar" role="status" aria-live="polite">
      <span aria-hidden="true">📴</span>
      <span>
        {quando ? t('offline.withData', { when: quando }) : t('offline.noData')}
      </span>
      <button className="offline-retry" onClick={() => window.location.reload()}>
        {t('offline.retry')}
      </button>
    </div>
  );
}
