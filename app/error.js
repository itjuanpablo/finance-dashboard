'use client';

// Fronteira de erro de PÁGINA (App Router). Sem este arquivo, um erro de
// JavaScript no render deixa a tela EM BRANCO — o React desmonta a árvore e não
// coloca nada no lugar. Num app onde a pessoa confia em número, tela branca é
// pior do que erro feio: ela não sabe se o programa morreu, se o dado sumiu ou
// se o saldo que viu antes valia.
//
// Três coisas, nesta ordem, porque é a ordem em que a pessoa pergunta:
//   1. o que aconteceu;
//   2. se os dados estão salvos — é a PRIMEIRA pergunta num app de finanças, e a
//      resposta é sim: o erro é de desenho de tela, e o SQLite em data/fluxo.db
//      só muda quando uma rota de API grava;
//   3. o que fazer agora (tentar de novo, voltar ao início).
//
// A mensagem técnica fica RECOLHIDA: quem só quer usar o app não precisa vê-la,
// e quem vai relatar o problema precisa dela inteira, copiável.

import { useEffect, useState } from 'react';
import { t } from '@/lib/i18n';

export default function Error({ error, reset }) {
  const [copied, setCopied] = useState(false);

  // O console do navegador guarda o stack completo; o texto da tela é resumo.
  useEffect(() => {
    console.error('[fluxo] erro de render:', error);
  }, [error]);

  const details = [
    error?.message || String(error),
    error?.digest ? t('error.digest', { digest: error.digest }) : null,
  ].filter(Boolean).join('\n');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(details);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // clipboard bloqueado (http sem localhost, permissão negada): o texto está
      // na tela e pode ser selecionado à mão — nada a fazer além de não quebrar.
    }
  };

  return (
    <div className="container">
      <div className="errpage">
        <div className="state">
          <div className="state-ico" aria-hidden="true">⚠️</div>
          <h3>{t('error.title')}</h3>
          <p className="state-safe">
            <b>{t('error.dataSafe')}</b> {t('error.dataSafeText')}
          </p>
          <p>{t('error.whatToDo')}</p>
          <div className="state-actions">
            <button className="state-btn primary" onClick={() => reset()}>
              ↻ {t('error.retry')}
            </button>
            <a className="state-btn" href="/">🏠 {t('error.home')}</a>
          </div>

          <details className="err-details">
            <summary>{t('error.details')}</summary>
            <pre>{details}</pre>
            <button className="state-btn" onClick={copy}
              aria-label={t('error.copy')}>
              {copied ? `✓ ${t('error.copied')}` : `⧉ ${t('error.copy')}`}
            </button>
          </details>
        </div>
      </div>
    </div>
  );
}
