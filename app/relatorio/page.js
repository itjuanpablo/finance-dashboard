'use client';

import { useEffect, useMemo, useState } from 'react';

const fmtBRL = c => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const MONTH_NAMES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const monthLabel = ym => `${MONTH_NAMES[+ym.slice(5, 7) - 1]} de ${ym.slice(0, 4)}`;
const addMonths = (ym, k) => {
  const y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + k;
  return `${y + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}`;
};

function monthStats(txs, ym) {
  const mts = txs.filter(t => t.date.startsWith(ym) && !t.transfer);
  const cats = {};
  mts.filter(t => t.amount_cents < 0)
    .forEach(t => { cats[t.category] = (cats[t.category] || 0) - t.amount_cents; });
  return {
    in: mts.filter(t => t.amount_cents > 0).reduce((s, t) => s + t.amount_cents, 0),
    out: mts.filter(t => t.amount_cents < 0).reduce((s, t) => s - t.amount_cents, 0),
    n: mts.length,
    cats,
    top: mts.filter(t => t.amount_cents < 0)
      .sort((a, b) => a.amount_cents - b.amount_cents).slice(0, 10),
  };
}

export default function Relatorio() {
  const [mes, setMes] = useState(null);
  const [txs, setTxs] = useState(null);
  const [colors, setColors] = useState({});
  const [emojis, setEmojis] = useState({});
  const [goals, setGoals] = useState([]);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('mes');
    setMes(/^\d{4}-\d{2}$/.test(p || '') ? p : new Date().toISOString().slice(0, 7));
    Promise.all([fetch('/api/transactions'), fetch('/api/goals')]).then(async ([t, g]) => {
      const td = await t.json();
      setTxs(td.transactions); setColors(td.categories); setEmojis(td.categoryEmojis || {});
      setGoals((await g.json()).goals);
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

  if (!data) return <div className="container"><div className="loading">Carregando…</div></div>;
  const { cur, prev, prevYm, catRows, budget } = data;
  const deltaOut = prev.out ? ((cur.out - prev.out) / prev.out * 100) : null;

  return (
    <div className="container" style={{ maxWidth: 860 }}>
      <header className="no-print">
        <div className="logo" style={{ gap: 14 }}>
          <a href="/" className="hbtn" style={{ textDecoration: 'none' }}>← Dashboard</a>
          <span><img src="/icon.svg" alt="" width={26} height={26} style={{ borderRadius: 8, verticalAlign: 'middle', marginRight: 8 }} />Relatório</span>
        </div>
        <button className="hbtn" onClick={() => window.print()}>🖨 Imprimir / Salvar PDF</button>
      </header>

      <div style={{ margin: '8px 0 20px' }}>
        <h1 style={{ fontSize: 24, letterSpacing: '-.02em' }}>
          Relatório mensal — {monthLabel(mes)}
        </h1>
        <div style={{ color: 'var(--muted)', fontSize: 12.5 }}>
          Fluxo · gerado em {new Date().toLocaleDateString('pt-BR')} · {cur.n} lançamentos no mês (transferências internas excluídas)
        </div>
      </div>

      <div className="cards" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-label">Entradas</div>
          <div className="card-value pos">{fmtBRL(cur.in)}</div>
        </div>
        <div className="card">
          <div className="card-label">Saídas</div>
          <div className="card-value neg">{fmtBRL(cur.out)}</div>
          {deltaOut != null && (
            <div className="card-sub">{deltaOut >= 0 ? '+' : ''}{deltaOut.toFixed(0)}% vs {monthLabel(prevYm).split(' de ')[0]}</div>
          )}
        </div>
        <div className="card">
          <div className="card-label">Saldo do mês</div>
          <div className={`card-value ${cur.in - cur.out >= 0 ? 'pos' : 'neg'}`}>{fmtBRL(cur.in - cur.out)}</div>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head"><h2>Gastos por categoria</h2></div>
        <div className="panel-body">
          <table style={{ fontSize: 13 }}>
            <thead><tr><th>Categoria</th><th style={{ textAlign: 'right' }}>Valor</th><th style={{ textAlign: 'right' }}>% das saídas</th><th style={{ textAlign: 'right' }}>vs mês anterior</th></tr></thead>
            <tbody>
              {catRows.map(r => (
                <tr key={r.cat}>
                  <td><span className="dot" style={{ background: colors[r.cat], marginRight: 8 }} />{emojis[r.cat] ? `${emojis[r.cat]} ` : ''}{r.cat}</td>
                  <td className="amount">{fmtBRL(r.v)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--muted)' }}>{r.pct.toFixed(1)}%</td>
                  <td style={{ textAlign: 'right', color: r.delta == null ? 'var(--muted)' : r.delta > 0 ? 'var(--red)' : 'var(--green)' }}>
                    {r.delta == null ? '—' : `${r.delta > 0 ? '+' : ''}${fmtBRL(r.delta)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {budget.length > 0 && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="panel-head"><h2>Orçado × realizado</h2></div>
          <div className="panel-body">
            <table style={{ fontSize: 13 }}>
              <thead><tr><th>Categoria</th><th style={{ textAlign: 'right' }}>Orçado</th><th style={{ textAlign: 'right' }}>Gasto</th><th style={{ textAlign: 'right' }}>Resultado</th></tr></thead>
              <tbody>
                {budget.map(b => (
                  <tr key={b.category}>
                    <td>{emojis[b.category] ? `${emojis[b.category]} ` : ''}{b.category}
                      {b.carry !== 0 && <span style={{ color: 'var(--muted)', fontSize: 11 }}> (meta {fmtBRL(b.limit_cents)} {b.carry > 0 ? '+' : '−'} {fmtBRL(Math.abs(b.carry))} rollover)</span>}
                    </td>
                    <td className="amount">{fmtBRL(b.eff)}</td>
                    <td className="amount">{fmtBRL(b.spent)}</td>
                    <td className="amount" style={{ color: b.saldo >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {b.saldo >= 0 ? `sobrou ${fmtBRL(b.saldo)}` : `estourou ${fmtBRL(-b.saldo)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head"><h2>10 maiores gastos do mês</h2></div>
        <div className="panel-body">
          <table style={{ fontSize: 13 }}>
            <tbody>
              {cur.top.map(t => (
                <tr key={t.id}>
                  <td style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{t.date.slice(8, 10)}/{t.date.slice(5, 7)}</td>
                  <td>{t.description}</td>
                  <td style={{ color: 'var(--muted)' }}>{t.category}</td>
                  <td className="amount">{fmtBRL(-t.amount_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="no-print" style={{ fontSize: 12, color: 'var(--muted)' }}>
        Dica: no diálogo de impressão, escolha "Salvar como PDF". Para outro mês, mude o seletor no dashboard e clique em 📄 Relatório.
      </p>
    </div>
  );
}
