'use client';

import { useMemo, useState } from 'react';
import { t, tn, catLabel } from '@/lib/i18n';
import { CAT } from '@/lib/categories';
import { stripInstallment } from '@/lib/parsers/labels';
import { fmtMoney } from '@/lib/format';

// Prefixos operacionais que não identificam o estabelecimento.
// As duas línguas ficam sempre ativas porque isto é texto do BANCO, não da
// interface: um extrato brasileiro diz "Pagamento com QR Pix" mesmo numa
// instância em espanhol, e vice-versa.
const PREFIXES = [
  // pt-BR
  /^pagamento com qr pix\s+/i, /^pagamento\s+/i, /^compra\s+/i,
  /^transferência pix recebida\s+/i, /^transferência pix enviada\s+/i,
  /^dinheiro (retirado|reservado)\s+/i,
  // es-AR — Confiança: BAIXA, inferido; ajustar com extrato real
  /^pago con qr\s+/i, /^pago\s+/i, /^compra en\s+/i,
  /^transferencia (recibida|enviada)\s+/i, /^débito automático\s+/i,
];

function merchantPattern(desc) {
  let d = stripInstallment(desc);
  for (const p of PREFIXES) d = d.replace(p, '');
  const words = d.split(/\s+/).slice(0, 2).join(' ').trim();
  return words.length >= 3 ? words : d.slice(0, 12).trim();
}

// `label`: chave de categoria → nome exibido (ver LancamentoRapido).
export default function RevisaoMassa({ txs, categories, label = catLabel, onClose, onDone }) {
  const [busy, setBusy] = useState(null);

  const groups = useMemo(() => {
    const map = {};
    for (const tx of txs) {
      if (tx.category !== CAT.TO_REVIEW) continue;
      const pattern = merchantPattern(tx.description);
      if (pattern.length < 3) continue;
      const key = pattern.toLowerCase();
      const g = (map[key] = map[key] || { pattern, count: 0, cents: 0, sample: tx.description });
      g.count++;
      g.cents += Math.abs(tx.amount_cents);
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
        </div>
      </div>
    </div>
  );
}
