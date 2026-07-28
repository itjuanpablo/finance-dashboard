'use client';

import { useEffect, useState } from 'react';
import { t } from '@/lib/i18n';
import { fmtMoney, fmtDayMonth, currencySymbol, parseAmountToCents } from '@/lib/format';

// Nome do mês (1–12) para o seletor de conta anual.
const monthName = n => t(`month.${n}`);

// Presets regionais: a conta fixa típica muda de país (condomínio/expensas,
// DAS MEI/monotributo), então rótulo, descrição e padrão vêm do dicionário.
const PRESETS = [
  { icon: '🏢', key: 'condo', due_day: 10 },
  { icon: '🧾', key: 'tax', due_day: 20 },
  { icon: '❤️', key: 'tithe', due_day: 10 },
];

const EMPTY = { description: '', valor: '', category: '', due_day: 10, frequency: 'mensal', due_month: 1, match_pattern: '' };

export default function ContasAPagar({ cats, toast }) {
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null); // 'new' | id | null
  const [form, setForm] = useState(EMPTY);

  const load = () => fetch('/api/bills').then(r => r.json()).then(setData);
  useEffect(() => { load(); }, []);

  const activeCats = cats.filter(c => !c.archived);

  async function save() {
    const body = {
      ...(editing !== 'new' && { id: editing }),
      description: form.description,
      amount_cents: Math.abs(parseAmountToCents(form.valor) ?? NaN),
      category: form.category,
      due_day: parseInt(form.due_day) || 0,
      frequency: form.frequency,
      due_month: parseInt(form.due_month) || 1,
      match_pattern: form.match_pattern,
    };
    const res = await fetch('/api/bills', {
      method: editing === 'new' ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    if (d.error) return toast(d.error, '⚠️', null, true);
    setEditing(null); setForm(EMPTY);
    setData(d);
    toast(t('bills.saved'));
  }

  async function call(method, body, msg) {
    const d = await (await fetch('/api/bills', {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })).json();
    if (d.error) return toast(d.error, '⚠️', null, true);
    setData(d);
    if (msg) toast(msg);
  }

  if (!data) return <div className="panel"><div className="loading">{t('common.loading')}</div></div>;

  const statusOf = bill => {
    const occ = data.occurrences.filter(o => o.bill_id === bill.id);
    const late = occ.find(o => o.status === 'atrasada');
    if (late) return { txt: t('bills.status.late', { ref: late.ref }), color: 'var(--red)' };
    const next = occ.find(o => o.status === 'proxima');
    if (next) return { txt: t('bills.status.next', { d: fmtDayMonth(next.due_date) }), color: 'var(--muted)' };
    return { txt: t('bills.status.ok'), color: 'var(--green)' };
  };

  return (
    <div className="panel">
      <div className="panel-head" style={{ paddingBottom: 12 }}>
        <div>
          <h2>{t('bills.title')}</h2>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
            {t('bills.help')}
          </p>
        </div>
        <button className="hbtn" onClick={() => { setEditing('new'); setForm(EMPTY); }}>+ {t('bills.new')}</button>
      </div>
      <div className="panel-body">
        {editing === 'new' && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--muted)', alignSelf: 'center' }}>{t('bills.presets')}</span>
            {PRESETS.map(p => (
              <button key={p.key} className="hbtn" style={{ height: 28, fontSize: 12 }}
                onClick={() => setForm(f => ({
                  ...f,
                  description: t(`bills.preset.${p.key}.desc`),
                  match_pattern: t(`bills.preset.${p.key}.pattern`),
                  due_day: p.due_day,
                  frequency: 'mensal',
                }))}>{p.icon} {t(`bills.preset.${p.key}.desc`)}</button>
            ))}
          </div>
        )}
        {editing && (
          <div className="cat-editor">
            <div className="acc-form">
              <input placeholder={t('bills.f.desc')} value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              <input placeholder={t('common.amountField', { symbol: currencySymbol })} value={form.valor}
                onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} />
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                <option value="">{t('common.categoryPick')}</option>
                {activeCats.map(c => <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>)}
              </select>
              <select value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))}>
                <option value="mensal">{t('bills.freq.monthly')}</option>
                <option value="anual">{t('bills.freq.yearly')}</option>
              </select>
              <input type="number" min={1} max={28} placeholder={t('bills.f.dueDay')} value={form.due_day}
                onChange={e => setForm(f => ({ ...f, due_day: e.target.value }))} />
              {form.frequency === 'anual' ? (
                <select value={form.due_month} onChange={e => setForm(f => ({ ...f, due_month: e.target.value }))}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                    <option key={m} value={m}>{monthName(m)}</option>
                  ))}
                </select>
              ) : <span />}
              <input placeholder={t('bills.f.pattern')} value={form.match_pattern}
                onChange={e => setForm(f => ({ ...f, match_pattern: e.target.value }))}
                style={{ gridColumn: '1 / -1' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="hbtn" onClick={() => { setEditing(null); setForm(EMPTY); }}>{t('common.cancel')}</button>
              <button className="hbtn" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }} onClick={save}>{t('common.save')}</button>
            </div>
          </div>
        )}
        {data.bills.filter(b => !b.archived).map(b => {
          const st = statusOf(b);
          return (
            <div className="list-row" key={b.id}>
              <div className="grow">
                <div style={{ fontWeight: 500 }}>{b.description} · {fmtMoney(b.amount_cents)}</div>
                <div className="sub">
                  {b.frequency === 'anual'
                    ? t('bills.everyYear', { month: monthName((b.due_month || 1)), day: b.due_day })
                    : t('bills.everyMonth', { day: b.due_day })}
                  {b.match_pattern
                    ? ` · ${t('bills.matches', { pattern: b.match_pattern })}`
                    : ` · ${t('bills.noMatch')}`}
                  {' · '}<span style={{ color: st.color }}>{st.txt}</span>
                </div>
              </div>
              <button className="hbtn" style={{ height: 28, fontSize: 12 }} onClick={() => {
                setEditing(b.id);
                setForm({
                  description: b.description, valor: (b.amount_cents / 100).toFixed(2).replace('.', ','),
                  category: b.category, due_day: b.due_day, frequency: b.frequency,
                  due_month: b.due_month || 1, match_pattern: b.match_pattern,
                });
              }}>{t('common.edit')}</button>
              <button className="hbtn" style={{ height: 28, fontSize: 12 }}
                onClick={() => call('PATCH', { id: b.id, archived: true }, t('bills.archived'))}>{t('common.archive')}</button>
              <button className="danger-btn" onClick={() => {
                if (confirm(t('bills.confirmDelete', { desc: b.description }))) {
                  call('DELETE', { id: b.id }, t('bills.deleted'));
                }
              }}>{t('common.delete')}</button>
            </div>
          );
        })}
        {data.bills.filter(b => b.archived).map(b => (
          <div className="list-row" key={b.id} style={{ opacity: .55 }}>
            <div className="grow">{b.description} <span className="sub">({t('common.archivedTag')})</span></div>
            <button className="hbtn" style={{ height: 28, fontSize: 12 }}
              onClick={() => call('PATCH', { id: b.id, archived: false }, t('bills.restored'))}>{t('common.restore')}</button>
          </div>
        ))}
        {!data.bills.length && !editing && (
          <div className="empty">
            {t('bills.empty')}
          </div>
        )}
      </div>
    </div>
  );
}
