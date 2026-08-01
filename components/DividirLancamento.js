'use client';

// Dividir um lançamento entre categorias.
//
// A tela inteira gira em torno de uma coisa: o valor que FALTA distribuir.
// Enquanto ele não for zero, o botão fica desabilitado — porque uma divisão que
// não fecha não é um erro de digitação, é dinheiro inventado ou sumido. Mostrar
// o quanto falta o tempo todo evita que a pessoa descubra isso só ao salvar.
//
// A última parte se autocompleta com o que sobra: é o caso comum (dividir 200
// em 150 e o resto) e poupa a subtração de cabeça.

import { useMemo, useState } from 'react';
import { t } from '@/lib/i18n';
import { fmtMoney, currencySymbol, parseAmountToCents } from '@/lib/format';

export default function DividirLancamento({ tx, cats, labelOf, onClose, onDone }) {
  const [partes, setPartes] = useState(() => [
    { valor: '', category: tx.category },
    { valor: '', category: '' },
  ]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const total = tx.amount_cents;
  const sinal = Math.sign(total);

  // Centavos de cada parte, já com o sinal do original: quem digita "150" numa
  // despesa quer dizer −150. Exigir o sinal seria pedir para errar.
  const centavos = useMemo(
    () => partes.map(p => {
      const c = parseAmountToCents(p.valor);
      return c == null ? null : Math.abs(c) * sinal;
    }),
    [partes, sinal],
  );

  const soma = centavos.reduce((s, c) => s + (c || 0), 0);
  const falta = total - soma;
  const fecha = falta === 0 && centavos.every(c => c !== null && c !== 0);
  const completo = fecha && partes.every(p => p.category);

  const set = (i, campo, v) =>
    setPartes(ps => ps.map((p, j) => (j === i ? { ...p, [campo]: v } : p)));

  // Preenche a parte com o que falta — o atalho do caso comum.
  const completar = (i) => {
    const outras = centavos.reduce((s, c, j) => s + (j === i ? 0 : (c || 0)), 0);
    const resto = total - outras;
    if (resto === 0) return;
    set(i, 'valor', (Math.abs(resto) / 100).toFixed(2).replace('.', ','));
  };

  async function salvar() {
    setSalvando(true); setErro('');
    const res = await fetch('/api/transactions/split', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: tx.id,
        parts: partes.map((p, i) => ({
          amount_cents: centavos[i],
          category: p.category,
          description: p.descricao || undefined,
        })),
      }),
    });
    const d = await res.json();
    setSalvando(false);
    if (d.error) { setErro(d.error); return; }
    onDone(t('split.done', { n: d.parts }));
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-head">
          <div>
            <h3>{t('split.title')}</h3>
            <p>{t('split.help')}</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label={t('common.close')}>✕</button>
        </div>

        <div className="modal-body">
          <div className="split-origem">
            <span className="grow">{tx.description}</span>
            <b>{fmtMoney(total)}</b>
          </div>

          {partes.map((p, i) => (
            <div className="split-parte" key={i}>
              <input className="control" inputMode="decimal"
                placeholder={t('common.amountPlaceholder', { symbol: currencySymbol() })}
                aria-label={t('common.value')}
                value={p.valor} onChange={e => set(i, 'valor', e.target.value)} />
              <select className="control" value={p.category}
                aria-label={t('common.category')}
                onChange={e => set(i, 'category', e.target.value)}>
                <option value="">{t('common.categoryPick')}</option>
                {cats.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
              <button className="split-fill" onClick={() => completar(i)}
                title={t('split.remaining', { v: fmtMoney(Math.abs(falta)) })}
                disabled={falta === 0}>↧</button>
              {partes.length > 2 && (
                <button className="split-del" aria-label={t('common.delete')}
                  onClick={() => setPartes(ps => ps.filter((_, j) => j !== i))}>✕</button>
              )}
            </div>
          ))}

          <button className="state-btn" style={{ marginTop: 6 }}
            onClick={() => setPartes(ps => [...ps, { valor: '', category: '' }])}>
            + {t('split.addPart')}
          </button>

          <div className={`split-saldo ${fecha ? 'ok' : ''}`}>
            {fecha ? `✓ ${t('split.balanced')}` : t('split.remaining', { v: fmtMoney(Math.abs(falta)) })}
          </div>

          {erro && <p style={{ color: 'var(--red)', fontSize: 12.5 }}>{erro}</p>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button className="state-btn" onClick={onClose}>{t('common.cancel')}</button>
            <button className="state-btn primary" disabled={!completo || salvando} onClick={salvar}>
              {salvando ? t('common.saving') : t('split.action')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
