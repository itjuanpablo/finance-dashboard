'use client';

import { t, tn } from '@/lib/i18n';
import { fmtMoney, fmtMoneyIn } from '@/lib/format';

// Resumo do mês separado do dashboard para que a página principal concentre
// dados e fluxos, não a apresentação dos quatro indicadores e suas ações.
export default function ResumoPainel({
  summary, outrasMoedas, future, reviewCount, upcomingBills,
  onReview, onMonthlyReview,
}) {
  return (
    <>
      <div className="cards">
        <div className="card">
          <div className="card-label"><span className="dot" style={{ background: 'var(--green)' }} />{t('dash.income')}</div>
          <div className="card-value pos">{fmtMoney(summary.totIn)}</div>
          <div className="card-sub">{tn(summary.nIn, 'import.tx')}</div>
        </div>
        <div className="card">
          <div className="card-label"><span className="dot" style={{ background: 'var(--red)' }} />{t('dash.expenses')}</div>
          <div className="card-value neg">{fmtMoney(summary.totOut)}</div>
          <div className="card-sub">{tn(summary.nOut, 'import.tx')}</div>
        </div>
        <div className="card balance-card">
          <div className="card-label"><span className="dot" style={{ background: 'var(--accent)' }} />{t('dash.balance')}</div>
          <div className={`card-value ${summary.bal >= 0 ? 'pos' : 'neg'}`}>{fmtMoney(summary.bal)}</div>
          <div className="card-sub">{t('dash.balanceSub')}</div>
          {outrasMoedas.map(m => (
            <div key={m.moeda} className="card-sub" style={{ marginTop: 6, color: 'var(--text)' }}>
              <b>{fmtMoneyIn(m.entrada - m.saida, m.moeda)}</b>{' '}
              <span style={{ color: 'var(--muted)' }}>{t('dash.otherCurrency', { n: m.n })}</span>
            </div>
          ))}
        </div>
        <div className="card projection-card">
          <div className="card-label"><span className="dot" style={{ background: 'var(--amber)' }} />{t('dash.projection')}</div>
          <div className="card-value">{summary.proj != null ? fmtMoney(summary.proj) : '—'}</div>
          <div className="card-sub">
            {summary.proj != null ? t('dash.projSub') : t('dash.projNA')}
            {future.months.length > 0 && summary.proj != null ? ` · ${t('dash.projInstallments')}` : ''}
          </div>
        </div>
      </div>

      {(reviewCount > 0 || upcomingBills.length > 0) && (
        <section className="action-tray" aria-label={t('dash.nextSteps')}>
          <div className="action-tray-title">
            <span>{t('dash.nextSteps')}</span>
            <small>{t('dash.nextStepsHelp')}</small>
          </div>
          <div className="action-tray-actions">
            <button className="attention-btn primary" onClick={onMonthlyReview}>
              <span aria-hidden="true">✓</span> {t('dash.monthlyReview')}
              <span className="attention-arrow" aria-hidden="true">→</span>
            </button>
            {reviewCount > 0 && (
              <button className="attention-btn" onClick={onReview}>
                <span aria-hidden="true">⚠</span> {t('dash.toReviewBtn', { n: reviewCount })}
                <span className="attention-arrow" aria-hidden="true">→</span>
              </button>
            )}
            {upcomingBills.length > 0 && (
              <a className="attention-btn neutral" href="/gerenciar?tab=apagar">
                <span aria-hidden="true">◷</span> {t('dash.upcoming')} · {upcomingBills.length}
                <span className="attention-arrow" aria-hidden="true">→</span>
              </a>
            )}
          </div>
        </section>
      )}
    </>
  );
}
