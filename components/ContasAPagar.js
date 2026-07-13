'use client';

import { useEffect, useState } from 'react';

const fmtBRL = c => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const parseMoney = s => {
  const v = parseFloat(String(s).replace(/R\$\s?/g, '').replace(/\./g, '').replace(',', '.'));
  return isFinite(v) ? Math.round(Math.abs(v) * 100) : NaN;
};
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const PRESETS = [
  { label: '🏢 Condomínio', form: { description: 'Condomínio', match_pattern: 'condominio', due_day: 10, frequency: 'mensal' } },
  { label: '🧾 DAS MEI', form: { description: 'DAS MEI', match_pattern: 'DAS', due_day: 20, frequency: 'mensal' } },
  { label: '❤️ Dízimo', form: { description: 'Dízimo', match_pattern: 'fed snt', due_day: 10, frequency: 'mensal' } },
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
      amount_cents: parseMoney(form.valor),
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
    toast('Conta salva — conciliação automática ativa');
  }

  async function call(method, body, msg) {
    const d = await (await fetch('/api/bills', {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })).json();
    if (d.error) return toast(d.error, '⚠️', null, true);
    setData(d);
    if (msg) toast(msg);
  }

  if (!data) return <div className="panel"><div className="loading">Carregando…</div></div>;

  const statusOf = bill => {
    const occ = data.occurrences.filter(o => o.bill_id === bill.id);
    const late = occ.find(o => o.status === 'atrasada');
    if (late) return { txt: `atrasada (${late.ref})`, color: 'var(--red)' };
    const next = occ.find(o => o.status === 'proxima');
    if (next) return { txt: `próxima: ${next.due_date.slice(8, 10)}/${next.due_date.slice(5, 7)}`, color: 'var(--muted)' };
    return { txt: 'em dia', color: 'var(--green)' };
  };

  return (
    <div className="panel">
      <div className="panel-head" style={{ paddingBottom: 12 }}>
        <div>
          <h2>Contas a pagar</h2>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
            Quando uma transação importada bater com o padrão, valor (±tolerância) e a janela do vencimento, a conta é marcada como paga sozinha.
          </p>
        </div>
        <button className="hbtn" onClick={() => { setEditing('new'); setForm(EMPTY); }}>+ Nova conta</button>
      </div>
      <div className="panel-body">
        {editing === 'new' && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--muted)', alignSelf: 'center' }}>Presets:</span>
            {PRESETS.map(p => (
              <button key={p.label} className="hbtn" style={{ height: 28, fontSize: 12 }}
                onClick={() => setForm(f => ({ ...f, ...p.form }))}>{p.label}</button>
            ))}
          </div>
        )}
        {editing && (
          <div className="cat-editor">
            <div className="acc-form">
              <input placeholder="Descrição (ex: Condomínio)" value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              <input placeholder="Valor (R$)" value={form.valor}
                onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} />
              <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                <option value="">Categoria…</option>
                {activeCats.map(c => <option key={c.name} value={c.name}>{c.emoji} {c.name}</option>)}
              </select>
              <select value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))}>
                <option value="mensal">Mensal</option>
                <option value="anual">Anual</option>
              </select>
              <input type="number" min={1} max={28} placeholder="Dia do vencimento" value={form.due_day}
                onChange={e => setForm(f => ({ ...f, due_day: e.target.value }))} />
              {form.frequency === 'anual' ? (
                <select value={form.due_month} onChange={e => setForm(f => ({ ...f, due_month: e.target.value }))}>
                  {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
              ) : <span />}
              <input placeholder="Padrão p/ conciliar (ex: condominio)" value={form.match_pattern}
                onChange={e => setForm(f => ({ ...f, match_pattern: e.target.value }))}
                style={{ gridColumn: '1 / -1' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="hbtn" onClick={() => { setEditing(null); setForm(EMPTY); }}>Cancelar</button>
              <button className="hbtn" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }} onClick={save}>Salvar</button>
            </div>
          </div>
        )}
        {data.bills.filter(b => !b.archived).map(b => {
          const st = statusOf(b);
          return (
            <div className="list-row" key={b.id}>
              <div className="grow">
                <div style={{ fontWeight: 500 }}>{b.description} · {fmtBRL(b.amount_cents)}</div>
                <div className="sub">
                  {b.frequency === 'anual' ? `todo ano em ${MONTHS[(b.due_month || 1) - 1]}, dia ${b.due_day}` : `todo dia ${b.due_day}`}
                  {b.match_pattern ? ` · concilia com "${b.match_pattern}"` : ' · sem conciliação automática'}
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
              }}>Editar</button>
              <button className="hbtn" style={{ height: 28, fontSize: 12 }}
                onClick={() => call('PATCH', { id: b.id, archived: true }, 'Conta arquivada')}>Arquivar</button>
              <button className="danger-btn" onClick={() => {
                if (confirm(`Excluir "${b.description}" e seu histórico de pagamentos?`)) {
                  call('DELETE', { id: b.id }, 'Conta excluída');
                }
              }}>Excluir</button>
            </div>
          );
        })}
        {data.bills.filter(b => b.archived).map(b => (
          <div className="list-row" key={b.id} style={{ opacity: .55 }}>
            <div className="grow">{b.description} <span className="sub">(arquivada)</span></div>
            <button className="hbtn" style={{ height: 28, fontSize: 12 }}
              onClick={() => call('PATCH', { id: b.id, archived: false }, 'Conta restaurada')}>Restaurar</button>
          </div>
        ))}
        {!data.bills.length && !editing && (
          <div className="empty">
            Cadastre suas contas fixas (condomínio, DAS MEI, dízimo…) e o Fluxo avisa
            no dashboard quando vencerem — e marca como pagas sozinho quando a transação aparecer.
          </div>
        )}
      </div>
    </div>
  );
}
