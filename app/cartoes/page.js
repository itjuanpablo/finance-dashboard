'use client';

import { useEffect, useMemo, useState } from 'react';
import { t, tn, makeCatLabeler } from '@/lib/i18n';
import SeletorIdioma from '@/components/SeletorIdioma';
import { CAT } from '@/lib/categories';
import { fmtMoney, fmtDate, fmtDayMonth, fmtMonthLong, fmtMonthShort } from '@/lib/format';

const STATUS = {
  aberta:  { key: 'cards.status.open',    color: 'var(--accent)' },
  fechada: { key: 'cards.status.closed',  color: 'var(--amber)' },
  parcial: { key: 'cards.status.partial', color: 'var(--amber)' },
  paga:    { key: 'cards.status.paid',    color: 'var(--green)' },
  futura:  { key: 'cards.status.future',  color: 'var(--muted)' },
};

export default function Cartoes() {
  const [cards, setCards] = useState(null);
  const [cardId, setCardId] = useState(null);
  const [data, setData] = useState(null);
  const [ref, setRef] = useState(null);
  const [toast, setToast] = useState(null);
  const [catList, setCatList] = useState([]);

  // by_category e txs vêm com CHAVE de categoria; o nome exibido vem daqui
  const labelOf = useMemo(() => makeCatLabeler(catList), [catList]);

  useEffect(() => {
    fetch('/api/categories').then(r => r.json()).then(d => setCatList(d.categories || []));
    fetch('/api/cards').then(r => r.json()).then(d => {
      const active = d.cards.filter(c => !c.archived);
      setCards(active);
      const p = new URLSearchParams(window.location.search).get('card');
      setCardId(p && active.some(c => c.id === +p) ? +p : active[0]?.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (!cardId) return;
    setData(null);
    fetch(`/api/invoices?card_id=${cardId}`).then(r => r.json()).then(d => {
      setData(d);
      // seleciona a fatura corrente; senão a mais recente não-futura
      const open = d.invoices?.find(i => i.status === 'aberta')
        || d.invoices?.find(i => i.status !== 'futura') || d.invoices?.[0];
      setRef(open?.ref ?? null);
    });
  }, [cardId]);

  const invoice = useMemo(
    () => data?.invoices?.find(i => i.ref === ref) ?? null, [data, ref]);
  const idx = data?.invoices?.findIndex(i => i.ref === ref) ?? -1;
  const older = idx >= 0 && idx < (data?.invoices?.length ?? 0) - 1;
  const newer = idx > 0;
  const maxTotal = Math.max(1, ...(data?.invoices ?? []).map(i => i.total_cents));

  async function changeCategory(tx, category) {
    await fetch('/api/transactions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: tx.id, category }),
    });
    // atualiza localmente sem refetch completo
    setData(d => ({
      ...d,
      invoices: d.invoices.map(inv => inv.ref !== ref ? inv : {
        ...inv,
        txs: inv.txs.map(x => x.id === tx.id ? { ...x, category } : x),
        by_category: (() => {
          const b = { ...inv.by_category };
          b[tx.category] = (b[tx.category] || 0) + tx.amount_cents;
          if (b[tx.category] <= 0) delete b[tx.category];
          b[category] = (b[category] || 0) - tx.amount_cents;
          return b;
        })(),
      }),
    }));
    setToast(t('manage.catChanged', { cat: labelOf(category) }));
    setTimeout(() => setToast(null), 2500);
  }

  if (!cards) return <div className="container"><div className="loading">{t('common.loading')}</div></div>;

  if (!cards.length) {
    return (
      <div className="container">
        <Header />
        <div className="panel"><div className="empty">
          {t('cards.noCards')} <a href="/gerenciar?tab=contas" style={{ color: 'var(--accent)' }}>{t('cards.linkAccounts')}</a>{t('cards.noCardsTail')} <b>mp-fatura</b>.
        </div></div>
      </div>
    );
  }

  const cats = data?.categories ?? {};
  const st = invoice ? STATUS[invoice.status] : null;
  const catEntries = invoice
    ? Object.entries(invoice.by_category).sort((a, b) => b[1] - a[1]) : [];
  const catMax = Math.max(1, ...catEntries.map(([, v]) => v));

  return (
    <div className="container">
      <Header />

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {cards.map(c => (
          <button key={c.id} className="hbtn"
            style={cardId === c.id ? { borderColor: 'var(--accent)', color: 'var(--accent)', fontWeight: 600 } : undefined}
            onClick={() => { setCardId(c.id);
              const u = new URL(window.location); u.searchParams.set('card', c.id);
              window.history.replaceState(null, '', u);
            }}>
            💳 {c.name}{c.last4 ? ` ····${c.last4}` : ''}
          </button>
        ))}
      </div>

      {!data ? <div className="loading">{t('common.loading')}</div> : data.noSources ? (
        <div className="panel"><div className="empty">
          {t('cards.noSource')}<br />
          {t('cards.noSourceGo')} <a href="/gerenciar?tab=contas" style={{ color: 'var(--accent)' }}>{t('cards.linkAccountsEdit')}</a>{t('cards.noSourceMark')} <b>mp-fatura</b>.
        </div></div>
      ) : !data.invoices.length ? (
        <div className="panel"><div className="empty">{t('cards.noInvoices')}</div></div>
      ) : (
        <>
          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="inv-nav">
              <button className="hbtn" disabled={!older} style={{ opacity: older ? 1 : .4 }}
                onClick={() => older && setRef(data.invoices[idx + 1].ref)}>‹</button>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-.02em' }}>
                  {t('cards.invoice')} <span style={{ color: 'var(--accent)' }}>{fmtMonthLong(invoice.ref)}</span>
                </div>
                <span className="status-badge" style={{ color: st.color, borderColor: st.color }}>{t(st.key)}</span>
              </div>
              <button className="hbtn" disabled={!newer} style={{ opacity: newer ? 1 : .4 }}
                onClick={() => newer && setRef(data.invoices[idx - 1].ref)}>›</button>
            </div>

            <div className="inv-summary">
              <div className="sumbox">
                <div className="sumbox-label">{t('cards.invoiceAmount')}</div>
                <div className="sumbox-value" style={{ color: invoice.status === 'paga' ? 'var(--green)' : 'var(--text)' }}>
                  {fmtMoney(invoice.total_cents)}
                </div>
                <div className="sumbox-sub">{tn(invoice.tx_count, 'import.tx')}
                  {invoice.paid_cents > 0 ? ` · ${t('cards.paidAmount', { v: fmtMoney(invoice.paid_cents) })}` : ''}</div>
              </div>
              <div className="sumbox">
                <div className="sumbox-label">{t('cards.closing')}</div>
                <div className="sumbox-value">{fmtDate(invoice.closing_date)}</div>
                <div className="sumbox-sub">{t('cards.closingSub')}</div>
              </div>
              <div className="sumbox">
                <div className="sumbox-label">{t('cards.due')}</div>
                <div className="sumbox-value">{fmtDate(invoice.due_date)}</div>
                <div className="sumbox-sub">{invoice.status === 'paga' ? t('cards.settled') : t('cards.dueSub')}</div>
              </div>
            </div>
          </div>

          <div className="grid">
            <div className="left-col">
              <div className="panel">
                <div className="panel-head"><h2>{t('cards.byCategory')}</h2></div>
                <div className="panel-body">
                  {catEntries.map(([cat, val]) => (
                    <div key={cat} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
                        <span><span className="dot" style={{ background: cats[cat], marginRight: 7 }} />{labelOf(cat)}</span>
                        <span style={{ fontWeight: 600 }}>{fmtMoney(val)}</span>
                      </div>
                      <div className="goal-bar"><div style={{ width: `${val / catMax * 100}%`, background: cats[cat] || '#999' }} /></div>
                    </div>
                  ))}
                  {!catEntries.length && <div className="empty">{t('cards.noSpending')}</div>}
                </div>
              </div>

              <div className="panel">
                <div className="panel-head"><h2>{t('cards.history')}</h2></div>
                <div className="panel-body">
                  {data.invoices.filter(i => i.status !== 'futura').slice(0, 12).map(i => (
                    <button key={i.ref} className="legend-item" style={{ opacity: i.ref === ref ? 1 : .75 }}
                      onClick={() => setRef(i.ref)}>
                      <span style={{ width: 64, color: 'var(--muted)', fontSize: 12 }}>
                        {fmtMonthShort(i.ref)}
                      </span>
                      <span className="goal-bar" style={{ flex: 1, margin: 0 }}>
                        <span style={{ display: 'block', height: '100%', borderRadius: 99, width: `${i.total_cents / maxTotal * 100}%`,
                          background: i.ref === ref ? 'var(--accent)' : 'var(--border)' }} />
                      </span>
                      <span className="val" style={{ width: 84, textAlign: 'right' }}>{fmtMoney(i.total_cents)}</span>
                      <span style={{ width: 14, textAlign: 'right', color: STATUS[i.status].color, fontSize: 12 }}>
                        {i.status === 'paga' ? '✓' : i.status === 'aberta' ? '●' : '○'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-head" style={{ paddingBottom: 14 }}>
                <h2>{t('cards.invoiceTxs')} <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 13 }}>· {invoice.tx_count}</span></h2>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead><tr><th>{t('common.date')}</th><th>{t('common.description')}</th><th>{t('common.category')}</th><th style={{ textAlign: 'right' }}>{t('common.value')}</th></tr></thead>
                  <tbody>
                    {invoice.txs.map(tx => {
                      const color = cats[tx.category] || '#999';
                      return (
                        <tr key={tx.id}>
                          <td style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtDayMonth(tx.date)}</td>
                          <td className="desc">{tx.description}</td>
                          <td>
                            <select className="badge-select" value={tx.category}
                              style={{ background: `${color}22`, color,
                                outline: tx.category === CAT.TO_REVIEW ? `1.5px dashed ${color}88` : 'none' }}
                              onChange={e => changeCategory(tx, e.target.value)}>
                              {Object.keys(cats).map(c => <option key={c} value={c}>{labelOf(c)}</option>)}
                            </select>
                          </td>
                          <td className="amount out">−{fmtMoney(-tx.amount_cents).replace('-', '')}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!invoice.txs.length && <div className="empty">{t('cards.noTxs')}</div>}
              </div>
            </div>
          </div>
        </>
      )}

      {toast && (
        <div className="toasts"><div className="toast"><span className="ico">✓</span><span>{toast}</span></div></div>
      )}
    </div>
  );
}

function Header() {
  return (
    <header>
      <div className="logo" style={{ gap: 14 }}>
        <a href="/" className="hbtn desk-only" title={t('nav.dashboard')} aria-label={t('nav.dashboard')} style={{ textDecoration: 'none' }}>←<span className="hbtn-label">{t('nav.dashboard')}</span></a>
        <span><img src="/icon.svg" alt="" width={26} height={26} style={{ borderRadius: 8, verticalAlign: 'middle', marginRight: 8 }} />{t('cards.title')}</span>
      </div>
      <SeletorIdioma />
      <button className="theme-toggle" title={t('common.privacyTitle')} onClick={() => {
        const on = document.documentElement.classList.toggle('privacy');
        try { localStorage.setItem('fluxo-privacy', on ? '1' : '0'); } catch (e) {}
      }} style={{ marginRight: 8 }}>👁</button>
      <button className="theme-toggle" title={t('common.themeTitle')} onClick={() => {
        document.documentElement.classList.toggle('dark');
        try {
          localStorage.setItem('fluxo-theme',
            document.documentElement.classList.contains('dark') ? 'dark' : 'light');
        } catch (e) {}
      }}>◐</button>
    </header>
  );
}
