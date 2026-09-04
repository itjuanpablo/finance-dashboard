'use client';

import { t } from '@/lib/i18n';
import { fmtMoney } from '@/lib/format';

// Não é uma "nota" financeira arbitrária: cada item mostra o fato que o
// sustenta, para a pessoa poder agir sem confiar em uma caixa-preta.
export default function SaudeFinanceira({ summary, dailyAllowance, future, upcomingBills, reviewCount }) {
  const overdue = upcomingBills.filter(b => b.status === 'atrasada').length;
  const nextInstallment = future.months[0];
  const items = [
    {
      icon: summary.bal >= 0 ? '✓' : '!',
      tone: summary.bal >= 0 ? 'good' : 'bad',
      label: t('health.monthBalance'),
      value: fmtMoney(summary.bal),
      help: summary.bal >= 0 ? t('health.balancePositive') : t('health.balanceNegative'),
    },
    dailyAllowance && {
      icon: dailyAllowance.remaining >= 0 ? '◷' : '!',
      tone: dailyAllowance.remaining >= 0 ? 'good' : 'bad',
      label: t('health.dailyBudget'),
      value: fmtMoney(dailyAllowance.perDay),
      help: t('health.dailyBudgetHelp', { n: dailyAllowance.daysLeft }),
    },
    nextInstallment && {
      icon: '▣', tone: 'neutral', label: t('health.commitments'),
      value: fmtMoney(nextInstallment[1].cents),
      help: t('health.commitmentsHelp', { month: nextInstallment[0], n: nextInstallment[1].n }),
    },
    {
      icon: overdue ? '!' : '✓', tone: overdue ? 'bad' : 'good', label: t('health.pending'),
      value: overdue ? t('health.overdue', { n: overdue }) : t('health.noOverdue'),
      help: reviewCount ? t('health.toReview', { n: reviewCount }) : t('health.reviewClear'),
    },
  ].filter(Boolean);

  return <section className="health-panel" aria-label={t('health.title')}>
    <div className="panel-head"><div><h2>{t('health.title')}</h2><p>{t('health.help')}</p></div></div>
    <div className="health-grid">{items.map(item => <div className={`health-item ${item.tone}`} key={item.label}>
      <span className="health-icon">{item.icon}</span><div><small>{item.label}</small><strong>{item.value}</strong><p>{item.help}</p></div>
    </div>)}</div>
  </section>;
}
