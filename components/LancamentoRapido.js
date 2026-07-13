'use client';

import { useState } from 'react';

const parseMoney = s => {
  const v = parseFloat(String(s).replace(/R\$\s?/g, '').replace(/\./g, '').replace(',', '.'));
  return isFinite(v) ? Math.round(Math.abs(v) * 100) : NaN;
};

// Lançamento manual rápido, estilo Organizze: despesa ou receita em 4 campos.
export default function LancamentoRapido({ tipo, categories, emojis = {}, onClose, onDone }) {
  const [valor, setValor] = useState('');
  const [desc, setDesc] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [cat, setCat] = useState(tipo === 'receita' ? 'Renda' : '');
  const [busy, setBusy] = useState(false);
  const isDespesa = tipo === 'despesa';

  async function save() {
    const cents = parseMoney(valor);
    if (!isFinite(cents) || !cents) return onDone({ error: 'Valor inválido' });
    if (!desc.trim()) return onDone({ error: 'Descrição obrigatória' });
    if (!cat) return onDone({ error: 'Escolha a categoria' });
    setBusy(true);
    const res = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date, description: desc.trim(), category: cat,
        amount_cents: isDespesa ? -cents : cents,
      }),
    });
    const d = await res.json();
    setBusy(false);
    onDone(d.error ? { error: d.error } : { msg: `${isDespesa ? 'Despesa' : 'Receita'} lançada` });
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 420 }}>
        <div className="modal-head">
          <h3 style={{ color: isDespesa ? 'var(--red)' : 'var(--green)' }}>
            {isDespesa ? '− Nova despesa' : '+ Nova receita'}
          </h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ padding: 20 }}>
          <div className="cat-editor" style={{ margin: 0, background: 'none', padding: 0 }}>
            <input autoFocus placeholder="R$ 0,00" inputMode="decimal"
              style={{ fontSize: 22, fontWeight: 700, textAlign: 'center' }}
              value={valor} onChange={e => setValor(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && save()} />
            <input placeholder={isDespesa ? 'Onde gastou? (ex: Padaria)' : 'De onde veio? (ex: Freelance)'}
              value={desc} onChange={e => setDesc(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && save()} />
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="date" style={{ flex: 1 }} value={date} onChange={e => setDate(e.target.value)} />
              <select className="control" style={{ flex: 1 }} value={cat} onChange={e => setCat(e.target.value)}>
                <option value="">Categoria…</option>
                {Object.keys(categories).map(c => (
                  <option key={c} value={c}>{emojis[c] ? `${emojis[c]} ` : ''}{c}</option>
                ))}
              </select>
            </div>
            <button disabled={busy} onClick={save}
              style={{ background: isDespesa ? 'var(--red)' : 'var(--green)', color: '#fff',
                border: 0, borderRadius: 10, padding: '10px 14px', fontSize: 14,
                fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              {busy ? 'Salvando…' : 'Lançar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
