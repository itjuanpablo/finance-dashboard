'use client';

import { useEffect, useMemo, useState } from 'react';
import ContasAPagar from '@/components/ContasAPagar';
import EstadoVazio from '@/components/EstadoVazio';
import DividirLancamento from '@/components/DividirLancamento';
import SeletorIdioma from '@/components/SeletorIdioma';
import { configurePin } from '@/components/PinGate';
import { t, tn } from '@/lib/i18n';
import { CAT } from '@/lib/categories';
import { stripInstallment } from '@/lib/parsers/labels';
import {
  fmtMoney, fmtDate, fmtMonthLong, currencySymbol, parseAmountToCents,
} from '@/lib/format';

const PALETTE = ['#f97316', '#3b82f6', '#8b5cf6', '#ec4899', '#a855f7', '#06b6d4',
  '#14b8a6', '#eab308', '#f43f5e', '#22c55e', '#64748b', '#94a3b8'];
const TABS = [
  ['lancamentos', '☰', 'manage.tab.tx'],
  ['categorias', '🏷', 'manage.tab.cats'],
  ['contas', '💳', 'manage.tab.accounts'],
  ['apagar', '📅', 'bills.title'],
  ['regras', '🧠', 'manage.tab.rules'],
  ['importacoes', '🗂', 'import.batches'],
];

let toastId = 0;

async function api(url, method, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

// Célula editável: clique → input; Enter/blur salva, Esc cancela.
function EditableCell({ value, display, onSave, width }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  if (!editing) {
    return (
      <span className="cell-editable" title={t('manage.clickToEdit')}
        onClick={() => { setDraft(value); setEditing(true); }}>
        {display ?? value}
      </span>
    );
  }
  const commit = () => { setEditing(false); if (draft !== value) onSave(draft); };
  return (
    <input className="inline-edit" style={width ? { width } : undefined} autoFocus
      value={draft} onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setEditing(false);
      }} />
  );
}

