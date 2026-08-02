'use client';

import { useEffect, useMemo, useState } from 'react';
import { t, makeCatLabeler } from '@/lib/i18n';
import { localIsoMonth } from '@/lib/insights';
import { fmtMoney, fmtDayMonth, fmtMonthLong, fmtToday } from '@/lib/format';
import AcoesCabecalho from '@/components/AcoesCabecalho';

const addMonths = (ym, k) => {
  const y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + k;
  return `${y + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}`;
};

function monthStats(txs, ym) {
  const mts = txs.filter(tx => tx.date.startsWith(ym) && !tx.transfer);
  const cats = {};
  mts.filter(tx => tx.amount_cents < 0)
    .forEach(tx => { cats[tx.category] = (cats[tx.category] || 0) - tx.amount_cents; });
  return {
    in: mts.filter(tx => tx.amount_cents > 0).reduce((s, tx) => s + tx.amount_cents, 0),
    out: mts.filter(tx => tx.amount_cents < 0).reduce((s, tx) => s - tx.amount_cents, 0),
    n: mts.length,
    cats,
    top: mts.filter(tx => tx.amount_cents < 0)
      .sort((a, b) => a.amount_cents - b.amount_cents).slice(0, 10),
  };
}

export default function Relatorio() {
  const [mes, setMes] = useState(null);
  const [txs, setTxs] = useState(null);
  const [colors, setColors] = useState({});
  const [emojis, setEmojis] = useState({});
  const [goals, setGoals] = useState([]);
  const [catList, setCatList] = useState([]);

  // categoria é chave em toda a resposta da API; aqui vira nome exibido
  const labelOf = useMemo(() => makeCatLabeler(catList), [catList]);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('mes');
    // localIsoMonth, não toISOString: em UTC−3, abrir o relatório em 31/12 às
    // 21h caía em janeiro — mês sem lançamento nenhum, relatório em branco.
    setMes(/^\d{4}-\d{2}$/.test(p || '') ? p : localIsoMonth());
    Promise.all([fetch('/api/transactions'), fetch('/api/goals'), fetch('/api/categories')])
      .then(async ([tRes, g, c]) => {
        const td = await tRes.json();
        setTxs(td.transactions); setColors(td.categories); setEmojis(td.categoryEmojis || {});
        setGoals((await g.json()).goals);
        setCatList((await c.json()).categories || []);
      });
  }, []);

  const data = useMemo(() => {
    if (!txs || !mes) return null;
    const cur = monthStats(txs, mes);
    const prevYm = addMonths(mes, -1);
    const prev = monthStats(txs, prevYm);
    const catRows = Object.entries(cur.cats).sort((a, b) => b[1] - a[1]).map(([cat, v]) => ({
      cat, v,
      pct: cur.out ? v / cur.out * 100 : 0,
      delta: prev.cats[cat] != null ? (v - prev.cats[cat]) : null,
    }));
    const budget = goals.map(g => {
      const carry = g.rollover && prev.n ? g.limit_cents - (prev.cats[g.category] || 0) : 0;
      const eff = Math.max(g.limit_cents + carry, 0);
      const spent = cur.cats[g.category] || 0;
      return { ...g, eff, carry, spent, saldo: eff - spent };
    });
    return { cur, prev, prevYm, catRows, budget };
  }, [txs, mes, goals]);

  if (!data) return <div className="container"><div className="loading">{t('common.loading')}</div></div>;
  const { cur, prev, prevYm, catRows, budget } = data;
  const deltaOut = prev.out ? ((cur.out - prev.out) / prev.out * 100) : null;

  return (
    <div className="container" style={{ maxWidth: 860 }}>
      <header className="no-print">
        <div className="logo" style={{ gap: 14 }}>
          <a href="/" className="hbtn desk-only" title={t('nav.dashboard')} aria-label={t('nav.dashboard')} style={{ textDecoration: 'none' }}>←<span className="hbtn-label">{t('nav.dashboard')}</span></a>
          <span><img src="/icon.svg" alt="" width={26} height={26} style={{ borderRadius: 8, verticalAlign: 'middle', marginRight: 8 }} />{t('report.title')}</span>
        </div>
        <AcoesCabecalho>
          <button className="hbtn" onClick={() => window.print()}>🖨 {t('report.print')}</button>
        </AcoesCabecalho>
      </header>

      <div style={{ margin: '8px 0 20px' }}>
        <h1 style={{ fontSize: 24, letterSpacing: '-.02em' }}>
          {t('report.heading', { month: fmtMonthLong(mes) })}
        </h1>
        <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>
          {t('report.generated', { date: fmtToday(), n: cur.n })}
        </div>
      </div>

      <div className="cards" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-label">{t('dash.income')}</div>
          <div className="card-value pos">{fmtMoney(cur.in)}</div>
        </div>
        <div className="card">
          <div className="card-label">{t('dash.expenses')}</div>
          <div className="card-value neg">{fmtMoney(cur.out)}</div>
          {deltaOut != null && (
            <div className="card-sub">{deltaOut >= 0 ? '+' : ''}{deltaOut.toFixed(0)}% {t('report.vsMonth', { month: fmtMonthLong(prevYm) })}</div>
          )}
        </div>
        <div className="card">
          <div className="card-label">{t('report.monthBalance')}</div>
          <div className={`card-value ${cur.in - cur.out >= 0 ? 'pos' : 'neg'}`}>{fmtMoney(cur.in - cur.out)}</div>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head"><h2>{t('dash.byCategory')}</h2></div>
        <div className="panel-body">
          <table style={{ fontSize: 13 }}>
            <thead><tr><th>{t('common.category')}</th><th style={{ textAlign: 'right' }}>{t('common.value')}</th><th style={{ textAlign: 'right' }}>{t('report.pctOut')}</th><th style={{ textAlign: 'right' }}>{t('report.vsPrevMonth')}</th></tr></thead>
            <tbody>
              {catRows.map(r => (
                <tr key={r.cat}>
                  <td><span className="dot" style={{ background: colors[r.cat], marginRight: 8 }} />{emojis[r.cat] ? `${emojis[r.cat]} ` : ''}{labelOf(r.cat)}</td>
                  <td className="amount">{fmtMoney(r.v)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{r.pct.toFixed(1)}%</td>
                  <td style={{ textAlign: 'right', color: r.delta == null ? 'var(--muted)' : r.delta > 0 ? 'var(--red)' : 'var(--green)' }}>
                    {r.delta == null ? '—' : `${r.delta > 0 ? '+' : ''}${fmtMoney(r.delta)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {budget.length > 0 && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-head"><h2>{t('report.budgetVsReal')}</h2></div>
          <div className="panel-body">
            <table style={{ fontSize: 13 }}>
              <thead><tr><th>{t('common.category')}</th><th style={{ textAlign: 'right' }}>{t('report.budgeted')}</th><th style={{ textAlign: 'right' }}>{t('report.spent')}</th><th style={{ textAlign: 'right' }}>{t('report.result')}</th></tr></thead>
              <tbody>
                {budget.map(b => (
                  <tr key={b.category}>
                    <td>{emojis[b.category] ? `${emojis[b.category]} ` : ''}{labelOf(b.category)}
                      {b.carry !== 0 && <span style={{ color: 'var(--muted)', fontSize: 11 }}> ({t('report.rollover', { goal: fmtMoney(b.limit_cents), sign: b.carry > 0 ? '+' : '−', carry: fmtMoney(Math.abs(b.carry)) })})</span>}
                    </td>
                    <td className="amount">{fmtMoney(b.eff)}</td>
                    <td className="amount">{fmtMoney(b.spent)}</td>
                    <td className="amount" style={{ color: b.saldo >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {b.saldo >= 0 ? t('report.left', { v: fmtMoney(b.saldo) }) : t('report.over', { v: fmtMoney(-b.saldo) })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head"><h2>{t('report.top10')}</h2></div>
        <div className="panel-body">
          <table style={{ fontSize: 13 }}>
            <tbody>
              {cur.top.map(tx => (
                <tr key={tx.id}>
                  <td style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtDayMonth(tx.date)}</td>
                  <td>{tx.description}</td>
                  <td style={{ color: 'var(--muted)' }}>{labelOf(tx.category)}</td>
                  <td className="amount">{fmtMoney(-tx.amount_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="no-print" style={{ fontSize: 12, color: 'var(--muted)' }}>
        {t('report.tip')}
      </p>
    </div>
  );
}
