'use client';

import { useEffect, useState } from 'react';
import { t } from '@/lib/i18n';
import { resolveLocale, resolveCurrency } from '@/lib/format';

/**
 * Troca de idioma (e de moeda) pela própria tela.
 *
 * Por que RECARREGA a página em vez de re-renderizar: o texto vem de `t()`,
 * uma função pura chamada em ~340 pontos, e boa parte roda no servidor
 * (metadata, insights, mensagens de erro de API). Transformar tudo em hook
 * reativo seria uma reescrita grande para ganhar 300 ms numa ação que a pessoa
 * faz uma vez na vida. O reload é instantâneo em localhost e garante que
 * servidor e cliente concordem — que é o requisito difícil aqui.
 *
 * A moeda é um campo SEPARADO de propósito. Os valores no banco são centavos
 * sem moeda: se trocar o idioma trocasse a moeda junto, um saldo de R$ 1.000
 * viraria $ 1.000 em pesos — mesmo número, outro significado, sem conversão
 * nenhuma ter acontecido.
 */
export default function SeletorIdioma() {
  const [open, setOpen] = useState(false);
  const [cfg, setCfg] = useState(null);
  const [saving, setSaving] = useState(false);

  // Valor inicial vem do que o servidor injetou, então o botão já mostra a
  // bandeira certa no primeiro render — sem piscar.
  const [locale, setLocale] = useState(() => resolveLocale());
  const [currency, setCurrency] = useState(() => resolveCurrency());

  useEffect(() => {
    if (!open || cfg) return;
    fetch('/api/settings').then(r => r.json()).then(setCfg).catch(() => {});
  }, [open, cfg]);

  async function save() {
    setSaving(true);
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale, currency }),
    });
    if (!res.ok) { setSaving(false); return; }
    window.location.reload();
  }

  const dirty = locale !== resolveLocale() || currency !== resolveCurrency();

  return (
    <>
      <button className="theme-toggle" title={t('settings.language')}
        onClick={() => setOpen(true)}>🌐</button>

      {open && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setOpen(false)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-head">
              <div>
                <h3>{t('settings.title')}</h3>
                <p>{t('settings.help')}</p>
              </div>
              <button className="modal-close" onClick={() => setOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <label className="field">
                <span>{t('settings.language')}</span>
                <select className="control" value={locale}
                  onChange={e => setLocale(e.target.value)}>
                  {(cfg?.locales ?? [{ code: locale, label: locale }]).map(l => (
                    <option key={l.code} value={l.code}>{l.label}</option>
                  ))}
                </select>
              </label>

              <label className="field" style={{ marginTop: 14 }}>
                <span>{t('settings.currency')}</span>
                <select className="control" value={currency}
                  onChange={e => setCurrency(e.target.value)}>
                  {(cfg?.currencies ?? [{ code: currency, symbol: '', label: currency }]).map(c => (
                    <option key={c.code} value={c.code}>{c.code} · {c.label}</option>
                  ))}
                </select>
              </label>

              <p className="sub" style={{ marginTop: 12, lineHeight: 1.5 }}>
                {t('settings.currencyWarning')}
              </p>

              <div className="btn-row end" style={{ marginTop: 20 }}>
                <button className="hbtn" onClick={() => setOpen(false)}>{t('common.cancel')}</button>
                <button className="hbtn" disabled={!dirty || saving} onClick={save}
                  style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>
                  {saving ? t('common.saving') : t('settings.apply')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
