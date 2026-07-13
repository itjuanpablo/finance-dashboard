'use client';

import { useEffect, useMemo, useState } from 'react';

const fmtBRL = c => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const refLabel = ref => `${MONTH_NAMES[+ref.slice(5, 7) - 1]} ${ref.slice(0, 4)}`;

const STATUS = {
  aberta:  { label: 'FATURA ABERTA',   color: 'var(--accent)' },
  fechada: { label: 'FATURA FECHADA',  color: 'var(--amber)' },
  parcial: { label: 'PAGA PARCIALMENTE', color: 'var(--amber)' },
  paga:    { label: 'PAGA ✓',          color: 'var(--green)' },
  futura:  { label: 'PARCELAS FUTURAS', color: 'var(--muted)' },
};

export default function Cartoes() {
  const [cards, setCards] = useState(null);
  const [cardId, setCardId] = useState(null);
  const [data, setData] = useState(null);
  const [ref, setRef] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
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
        txs: inv.txs.map(t => t.id === tx.id ? { ...t, category } : t),
        by_category: (() => {
          const b = { ...inv.by_category };
          b[tx.category] = (b[tx.category] || 0) + tx.amount_cents;
          if (b[tx.category] <= 0) delete b[tx.category];
          b[category] = (b[category] || 0) - tx.amount_cents;
          return b;
        })(),
      }),
    }));
    setToast(`Categoria: ${category}`);
    setTimeout(() => setToast(null), 2500);
  }

  if (!cards) return <div className="container"><div className="loading">Carregando…</div></div>;

  if (!cards.length) {
    return (
      <div className="container">
        <Header />
        <div className="panel"><div className="empty">
          Nenhum cartão cadastrado. Crie um em <a href="/gerenciar?tab=contas" style={{ color: 'var(--accent)' }}>Gerenciar → Contas e cartões</a> e vincule a origem <b>mp-fatura</b>.
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

      {!data ? <div className="loading">Carregando…</div> : data.noSources ? (
        <div className="panel"><div className="empty">
          Este cartão não tem origem vinculada — sem isso, não há como saber quais transações são dele.<br />
          Vá em <a href="/gerenciar?tab=contas" style={{ color: 'var(--accent)' }}>Gerenciar → Contas e cartões → Editar</a> e marque <b>mp-fatura</b>.
        </div></div>
      ) : !data.invoices.length ? (
        <div className="panel"><div className="empty">Nenhuma fatura encontrada — importe faturas do cartão no dashboard.</div></div>
      ) : (
        <>
          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="inv-nav">
              <button className="hbtn" disabled={!older} style={{ opacity: older ? 1 : .4 }}
                onClick={() => older && setRef(data.invoices[idx + 1].ref)}>‹</button>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-.02em' }}>
                  Fatura <span style={{ color: 'var(--accent)' }}>{refLabel(invoice.ref)}</span>
                </div>
                <span className="status-badge" style={{ color: st.color, borderColor: st.color }}>{st.label}</span>
              </div>
              <button className="hbtn" disabled={!newer} style={{ opacity: newer ? 1 : .4 }}
                onClick={() => newer && setRef(data.invoices[idx - 1].ref)}>›</button>
            </div>

            <div className="inv-summary">
              <div className="sumbox">
                <div className="sumbox-label">Valor da fatura</div>
                <div className="sumbox-value" style={{ color: invoice.status === 'paga' ? 'var(--green)' : 'var(--text)' }}>
                  {fmtBRL(invoice.total_cents)}
                </div>
                <div className="sumbox-sub">{invoice.tx_count} lançamentos
                  {invoice.paid_cents > 0 ? ` · pago ${fmtBRL(invoice.paid_cents)}` : ''}</div>
              </div>
              <div className="sumbox">
                <div className="sumbox-label">Fechamento</div>
                <div className="sumbox-value">{fmtDate(invoice.closing_date)}</div>
                <div className="sumbox-sub">compras após essa data caem na próxima</div>
              </div>
              <div className="sumbox">
                <div className="sumbox-label">Vencimento</div>
                <div className="sumbox-value">{fmtDate(invoice.due_date)}</div>
                <div className="sumbox-sub">{invoice.status === 'paga' ? 'quitada' : 'pague pela sua conta'}</div>
              </div>
            </div>
          </div>

          <div className="grid">
            <div className="left-col">
              <div className="panel">
                <div className="panel-head"><h2>Categorias da fatura</h2></div>
                <div className="panel-body">
                  {catEntries.map(([cat, val]) => (
                    <div key={cat} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
                        <span><span className="dot" style={{ background: cats[cat], marginRight: 7 }} />{cat}</span>
                        <span style={{ fontWeight: 600 }}>{fmtBRL(val)}</span>
                      </div>
                      <div className="goal-bar"><div style={{ width: `${val / catMax * 100}%`, background: cats[cat] || '#999' }} /></div>
                    </div>
                  ))}
                  {!catEntries.length && <div className="empty">Sem gastos nesta fatura.</div>}
                </div>
              </div>

              <div className="panel">
                <div className="panel-head"><h2>Histórico</h2></div>
                <div className="panel-body">
                  {data.invoices.filter(i => i.status !== 'futura').slice(0, 12).map(i => (
                    <button key={i.ref} className="legend-item" style={{ opacity: i.ref === ref ? 1 : .75 }}
                      onClick={() => setRef(i.ref)}>
                      <span style={{ width: 64, color: 'var(--muted)', fontSize: 12 }}>
                        {MONTH_NAMES[+i.ref.slice(5, 7) - 1].slice(0, 3).toLowerCase()}/{i.ref.slice(2, 4)}
                      </span>
                      <span className="goal-bar" style={{ flex: 1, margin: 0 }}>
                        <span style={{ display: 'block', height: '100%', borderRadius: 99, width: `${i.total_cents / maxTotal * 100}%`,
                          background: i.ref === ref ? 'var(--accent)' : 'var(--border)' }} />
                      </span>
                      <span className="val" style={{ width: 84, textAlign: 'right' }}>{fmtBRL(i.total_cents)}</span>
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
                <h2>Lançamentos da fatura <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 13 }}>· {invoice.tx_count}</span></h2>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th style={{ textAlign: 'right' }}>Valor</th></tr></thead>
                  <tbody>
                    {invoice.txs.map(t => {
                      const color = cats[t.category] || '#999';
                      return (
                        <tr key={t.id}>
                          <td style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{t.date.slice(8, 10)}/{t.date.slice(5, 7)}</td>
                          <td className="desc">{t.description}</td>
                          <td>
                            <select className="badge-select" value={t.category}
                              style={{ background: `${color}22`, color,
                                outline: t.category === 'A revisar' ? `1.5px dashed ${color}88` : 'none' }}
                              onChange={e => changeCategory(t, e.target.value)}>
                              {Object.keys(cats).map(c => <option key={c}>{c}</option>)}
                            </select>
                          </td>
                          <td className="amount out">−{fmtBRL(-t.amount_cents).replace('-', '')}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!invoice.txs.length && <div className="empty">Nenhum lançamento nesta fatura.</div>}
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
        <a href="/" className="hbtn" style={{ textDecoration: 'none' }}>← Dashboard</a>
        <span><img src="/icon.svg" alt="" width={26} height={26} style={{ borderRadius: 8, verticalAlign: 'middle', marginRight: 8 }} />Cartões</span>
      </div>
      <button className="theme-toggle" title="Modo privacidade: esconder valores" onClick={() => {
        const on = document.documentElement.classList.toggle('privacy');
        try { localStorage.setItem('fluxo-privacy', on ? '1' : '0'); } catch (e) {}
      }} style={{ marginRight: 8 }}>👁</button>
      <button className="theme-toggle" title="Alternar tema" onClick={() => {
        document.documentElement.classList.toggle('dark');
        try {
          localStorage.setItem('fluxo-theme',
            document.documentElement.classList.contains('dark') ? 'dark' : 'light');
        } catch (e) {}
      }}>◐</button>
    </header>
  );
}
