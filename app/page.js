'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { computeInsights } from '@/lib/insights';

const fmtBRL = cents =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const MONTH_NAMES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MONTH_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const monthLabel = ym => `${MONTH_NAMES[parseInt(ym.slice(5, 7)) - 1]} de ${ym.slice(0, 4)}`;
const monthShort = ym => MONTH_SHORT[parseInt(ym.slice(5, 7)) - 1];
const addMonths = (ym, k) => {
  const y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + k;
  return `${y + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}`;
};
const stripParcela = d => d.replace(/\s*\(parcela \d+\/\d+\)$/, '').trim();

let toastId = 0;

export default function Dashboard() {
  const [txs, setTxs] = useState(null);
  const [categories, setCategories] = useState({});
  const [goals, setGoals] = useState([]);
  const [cards, setCards] = useState([]);
  const [rules, setRules] = useState([]);
  const [batches, setBatches] = useState([]);
  const [dismissed, setDismissed] = useState(null); // null até hidratar
  const [modal, setModal] = useState(null); // 'rules' | 'batches' | null
  const [month, setMonth] = useState('');
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [activeCat, setActiveCat] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [drag, setDrag] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [limit, setLimit] = useState(50);
  const [goalCat, setGoalCat] = useState('');
  const [goalVal, setGoalVal] = useState('');
  const fileRef = useRef(null);

  const toast = (msg, ico = '✓', err = false) => {
    const id = ++toastId;
    setToasts(t => [...t, { id, msg, ico, err }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4200);
  };

  async function load(selectLatestMonth = false) {
    const [tRes, gRes, rRes, bRes, cRes] = await Promise.all([
      fetch('/api/transactions'), fetch('/api/goals'),
      fetch('/api/rules'), fetch('/api/batches'), fetch('/api/cards'),
    ]);
    const t = await tRes.json();
    setTxs(t.transactions);
    setCategories(t.categories);
    setGoals((await gRes.json()).goals);
    setRules((await rRes.json()).rules);
    setBatches((await bRes.json()).batches);
    setCards((await cRes.json()).cards);
    if (selectLatestMonth && t.transactions.length) {
      setMonth(m => m || t.transactions[0].date.slice(0, 7));
    }
  }
  useEffect(() => {
    load(true);
    try {
      setDismissed(new Set(JSON.parse(localStorage.getItem('fluxo-insights-off') || '[]')));
    } catch { setDismissed(new Set()); }
  }, []);

  const dismissInsight = id => {
    setDismissed(prev => {
      const next = new Set(prev || []);
      next.add(id);
      try { localStorage.setItem('fluxo-insights-off', JSON.stringify([...next])); } catch (e) {}
      return next;
    });
  };

  const insights = useMemo(() => {
    if (!txs || !dismissed) return [];
    return computeInsights({ transactions: txs, goals, cards })
      .filter(i => !dismissed.has(i.id))
      .slice(0, 3);
  }, [txs, goals, cards, dismissed]);

  // ── Importação ────────────────────────────────────────
  async function upload(files) {
    if (!files.length || busy) return;
    setBusy(true); setProgress(15);
    const form = new FormData();
    [...files].forEach(f => form.append('files', f));
    const tick = setInterval(() => setProgress(p => Math.min(p + 9, 88)), 350);
    try {
      const res = await fetch('/api/import', { method: 'POST', body: form });
      const { results, error } = await res.json();
      clearInterval(tick); setProgress(100);
      if (error) toast(error, '⚠️', true);
      for (const r of results || []) {
        if (r.error) toast(`${r.fileName}: ${r.error}`, '⚠️', true);
        else toast(
          `${r.fileName}: ${r.inserted} novas` +
          (r.skipped ? `, ${r.skipped} já existiam` : '') +
          (r.toReview ? ` · ${r.toReview} a revisar` : ''), '✅');
      }
      await load(true);
    } catch (e) {
      clearInterval(tick);
      toast('Falha na importação: ' + e.message, '⚠️', true);
    } finally {
      setTimeout(() => { setBusy(false); setProgress(0); }, 600);
    }
  }

  async function undoBatch(b) {
    if (!confirm(`Desfazer a importação de "${b.file_name}"? ${b.inserted} transações serão removidas.`)) return;
    const res = await fetch('/api/batches', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: b.id }),
    });
    const data = await res.json();
    toast(data.error || `Importação desfeita: ${data.removed} transações removidas`, data.error ? '⚠️' : '↩️', !!data.error);
    await load();
  }

  // ── Recategorização (+ regra automática) ──────────────
  async function changeCategory(tx, category) {
    const fromReview = tx.category === 'A revisar';
    const pattern = stripParcela(tx.description);
    const res = await fetch('/api/transactions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: tx.id, category, createRule: fromReview, pattern }),
    });
    const data = await res.json();
    if (fromReview) {
      toast(`Regra criada: "${pattern.slice(0, 40)}" → ${category}` +
        (data.ruleApplied > 1 ? ` (aplicada a ${data.ruleApplied} transações)` : ''), '🧠');
    }
    await load();
  }

  async function editRule(rule, category) {
    await fetch('/api/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pattern: rule.pattern, category }),
    });
    await load();
  }

  async function deleteRule(rule) {
    await fetch('/api/rules', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: rule.id }),
    });
    toast(`Regra removida: "${rule.pattern.slice(0, 40)}"`, '🗑');
    await load();
  }

  // ── Metas ─────────────────────────────────────────────
  async function saveGoal(category, reais) {
    const cents = Math.round(parseFloat(String(reais).replace(/\./g, '').replace(',', '.')) * 100);
    if (!category || !isFinite(cents)) return;
    await fetch('/api/goals', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, limit_cents: cents }),
    });
    setGoalCat(''); setGoalVal('');
    await load();
  }

  // ── Exportar CSV ──────────────────────────────────────
  function exportCsv(rowsToExport) {
    const head = 'data;descricao;categoria;valor;origem';
    const lines = rowsToExport.map(t =>
      `${t.date};"${t.description.replace(/"/g, '""')}";${t.category};${(t.amount_cents / 100).toFixed(2).replace('.', ',')};${t.source}`);
    const blob = new Blob(['﻿' + [head, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `fluxo-${month || 'tudo'}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`${rowsToExport.length} transações exportadas`, '⬇️');
  }

  // ── Derivados ─────────────────────────────────────────
  const months = useMemo(() => {
    if (!txs) return [];
    return [...new Set(txs.map(t => t.date.slice(0, 7)))].sort().reverse();
  }, [txs]);

  const effMonth = month || months[0] || '';

  const monthTxs = useMemo(() => {
    if (!txs) return [];
    return month ? txs.filter(t => t.date.startsWith(month)) : txs;
  }, [txs, month]);

  const summary = useMemo(() => {
    const real = monthTxs.filter(t => !t.transfer);
    const totIn = real.filter(t => t.amount_cents > 0).reduce((s, t) => s + t.amount_cents, 0);
    const totOut = real.filter(t => t.amount_cents < 0).reduce((s, t) => s - t.amount_cents, 0);
    const now = new Date();
    const isCurrent = month === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const daysIn = month ? new Date(+month.slice(0, 4), +month.slice(5, 7), 0).getDate() : 30;
    const proj = isCurrent && now.getDate() > 0 ? totOut / now.getDate() * daysIn : null;
    return {
      totIn, totOut, bal: totIn - totOut, proj,
      nIn: real.filter(t => t.amount_cents > 0).length,
      nOut: real.filter(t => t.amount_cents < 0).length,
    };
  }, [monthTxs, month]);

  const donut = useMemo(() => {
    const spent = {};
    monthTxs.filter(t => t.amount_cents < 0 && !t.transfer)
      .forEach(t => { spent[t.category] = (spent[t.category] || 0) - t.amount_cents; });
    const entries = Object.entries(spent).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((s, [, v]) => s + v, 0);
    return { entries, total };
  }, [monthTxs]);

  // gasto por categoria no mês efetivo (para metas)
  const spentByCat = useMemo(() => {
    const map = {};
    (txs || []).filter(t => t.date.startsWith(effMonth) && t.amount_cents < 0 && !t.transfer)
      .forEach(t => { map[t.category] = (map[t.category] || 0) - t.amount_cents; });
    return map;
  }, [txs, effMonth]);

  // evolução: últimos 6 meses com dados
  const evolution = useMemo(() => {
    const asc = [...months].sort().slice(-6);
    return asc.map(ym => {
      const mts = (txs || []).filter(t => t.date.startsWith(ym) && !t.transfer);
      return {
        ym,
        in: mts.filter(t => t.amount_cents > 0).reduce((s, t) => s + t.amount_cents, 0),
        out: mts.filter(t => t.amount_cents < 0).reduce((s, t) => s - t.amount_cents, 0),
      };
    });
  }, [txs, months]);

  // parcelas futuras: compromissos já contratados no cartão
  const future = useMemo(() => {
    const map = {};
    const nowYm = new Date().toISOString().slice(0, 7);
    for (const t of txs || []) {
      const m = t.description.match(/\(parcela (\d+)\/(\d+)\)$/);
      if (!m || t.amount_cents >= 0) continue;
      const [, num, tot] = m.map(Number);
      for (let k = 1; k <= tot - num; k++) {
        const ym = addMonths(t.date.slice(0, 7), k);
        if (ym <= nowYm) continue; // parcela já deve ter aparecido em fatura importada
        map[ym] = map[ym] || { cents: 0, n: 0 };
        map[ym].cents += -t.amount_cents;
        map[ym].n++;
      }
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).slice(0, 4);
  }, [txs]);

  // recorrências: mesma despesa, valor estável, >= 3 meses distintos
  const recurring = useMemo(() => {
    const groups = {};
    for (const t of txs || []) {
      if (t.amount_cents >= 0 || t.transfer) continue;
      const key = stripParcela(t.description).toLowerCase();
      (groups[key] = groups[key] || []).push(t);
    }
    const rec = new Map(); // desc → aviso de mudança de valor (ou null)
    for (const [key, list] of Object.entries(groups)) {
      const ms = new Set(list.map(t => t.date.slice(0, 7)));
      if (ms.size < 3 || list.length / ms.size > 2) continue;
      const vals = list.map(t => -t.amount_cents).sort((a, b) => a - b);
      const median = vals[Math.floor(vals.length / 2)];
      if ((vals[vals.length - 1] - vals[0]) / median > 0.25) continue;
      const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
      const last = -sorted[sorted.length - 1].amount_cents;
      const prev = sorted.length > 1 ? -sorted[sorted.length - 2].amount_cents : last;
      const changed = Math.abs(last - prev) / prev > 0.05
        ? `valor mudou: ${fmtBRL(prev)} → ${fmtBRL(last)}` : null;
      rec.set(key, changed);
    }
    return rec;
  }, [txs]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return monthTxs
      .filter(t => !q || t.description.toLowerCase().includes(q))
      .filter(t => !catFilter || t.category === catFilter)
      .filter(t => !typeFilter ||
        (typeFilter === 'in' ? t.amount_cents > 0 && !t.transfer :
         typeFilter === 'out' ? t.amount_cents < 0 && !t.transfer :
         typeFilter === 'review' ? t.category === 'A revisar' : !!t.transfer));
  }, [monthTxs, search, catFilter, typeFilter]);

  const reviewCount = useMemo(
    () => (txs || []).filter(t => t.category === 'A revisar').length, [txs]);

  if (!txs) return <div className="container"><div className="loading">Carregando…</div></div>;

  // ── Donut geometria ───────────────────────────────────
  const R = 82, C = 2 * Math.PI * R, GAP = 2.5;
  let acc = 0;
  const segs = donut.entries.map(([cat, val]) => {
    const frac = val / donut.total;
    const seg = { cat, val, len: Math.max(frac * C - GAP, 1), off: -acc };
    acc += frac * C;
    return seg;
  });

  const evoMax = Math.max(1, ...evolution.flatMap(e => [e.in, e.out]));
  const goalColor = pct => pct < 80 ? 'var(--green)' : pct < 100 ? 'var(--amber)' : 'var(--red)';
  const noGoalCats = Object.keys(categories).filter(c =>
    !goals.some(g => g.category === c) && !['Transferências', 'Renda', 'A revisar'].includes(c));

  return (
    <div className="container">
      <header>
        <div className="logo"><img src="/icon.svg" alt="" width={30} height={30} style={{ borderRadius: 9 }} />Fluxo</div>
        <div className="header-right">
          <button className="hbtn" onClick={() => exportCsv(rows)} title="Exportar transações filtradas">⬇ CSV</button>
          <button className="hbtn" onClick={() => setModal('rules')}>🧠 Regras{rules.length ? ` (${rules.length})` : ''}</button>
          <button className="hbtn" onClick={() => setModal('batches')}>🗂 Importações</button>
          <a className="hbtn" href="/cartoes" style={{ textDecoration: 'none' }}>💳 Faturas</a>
          <a className="hbtn" href="/gerenciar" style={{ textDecoration: 'none' }}>⚙ Gerenciar</a>
          <select className="control" value={month} onChange={e => { setMonth(e.target.value); setActiveCat(null); }}>
            <option value="">Todo o período</option>
            {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
          <button className="theme-toggle" title="Alternar tema" onClick={() => {
            document.documentElement.classList.toggle('dark');
            try {
              localStorage.setItem('fluxo-theme',
                document.documentElement.classList.contains('dark') ? 'dark' : 'light');
            } catch (e) {}
          }}>◐</button>
        </div>
      </header>

      <div
        className={`dropzone ${drag ? 'dragover' : ''} ${busy ? 'busy' : ''}`}
        onClick={() => fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}
      >
        <div className="dropzone-icon">⇪</div>
        <h3>{busy ? 'Processando…' : 'Arraste seus extratos e faturas aqui'}</h3>
        <p>PDF (Mercado Pago), OFX ou CSV — ou <b>clique para selecionar</b>. Reimportar o mesmo arquivo não duplica nada.</p>
        <input ref={fileRef} type="file" multiple accept=".pdf,.ofx,.csv,.txt"
          onChange={e => { upload(e.target.files); e.target.value = ''; }} />
        <div className="progress-bar" style={{ width: `${progress}%` }} />
      </div>

      <div className="cards">
        <div className="card">
          <div className="card-label"><span className="dot" style={{ background: 'var(--green)' }} />Entradas</div>
          <div className="card-value pos">{fmtBRL(summary.totIn)}</div>
          <div className="card-sub">{summary.nIn} lançamentos</div>
        </div>
        <div className="card">
          <div className="card-label"><span className="dot" style={{ background: 'var(--red)' }} />Saídas</div>
          <div className="card-value neg">{fmtBRL(summary.totOut)}</div>
          <div className="card-sub">{summary.nOut} lançamentos</div>
        </div>
        <div className="card">
          <div className="card-label"><span className="dot" style={{ background: 'var(--accent)' }} />Saldo</div>
          <div className={`card-value ${summary.bal >= 0 ? 'pos' : 'neg'}`}>{fmtBRL(summary.bal)}</div>
          <div className="card-sub">entradas − saídas (sem transferências)</div>
        </div>
        <div className="card">
          <div className="card-label"><span className="dot" style={{ background: 'var(--amber)' }} />Projeção de gastos</div>
          <div className="card-value">{summary.proj != null ? fmtBRL(summary.proj) : '—'}</div>
          <div className="card-sub">
            {summary.proj != null ? 'ritmo atual até o fim do mês' : 'disponível no mês corrente'}
            {future.length > 0 && summary.proj != null ? ` · + parcelas contratadas` : ''}
          </div>
        </div>
      </div>

      {insights.length > 0 && (
        <div className="insights-row">
          {insights.map(i => (
            <div key={i.id} className={`insight-card sev-${i.severity}`}>
              <button className="insight-x" title="Não mostrar de novo neste mês"
                onClick={() => dismissInsight(i.id)}>✕</button>
              <div className="insight-title">{i.title}</div>
              <div className="insight-detail">{i.detail}</div>
              {i.action && (
                <button className="insight-action" onClick={() => {
                  if (i.action.filter?.cat) { setCatFilter(i.action.filter.cat); setTypeFilter(''); }
                  if (i.action.filter?.search) setSearch(i.action.filter.search);
                }}>{i.action.label} →</button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="grid">
        <div className="left-col">
          <div className="panel">
            <div className="panel-head"><h2>Gastos por categoria</h2></div>
            {donut.entries.length === 0 ? (
              <div className="empty">Sem gastos no período.</div>
            ) : (
              <>
                <div className="donut-wrap">
                  <svg width="210" height="210" viewBox="0 0 210 210">
                    {segs.map(s => (
                      <circle key={s.cat} className={`seg ${activeCat && activeCat !== s.cat ? 'dim' : ''}`}
                        cx="105" cy="105" r={R} fill="none"
                        stroke={categories[s.cat] || '#999'}
                        strokeWidth={activeCat === s.cat ? 22 : 18}
                        strokeDasharray={`${s.len} ${C - s.len}`}
                        strokeDashoffset={s.off} strokeLinecap="round"
                        transform="rotate(-90 105 105)"
                        onClick={() => setActiveCat(a => a === s.cat ? null : s.cat)} />
                    ))}
                  </svg>
                  <div className="donut-center">
                    <div>
                      <div className="t">{fmtBRL(activeCat ? (donut.entries.find(([c]) => c === activeCat)?.[1] || 0) : donut.total)}</div>
                      <div className="s">{activeCat || 'total gasto'}</div>
                    </div>
                  </div>
                </div>
                <div className="legend">
                  {donut.entries.map(([cat, val]) => (
                    <button key={cat} className="legend-item"
                      style={{ opacity: activeCat && activeCat !== cat ? .4 : 1 }}
                      onClick={() => setActiveCat(a => a === cat ? null : cat)}>
                      <span className="dot" style={{ background: categories[cat] }} />
                      <span className="name">{cat}</span>
                      <span className="val">{fmtBRL(val)}</span>
                      <span className="pct">{(val / donut.total * 100).toFixed(0)}%</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="panel">
            <div className="panel-head"><h2>Metas · {monthLabel(effMonth || '2026-01').split(' de ')[0]}</h2></div>
            <div className="panel-body">
              {goals.length === 0 && (
                <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>
                  Defina limites de gasto por categoria e acompanhe o progresso do mês.
                </div>
              )}
              {goals.map(g => {
                const spent = spentByCat[g.category] || 0;
                const pct = Math.min(spent / g.limit_cents * 100, 100);
                const realPct = spent / g.limit_cents * 100;
                return (
                  <div key={g.category}>
                    <div className="goal-row">
                      <span className="name">
                        <span className="dot" style={{ background: categories[g.category] }} />
                        {g.category}
                      </span>
                      <span className="nums">{fmtBRL(spent)} / {fmtBRL(g.limit_cents)} ({realPct.toFixed(0)}%)</span>
                      <button className="goal-del" title="Remover meta"
                        onClick={() => saveGoal(g.category, '0')}>✕</button>
                    </div>
                    <div className="goal-bar">
                      <div style={{ width: `${pct}%`, background: goalColor(realPct) }} />
                    </div>
                  </div>
                );
              })}
              <div className="goal-form">
                <select className="control" value={goalCat} onChange={e => setGoalCat(e.target.value)}>
                  <option value="">Categoria…</option>
                  {noGoalCats.map(c => <option key={c}>{c}</option>)}
                </select>
                <input placeholder="R$ 500,00" value={goalVal}
                  onChange={e => setGoalVal(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveGoal(goalCat, goalVal)} />
                <button onClick={() => saveGoal(goalCat, goalVal)}>+</button>
              </div>
            </div>
          </div>

          {evolution.length > 1 && (
            <div className="panel">
              <div className="panel-head"><h2>Evolução mensal</h2></div>
              <div className="panel-body">
                <svg width="100%" height="110" viewBox={`0 0 ${evolution.length * 52} 110`} preserveAspectRatio="none">
                  {evolution.map((e, i) => (
                    <g key={e.ym}>
                      <rect x={i * 52 + 8} y={100 - e.in / evoMax * 92} width="16" rx="3"
                        height={Math.max(e.in / evoMax * 92, 2)} fill="var(--green)" opacity=".85">
                        <title>{monthShort(e.ym)}: entradas {fmtBRL(e.in)}</title>
                      </rect>
                      <rect x={i * 52 + 28} y={100 - e.out / evoMax * 92} width="16" rx="3"
                        height={Math.max(e.out / evoMax * 92, 2)} fill="var(--red)" opacity=".85">
                        <title>{monthShort(e.ym)}: saídas {fmtBRL(e.out)}</title>
                      </rect>
                    </g>
                  ))}
                </svg>
                <div className="evo-labels">
                  {evolution.map(e => <span key={e.ym}>{monthShort(e.ym)}</span>)}
                </div>
              </div>
            </div>
          )}

          {future.length > 0 && (
            <div className="panel">
              <div className="panel-head"><h2>Parcelas já contratadas</h2></div>
              <div className="panel-body">
                {future.map(([ym, f]) => (
                  <div className="future-row" key={ym}>
                    <span>{monthLabel(ym)}</span>
                    <span className="v">{fmtBRL(f.cents)} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({f.n}x)</span></span>
                  </div>
                ))}
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8 }}>
                  Estimado a partir das parcelas visíveis nas faturas importadas.
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-head" style={{ paddingBottom: 14 }}>
            <h2>Transações <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 13 }}>· {rows.length}</span></h2>
            {reviewCount > 0 && (
              <button style={{ border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--amber)', borderRadius: 10, padding: '6px 12px', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}
                onClick={() => { setTypeFilter('review'); setMonth(''); }}>
                ⚠ {reviewCount} a revisar
              </button>
            )}
          </div>
          <div className="filters">
            <div className="search">🔍<input placeholder="Buscar por descrição…" value={search} onChange={e => setSearch(e.target.value)} /></div>
            <select className="control" value={catFilter} onChange={e => setCatFilter(e.target.value)}>
              <option value="">Todas as categorias</option>
              {Object.keys(categories).map(c => <option key={c}>{c}</option>)}
            </select>
            <select className="control" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="">Todos os tipos</option>
              <option value="out">Só saídas</option>
              <option value="in">Só entradas</option>
              <option value="trf">Transferências</option>
              <option value="review">A revisar</option>
            </select>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th style={{ textAlign: 'right' }}>Valor</th></tr></thead>
              <tbody>
                {rows.slice(0, limit).map(t => {
                  const color = categories[t.category] || '#999';
                  const recKey = stripParcela(t.description).toLowerCase();
                  const isRec = t.amount_cents < 0 && !t.transfer && recurring.has(recKey);
                  const recWarn = isRec ? recurring.get(recKey) : null;
                  return (
                    <tr key={t.id}>
                      <td style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtDate(t.date)}</td>
                      <td className="desc">
                        {t.description}
                        {isRec && <span className="rec-badge" title={recWarn || 'Despesa recorrente'}>{recWarn ? '↻⚠️' : '↻'}</span>}
                        <small>{t.source}</small>
                      </td>
                      <td>
                        <select className="badge-select" value={t.category}
                          style={{
                            background: `${color}22`, color,
                            outline: t.category === 'A revisar' ? `1.5px dashed ${color}88` : 'none',
                          }}
                          onChange={e => changeCategory(t, e.target.value)}>
                          {Object.keys(categories).map(c => <option key={c}>{c}</option>)}
                        </select>
                      </td>
                      <td className={`amount ${t.transfer ? 'trf' : t.amount_cents > 0 ? 'in' : 'out'}`}>
                        {t.amount_cents > 0 ? '+' : ''}{fmtBRL(t.amount_cents)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length === 0 && <div className="empty">
              {txs.length === 0 ? 'Nada por aqui ainda. Arraste um extrato acima para começar.' : 'Nenhuma transação encontrada.'}
            </div>}
            {rows.length > limit && (
              <div className="pager">
                <button onClick={() => setLimit(l => l + 100)}>Mostrar mais ({rows.length - limit} restantes)</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {modal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div className="modal">
            <div className="modal-head">
              <div>
                <h3>{modal === 'rules' ? 'Regras de categorização' : 'Importações'}</h3>
                <p>{modal === 'rules'
                  ? 'Criadas quando você corrige uma transação. Excluir uma regra não altera o que já foi categorizado.'
                  : 'Cada arquivo importado. Desfazer remove apenas as transações daquele lote.'}</p>
              </div>
              <button className="modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              {modal === 'rules' && (rules.length === 0
                ? <div className="empty">Nenhuma regra ainda. Corrija uma transação "A revisar" para criar a primeira.</div>
                : rules.map(r => (
                  <div className="list-row" key={r.id}>
                    <div className="grow">
                      <div style={{ fontWeight: 500 }}>"{r.pattern}"</div>
                      <div className="sub">contém no texto → categoria ao lado</div>
                    </div>
                    <select className="control" value={r.category} onChange={e => editRule(r, e.target.value)}>
                      {Object.keys(categories).map(c => <option key={c}>{c}</option>)}
                    </select>
                    <button className="danger-btn" onClick={() => deleteRule(r)}>Excluir</button>
                  </div>
                )))}
              {modal === 'batches' && (batches.length === 0
                ? <div className="empty">Nenhuma importação ainda.</div>
                : batches.map(b => (
                  <div className="list-row" key={b.id}>
                    <div className="grow">
                      <div style={{ fontWeight: 500 }}>{b.file_name}</div>
                      <div className="sub">{b.kind} · {b.inserted} novas, {b.skipped} puladas · {b.imported_at}</div>
                    </div>
                    <button className="danger-btn" onClick={() => undoBatch(b)}>↩ Desfazer</button>
                  </div>
                )))}
            </div>
          </div>
        </div>
      )}

      <div className="toasts">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.err ? 'err' : ''}`}>
            <span className="ico">{t.ico}</span><span>{t.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
