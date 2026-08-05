'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { computeInsights, localIsoDate, localIsoMonth } from '@/lib/insights';
import RevisaoMassa from '@/components/RevisaoMassa';
import EstadoVazio from '@/components/EstadoVazio';
import AcoesCabecalho from '@/components/AcoesCabecalho';
import LancamentoRapido from '@/components/LancamentoRapido';
import { t, tn, makeCatLabeler } from '@/lib/i18n';
import { CAT, NON_BUDGET_CATEGORIES } from '@/lib/categories';
import { stripInstallment as stripParcela, installmentOf } from '@/lib/parsers/labels';
import {
  fmtMoney, fmtMoneyIn, fmtDayMonth, fmtMonthLong, fmtMonthShort,
  currencySymbol, parseAmountToCents,
} from '@/lib/format';

const saudacao = () => {
  const h = new Date().getHours();
  return h < 12 ? t('dash.morning') : h < 18 ? t('dash.afternoon') : t('dash.evening');
};

const addMonths = (ym, k) => {
  const y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + k;
  return `${y + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}`;
};

let toastId = 0;

export default function Dashboard() {
  const [txs, setTxs] = useState(null);
  const [categories, setCategories] = useState({});
  const [catList, setCatList] = useState([]);
  const [goals, setGoals] = useState([]);
  const [cards, setCards] = useState([]);
  const [rules, setRules] = useState([]);
  const [batches, setBatches] = useState([]);
  const [dismissed, setDismissed] = useState(null); // null até hidratar
  const [showReview, setShowReview] = useState(false);
  const [emojis, setEmojis] = useState({});
  const [quickAdd, setQuickAdd] = useState(null); // 'despesa' | 'receita' | null
  const [userName, setUserName] = useState('');
  const [billOccurrences, setBillOccurrences] = useState([]);
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

  // categoria circula como CHAVE; o nome exibido vem da lista da API
  const labelOf = useMemo(() => makeCatLabeler(catList), [catList]);

  const toast = (msg, ico = '✓', err = false) => {
    const id = ++toastId;
    setToasts(list => [...list, { id, msg, ico, err }]);
    setTimeout(() => setToasts(list => list.filter(x => x.id !== id)), 4200);
  };

  async function load(selectLatestMonth = false) {
    const [tRes, gRes, rRes, bRes, cRes, biRes, catRes] = await Promise.all([
      fetch('/api/transactions'), fetch('/api/goals'),
      fetch('/api/rules'), fetch('/api/batches'), fetch('/api/cards'),
      fetch('/api/bills'), fetch('/api/categories'),
    ]);
    const bills = await biRes.json();
    setBillOccurrences(bills.occurrences || []);
    // conciliação de contas a pagar que não conseguiu gravar: a tela mostra o
    // status certo, mas na próxima abertura ele volta a aparecer como não pago —
    // melhor dizer do que deixar a pessoa achando que o app está esquecendo
    if (bills.reconcileError) {
      toast(t('bills.reconcileFailed', { msg: bills.reconcileError }), '⚠️', true);
    }
    const tx = await tRes.json();
    setTxs(tx.transactions);
    setCategories(tx.categories);
    setEmojis(tx.categoryEmojis || {});
    setCatList((await catRes.json()).categories || []);
    setGoals((await gRes.json()).goals);
    setRules((await rRes.json()).rules);
    setBatches((await bRes.json()).batches);
    setCards((await cRes.json()).cards);
    if (selectLatestMonth && tx.transactions.length) {
      setMonth(m => m || tx.transactions[0].date.slice(0, 7));
    }
  }
  useEffect(() => {
    load(true);
    try {
      setDismissed(new Set(JSON.parse(localStorage.getItem('fluxo-insights-off') || '[]')));
      setUserName(localStorage.getItem('fluxo-nome') || '');
    } catch { setDismissed(new Set()); }
    // atalho do PWA (segurar o ícone) e de URL: /?add=despesa|receita
    const add = new URLSearchParams(window.location.search).get('add');
    if (add === 'despesa' || add === 'receita') setQuickAdd(add);
    // atalhos de teclado: d = despesa, r = receita
    const onKey = e => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target.closest?.('input, select, textarea')) return;
      if (e.key === 'd') setQuickAdd('despesa');
      if (e.key === 'r') setQuickAdd('receita');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const editName = () => {
    const n = prompt(t('dash.namePrompt'), userName || '');
    if (n === null) return;
    setUserName(n.trim());
    try { localStorage.setItem('fluxo-nome', n.trim()); } catch (e) {}
  };

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
    return computeInsights({ transactions: txs, goals, cards, billOccurrences, catLabel: labelOf })
      .filter(i => !dismissed.has(i.id))
      .slice(0, 3);
  }, [txs, goals, cards, billOccurrences, dismissed, labelOf]);

  // vencimentos a exibir: atrasadas + próximas 45 dias, não pagas
  const upcomingBills = useMemo(() => {
    // localIsoDate, não toISOString: em UTC−3 depois das 21h o corte pulava um
    // dia e trazia (ou escondia) um vencimento a mais do que deveria.
    const cutoff = localIsoDate(new Date(Date.now() + 45 * 86400000));
    return billOccurrences
      .filter(o => o.status === 'atrasada' || (o.status === 'proxima' && o.due_date <= cutoff))
      .slice(0, 6);
  }, [billOccurrences]);

  async function payBill(o) {
    await fetch('/api/bills', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bill_id: o.bill_id, ref: o.ref, paid: true }),
    });
    toast(t('bills.markedPaid', { desc: o.description, ref: o.ref }), '✅');
    await load();
  }

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
        if (r.error) { toast(`${r.fileName}: ${r.error}`, '⚠️', true); continue; }
        toast(
          t('import.result', { file: r.fileName, inserted: r.inserted, skipped: r.skipped }) +
          (r.toReview ? ` · ${tn(r.toReview, 'import.toReview')}` : ''), '✅');
        // Confiança baixa e encoding exótico são justamente os casos em que o
        // número pode estar errado: dizer qual perfil leu o arquivo dá ao
        // usuário a chance de desconfiar antes de tomar decisão com o dado.
        if (r.bank && r.confidence && r.confidence !== 'alta') {
          toast(`${r.bank} — ${t(`import.confidence.${r.confidence}`)}`, 'ℹ️');
        }
        for (const w of r.warnings || []) toast(w, '⚠️', true);
      }
      await load(true);
    } catch (e) {
      clearInterval(tick);
      toast(t('import.fail', { msg: e.message }), '⚠️', true);
    } finally {
      setTimeout(() => { setBusy(false); setProgress(0); }, 600);
    }
  }

  async function undoBatch(b) {
    // Desfazer é DELETE físico: leva embora também as transações que a pessoa
    // corrigiu à mão, e correção manual não volta do arquivo original. Por isso
    // a contagem aparece ANTES, no confirm — depois do clique não há como avisar.
    const edited = (txs || []).filter(tx =>
      tx.batch_id === b.id &&
      (tx.original_date != null || tx.original_description != null ||
       tx.original_amount_cents != null)).length;
    const aviso = edited > 0 ? `\n\n${tn(edited, 'import.undoManual')}` : '';
    if (!confirm(t('import.undoConfirm', { file: b.file_name, n: b.inserted }) + aviso)) return;
    const res = await fetch('/api/batches', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: b.id }),
    });
    const data = await res.json();
    toast(data.error || t('import.undone', { n: data.removed }), data.error ? '⚠️' : '↩️', !!data.error);
    // O servidor conta de novo (a tela pode estar com dado velho) e diz onde
    // ficou o backup — é por ali que a pessoa recupera o que acabou de apagar.
    if (!data.error && data.manuallyEdited > 0) {
      toast(tn(data.manuallyEdited, 'import.undoManual'), '⚠️', true);
    }
    if (!data.error && data.backup) toast(t('import.undoBackup', { file: data.backup }), '💾');
    await load();
  }

  // ── Recategorização (+ regra automática) ──────────────
  async function changeCategory(tx, category) {
    const fromReview = tx.category === CAT.TO_REVIEW;
    const pattern = stripParcela(tx.description);
    const res = await fetch('/api/transactions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: tx.id, category, createRule: fromReview, pattern }),
    });
    const data = await res.json();
    if (fromReview) {
      toast(t('dash.ruleCreated', { pattern: pattern.slice(0, 40), cat: labelOf(category) }) +
        (data.ruleApplied > 1 ? ` ${t('dash.ruleApplied', { n: data.ruleApplied })}` : ''), '🧠');
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
    toast(t('manage.ruleRemoved', { pattern: rule.pattern.slice(0, 40) }), '🗑');
    await load();
  }

  // ── Metas / Orçamento ─────────────────────────────────
  async function saveGoal(category, reais, rollover) {
    const cents = parseAmountToCents(reais);
    if (!category || cents == null) return;
    await fetch('/api/goals', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, limit_cents: cents, ...(rollover !== undefined && { rollover }) }),
    });
    setGoalCat(''); setGoalVal('');
    await load();
  }

  // ── Exportar CSV ──────────────────────────────────────
  function exportCsv(rowsToExport) {
    const head = t('export.csvHead');
    const lines = rowsToExport.map(tx =>
      `${tx.date};"${tx.description.replace(/"/g, '""')}";${labelOf(tx.category)};${(tx.amount_cents / 100).toFixed(2).replace('.', ',')};${tx.source}`);
    const blob = new Blob(['﻿' + [head, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `fluxo-${month || t('export.all')}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(t('export.done', { n: rowsToExport.length }), '⬇️');
  }

  // ── Derivados ─────────────────────────────────────────
  const months = useMemo(() => {
    if (!txs) return [];
    return [...new Set(txs.map(tx => tx.date.slice(0, 7)))].sort().reverse();
  }, [txs]);

  const effMonth = month || months[0] || '';

  const monthTxs = useMemo(() => {
    if (!txs) return [];
    return month ? txs.filter(tx => tx.date.startsWith(month)) : txs;
  }, [txs, month]);

  const summary = useMemo(() => {
    // `currency == null` é a moeda da instalação. Os cartões de resumo, a
    // projeção e o orçamento falam SÓ dessa moeda — ver BASE_CURRENCY em
    // lib/db.js. Dólar não entra aqui: entra no bloco `outrasMoedas`, com o
    // próprio símbolo, sem conversão nenhuma.
    const real = monthTxs.filter(tx => !tx.transfer && tx.currency == null);
    const totIn = real.filter(tx => tx.amount_cents > 0).reduce((s, tx) => s + tx.amount_cents, 0);
    const totOut = real.filter(tx => tx.amount_cents < 0).reduce((s, tx) => s - tx.amount_cents, 0);
    const now = new Date();
    const isCurrent = month === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const daysIn = month ? new Date(+month.slice(0, 4), +month.slice(5, 7), 0).getDate() : 30;
    const proj = isCurrent && now.getDate() > 0 ? totOut / now.getDate() * daysIn : null;
    return {
      totIn, totOut, bal: totIn - totOut, proj,
      nIn: real.filter(tx => tx.amount_cents > 0).length,
      nOut: real.filter(tx => tx.amount_cents < 0).length,
    };
  }, [monthTxs, month]);

  /**
   * Totais das moedas ESTRANGEIRAS, uma linha por moeda.
   *
   * Nunca somados com os de cima e nunca convertidos: o extrato da conta em
   * dólar não traz cotação, e aplicar a de hoje a um gasto de julho produz um
   * número que não corresponde a nada. Dois totais lado a lado dizem a verdade;
   * um total só exigiria inventar a taxa.
   */
  const outrasMoedas = useMemo(() => {
    const porMoeda = new Map();
    for (const tx of monthTxs) {
      if (tx.transfer || tx.currency == null) continue;
      const m = porMoeda.get(tx.currency) ?? { moeda: tx.currency, entrada: 0, saida: 0, n: 0 };
      tx.amount_cents > 0 ? (m.entrada += tx.amount_cents) : (m.saida -= tx.amount_cents);
      m.n++;
      porMoeda.set(tx.currency, m);
    }
    return [...porMoeda.values()].sort((a, b) => a.moeda.localeCompare(b.moeda));
  }, [monthTxs]);

  const donut = useMemo(() => {
    const spent = {};
    monthTxs.filter(tx => tx.amount_cents < 0 && !tx.transfer && tx.currency == null)
      .forEach(tx => { spent[tx.category] = (spent[tx.category] || 0) - tx.amount_cents; });
    const entries = Object.entries(spent).sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((s, [, v]) => s + v, 0);
    return { entries, total };
  }, [monthTxs]);

  // gasto por categoria no mês efetivo (para metas)
  const spentByCat = useMemo(() => {
    const map = {};
    (txs || []).filter(tx => tx.date.startsWith(effMonth) && tx.amount_cents < 0 && !tx.transfer)
      .forEach(tx => { map[tx.category] = (map[tx.category] || 0) - tx.amount_cents; });
    return map;
  }, [txs, effMonth]);

  // orçamento envelope: sobra/estouro do mês anterior ajusta o orçamento (rollover)
  const prevMonth = effMonth ? addMonths(effMonth, -1) : '';
  const prevSpentByCat = useMemo(() => {
    const map = {};
    (txs || []).filter(tx => tx.date.startsWith(prevMonth) && tx.amount_cents < 0 && !tx.transfer)
      .forEach(tx => { map[tx.category] = (map[tx.category] || 0) - tx.amount_cents; });
    return map;
  }, [txs, prevMonth]);
  const prevMonthHasData = useMemo(
    () => (txs || []).some(tx => tx.date.startsWith(prevMonth)), [txs, prevMonth]);
  const effectiveBudget = g => {
    if (!g.rollover || !prevMonthHasData) return { budget: g.limit_cents, carry: 0 };
    const carry = g.limit_cents - (prevSpentByCat[g.category] || 0);
    return { budget: Math.max(g.limit_cents + carry, 0), carry };
  };

  // "pode gastar hoje": só no mês corrente de verdade
  const dailyAllowance = useMemo(() => {
    const now = new Date();
    const realMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (!goals.length || effMonth !== realMonth) return null;
    const totBudget = goals.reduce((s, g) => s + effectiveBudget(g).budget, 0);
    const totSpent = goals.reduce((s, g) => s + (spentByCat[g.category] || 0), 0);
    const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1;
    return { remaining: totBudget - totSpent, perDay: (totBudget - totSpent) / daysLeft, daysLeft };
  }, [goals, effMonth, spentByCat, prevSpentByCat, prevMonthHasData]);

  // evolução: últimos 6 meses com dados
  const evolution = useMemo(() => {
    const asc = [...months].sort().slice(-6);
    return asc.map(ym => {
      const mts = (txs || []).filter(tx => tx.date.startsWith(ym) && !tx.transfer);
      return {
        ym,
        in: mts.filter(tx => tx.amount_cents > 0).reduce((s, tx) => s + tx.amount_cents, 0),
        out: mts.filter(tx => tx.amount_cents < 0).reduce((s, tx) => s - tx.amount_cents, 0),
      };
    });
  }, [txs, months]);

  // Parcelas futuras: compromissos já contratados no cartão.
  //
  // Dois erros moravam aqui, e os dois mentiam sobre dinheiro:
  //
  // 1. ÂNCORA ERRADA. `transactions.date` é a data da COMPRA, repetida em todas
  //    as parcelas — a parcela n não cai em `compra + 1`, cai na fatura em que
  //    foi cobrada. Ancorando na compra e somando 1, os meses projetados caíam
  //    no passado e o filtro `ym <= nowYm` os descartava. Agora a âncora é
  //    `invoice_ref` (competência da fatura, gravada na importação).
  // 2. CONTAGEM DUPLA. Cada parcela já importada carrega o total, então projetar
  //    a partir de TODAS as parcelas da mesma compra soma o mesmo mês futuro
  //    várias vezes (a 1/4 e a 2/4 projetam as mesmas 3/4 e 4/4). Fica só a
  //    parcela mais avançada de cada compra. A chave de agrupamento é
  //    `data da compra + descrição sem o sufixo + total`: é exatamente o que as
  //    parcelas de uma mesma compra têm idêntico no banco.
  const future = useMemo(() => {
    const nowYm = localIsoMonth();
    // compra → parcela mais avançada já importada
    const perPurchase = new Map();
    for (const tx of txs || []) {
      const parc = installmentOf(tx.description);
      if (!parc || tx.amount_cents >= 0) continue;
      const key = `${tx.date}|${stripParcela(tx.description).toLowerCase()}|${parc.total}`;
      const cur = perPurchase.get(key);
      if (!cur || parc.n > cur.parc.n) perPurchase.set(key, { tx, parc });
    }
    const map = {};
    let approx = 0;
    for (const { tx, parc } of perPurchase.values()) {
      // Sem `invoice_ref` (linha importada antes da v4.1, ou parser que não
      // grava competência) o caminho é APROXIMADO: supõe-se que a parcela n caiu
      // na fatura de `compra + n`. A regra foi conferida contra as 28 parcelas do
      // banco real que têm invoice_ref e bate em todas — mas segue suposição, e
      // por isso o total exibido diz quantas linhas foram estimadas assim.
      const anchor = tx.invoice_ref || addMonths(tx.date.slice(0, 7), parc.n);
      if (!tx.invoice_ref) approx++;
      for (let k = 1; k <= parc.total - parc.n; k++) {
        const ym = addMonths(anchor, k);
        if (ym <= nowYm) continue; // já apareceu em fatura importada
        map[ym] = map[ym] || { cents: 0, n: 0 };
        map[ym].cents += -tx.amount_cents;
        map[ym].n++;
      }
    }
    return {
      months: Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).slice(0, 4),
      approx,
    };
  }, [txs]);

  // recorrências: mesma despesa, valor estável, >= 3 meses distintos
  const recurring = useMemo(() => {
    const groups = {};
    for (const tx of txs || []) {
      if (tx.amount_cents >= 0 || tx.transfer) continue;
      const key = stripParcela(tx.description).toLowerCase();
      (groups[key] = groups[key] || []).push(tx);
    }
    const rec = new Map(); // desc → aviso de mudança de valor (ou null)
    for (const [key, list] of Object.entries(groups)) {
      const ms = new Set(list.map(tx => tx.date.slice(0, 7)));
      if (ms.size < 3 || list.length / ms.size > 2) continue;
      const vals = list.map(tx => -tx.amount_cents).sort((a, b) => a - b);
      const median = vals[Math.floor(vals.length / 2)];
      if ((vals[vals.length - 1] - vals[0]) / median > 0.25) continue;
      const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
      const last = -sorted[sorted.length - 1].amount_cents;
      const prev = sorted.length > 1 ? -sorted[sorted.length - 2].amount_cents : last;
      const changed = Math.abs(last - prev) / prev > 0.05
        ? t('dash.recChanged', { prev: fmtMoney(prev), last: fmtMoney(last) }) : null;
      rec.set(key, changed);
    }
    return rec;
  }, [txs]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return monthTxs
      .filter(tx => !q || tx.description.toLowerCase().includes(q))
      .filter(tx => !catFilter || tx.category === catFilter)
      .filter(tx => !typeFilter ||
        (typeFilter === 'in' ? tx.amount_cents > 0 && !tx.transfer :
         typeFilter === 'out' ? tx.amount_cents < 0 && !tx.transfer :
         typeFilter === 'review' ? tx.category === CAT.TO_REVIEW : !!tx.transfer));
  }, [monthTxs, search, catFilter, typeFilter]);

  const reviewCount = useMemo(
    () => (txs || []).filter(tx => tx.category === CAT.TO_REVIEW).length, [txs]);

  if (!txs) return <div className="container"><div className="loading">{t('common.loading')}</div></div>;

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
    !goals.some(g => g.category === c) && !NON_BUDGET_CATEGORIES.includes(c));

  return (
    <div className="container">
      <header>
        <div className="logo"><img src="/icon.svg" alt="" width={30} height={30} style={{ borderRadius: 9 }} />{t('app.name')}</div>
        <AcoesCabecalho>
          <button className="hbtn desk-only" onClick={() => exportCsv(rows)} title={t('export.title')} aria-label={t('export.title')}>⬇<span className="hbtn-label">CSV</span></button>
          <button className="hbtn desk-only" onClick={() => setModal('rules')} title={t('manage.tab.rules')} aria-label={t('manage.tab.rules')}>🧠<span className="hbtn-label">{t('manage.tab.rules')}{rules.length ? ` (${rules.length})` : ''}</span></button>
          <button className="hbtn desk-only" onClick={() => setModal('batches')} title={t('import.batches')} aria-label={t('import.batches')}>🗂<span className="hbtn-label">{t('import.batches')}</span></button>
          <a className="hbtn desk-only" href="/cartoes" title={t('nav.cards')} aria-label={t('nav.cards')} style={{ textDecoration: 'none' }}>💳<span className="hbtn-label">{t('nav.cards')}</span></a>
          <a className="hbtn desk-only" href="/evolucao" title={t('nav.evolution')} aria-label={t('nav.evolution')} style={{ textDecoration: 'none' }}>📈<span className="hbtn-label">{t('nav.evolution')}</span></a>
          <a className="hbtn desk-only" href="/evoluir" title={t('nav.evolve')} aria-label={t('nav.evolve')} style={{ textDecoration: 'none' }}>🌱<span className="hbtn-label">{t('nav.evolve')}</span></a>
          <a className="hbtn desk-only" href="/gerenciar" title={t('nav.manage')} aria-label={t('nav.manage')} style={{ textDecoration: 'none' }}>⚙<span className="hbtn-label">{t('nav.manage')}</span></a>
          <select className="control" value={month} onChange={e => { setMonth(e.target.value); setActiveCat(null); }}>
            <option value="">{t('filter.allPeriod')}</option>
            {months.map(m => <option key={m} value={m}>{fmtMonthLong(m)}</option>)}
          </select>
        </AcoesCabecalho>
      </header>

      <div className="greeting">
        <div>
          <span className="greeting-hello">{saudacao()},</span>{' '}
          <button className="greeting-name" onClick={editName}
            title={t('dash.editNameTitle')}>
            {userName || t('dash.setName')}
          </button>
        </div>
        <div className="btn-row">
          <button className="hbtn" style={{ color: 'var(--red)' }} title={t('dash.shortcutExpense')}
            onClick={() => setQuickAdd('despesa')}>− {t('dash.expense')}</button>
          <button className="hbtn" style={{ color: 'var(--green)' }} title={t('dash.shortcutIncome')}
            onClick={() => setQuickAdd('receita')}>+ {t('dash.incomeEntry')}</button>
        </div>
      </div>

      <div
        className={`dropzone ${drag ? 'dragover' : ''} ${busy ? 'busy' : ''}`}
        onClick={() => fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}
      >
        <div className="dropzone-icon">⇪</div>
        <h3>{busy ? t('import.processing') : t('import.dropzone')}</h3>
        <p>{t('import.hintPrefix')}<b>{t('import.hintClick')}</b>{t('import.hintSuffix')}</p>
        <input ref={fileRef} type="file" multiple accept=".pdf,.ofx,.csv,.txt"
          onChange={e => { upload(e.target.files); e.target.value = ''; }} />
        <div className="progress-bar" style={{ width: `${progress}%` }} />
      </div>

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
        <div className="card">
          <div className="card-label"><span className="dot" style={{ background: 'var(--accent)' }} />{t('dash.balance')}</div>
          <div className={`card-value ${summary.bal >= 0 ? 'pos' : 'neg'}`}>{fmtMoney(summary.bal)}</div>
          <div className="card-sub">{t('dash.balanceSub')}</div>
          {/* Moeda estrangeira aparece SEPARADA, embaixo do saldo, com o próprio
              símbolo. Não é somada nem convertida: o extrato da conta em dólar
              não traz cotação, e aplicar a de hoje a um gasto de julho daria um
              número que nunca existiu. Dois números dizem a verdade; um só
              exigiria inventar a taxa. */}
          {outrasMoedas.map(m => (
            <div key={m.moeda} className="card-sub" style={{ marginTop: 6, color: 'var(--text)' }}>
              <b>{fmtMoneyIn(m.entrada - m.saida, m.moeda)}</b>{' '}
              <span style={{ color: 'var(--muted)' }}>{t('dash.otherCurrency', { n: m.n })}</span>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-label"><span className="dot" style={{ background: 'var(--amber)' }} />{t('dash.projection')}</div>
          <div className="card-value">{summary.proj != null ? fmtMoney(summary.proj) : '—'}</div>
          <div className="card-sub">
            {summary.proj != null ? t('dash.projSub') : t('dash.projNA')}
            {future.months.length > 0 && summary.proj != null ? ` · ${t('dash.projInstallments')}` : ''}
          </div>
        </div>
      </div>

      {insights.length > 0 && (
        <div className="insights-row">
          {insights.map(i => (
            <div key={i.id} className={`insight-card sev-${i.severity}`}>
              <button className="insight-x" title={t('insight.dismiss')}
                onClick={() => dismissInsight(i.id)}>✕</button>
              <div className="insight-title">{i.title}</div>
              <div className="insight-detail">{i.detail}</div>
              {i.action && (i.action.href ? (
                <a className="insight-action" href={i.action.href}
                  style={{ display: 'inline-block', textDecoration: 'none' }}>{i.action.label} →</a>
              ) : (
                <button className="insight-action" onClick={() => {
                  if (i.action.filter?.cat) { setCatFilter(i.action.filter.cat); setTypeFilter(''); }
                  if (i.action.filter?.search) setSearch(i.action.filter.search);
                }}>{i.action.label} →</button>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="grid">
        <div className="left-col">
          <div className="panel">
            <div className="panel-head"><h2>{t('dash.byCategory')}</h2></div>
            {donut.entries.length === 0 ? (
              <div className="empty">{t('dash.noSpending')}</div>
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
                      <div className="t">{fmtMoney(activeCat ? (donut.entries.find(([c]) => c === activeCat)?.[1] || 0) : donut.total)}</div>
                      <div className="s">{activeCat ? labelOf(activeCat) : t('dash.totalSpent')}</div>
                    </div>
                  </div>
                </div>
                <div className="legend">
                  {donut.entries.map(([cat, val]) => (
                    <button key={cat} className="legend-item"
                      style={{ opacity: activeCat && activeCat !== cat ? .4 : 1 }}
                      onClick={() => setActiveCat(a => a === cat ? null : cat)}>
                      <span className="dot" style={{ background: categories[cat] }} />
                      <span className="name">{emojis[cat] ? `${emojis[cat]} ` : ''}{labelOf(cat)}</span>
                      <span className="val">{fmtMoney(val)}</span>
                      <span className="pct">{(val / donut.total * 100).toFixed(0)}%</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>{t('dash.budget')}{effMonth ? ` · ${fmtMonthLong(effMonth)}` : ''}</h2>
              <a className="hbtn" style={{ height: 26, fontSize: 11.5, textDecoration: 'none' }}
                href={`/relatorio?mes=${effMonth}`}>📄 {t('report.title')}</a>
            </div>
            <div className="panel-body">
              {dailyAllowance && (
                <div style={{
                  background: 'var(--surface-2)', borderRadius: 10, padding: '10px 12px',
                  marginBottom: 12, fontSize: 13,
                }}>
                  {dailyAllowance.remaining >= 0 ? (
                    <>{t('dash.allowancePrefix')} <b style={{ color: 'var(--green)' }}>{t('dash.allowancePerDay', { v: fmtMoney(Math.floor(dailyAllowance.perDay)) })}</b>
                    <span style={{ color: 'var(--muted)' }}> · {t('dash.allowanceRest', { v: fmtMoney(dailyAllowance.remaining), n: dailyAllowance.daysLeft })}</span></>
                  ) : (
                    <>{t('dash.overrunPrefix')} <b style={{ color: 'var(--red)' }}>{fmtMoney(-dailyAllowance.remaining)}</b>
                    <span style={{ color: 'var(--muted)' }}> — {t('dash.overrunNote')}</span></>
                  )}
                </div>
              )}
              {goals.length === 0 && (
                <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 4 }}>
                  {t('dash.goalsHelp')}
                </div>
              )}
              {goals.map(g => {
                const spent = spentByCat[g.category] || 0;
                const { budget, carry } = effectiveBudget(g);
                const base = budget || 1;
                const pct = Math.min(spent / base * 100, 100);
                const realPct = spent / base * 100;
                return (
                  <div key={g.category}>
                    <div className="goal-row">
                      <span className="name">
                        <span className="dot" style={{ background: categories[g.category] }} />
                        {emojis[g.category] ? `${emojis[g.category]} ` : ''}{labelOf(g.category)}
                        <button className="goal-del"
                          title={g.rollover
                            ? `${t('dash.rolloverOn')}${carry ? ` ${t('dash.rolloverCarry', { sign: carry > 0 ? '+' : '', v: fmtMoney(carry) })}` : ''}`
                            : t('dash.rolloverOff')}
                          style={{ color: g.rollover ? 'var(--accent)' : 'var(--muted)', opacity: g.rollover ? 1 : .5 }}
                          onClick={() => saveGoal(g.category, (g.limit_cents / 100).toFixed(2).replace('.', ','), !g.rollover)}>↻</button>
                      </span>
                      <span className="nums" title={carry
                        ? t('dash.goalCarryTitle', { goal: fmtMoney(g.limit_cents), sign: carry > 0 ? '+' : '−', carry: fmtMoney(Math.abs(carry)) })
                        : undefined}>
                        {fmtMoney(spent)} / {fmtMoney(budget)} ({realPct.toFixed(0)}%)
                      </span>
                      <button className="goal-del" title={t('dash.removeGoal')}
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
                  <option value="">{t('common.categoryPick')}</option>
                  {noGoalCats.map(c => <option key={c} value={c}>{labelOf(c)}</option>)}
                </select>
                <input placeholder={t('dash.goalPlaceholder', { symbol: currencySymbol() })} value={goalVal}
                  onChange={e => setGoalVal(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveGoal(goalCat, goalVal)} />
                <button onClick={() => saveGoal(goalCat, goalVal)}>+</button>
              </div>
            </div>
          </div>

          {upcomingBills.length > 0 && (
            <div className="panel">
              <div className="panel-head">
                <h2>{t('dash.upcoming')}</h2>
                <a href="/gerenciar?tab=apagar" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}>{t('dash.manageLink')}</a>
              </div>
              <div className="panel-body">
                {upcomingBills.map(o => (
                  <div className="future-row" key={`${o.bill_id}:${o.ref}`}>
                    <span>
                      {emojis[o.category] ? `${emojis[o.category]} ` : ''}{o.description}
                      <span style={{ color: o.status === 'atrasada' ? 'var(--red)' : 'var(--muted)', fontSize: 11.5, marginLeft: 6 }}>
                        {o.status === 'atrasada' ? `${t('bills.lateShort')} · ` : ''}{t('bills.dueShort', { d: fmtDayMonth(o.due_date) })}
                      </span>
                    </span>
                    <span className="v">
                      {fmtMoney(o.amount_cents)}
                      <button className="goal-del" title={t('bills.markPaid')} style={{ marginLeft: 6, color: 'var(--green)' }}
                        onClick={() => payBill(o)}>✓</button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {evolution.length > 1 && (
            <div className="panel">
              <div className="panel-head"><h2>{t('dash.evolution')}</h2></div>
              <div className="panel-body">
                <svg width="100%" height="110" viewBox={`0 0 ${evolution.length * 52} 110`} preserveAspectRatio="none">
                  {evolution.map((e, i) => (
                    <g key={e.ym}>
                      <rect x={i * 52 + 8} y={100 - e.in / evoMax * 92} width="16" rx="3"
                        height={Math.max(e.in / evoMax * 92, 2)} fill="var(--green)" opacity=".85">
                        <title>{t('dash.evoIn', { m: fmtMonthShort(e.ym), v: fmtMoney(e.in) })}</title>
                      </rect>
                      <rect x={i * 52 + 28} y={100 - e.out / evoMax * 92} width="16" rx="3"
                        height={Math.max(e.out / evoMax * 92, 2)} fill="var(--red)" opacity=".85">
                        <title>{t('dash.evoOut', { m: fmtMonthShort(e.ym), v: fmtMoney(e.out) })}</title>
                      </rect>
                    </g>
                  ))}
                </svg>
                <div className="evo-labels">
                  {evolution.map(e => <span key={e.ym}>{fmtMonthShort(e.ym)}</span>)}
                </div>
              </div>
            </div>
          )}

          {future.months.length > 0 && (
            <div className="panel">
              <div className="panel-head"><h2>{t('dash.future')}</h2></div>
              <div className="panel-body">
                {future.months.map(([ym, f]) => (
                  <div className="future-row" key={ym}>
                    <span>{fmtMonthLong(ym)}</span>
                    <span className="v">{fmtMoney(f.cents)} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({f.n}x)</span></span>
                  </div>
                ))}
                <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8 }}>
                  {t('dash.futureNote')}
                  {/* Quantas linhas foram estimadas por data em vez de lidas da
                      competência da fatura: em dinheiro, o grau de certeza faz
                      parte do número. */}
                  {future.approx > 0 ? ` ${tn(future.approx, 'dash.futureApprox')}` : ''}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-head" style={{ paddingBottom: 14 }}>
            <h2>{t('dash.transactions')} <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 13 }}>· {rows.length}</span></h2>
            {reviewCount > 0 && (
              <button style={{ border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--amber)', borderRadius: 10, padding: '6px 12px', fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit' }}
                title={t('review.buttonTitle')}
                onClick={() => setShowReview(true)}>
                ⚠ {t('dash.toReviewBtn', { n: reviewCount })}
              </button>
            )}
          </div>
          <div className="filters">
            <div className="search">🔍<input placeholder={t('filter.searchDesc')} value={search} onChange={e => setSearch(e.target.value)} /></div>
            <select className="control" value={catFilter} onChange={e => setCatFilter(e.target.value)}>
              <option value="">{t('filter.allCategories')}</option>
              {Object.keys(categories).map(c => <option key={c} value={c}>{labelOf(c)}</option>)}
            </select>
            <select className="control" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="">{t('filter.allTypes')}</option>
              <option value="out">{t('filter.onlyOut')}</option>
              <option value="in">{t('filter.onlyIn')}</option>
              <option value="trf">{t('cat.transfers')}</option>
              <option value="review">{t('cat.to_review')}</option>
            </select>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>{t('common.date')}</th><th>{t('common.description')}</th><th>{t('common.category')}</th><th style={{ textAlign: 'right' }}>{t('common.value')}</th></tr></thead>
              <tbody>
                {rows.slice(0, limit).map(tx => {
                  const color = categories[tx.category] || '#999';
                  const recKey = stripParcela(tx.description).toLowerCase();
                  const isRec = tx.amount_cents < 0 && !tx.transfer && recurring.has(recKey);
                  const recWarn = isRec ? recurring.get(recKey) : null;
                  return (
                    <tr key={tx.id}>
                      <td style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{fmtDayMonth(tx.date)}</td>
                      <td className="desc">
                        {tx.description}
                        {isRec && <span className="rec-badge" title={recWarn || t('dash.recurring')}>{recWarn ? '↻⚠️' : '↻'}</span>}
                        <small>{tx.source}</small>
                      </td>
                      <td>
                        <select className="badge-select" value={tx.category}
                          style={{
                            background: `${color}22`, color,
                            outline: tx.category === CAT.TO_REVIEW ? `1.5px dashed ${color}88` : 'none',
                          }}
                          onChange={e => changeCategory(tx, e.target.value)}>
                          {Object.keys(categories).map(c => (
                            <option key={c} value={c}>{emojis[c] ? `${emojis[c]} ` : ''}{labelOf(c)}</option>
                          ))}
                        </select>
                      </td>
                      <td className={`amount ${tx.transfer ? 'trf' : tx.amount_cents > 0 ? 'in' : 'out'}`}>
                        {tx.amount_cents > 0 ? '+' : ''}{fmtMoney(tx.amount_cents)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {/* Três situações que pareciam a mesma e têm saídas diferentes:
                 · banco vazio      → arrastar o primeiro extrato
                 · mês sem lançamento → trocar o período
                 · filtro sem resultado → limpar o filtro
                Antes as três mostravam "Nenhuma transação encontrada", que é
                verdade e não ajuda ninguém a sair do lugar. */}
            {rows.length === 0 && (
              txs.length === 0 ? (
                <EstadoVazio inline icone="📄"
                  titulo={t('empty.dashTitle')}
                  texto={t('empty.dashText')}
                  nota={t('empty.dashPrivacy')}
                  acao={{ label: t('empty.dashAction'), onClick: () => fileRef.current?.click() }} />
              ) : (search || catFilter || typeFilter) ? (
                <EstadoVazio inline icone="🔍"
                  titulo={t('empty.searchTitle')}
                  texto={t('empty.searchText')}
                  acao={{
                    label: t('empty.searchAction'),
                    onClick: () => { setSearch(''); setCatFilter(''); setTypeFilter(''); },
                  }} />
              ) : (
                <EstadoVazio inline icone="📅"
                  titulo={t('empty.monthTitle', { month: month ? fmtMonthLong(month) : '' })}
                  texto={t('empty.monthText')}
                  acao={{ label: t('empty.monthAction'), onClick: () => setMonth('') }} />
              )
            )}
            {rows.length > limit && (
              <div className="pager">
                <button onClick={() => setLimit(l => l + 100)}>{t('common.showMore', { n: rows.length - limit })}</button>
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
                <h3>{modal === 'rules' ? t('manage.rulesTitle') : t('import.batches')}</h3>
                <p>{modal === 'rules' ? t('manage.rulesHelp') : t('import.batchesHelp')}</p>
              </div>
              <button className="modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              {modal === 'rules' && (rules.length === 0
                ? <EstadoVazio inline icone="🧠" titulo={t('empty.rulesTitle')} texto={t('empty.rulesText')} />
                : rules.map(r => (
                  <div className="list-row" key={r.id}>
                    <div className="grow">
                      <div style={{ fontWeight: 500 }}>"{r.pattern}"</div>
                      <div className="sub">{t('manage.ruleSub')}</div>
                    </div>
                    <select className="control" value={r.category} onChange={e => editRule(r, e.target.value)}>
                      {Object.keys(categories).map(c => <option key={c} value={c}>{labelOf(c)}</option>)}
                    </select>
                    <button className="danger-btn" onClick={() => deleteRule(r)}>{t('common.delete')}</button>
                  </div>
                )))}
              {modal === 'batches' && (batches.length === 0
                ? <EstadoVazio inline icone="🗂" titulo={t('empty.batchesTitle')} texto={t('empty.batchesText')} />
                : batches.map(b => (
                  <div className="list-row" key={b.id}>
                    <div className="grow">
                      <div style={{ fontWeight: 500 }}>{b.file_name}</div>
                      <div className="sub">{t('import.batchSub', { kind: b.kind, inserted: b.inserted, skipped: b.skipped, at: b.imported_at })}</div>
                    </div>
                    <button className="danger-btn" onClick={() => undoBatch(b)}>↩ {t('common.undo')}</button>
                  </div>
                )))}
            </div>
          </div>
        </div>
      )}

      {quickAdd && (
        <LancamentoRapido tipo={quickAdd} categories={categories} emojis={emojis} label={labelOf}
          onClose={() => setQuickAdd(null)}
          onDone={async r => {
            if (r.error) { toast(r.error, '⚠️', true); return; }
            setQuickAdd(null);
            toast(r.msg, '✅');
            await load();
          }} />
      )}

      {showReview && (
        <RevisaoMassa txs={txs} categories={categories} label={labelOf}
          onClose={() => setShowReview(false)}
          onDone={async r => {
            if (r.error) toast(r.error, '⚠️', true);
            else toast(r.msg, '🧠');
            await load();
          }} />
      )}

      <div className="toasts">
        {toasts.map(to => (
          <div key={to.id} className={`toast ${to.err ? 'err' : ''}`}>
            <span className="ico">{to.ico}</span><span>{to.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
