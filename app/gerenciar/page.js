'use client';

import { useEffect, useMemo, useState } from 'react';
import ContasAPagar from '@/components/ContasAPagar';
import { configurePin } from '@/components/PinGate';

const fmtBRL = c => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const MONTH_NAMES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const monthLabel = ym => `${MONTH_NAMES[parseInt(ym.slice(5, 7)) - 1]} de ${ym.slice(0, 4)}`;
const parseMoneyInput = s => {
  const v = parseFloat(String(s).replace(/R\$\s?/g, '').replace(/\./g, '').replace(',', '.'));
  return isFinite(v) ? Math.round(v * 100) : NaN;
};
const PALETTE = ['#f97316', '#3b82f6', '#8b5cf6', '#ec4899', '#a855f7', '#06b6d4',
  '#14b8a6', '#eab308', '#f43f5e', '#22c55e', '#64748b', '#94a3b8'];
const TABS = [
  ['lancamentos', '☰', 'Lançamentos'],
  ['categorias', '🏷', 'Categorias'],
  ['contas', '💳', 'Contas e cartões'],
  ['apagar', '📅', 'Contas a pagar'],
  ['regras', '🧠', 'Regras'],
  ['importacoes', '🗂', 'Importações'],
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
      <span className="cell-editable" title="Clique para editar"
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
    setToasts(t => [...t, { id, msg, ico, undoFn, err }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), undoFn ? 8000 : 4200);
  };

  async function loadAll() {
    const [t, c, a, cd, r, b] = await Promise.all([
      fetch('/api/transactions').then(x => x.json()),
      fetch('/api/categories').then(x => x.json()),
      fetch('/api/accounts').then(x => x.json()),
      fetch('/api/cards').then(x => x.json()),
      fetch('/api/rules').then(x => x.json()),
      fetch('/api/batches').then(x => x.json()),
    ]);
    setTxs(t.transactions); setColors(t.categories);
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

  if (!txs) return <div className="container"><div className="loading">Carregando…</div></div>;

  const activeCatNames = cats.filter(c => !c.archived).map(c => c.name);

  return (
    <div className="container">
      <header>
        <div className="logo" style={{ gap: 14 }}>
          <a href="/" className="hbtn" style={{ textDecoration: 'none' }}>← Dashboard</a>
          <span><img src="/icon.svg" alt="" width={26} height={26} style={{ borderRadius: 8, verticalAlign: 'middle', marginRight: 8 }} />Gerenciar</span>
        </div>
        <button className="theme-toggle" title="Definir/alterar PIN de bloqueio" onClick={async () => {
          const msg = await configurePin();
          if (msg) alert(msg);
        }} style={{ marginRight: 8 }}>🔒</button>
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

      <div className="manage-layout">
        <nav className="manage-side">
          {TABS.map(([k, ico, label]) => (
            <button key={k} className={`side-item ${tab === k ? 'active' : ''}`}
              onClick={() => switchTab(k)}>
              <span>{ico}</span>{label}
              {k === 'regras' && rules.length > 0 && <span style={{ marginLeft: 'auto', fontSize: 11.5 }}>{rules.length}</span>}
            </button>
          ))}
        </nav>

        <div className="manage-content">
          {tab === 'lancamentos' && (
            <Lancamentos txs={txs} colors={colors} activeCatNames={activeCatNames}
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
                  <h2>Regras de categorização</h2>
                  <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                    Criadas quando você corrige uma transação. Excluir não altera o que já foi categorizado.
                  </p>
                </div>
              </div>
              <div className="panel-body">
                {rules.length === 0
                  ? <div className="empty">Nenhuma regra ainda. Corrija uma transação "A revisar" para criar a primeira.</div>
                  : rules.map(r => (
                    <div className="list-row" key={r.id}>
                      <div className="grow">
                        <div style={{ fontWeight: 500 }}>"{r.pattern}"</div>
                        <div className="sub">contém no texto → categoria ao lado</div>
                      </div>
                      <select className="control" value={r.category}
                        onChange={async e => {
                          await api('/api/rules', 'POST', { pattern: r.pattern, category: e.target.value });
                          await loadAll();
                        }}>
                        {activeCatNames.map(c => <option key={c}>{c}</option>)}
                      </select>
                      <button className="danger-btn" onClick={async () => {
                        await api('/api/rules', 'DELETE', { id: r.id });
                        toast(`Regra removida: "${r.pattern.slice(0, 40)}"`, '🗑');
                        await loadAll();
                      }}>Excluir</button>
                    </div>
                  ))}
              </div>
            </div>
          )}
          {tab === 'importacoes' && (
            <div className="panel">
              <div className="panel-head" style={{ paddingBottom: 12 }}>
                <div>
                  <h2>Importações</h2>
                  <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                    Desfazer remove apenas as transações daquele lote.
                  </p>
                </div>
              </div>
              <div className="panel-body">
                {batches.length === 0
                  ? <div className="empty">Nenhuma importação ainda.</div>
                  : batches.map(b => (
                    <div className="list-row" key={b.id}>
                      <div className="grow">
                        <div style={{ fontWeight: 500 }}>{b.file_name}</div>
                        <div className="sub">{b.kind} · {b.inserted} novas, {b.skipped} puladas · {b.imported_at}</div>
                      </div>
                      <button className="danger-btn" onClick={async () => {
                        if (!confirm(`Desfazer "${b.file_name}"? ${b.inserted} transações serão removidas.`)) return;
                        const d = await api('/api/batches', 'DELETE', { id: b.id });
                        toast(d.error || `Desfeita: ${d.removed} transações removidas`, d.error ? '⚠️' : '↩️', null, !!d.error);
                        await loadAll();
                      }}>↩ Desfazer</button>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="toasts">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.err ? 'err' : ''}`}>
            <span className="ico">{t.ico}</span><span>{t.msg}</span>
            {t.undoFn && (
              <button className="hbtn" style={{ height: 28, fontSize: 12 }}
                onClick={async () => {
                  setToasts(x => x.filter(y => y.id !== t.id));
                  await t.undoFn();
                }}>Desfazer</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══ Lançamentos ═══════════════════════════════════════
function Lancamentos({ txs, colors, activeCatNames, accounts, toast, reload }) {
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
    () => [...new Set(txs.map(t => t.date.slice(0, 7)))].sort().reverse(), [txs]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return txs
      .filter(t => !month || t.date.startsWith(month))
      .filter(t => !cat || t.category === cat)
      .filter(t => !account || String(t.account_id) === account)
      .filter(t => !q || t.description.toLowerCase().includes(q))
      .filter(t => !type ||
        (type === 'in' ? t.amount_cents > 0 && !t.transfer :
         type === 'out' ? t.amount_cents < 0 && !t.transfer :
         type === 'review' ? t.category === 'A revisar' : !!t.transfer));
  }, [txs, month, cat, type, account, search]);

  const visible = rows.slice(0, limit);

  const patch = async (id, body, undoBody, label) => {
    const d = await api('/api/transactions', 'PATCH', { id, ...body });
    if (d.error) return toast(d.error, '⚠️', null, true);
    toast(label || 'Alterado', '✓', undoBody
      ? async () => { await api('/api/transactions', 'PATCH', { id, ...undoBody }); await reload(); }
      : null);
    await reload();
  };

  const toggleRow = (t, idx, shift) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (shift && lastIdx != null) {
        const [a, b] = [Math.min(lastIdx, idx), Math.max(lastIdx, idx)];
        const turnOn = !prev.has(t.id);
        for (let i = a; i <= b; i++) {
          turnOn ? next.add(visible[i].id) : next.delete(visible[i].id);
        }
      } else {
        next.has(t.id) ? next.delete(t.id) : next.add(t.id);
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
    toast(`${d.changed} transações: ${label}`, '✓', undo);
    setSelected(new Set());
    await reload();
  };

  const allVisibleSelected = visible.length > 0 && visible.every(t => selected.has(t.id));

  return (
    <div className="panel">
      <div className="panel-head" style={{ paddingBottom: 12 }}>
        <h2>Lançamentos <span style={{ color: 'var(--muted)', fontWeight: 400, fontSize: 13 }}>· {rows.length}</span></h2>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>clique numa célula para editar · shift+clique seleciona intervalo</span>
      </div>
      <div className="filters">
        <select className="control" value={month} onChange={e => setMonth(e.target.value)}>
          <option value="">Todo o período</option>
          {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
        <select className="control" value={cat} onChange={e => setCat(e.target.value)}>
          <option value="">Todas as categorias</option>
          {activeCatNames.map(c => <option key={c}>{c}</option>)}
        </select>
        <select className="control" value={type} onChange={e => setType(e.target.value)}>
          <option value="">Todos os tipos</option>
          <option value="out">Só saídas</option>
          <option value="in">Só entradas</option>
          <option value="trf">Transferências</option>
          <option value="review">A revisar</option>
        </select>
        {accounts.length > 0 && (
          <select className="control" value={account} onChange={e => setAccount(e.target.value)}>
            <option value="">Todas as contas</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
        <div className="search">🔍<input placeholder="Buscar…" value={search} onChange={e => setSearch(e.target.value)} /></div>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr>
            <th style={{ width: 30 }}>
              <input type="checkbox" checked={allVisibleSelected}
                onChange={() => setSelected(prev => {
                  const next = new Set(prev);
                  allVisibleSelected
                    ? visible.forEach(t => next.delete(t.id))
                    : visible.forEach(t => next.add(t.id));
                  return next;
                })} />
            </th>
            <th>Data</th><th>Descrição</th><th>Categoria</th>
            <th style={{ textAlign: 'right' }}>Valor</th>
          </tr></thead>
          <tbody>
            {visible.map((t, idx) => {
              const color = colors[t.category] || '#999';
              const edited = t.original_date != null || t.original_description != null || t.original_amount_cents != null;
              return (
                <tr key={t.id} style={selected.has(t.id) ? { background: 'var(--accent-soft)' } : undefined}>
                  <td>
                    <input type="checkbox" checked={selected.has(t.id)}
                      onClick={e => toggleRow(t, idx, e.shiftKey)} onChange={() => {}} />
                  </td>
                  <td style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    <EditableCell value={t.date} width={110}
                      display={`${t.date.slice(8, 10)}/${t.date.slice(5, 7)}/${t.date.slice(2, 4)}`}
                      onSave={v => patch(t.id, { date: v.trim() }, { date: t.date }, 'Data alterada')} />
                  </td>
                  <td className="desc">
                    <EditableCell value={t.description}
                      onSave={v => patch(t.id, { description: v }, { description: t.description }, 'Descrição alterada')} />
                    {edited && (
                      <span className="edited-mark" title="Editada manualmente — clique para restaurar o original"
                        onClick={() => patch(t.id, { restore: true }, null, 'Original restaurado')}>· editada</span>
                    )}
                    <small>{t.source}</small>
                  </td>
                  <td>
                    <select className="badge-select" value={t.category}
                      style={{
                        background: `${color}22`, color,
                        outline: t.category === 'A revisar' ? `1.5px dashed ${color}88` : 'none',
                      }}
                      onChange={e => patch(t.id, {
                        category: e.target.value,
                        createRule: t.category === 'A revisar',
                        pattern: t.description.replace(/\s*\(parcela \d+\/\d+\)$/, '').trim(),
                      }, { category: t.category }, `Categoria: ${e.target.value}`)}>
                      {activeCatNames.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </td>
                  <td className={`amount ${t.transfer ? 'trf' : t.amount_cents > 0 ? 'in' : 'out'}`}>
                    <EditableCell value={(t.amount_cents / 100).toFixed(2).replace('.', ',')} width={90}
                      display={`${t.amount_cents > 0 ? '+' : ''}${fmtBRL(t.amount_cents)}`}
                      onSave={v => {
                        const cents = parseMoneyInput(v);
                        if (!isFinite(cents) || cents === 0) return toast('Valor inválido', '⚠️', null, true);
                        patch(t.id, { amount_cents: cents }, { amount_cents: t.amount_cents }, 'Valor alterado');
                      }} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty">Nenhuma transação encontrada.</div>}
        {rows.length > limit && (
          <div className="pager">
            <button onClick={() => setLimit(l => l + 200)}>Mostrar mais ({rows.length - limit} restantes)</button>
          </div>
        )}
      </div>
      {selected.size > 0 && (
        <div className="bulk-bar">
          <b>{selected.size} selecionada{selected.size > 1 ? 's' : ''}</b>
          <select className="control" value={bulkCat} onChange={e => setBulkCat(e.target.value)}>
            <option value="">Mudar categoria…</option>
            {activeCatNames.map(c => <option key={c}>{c}</option>)}
          </select>
          <button className="hbtn" style={{ height: 30 }} disabled={!bulkCat}
            onClick={() => bulkCat && bulk('category', bulkCat, bulkCat)}>Aplicar</button>
          <button className="danger-btn" onClick={() => {
            if (selected.size > 10 && !confirm(`Excluir ${selected.size} transações?`)) return;
            bulk('delete', null, 'excluídas');
          }}>Excluir</button>
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
    toast(editing === 'new' ? 'Categoria criada' : 'Categoria atualizada');
    await reload();
  };

  const Editor = () => (
    <div className="cat-editor">
      <div style={{ display: 'flex', gap: 8 }}>
        <input style={{ width: 54, textAlign: 'center' }} placeholder="🏷" maxLength={4}
          value={draft.emoji ?? ''} onChange={e => setDraft(x => ({ ...x, emoji: e.target.value }))} />
        <input style={{ flex: 1 }} placeholder="Nome da categoria" autoFocus
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
        <button className="hbtn" onClick={() => { setEditing(null); setAdding(false); }}>Cancelar</button>
        <button className="hbtn" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
          onClick={save}>Salvar</button>
      </div>
    </div>
  );

  return (
    <div className="panel">
      <div className="panel-head" style={{ paddingBottom: 12 }}>
        <h2>Categorias</h2>
        <button className="hbtn" onClick={() => {
          setAdding(true); setEditing('new');
          setDraft({ name: '', color: PALETTE[0], emoji: '' });
        }}>+ Nova categoria</button>
      </div>
      <div className="panel-body">
        {adding && editing === 'new' && <Editor />}
        {active.map(c => (
          <div key={c.id}>
            <div className="list-row">
              <span className="dot" style={{ background: c.color, width: 10, height: 10 }} />
              <span style={{ width: 24, textAlign: 'center' }}>{c.emoji}</span>
              <div className="grow">
                <div style={{ fontWeight: 500 }}>{c.name}{c.system && <span style={{ color: 'var(--muted)', fontSize: 11, marginLeft: 6 }}>(sistema)</span>}</div>
                <div className="sub">
                  {c.txCount} transações{c.monthlyAvg > 0 ? ` · ${fmtBRL(c.monthlyAvg)}/mês` : ''}{c.rulesCount ? ` · ${c.rulesCount} regra${c.rulesCount > 1 ? 's' : ''}` : ''}
                </div>
              </div>
              <button className="hbtn" style={{ height: 30 }} onClick={() => {
                setEditing(c.id); setAdding(false);
                setDraft({ name: c.name, color: c.color, emoji: c.emoji });
              }}>Editar</button>
              {!c.system && (
                <>
                  <button className="hbtn" style={{ height: 30 }} title="Some dos seletores; histórico intacto"
                    onClick={async () => {
                      await api('/api/categories', 'PATCH', { id: c.id, archived: true });
                      toast(`"${c.name}" arquivada`, '📦');
                      await reload();
                    }}>Arquivar</button>
                  <button className="danger-btn" onClick={() => { setDeleting(c.id); setMoveTo(''); }}>Excluir</button>
                </>
              )}
            </div>
            {editing === c.id && <Editor />}
            {deleting === c.id && (
              <div className="cat-editor" style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13 }}>
                  {c.txCount > 0 ? `Mover as ${c.txCount} transações para:` : 'Excluir categoria vazia?'}
                </span>
                {c.txCount > 0 && (
                  <select className="control" value={moveTo} onChange={e => setMoveTo(e.target.value)}>
                    <option value="">Escolher…</option>
                    {active.filter(x => x.id !== c.id).map(x => <option key={x.id}>{x.name}</option>)}
                  </select>
                )}
                <button className="danger-btn" disabled={c.txCount > 0 && !moveTo}
                  onClick={async () => {
                    const d = await api('/api/categories', 'DELETE', { id: c.id, moveTo });
                    if (d.error) return toast(d.error, '⚠️', null, true);
                    setDeleting(null);
                    toast(d.moved ? `Excluída — ${d.moved} transações movidas para ${moveTo}` : 'Categoria excluída', '🗑');
                    await reload();
                  }}>Confirmar exclusão</button>
                <button className="hbtn" style={{ height: 30 }} onClick={() => setDeleting(null)}>Cancelar</button>
              </div>
            )}
          </div>
        ))}
        {archived.length > 0 && <div className="section-title">Arquivadas</div>}
        {archived.map(c => (
          <div className="list-row" key={c.id} style={{ opacity: .6 }}>
            <span className="dot" style={{ background: c.color, width: 10, height: 10 }} />
            <span style={{ width: 24, textAlign: 'center' }}>{c.emoji}</span>
            <div className="grow"><div>{c.name}</div><div className="sub">{c.txCount} transações</div></div>
            <button className="hbtn" style={{ height: 30 }} onClick={async () => {
              await api('/api/categories', 'PATCH', { id: c.id, archived: false });
              toast(`"${c.name}" restaurada`);
              await reload();
            }}>Restaurar</button>
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
      initial_cents: parseMoneyInput(draft.initial || '0') || 0,
      initial_date: draft.initial_date || '1970-01-01',
      sources: draft.sources || [],
    };
    const d = await api('/api/accounts', editAcc === 'new' ? 'POST' : 'PATCH', body);
    if (d.error) return toast(d.error, '⚠️', null, true);
    setEditAcc(null);
    toast('Conta salva — saldo recalculado');
    await reload();
  };

  const saveCard = async () => {
    const body = {
      ...(editCard !== 'new' && { id: editCard }),
      name: draft.name, last4: draft.last4,
      limit_cents: parseMoneyInput(draft.limit || '0') || 0,
      closing_day: parseInt(draft.closing_day) || 1,
      due_day: parseInt(draft.due_day) || 10,
      sources: draft.sources || [],
    };
    const d = await api('/api/cards', editCard === 'new' ? 'POST' : 'PATCH', body);
    if (d.error) return toast(d.error, '⚠️', null, true);
    setEditCard(null);
    toast('Cartão salvo');
    await reload();
  };

  const SourcePicker = () => (
    <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>Origens vinculadas:</span>
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
      {knownSources.length === 0 && <span style={{ fontSize: 12, color: 'var(--muted)' }}>importe um arquivo primeiro</span>}
    </div>
  );

  return (
    <>
      <div className="panel">
        <div className="panel-head" style={{ paddingBottom: 12 }}>
          <h2>Contas</h2>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>saldo = inicial + movimentos das origens vinculadas</span>
        </div>
        <div className="panel-body">
          <div className="acc-grid">
            {accounts.filter(a => !a.archived).map(a => (
              <div className="acc-card" key={a.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <b>{a.name}</b>
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}>{a.kind}</span>
                </div>
                <div className="big">{fmtBRL(a.balance_cents)}</div>
                <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                  {a.institution}{a.sources.length ? ` · ${a.sources.join(', ')}` : ' · sem origem vinculada'}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="hbtn" style={{ height: 28, fontSize: 12 }} onClick={() => {
                    setEditAcc(a.id); setEditCard(null);
                    setDraft({
                      name: a.name, institution: a.institution, kind: a.kind,
                      initial: (a.initial_cents / 100).toFixed(2).replace('.', ','),
                      initial_date: a.initial_date, sources: a.sources,
                    });
                  }}>Editar</button>
                  <button className="hbtn" style={{ height: 28, fontSize: 12 }} onClick={async () => {
                    await api('/api/accounts', 'PATCH', { id: a.id, archived: true });
                    toast('Conta arquivada', '📦'); await reload();
                  }}>Arquivar</button>
                </div>
              </div>
            ))}
            <button className="ghost-add" onClick={() => {
              setEditAcc('new'); setEditCard(null);
              setDraft({ name: '', institution: '', kind: 'corrente', initial: '0,00', initial_date: new Date().toISOString().slice(0, 10), sources: [] });
            }}>+ conta</button>
          </div>
          {editAcc && (
            <div className="cat-editor" style={{ marginTop: 12 }}>
              <div className="acc-form">
                <input placeholder="Nome (ex: Mercado Pago)" value={draft.name ?? ''}
                  onChange={e => setDraft(x => ({ ...x, name: e.target.value }))} />
                <input placeholder="Instituição" value={draft.institution ?? ''}
                  onChange={e => setDraft(x => ({ ...x, institution: e.target.value }))} />
                <select value={draft.kind} onChange={e => setDraft(x => ({ ...x, kind: e.target.value }))}>
                  <option value="corrente">Conta corrente</option>
                  <option value="pagamento">Conta de pagamento</option>
                  <option value="poupanca">Poupança</option>
                </select>
                <span />
                <input placeholder="Saldo inicial (R$)" value={draft.initial ?? ''}
                  onChange={e => setDraft(x => ({ ...x, initial: e.target.value }))} />
                <input type="date" value={draft.initial_date ?? ''}
                  onChange={e => setDraft(x => ({ ...x, initial_date: e.target.value }))} />
                <SourcePicker />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="hbtn" onClick={() => setEditAcc(null)}>Cancelar</button>
                <button className="hbtn" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }} onClick={saveAcc}>Salvar</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-head" style={{ paddingBottom: 12 }}>
          <h2>Cartões de crédito</h2>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>fatura aberta = gastos das origens desde o último fechamento</span>
        </div>
        <div className="panel-body">
          <div className="acc-grid">
            {cards.filter(c => !c.archived).map(c => {
              const pct = c.limit_cents > 0 ? Math.min(c.open_invoice_cents / c.limit_cents * 100, 100) : 0;
              return (
                <div className="acc-card" key={c.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <b>{c.name}{c.last4 ? ` ····${c.last4}` : ''}</b>
                    <span style={{ color: 'var(--muted)', fontSize: 12 }}>fecha {c.closing_day} · vence {c.due_day}</span>
                  </div>
                  <div className="big">{fmtBRL(c.open_invoice_cents)} <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--muted)' }}>fatura aberta</span></div>
                  {c.limit_cents > 0 && (
                    <>
                      <div className="goal-bar"><div style={{ width: `${pct}%`, background: pct < 80 ? 'var(--accent)' : 'var(--red)' }} /></div>
                      <div style={{ color: 'var(--muted)', fontSize: 12 }}>
                        limite {fmtBRL(c.limit_cents)} · disponível ≈ {fmtBRL(Math.max(c.limit_cents - c.open_invoice_cents, 0))}
                      </div>
                    </>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <a className="hbtn" style={{ height: 28, fontSize: 12, textDecoration: 'none' }}
                      href={`/cartoes?card=${c.id}`}>Faturas</a>
                    <button className="hbtn" style={{ height: 28, fontSize: 12 }} onClick={() => {
                      setEditCard(c.id); setEditAcc(null);
                      setDraft({
                        name: c.name, last4: c.last4,
                        limit: (c.limit_cents / 100).toFixed(2).replace('.', ','),
                        closing_day: c.closing_day, due_day: c.due_day, sources: c.sources,
                      });
                    }}>Editar</button>
                    <button className="hbtn" style={{ height: 28, fontSize: 12 }} onClick={async () => {
                      await api('/api/cards', 'PATCH', { id: c.id, archived: true });
                      toast('Cartão arquivado', '📦'); await reload();
                    }}>Arquivar</button>
                  </div>
                </div>
              );
            })}
            <button className="ghost-add" onClick={() => {
              setEditCard('new'); setEditAcc(null);
              setDraft({ name: '', last4: '', limit: '0,00', closing_day: 9, due_day: 15, sources: [] });
            }}>+ cartão</button>
          </div>
          {editCard && (
            <div className="cat-editor" style={{ marginTop: 12 }}>
              <div className="acc-form">
                <input placeholder="Nome (ex: MP Visa)" value={draft.name ?? ''}
                  onChange={e => setDraft(x => ({ ...x, name: e.target.value }))} />
                <input placeholder="4 últimos dígitos" maxLength={4} value={draft.last4 ?? ''}
                  onChange={e => setDraft(x => ({ ...x, last4: e.target.value }))} />
                <input placeholder="Limite (R$)" value={draft.limit ?? ''}
                  onChange={e => setDraft(x => ({ ...x, limit: e.target.value }))} />
                <span />
                <input type="number" min={1} max={28} placeholder="Dia de fechamento" value={draft.closing_day ?? ''}
                  onChange={e => setDraft(x => ({ ...x, closing_day: e.target.value }))} />
                <input type="number" min={1} max={28} placeholder="Dia de vencimento" value={draft.due_day ?? ''}
                  onChange={e => setDraft(x => ({ ...x, due_day: e.target.value }))} />
                <SourcePicker />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="hbtn" onClick={() => setEditCard(null)}>Cancelar</button>
                <button className="hbtn" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }} onClick={saveCard}>Salvar</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
