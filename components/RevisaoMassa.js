'use client';

import { useMemo, useState } from 'react';

const fmtBRL = c => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Prefixos operacionais que não identificam o estabelecimento
const PREFIXES = [
  /^pagamento com qr pix\s+/i, /^pagamento\s+/i, /^compra\s+/i,
  /^transferência pix recebida\s+/i, /^transferência pix enviada\s+/i,
  /^dinheiro (retirado|reservado)\s+/i,
];

function merchantPattern(desc) {
  let d = desc.replace(/\s*\(parcela \d+\/\d+\)$/, '').trim();
  for (const p of PREFIXES) d = d.replace(p, '');
  const words = d.split(/\s+/).slice(0, 2).join(' ').trim();
  return words.length >= 3 ? words : d.slice(0, 12).trim();
}

export default function RevisaoMassa({ txs, categories, onClose, onDone }) {
  const [busy, setBusy] = useState(null);

  const groups = useMemo(() => {
    const map = {};
    for (const t of txs) {
      if (t.category !== 'A revisar') continue;
      const pattern = merchantPattern(t.description);
      if (pattern.length < 3) continue;
      const key = pattern.toLowerCase();
      const g = (map[key] = map[key] || { pattern, count: 0, cents: 0, sample: t.description });
      g.count++;
      g.cents += Math.abs(t.amount_cents);
    }
    return Object.values(map).sort((a, b) => b.count - a.count).slice(0, 25);
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
      : { msg: `"${group.pattern}" → ${category} (${d.applied} transações + regra criada)` });
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 640 }}>
        <div className="modal-head">
          <div>
            <h3>Revisão em massa</h3>
            <p>Pendências agrupadas por estabelecimento. Escolher a categoria cria a regra e aplica a todo o grupo — importações futuras já vêm certas.</p>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {groups.length === 0 && <div className="empty">Nada a revisar. 🎉</div>}
          {groups.map(g => (
            <div className="list-row" key={g.pattern}>
              <div className="grow">
                <div style={{ fontWeight: 500 }}>{g.pattern}</div>
                <div className="sub">
                  {g.count} transaç{g.count > 1 ? 'ões' : 'ão'} · {fmtBRL(g.cents)}
                  {g.sample.toLowerCase() !== g.pattern.toLowerCase() ? ` · ex: ${g.sample.slice(0, 44)}` : ''}
                </div>
              </div>
              <select className="control" value="" disabled={busy === g.pattern}
                onChange={e => assign(g, e.target.value)}>
                <option value="">{busy === g.pattern ? 'Aplicando…' : 'Categorizar…'}</option>
                {Object.keys(categories).map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