export default function Gerenciar() {
  const [tab, setTab] = useState('lancamentos');
  const [txs, setTxs] = useState(null);
  const [colors, setColors] = useState({});
  const [cats, setCats] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [knownSources, setKnownSources] = useState([]);
  const [cards, setCards] = useState([]);
  const [rules, setRules] = useState([]);
  const [batches, setBatches] = useState([]);
  const [toasts, setToasts] = useState([]);

  const toast = (msg, ico = '✓', undoFn = null, err = false) => {
    const id = ++toastId;
    setToasts(list => [...list, { id, msg, ico, undoFn, err }]);
    setTimeout(() => setToasts(list => list.filter(x => x.id !== id)), undoFn ? 8000 : 4200);
  };

  async function loadAll() {
    const [tx, c, a, cd, r, b] = await Promise.all([
      fetch('/api/transactions').then(x => x.json()),
      fetch('/api/categories').then(x => x.json()),
      fetch('/api/accounts').then(x => x.json()),
      fetch('/api/cards').then(x => x.json()),
      fetch('/api/rules').then(x => x.json()),
      fetch('/api/batches').then(x => x.json()),
    ]);
    setTxs(tx.transactions); setColors(tx.categories);
    setCats(c.categories);
    setAccounts(a.accounts); setKnownSources(a.knownSources);
    setCards(cd.cards);
    setRules(r.rules); setBatches(b.batches);
  }

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('tab');
    if (p && TABS.some(([k]) => k === p)) setTab(p);
    loadAll();
  }, []);

  const switchTab = k => {
    setTab(k);
    const url = new URL(window.location);
    url.searchParams.set('tab', k);
    window.history.replaceState(null, '', url);
  };

  if (!txs) return <div className="container"><div className="loading">{t('common.loading')}</div></div>;

  // categoria é chave: os seletores levam `key` no value e `label` no texto
  const activeCats = cats.filter(c => !c.archived);
  const labelOf = key => cats.find(c => c.key === key)?.label ?? key;

  return (
    <div className="container">
      <header>
        <div className="logo" style={{ gap: 14 }}>
          <a href="/" className="hbtn desk-only" title={t('nav.dashboard')} aria-label={t('nav.dashboard')} style={{ textDecoration: 'none' }}>←<span className="hbtn-label">{t('nav.dashboard')}</span></a>
          <span><img src="/icon.svg" alt="" width={26} height={26} style={{ borderRadius: 8, verticalAlign: 'middle', marginRight: 8 }} />{t('nav.manage')}</span>
        </div>
        <SeletorIdioma />
        <button className="theme-toggle" title={t('pin.configTitle')} onClick={async () => {
          const msg = await configurePin();
          if (msg) alert(msg);
        }} style={{ marginRight: 8 }}>🔒</button>
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

      <div className="manage-layout">
        <nav className="manage-side">
          {TABS.map(([k, ico, labelKey]) => (
            <button key={k} className={`side-item ${tab === k ? 'active' : ''}`}
              onClick={() => switchTab(k)}>
              <span>{ico}</span>{t(labelKey)}
              {k === 'regras' && rules.length > 0 && <span style={{ marginLeft: 'auto', fontSize: 11.5 }}>{rules.length}</span>}
            </button>
          ))}
        </nav>

        <div className="manage-content">
          {tab === 'lancamentos' && (
            <Lancamentos txs={txs} colors={colors} activeCats={activeCats} labelOf={labelOf}
              accounts={accounts} toast={toast} reload={loadAll} />
          )}
          {tab === 'categorias' && (
            <Categorias cats={cats} toast={toast} reload={loadAll} />
          )}
          {tab === 'contas' && (
            <Contas accounts={accounts} cards={cards} knownSources={knownSources}
              toast={toast} reload={loadAll} />
          )}
          {tab === 'apagar' && (
            <ContasAPagar cats={cats} toast={toast} />
          )}
          {tab === 'regras' && (
            <div className="panel">
              <div className="panel-head" style={{ paddingBottom: 12 }}>
                <div>
                  <h2>{t('manage.rulesTitle')}</h2>
                  <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                    {t('manage.rulesHelp')}
                  </p>
                </div>
              </div>
              <div className="panel-body">
                {rules.length === 0
                  ? <EstadoVazio inline icone="🧠" titulo={t('empty.rulesTitle')} texto={t('empty.rulesText')} />
                  : rules.map(r => (
                    <div className="list-row" key={r.id}>
                      <div className="grow">
                        <div style={{ fontWeight: 500 }}>"{r.pattern}"</div>
                        <div className="sub">{t('manage.ruleSub')}</div>
                      </div>
                      <select className="control" value={r.category}
                        onChange={async e => {
                          await api('/api/rules', 'POST', { pattern: r.pattern, category: e.target.value });
                          await loadAll();
                        }}>
                        {activeCats.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                      </select>
                      <button className="danger-btn" onClick={async () => {
                        await api('/api/rules', 'DELETE', { id: r.id });
                        toast(t('manage.ruleRemoved', { pattern: r.pattern.slice(0, 40) }), '🗑');
                        await loadAll();
                      }}>{t('common.delete')}</button>
                    </div>
                  ))}
              </div>
            </div>
          )}
          {tab === 'importacoes' && (
            <div className="panel">
              <div className="panel-head" style={{ paddingBottom: 12 }}>
                <div>
                  <h2>{t('import.batches')}</h2>
                  <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                    {t('import.batchesHelp')}
                  </p>
                </div>
              </div>
              <div className="panel-body">
                {batches.length === 0
                  ? <EstadoVazio inline icone="🗂" titulo={t('empty.batchesTitle')} texto={t('empty.batchesText')} />
                  : batches.map(b => (
                    <div className="list-row" key={b.id}>
                      <div className="grow">
                        <div style={{ fontWeight: 500 }}>{b.file_name}</div>
                        <div className="sub">{t('import.batchSub', { kind: b.kind, inserted: b.inserted, skipped: b.skipped, at: b.imported_at })}</div>
                      </div>
                      <button className="danger-btn" onClick={async () => {
                        if (!confirm(t('import.undoConfirm', { file: b.file_name, n: b.inserted }))) return;
                        const d = await api('/api/batches', 'DELETE', { id: b.id });
                        toast(d.error || t('import.undone', { n: d.removed }), d.error ? '⚠️' : '↩️', null, !!d.error);
                        await loadAll();
                      }}>↩ {t('common.undo')}</button>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="toasts">
        {toasts.map(to => (
          <div key={to.id} className={`toast ${to.err ? 'err' : ''}`}>
            <span className="ico">{to.ico}</span><span>{to.msg}</span>
            {to.undoFn && (
              <button className="hbtn" style={{ height: 28, fontSize: 12 }}
                onClick={async () => {
                  setToasts(x => x.filter(y => y.id !== to.id));
                  await to.undoFn();
                }}>{t('common.undo')}</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══ Lançamentos ═══════════════════════════════════════
function Lancamentos({ txs, colors, activeCats, labelOf, accounts, toast, reload }) {
  const [dividindo, setDividindo] = useState(null); // lançamento sendo dividido
  const [month, setMonth] = useState('');
  const [cat, setCat] = useState('');
  const [type, setType] = useState('');
  const [account, setAccount] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [lastIdx, setLastIdx] = useState(null);
  const [limit, setLimit] = useState(80);
  const [bulkCat, setBulkCat] = useState('');

  const months = useMemo(
    () => [...new Set(txs.map(tx => tx.date.slice(0, 7)))].sort().reverse(), [txs]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return txs
      .filter(tx => !month || tx.date.startsWith(month))
      .filter(tx => !cat || tx.category === cat)
      .filter(tx => !account || String(tx.account_id) === account)
      .filter(tx => !q || tx.description.toLowerCase().includes(q))
      .filter(tx => !type ||
        (type === 'in' ? tx.amount_cents > 0 && !tx.transfer :
         type === 'out' ? tx.amount_cents < 0 && !tx.transfer :
         type === 'review' ? tx.category === CAT.TO_REVIEW : !!tx.transfer));
  }, [txs, month, cat, type, account, search]);

  const visible = rows.slice(0, limit);

  const patch = async (id, body, undoBody, label) => {
    const d = await api('/api/transactions', 'PATCH', { id, ...body });
    if (d.error) return toast(d.error, '⚠️', null, true);
    toast(label || t('manage.changed'), '✓', undoBody
      ? async () => { await api('/api/transactions', 'PATCH', { id, ...undoBody }); await reload(); }
      : null);
    await reload();
  };

  const toggleRow = (tx, idx, shift) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (shift && lastIdx != null) {
        const [a, b] = [Math.min(lastIdx, idx), Math.max(lastIdx, idx)];
        const turnOn = !prev.has(tx.id);
        for (let i = a; i <= b; i++) {
          turnOn ? next.add(visible[i].id) : next.delete(visible[i].id);
        }
      } else {
        next.has(tx.id) ? next.delete(tx.id) : next.add(tx.id);
      }
      return next;
    });
    setLastIdx(idx);
  };

  const bulk = async (action, value, label) => {
    const ids = [...selected];
    const d = await api('/api/transactions/bulk', 'POST', { ids, action, value });
    if (d.error) return toast(d.error, '⚠️', null, true);
    const undo = action === 'delete'
      ? async () => { await api('/api/transactions/bulk', 'POST', { ids, action: 'undelete' }); await reload(); }
      : null;
    toast(t('manage.bulkDone', { n: d.changed, what: label }), '✓', undo);
    setSelected(new Set());
    await reload();
  };

  const allVisibleSelected = visible.length > 0 && visible.every(tx => selected.has(tx.id));

  return (
    <div className="panel">
      <div className="panel-head" style={{ paddingBottom: 12 }}>
        <h2>{t('manage.tab.tx')} <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 13 }}>· {rows.length}</span></h2>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t('manage.txHint')}</span>
      </div>
      <div className="filters">
        <select className="control" value={month} onChange={e => setMonth(e.target.value)}>
          <option value="">{t('filter.allPeriod')}</option>
          {months.map(m => <option key={m} value={m}>{fmtMonthLong(m)}</option>)}
        </select>
        <select className="control" value={cat} onChange={e => setCat(e.target.value)}>
          <option value="">{t('filter.allCategories')}</option>
          {activeCats.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <select className="control" value={type} onChange={e => setType(e.target.value)}>
          <option value="">{t('filter.allTypes')}</option>
          <option value="out">{t('filter.onlyOut')}</option>
          <option value="in">{t('filter.onlyIn')}</option>
          <option value="trf">{t('cat.transfers')}</option>
          <option value="review">{t('cat.to_review')}</option>
        </select>
        {accounts.length > 0 && (
          <select className="control" value={account} onChange={e => setAccount(e.target.value)}>
            <option value="">{t('filter.allAccounts')}</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        <div className="search">🔍<input placeholder={t('common.searchPlaceholder')} value={search} onChange={e => setSearch(e.target.value)} /></div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr>
            <th style={{ width: 30 }}>
              <input type="checkbox" checked={allVisibleSelected}
                onChange={() => setSelected(prev => {
                  const next = new Set(prev);
                  allVisibleSelected
                    ? visible.forEach(tx => next.delete(tx.id))
                    : visible.forEach(tx => next.add(tx.id));
                  return next;
                })} />
            </th>
            <th>{t('common.date')}</th><th>{t('common.description')}</th><th>{t('common.category')}</th>
            <th style={{ textAlign: 'right' }}>{t('common.value')}</th>
          </tr></thead>
          <tbody>
            {visible.map((tx, idx) => {
              const color = colors[tx.category] || '#999';
              const edited = tx.original_date != null || tx.original_description != null || tx.original_amount_cents != null;
              return (
                <tr key={tx.id} style={selected.has(tx.id) ? { background: 'var(--accent-soft)' } : undefined}>
                  <td>
                    <input type="checkbox" checked={selected.has(tx.id)}
                      onClick={e => toggleRow(tx, idx, e.shiftKey)} onChange={() => {}} />
                  </td>
                  <td style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    <EditableCell value={tx.date} width={110}
                      display={fmtDate(tx.date)}
                      onSave={v => patch(tx.id, { date: v.trim() }, { date: tx.date }, t('manage.dateChanged'))} />
                  </td>
                  <td className="desc">
                    <EditableCell value={tx.description}
                      onSave={v => patch(tx.id, { description: v }, { description: tx.description }, t('manage.descChanged'))} />
                    {edited && (
                      <span className="edited-mark" title={t('manage.editedTitle')}
                        onClick={() => patch(tx.id, { restore: true }, null, t('manage.origRestored'))}>· {t('manage.editedMark')}</span>
                    )}
                    <small>{tx.source}</small>
                  </td>
                  <td>
                    <select className="badge-select" value={tx.category}
                      style={{
                        background: `${color}22`, color,
                        outline: tx.category === CAT.TO_REVIEW ? `1.5px dashed ${color}88` : 'none',
                      }}
                      onChange={e => patch(tx.id, {
                        category: e.target.value,
                        createRule: tx.category === CAT.TO_REVIEW,
                        pattern: stripInstallment(tx.description),
                      }, { category: tx.category }, t('manage.catChanged', { cat: labelOf(e.target.value) }))}>
                      {activeCats.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select>
                  </td>
                  <td className={`amount ${tx.transfer ? 'trf' : tx.amount_cents > 0 ? 'in' : 'out'}`}>
                    <EditableCell value={(tx.amount_cents / 100).toFixed(2).replace('.', ',')} width={90}
                      display={`${tx.amount_cents > 0 ? '+' : ''}${fmtMoney(tx.amount_cents)}`}
                      onSave={v => {
                        const cents = parseAmountToCents(v);
                        if (cents == null || cents === 0) return toast(t('common.invalidAmount'), '⚠️', null, true);
                        patch(tx.id, { amount_cents: cents }, { amount_cents: tx.amount_cents }, t('manage.amountChanged'));
                      }} />
                    <button className="split-btn" title={t('split.title')}
                      aria-label={t('split.title')}
                      onClick={() => setDividindo(tx)}>⑂</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {dividindo && (
          <DividirLancamento tx={dividindo} cats={activeCats} labelOf={labelOf}
            onClose={() => setDividindo(null)}
            onDone={async (msg) => { setDividindo(null); toast(msg, '⑂'); await reload(); }} />
        )}
        {rows.length === 0 && <EstadoVazio inline icone="🔍"
          titulo={t('empty.searchTitle')} texto={t('empty.searchText')} />}
        {rows.length > limit && (
          <div className="pager">
            <button onClick={() => setLimit(l => l + 200)}>{t('common.showMore', { n: rows.length - limit })}</button>
          </div>
        )}
      </div>
      {selected.size > 0 && (
        <div className="bulk-bar">
          <b>{tn(selected.size, 'manage.selected')}</b>
          <select className="control" value={bulkCat} onChange={e => setBulkCat(e.target.value)}>
            <option value="">{t('manage.bulkCat')}</option>
            {activeCats.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <button className="hbtn" style={{ height: 30 }} disabled={!bulkCat}
            onClick={() => bulkCat && bulk('category', bulkCat, labelOf(bulkCat))}>{t('common.apply')}</button>
          <button className="danger-btn" onClick={() => {
            if (selected.size > 10 && !confirm(t('manage.bulkDeleteConfirm', { n: selected.size }))) return;
            bulk('delete', null, t('manage.bulkDeleted'));
          }}>{t('common.delete')}</button>
          <button className="hbtn" style={{ height: 30 }} onClick={() => setSelected(new Set())}>✕</button>
        </div>
      )}
    </div>
  );
}

// ═══ Categorias ════════════════════════════════════════
function Categorias({ cats, toast, reload }) {
  const [editing, setEditing] = useState(null); // id em edição
  const [draft, setDraft] = useState({});
  const [deleting, setDeleting] = useState(null); // id em fluxo de exclusão
  const [moveTo, setMoveTo] = useState('');
  const [adding, setAdding] = useState(false);

  const active = cats.filter(c => !c.archived);
  const archived = cats.filter(c => c.archived);

  const save = async () => {
    const d = await api('/api/categories', editing === 'new' ? 'POST' : 'PATCH',
      editing === 'new' ? draft : { id: editing, ...draft });
    if (d.error) return toast(d.error, '⚠️', null, true);
    setEditing(null); setAdding(false);
    toast(editing === 'new' ? t('manage.catCreated') : t('manage.catUpdated'));
    await reload();
  };

  const Editor = () => (
    <div className="cat-editor">
      <div style={{ display: 'flex', gap: 8 }}>
        <input style={{ width: 54, textAlign: 'center' }} placeholder="🏷" maxLength={4}
          value={draft.emoji ?? ''} onChange={e => setDraft(x => ({ ...x, emoji: e.target.value }))} />
        <input style={{ flex: 1 }} placeholder={t('manage.catName')} autoFocus
          value={draft.name ?? ''} onChange={e => setDraft(x => ({ ...x, name: e.target.value }))}
          onKeyDown={e => e.key === 'Enter' && save()} />
      </div>
      <div className="swatches">
        {PALETTE.map(c => (
          <button key={c} className={`swatch ${draft.color === c ? 'sel' : ''}`}
            style={{ background: c }} onClick={() => setDraft(x => ({ ...x, color: c }))} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="hbtn" onClick={() => { setEditing(null); setAdding(false); }}>{t('common.cancel')}</button>
        <button className="hbtn" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
          onClick={save}>{t('common.save')}</button>
      </div>
    </div>
  );

  return (
    <div className="panel">
      <div className="panel-head" style={{ paddingBottom: 12 }}>
        <h2>{t('manage.tab.cats')}</h2>
        <button className="hbtn" onClick={() => {
          setAdding(true); setEditing('new');
          setDraft({ name: '', color: PALETTE[0], emoji: '' });
        }}>+ {t('manage.newCat')}</button>
      </div>
      <div className="panel-body">
        {adding && editing === 'new' && <Editor />}
        {active.map(c => (
          <div key={c.id}>
            <div className="list-row">
              <span className="dot" style={{ background: c.color, width: 10, height: 10 }} />
              <span style={{ width: 24, textAlign: 'center' }}>{c.emoji}</span>
              <div className="grow">
                <div style={{ fontWeight: 500 }}>{c.label}{c.system && <span style={{ color: 'var(--muted)', fontSize: 11, marginLeft: 6 }}>({t('manage.systemTag')})</span>}</div>
                <div className="sub">
                  {tn(c.txCount, 'manage.txCount')}{c.monthlyAvg > 0 ? ` · ${t('manage.perMonth', { v: fmtMoney(c.monthlyAvg) })}` : ''}{c.rulesCount ? ` · ${tn(c.rulesCount, 'manage.rulesCount')}` : ''}
                </div>
              </div>
              <button className="hbtn" style={{ height: 30 }} onClick={() => {
                setEditing(c.id); setAdding(false);
                // parte do nome visível: renomear canônica desliga a tradução (v4)
                setDraft({ name: c.label, color: c.color, emoji: c.emoji });
              }}>{t('common.edit')}</button>
              {!c.system && (
                <>
                  <button className="hbtn" style={{ height: 30 }} title={t('manage.archiveTitle')}
                    onClick={async () => {
                      await api('/api/categories', 'PATCH', { id: c.id, archived: true });
                      toast(t('manage.catArchived', { name: c.label }), '📦');
                      await reload();
                    }}>{t('common.archive')}</button>
                  <button className="danger-btn" onClick={() => { setDeleting(c.id); setMoveTo(''); }}>{t('common.delete')}</button>
                </>
              )}
            </div>
            {editing === c.id && <Editor />}
            {deleting === c.id && (
              <div className="cat-editor" style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13 }}>
                  {c.txCount > 0 ? t('manage.moveTxTo', { n: c.txCount }) : t('manage.deleteEmptyCat')}
                </span>
                {c.txCount > 0 && (
                  <select className="control" value={moveTo} onChange={e => setMoveTo(e.target.value)}>
                    <option value="">{t('manage.choose')}</option>
                    {active.filter(x => x.id !== c.id).map(x => <option key={x.id} value={x.key}>{x.label}</option>)}
                  </select>
                )}
                <button className="danger-btn" disabled={c.txCount > 0 && !moveTo}
                  onClick={async () => {
                    const d = await api('/api/categories', 'DELETE', { id: c.id, moveTo });
                    if (d.error) return toast(d.error, '⚠️', null, true);
                    setDeleting(null);
                    const dest = active.find(x => x.key === moveTo)?.label ?? moveTo;
                    toast(d.moved
                      ? t('manage.catDeletedMoved', { n: d.moved, dest })
                      : t('manage.catDeleted'), '🗑');
                    await reload();
                  }}>{t('manage.confirmDelete')}</button>
                <button className="hbtn" style={{ height: 30 }} onClick={() => setDeleting(null)}>{t('common.cancel')}</button>
              </div>
            )}
          </div>
        ))}
        {archived.length > 0 && <div className="section-title">{t('manage.archivedSection')}</div>}
        {archived.map(c => (
          <div className="list-row" key={c.id} style={{ opacity: .6 }}>
            <span className="dot" style={{ background: c.color, width: 10, height: 10 }} />
            <span style={{ width: 24, textAlign: 'center' }}>{c.emoji}</span>
            <div className="grow"><div>{c.label}</div><div className="sub">{tn(c.txCount, 'manage.txCount')}</div></div>
            <button className="hbtn" style={{ height: 30 }} onClick={async () => {
              await api('/api/categories', 'PATCH', { id: c.id, archived: false });
              toast(t('manage.catRestored', { name: c.label }));
              await reload();
            }}>{t('common.restore')}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══ Contas & Cartões ══════════════════════════════════
function Contas({ accounts, cards, knownSources, toast, reload }) {
  const [editAcc, setEditAcc] = useState(null); // id | 'new' | null
  const [editCard, setEditCard] = useState(null);
  const [draft, setDraft] = useState({});

  const saveAcc = async () => {
    const body = {
      ...(editAcc !== 'new' && { id: editAcc }),
      name: draft.name, institution: draft.institution, kind: draft.kind,
      initial_cents: parseAmountToCents(draft.initial || '0') || 0,
      initial_date: draft.initial_date || '1970-01-01',
      sources: draft.sources || [],
    };
    const d = await api('/api/accounts', editAcc === 'new' ? 'POST' : 'PATCH', body);
    if (d.error) return toast(d.error, '⚠️', null, true);
    setEditAcc(null);
    toast(t('manage.accSaved'));
    await reload();
  };

  const saveCard = async () => {
    const body = {
      ...(editCard !== 'new' && { id: editCard }),
      name: draft.name, last4: draft.last4,
      limit_cents: parseAmountToCents(draft.limit || '0') || 0,
      closing_day: parseInt(draft.closing_day) || 1,
      due_day: parseInt(draft.due_day) || 10,
      sources: draft.sources || [],
    };
    const d = await api('/api/cards', editCard === 'new' ? 'POST' : 'PATCH', body);
    if (d.error) return toast(d.error, '⚠️', null, true);
    setEditCard(null);
    toast(t('manage.cardSaved'));
    await reload();
  };

  const SourcePicker = () => (
    <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t('manage.linkedSources')}</span>
      {knownSources.map(s => (
        <label key={s} className="src-check">
          <input type="checkbox" checked={(draft.sources || []).includes(s)}
            onChange={e => setDraft(x => ({
              ...x,
              sources: e.target.checked
                ? [...(x.sources || []), s]
                : (x.sources || []).filter(y => y !== s),
            }))} />
          {s}
        </label>
      ))}
      {knownSources.length === 0 && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t('manage.noSourcesYet')}</span>}
    </div>
  );

  return (
    <>
      <div className="panel">
        <div className="panel-head" style={{ paddingBottom: 12 }}>
          <h2>{t('manage.accounts')}</h2>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t('manage.accHint')}</span>
        </div>
        <div className="panel-body">
          <div className="acc-grid">
            {accounts.filter(a => !a.archived).map(a => (
              <div className="acc-card" key={a.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <b>{a.name}</b>
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}>{t(`manage.kind.${a.kind}`)}</span>
                </div>
                <div className="big">{fmtMoney(a.balance_cents)}</div>
                <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                  {a.institution}{a.sources.length ? ` · ${a.sources.join(', ')}` : ` · ${t('manage.noLinkedSource')}`}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="hbtn" style={{ height: 28, fontSize: 12 }} onClick={() => {
                    setEditAcc(a.id); setEditCard(null);
                    setDraft({
                      name: a.name, institution: a.institution, kind: a.kind,
                      initial: (a.initial_cents / 100).toFixed(2).replace('.', ','),
                      initial_date: a.initial_date, sources: a.sources,
                    });
                  }}>{t('common.edit')}</button>
                  <button className="hbtn" style={{ height: 28, fontSize: 12 }} onClick={async () => {
                    await api('/api/accounts', 'PATCH', { id: a.id, archived: true });
                    toast(t('manage.accArchived'), '📦'); await reload();
                  }}>{t('common.archive')}</button>
                </div>
              </div>
            ))}
            <button className="ghost-add" onClick={() => {
              setEditAcc('new'); setEditCard(null);
              setDraft({ name: '', institution: '', kind: 'corrente', initial: '0,00', initial_date: new Date().toISOString().slice(0, 10), sources: [] });
            }}>+ {t('manage.addAccount')}</button>
          </div>
          {editAcc && (
            <div className="cat-editor" style={{ marginTop: 12 }}>
              <div className="acc-form">
                <input placeholder={t('manage.accNamePh')} value={draft.name ?? ''}
                  onChange={e => setDraft(x => ({ ...x, name: e.target.value }))} />
                <input placeholder={t('manage.institution')} value={draft.institution ?? ''}
                  onChange={e => setDraft(x => ({ ...x, institution: e.target.value }))} />
                <select value={draft.kind} onChange={e => setDraft(x => ({ ...x, kind: e.target.value }))}>
                  <option value="corrente">{t('manage.kind.corrente')}</option>
                  <option value="pagamento">{t('manage.kind.pagamento')}</option>
                  <option value="poupanca">{t('manage.kind.poupanca')}</option>
                </select>
                <span />
                <input placeholder={t('manage.initialBalance', { symbol: currencySymbol() })} value={draft.initial ?? ''}
                  onChange={e => setDraft(x => ({ ...x, initial: e.target.value }))} />
                <input type="date" value={draft.initial_date ?? ''}
                  onChange={e => setDraft(x => ({ ...x, initial_date: e.target.value }))} />
                <SourcePicker />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="hbtn" onClick={() => setEditAcc(null)}>{t('common.cancel')}</button>
                <button className="hbtn" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }} onClick={saveAcc}>{t('common.save')}</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-head" style={{ paddingBottom: 12 }}>
          <h2>{t('manage.creditCards')}</h2>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t('manage.cardsHint')}</span>
        </div>
        <div className="panel-body">
          <div className="acc-grid">
            {cards.filter(c => !c.archived).map(c => {
              const pct = c.limit_cents > 0 ? Math.min(c.open_invoice_cents / c.limit_cents * 100, 100) : 0;
              return (
                <div className="acc-card" key={c.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <b>{c.name}{c.last4 ? ` ····${c.last4}` : ''}</b>
                    <span style={{ color: 'var(--muted)', fontSize: 12 }}>{t('manage.cardDays', { closing: c.closing_day, due: c.due_day })}</span>
                  </div>
                  <div className="big">{fmtMoney(c.open_invoice_cents)} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)' }}>{t('cards.openInvoice')}</span></div>
                  {c.limit_cents > 0 && (
                    <>
                      <div className="goal-bar"><div style={{ width: `${pct}%`, background: pct < 80 ? 'var(--accent)' : 'var(--red)' }} /></div>
                      <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                        {t('manage.cardLimitLine', {
                          limit: fmtMoney(c.limit_cents),
                          available: fmtMoney(Math.max(c.limit_cents - c.open_invoice_cents, 0)),
                        })}
                      </div>
                    </>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <a className="hbtn" style={{ height: 28, fontSize: 12, textDecoration: 'none' }}
                      href={`/cartoes?card=${c.id}`}>{t('nav.cards')}</a>
                    <button className="hbtn" style={{ height: 28, fontSize: 12 }} onClick={() => {
                      setEditCard(c.id); setEditAcc(null);
                      setDraft({
                        name: c.name, last4: c.last4,
                        limit: (c.limit_cents / 100).toFixed(2).replace('.', ','),
                        closing_day: c.closing_day, due_day: c.due_day, sources: c.sources,
                      });
                    }}>{t('common.edit')}</button>
                    <button className="hbtn" style={{ height: 28, fontSize: 12 }} onClick={async () => {
                      await api('/api/cards', 'PATCH', { id: c.id, archived: true });
                      toast(t('manage.cardArchived'), '📦'); await reload();
                    }}>{t('common.archive')}</button>
                  </div>
                </div>
              );
            })}
            <button className="ghost-add" onClick={() => {
              setEditCard('new'); setEditAcc(null);
              setDraft({ name: '', last4: '', limit: '0,00', closing_day: 9, due_day: 15, sources: [] });
            }}>+ {t('manage.addCard')}</button>
          </div>
          {editCard && (
            <div className="cat-editor" style={{ marginTop: 12 }}>
              <div className="acc-form">
                <input placeholder={t('manage.cardNamePh')} value={draft.name ?? ''}
                  onChange={e => setDraft(x => ({ ...x, name: e.target.value }))} />
                <input placeholder={t('manage.last4')} maxLength={4} value={draft.last4 ?? ''}
                  onChange={e => setDraft(x => ({ ...x, last4: e.target.value }))} />
                <input placeholder={t('manage.cardLimitPh', { symbol: currencySymbol() })} value={draft.limit ?? ''}
                  onChange={e => setDraft(x => ({ ...x, limit: e.target.value }))} />
                <span />
                <input type="number" min={1} max={28} placeholder={t('manage.closingDay')} value={draft.closing_day ?? ''}
                  onChange={e => setDraft(x => ({ ...x, closing_day: e.target.value }))} />
                <input type="number" min={1} max={28} placeholder={t('manage.dueDay')} value={draft.due_day ?? ''}
                  onChange={e => setDraft(x => ({ ...x, due_day: e.target.value }))} />
                <SourcePicker />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="hbtn" onClick={() => setEditCard(null)}>{t('common.cancel')}</button>
                <button className="hbtn" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }} onClick={saveCard}>{t('common.save')}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
