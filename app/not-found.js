'use client';

// 404. Sem este arquivo o Next mostra a página padrão dele, em inglês e fora do
// visual do app — o que, num app local que só tem cinco telas, dá a impressão
// de que alguma coisa quebrou de verdade.

import { t } from '@/lib/i18n';

export default function NotFound() {
  return (
    <div className="container">
      <div className="state">
        <div className="state-ico" aria-hidden="true">🧭</div>
        <h3>{t('error.notFoundTitle')}</h3>
        <p>{t('error.notFoundText')}</p>
        <div className="state-actions">
          <a className="state-btn primary" href="/">🏠 {t('error.home')}</a>
        </div>
      </div>
    </div>
  );
}
