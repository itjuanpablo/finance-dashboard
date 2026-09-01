'use client';

import { t } from '@/lib/i18n';
import { fmtDayMonth, fmtMoney } from '@/lib/format';

// Um fechamento não cria dinheiro nem marca fatos automaticamente: apenas põe
// as pendências do mês numa ordem que permite concluir cada uma conscientemente.
export default function FechamentoMensal({
  reviewCount, upcomingBills, emojis, onClose, onReview, onPayBill,
}) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal monthly-review">
        <div className="modal-head">
          <div>
            <h3>{t('dash.monthlyReview')}</h3>
            <p>{t('dash.monthlyReviewHelp')}</p>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {reviewCount > 0 && (
            <section className="monthly-step">
              <div className="monthly-step-icon amber">⚠</div>
              <div className="grow">
                <h4>{t('dash.monthlyCategorize')}</h4>
                <p>{t('dash.toReviewBtn', { n: reviewCount })}</p>
              </div>
              <button className="hbtn" onClick={() => { onClose(); onReview(); }}>
                {t('dash.monthlyOpen')}
              </button>
            </section>
          )}

          {upcomingBills.length > 0 && (
            <section className="monthly-group">
              <h4>{t('dash.upcoming')}</h4>
              {upcomingBills.map(o => (
                <div className="monthly-step compact" key={`${o.bill_id}:${o.ref}`}>
                  <div className={`monthly-step-icon ${o.status === 'atrasada' ? 'red' : 'accent'}`}>
                    {o.status === 'atrasada' ? '!' : '◷'}
                  </div>
                  <div className="grow">
                    <strong>{emojis[o.category] ? `${emojis[o.category]} ` : ''}{o.description}</strong>
                    <p>{t('bills.dueShort', { d: fmtDayMonth(o.due_date) })} · {fmtMoney(o.amount_cents)}</p>
                  </div>
                  <button className="hbtn" onClick={() => onPayBill(o)}>✓ {t('bills.markPaid')}</button>
                </div>
              ))}
            </section>
          )}

          {!reviewCount && !upcomingBills.length && (
            <div className="empty">{t('dash.monthlyClear')}</div>
          )}
        </div>
      </div>
    </div>
  );
}
