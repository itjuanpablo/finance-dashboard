'use client';

import { useMemo, useState } from 'react';
import { t, tn, catLabel } from '@/lib/i18n';
import { CAT } from '@/lib/categories';
import { merchantKey } from '@/lib/merchant';
import { fmtMoney } from '@/lib/format';

// Quantos grupos a tela mostra de uma vez. O resto é ANUNCIADO abaixo da
// lista — antes ficava escondido, e como o usuário limpava 25 e reabria para
// achar outros 25, parecia que categorizar não adiantava nada.
const VISIVEIS = 25;

// `label`: chave de categoria → nome exibido (ver LancamentoRapido).
export default function RevisaoMassa({ txs, categories, label = catLabel, onClose, onDone }) {
  const [busy, setBusy] = useState(null);

  const { groups, ocultos } = useMemo(() => {
    const map = {};
    for (const tx of txs) {
      if (tx.category !== CAT.TO_REVIEW) continue;
      const pattern = merchantKey(tx.description);
      if (pattern.length < 3) continue;
      // Acentos e caixa não podem separar grupos: "Farmácia" e "FARMÁCIA" são
      // o mesmo lugar, e antes viravam duas linhas para categorizar.
      const key = pattern.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
      const g = (map[key] = map[key] || { pattern, count: 0, cents: 0, sample: tx.description });
      g.count++;
      g.cents += Math.abs(tx.amount_cents);
    }
    const todos = Object.values(map).sort((a, b) => b.count - a.count);
    return { groups: todos.slice(0, VISIVEIS), ocultos: Math.max(0, todos.length - VISIVEIS) };
  }, [txs]);

  async function assign(group, category) {
    if (!category) return;
    setBusy(group.pattern);
    const res = await fetch('/api/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pattern: group.pattern, category, apply: true }),
    });
    const d = await res.json();
    setBusy(null);
    onDone(d.error
      ? { error: d.error }
      : { msg: t('review.applied', { pattern: group.pattern, cat: label(category), n: d.applied }) });
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 640 }}>
        <div className="modal-head">
          <div>
            <h3>{t('review.title')}</h3>
            <p>{t('review.help')}</p>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {groups.length === 0 && <div className="empty">{t('review.empty')}</div>}
          {groups.map(g => (
            <div className="list-row" key={g.pattern}>
              <div className="grow">
                <div style={{ fontWeight: 500 }}>{g.pattern}</div>
                <div className="sub">
                  {tn(g.count, 'import.tx')} · {fmtMoney(g.cents)}
                  {g.sample.toLowerCase() !== g.pattern.toLowerCase()
                    ? ` · ${t('review.sample', { s: g.sample.slice(0, 44) })}` : ''}
                </div>
              </div>
              <select className="control" value="" disabled={busy === g.pattern}
                onChange={e => assign(g, e.target.value)}>
                <option value="">{busy === g.pattern ? t('review.applying') : t('review.pick')}</option>
                {Object.keys(categories).map(c => <option key={c} value={c}>{label(c)}</option>)}
              </select>
            </div>
          ))}
          {ocultos > 0 && (
            <div className="sub" style={{ padding: '12px 0 4px', textAlign: 'center' }}>
              {t('review.more', { n: ocultos })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
