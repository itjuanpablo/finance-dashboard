'use client';

import { useState } from 'react';
import { t, catLabel } from '@/lib/i18n';
import { CAT } from '@/lib/categories';
import { currencySymbol, parseAmountToCents } from '@/lib/format';

// Lançamento manual rápido, estilo Organizze: despesa ou receita em 4 campos.
// `label` resolve chave de categoria → nome exibido (a página passa o resolvedor
// montado com a lista da API; sem ele, cai no dicionário das canônicas).
export default function LancamentoRapido({ tipo, categories, emojis = {}, label = catLabel, onClose, onDone }) {
  const [valor, setValor] = useState('');
  const [desc, setDesc] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [cat, setCat] = useState(tipo === 'receita' ? CAT.INCOME : '');
  const [busy, setBusy] = useState(false);
  const isDespesa = tipo === 'despesa';

  async function save() {
    // valor sempre em módulo: o sinal vem do tipo de lançamento
    const cents = Math.abs(parseAmountToCents(valor) ?? NaN);
    if (!isFinite(cents) || !cents) return onDone({ error: t('common.invalidAmount') });
    if (!desc.trim()) return onDone({ error: t('quick.err.desc') });
    if (!cat) return onDone({ error: t('quick.err.cat') });
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
    onDone(d.error
      ? { error: d.error }
      : { msg: isDespesa ? t('quick.done.expense') : t('quick.done.income') });
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 420 }}>
        <div className="modal-head">
          <h3 style={{ color: isDespesa ? 'var(--red)' : 'var(--green)' }}>
            {isDespesa ? t('quick.title.expense') : t('quick.title.income')}
          </h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ padding: 20 }}>
          <div className="cat-editor" style={{ margin: 0, background: 'none', padding: 0 }}>
            <input autoFocus placeholder={t('common.amountPlaceholder', { symbol: currencySymbol() })} inputMode="decimal"
              style={{ fontSize: 22, fontWeight: 700, textAlign: 'center' }}
              value={valor} onChange={e => setValor(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && save()} />
            <input placeholder={isDespesa ? t('quick.descExpense') : t('quick.descIncome')}
              value={desc} onChange={e => setDesc(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && save()} />
            <div className="btn-row">
              <input type="date" style={{ flex: 1 }} value={date} onChange={e => setDate(e.target.value)} />
              <select className="control" style={{ flex: 1 }} value={cat} onChange={e => setCat(e.target.value)}>
                <option value="">{t('common.categoryPick')}</option>
                {Object.keys(categories).map(c => (
                  <option key={c} value={c}>{emojis[c] ? `${emojis[c]} ` : ''}{label(c)}</option>
                ))}
              </select>
            </div>
            <button disabled={busy} onClick={save}
              style={{ background: isDespesa ? 'var(--red)' : 'var(--green)', color: '#fff',
                border: 0, borderRadius: 10, padding: '10px 14px', fontSize: 14,
                fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              {busy ? t('common.saving') : t('quick.submit')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
