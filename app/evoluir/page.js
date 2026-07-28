'use client';

import { useEffect, useMemo, useState } from 'react';
import { IDEIAS } from '@/lib/ideias-renda';
import { t } from '@/lib/i18n';
import SeletorIdioma from '@/components/SeletorIdioma';
import { fmtMoney, parseAmountToCents } from '@/lib/format';

// valor digitado → centavos, sempre positivo (é aporte, não lançamento)
const money = s => Math.abs(parseAmountToCents(s) ?? 0);

// FV com aporte mensal: inicial·(1+i)^n + aporte·[((1+i)^n − 1)/i]
function simulate(inicialCents, aporteCents, taxaAnualPct, meses) {
  const i = Math.pow(1 + taxaAnualPct / 100, 1 / 12) - 1;
  const fator = Math.pow(1 + i, meses);
  const fv = i > 0
    ? inicialCents * fator + aporteCents * ((fator - 1) / i)
    : inicialCents + aporteCents * meses;
  const aportado = inicialCents + aporteCents * meses;
  return { fv: Math.round(fv), aportado, rendimento: Math.round(fv) - aportado };
}

const CATS = [
  ['todas', '', 'common.all'],
  ['digital', '💻', 'evolve.cat.digital'],
  ['servicos', '🛠', 'evolve.cat.services'],
  ['vendas', '🛍', 'evolve.cat.sales'],
];

const HORIZONS = [['evolve.y1', 12], ['evolve.y5', 60], ['evolve.y10', 120]];

export default function Evoluir() {
  const [inicial, setInicial] = useState('0,00');
  const [aporte, setAporte] = useState('500,00');
  const [taxa, setTaxa] = useState('');
  const [filtro, setFiltro] = useState('todas');

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('aporte');
    if (p && isFinite(+p)) setAporte((+p / 100).toFixed(2).replace('.', ','));
  }, []);

  const taxaNum = parseFloat(String(taxa).replace(',', '.'));
  const rows = useMemo(() => {
    if (!isFinite(taxaNum) || taxaNum <= 0 || taxaNum > 100) return null;
    const ini = money(inicial), apo = money(aporte);
    if (!ini && !apo) return null;
    return HORIZONS.map(([key, n]) => ({ label: t(key), ...simulate(ini, apo, taxaNum, n) }));
  }, [inicial, aporte, taxaNum]);

  const maxFv = rows ? Math.max(...rows.map(r => r.fv)) : 1;
  const ideias = IDEIAS.filter(i => filtro === 'todas' || i.categoria === filtro);

  return (
    <div className="container">
      <header>
        <div className="logo" style={{ gap: 14 }}>
          <a href="/" className="hbtn desk-only" style={{ textDecoration: 'none' }}>← {t('nav.dashboard')}</a>
          <span><img src="/icon.svg" alt="" width={26} height={26} style={{ borderRadius: 8, verticalAlign: 'middle', marginRight: 8 }} />{t('nav.evolve')}</span>
        </div>
        <SeletorIdioma />
        <button className="theme-toggle" title={t('common.privacyTitle')} onClick={() => {
          const on = document.documentElement.classList.toggle('privacy');
          try { localStorage.setItem('fluxo-privacy', on ? '1' : '0'); } catch (e) {}
        }} style={{ marginRight: 8 }}>👁</button>
        <button className="theme-toggle" title={t('common.themeTitle')} onClick={() => {
          document.documentElement.classList.toggle('dark');
          try {
            localStorage.setItem('fluxo-theme',
              document.documentElement.classList.contains('dark') ? 'dark' : 'light');
          } catch (e) {}
        }}>◐</button>
      </header>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head"><h2>{t('evolve.calcTitle')}</h2></div>
        <div className="panel-body">
          <div className="acc-form" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>{t('evolve.initial')}
              <input style={{ width: '100%', marginTop: 4 }} value={inicial}
                onChange={e => setInicial(e.target.value)} inputMode="decimal" />
            </label>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>{t('evolve.monthly')}
              <input style={{ width: '100%', marginTop: 4 }} value={aporte}
                onChange={e => setAporte(e.target.value)} inputMode="decimal" />
            </label>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>{t('evolve.rate')}
              <input style={{ width: '100%', marginTop: 4 }} value={taxa} placeholder={t('evolve.ratePlaceholder')}
                onChange={e => setTaxa(e.target.value)} inputMode="decimal" />
            </label>
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '10px 0 0' }}>
            {t('evolve.rateHelp')}
          </p>

          {rows ? (
            <div style={{ marginTop: 16 }}>
              {rows.map(r => (
                <div key={r.label} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                    <b>{r.label}</b>
                    <span className="amount">{fmtMoney(r.fv)}</span>
                  </div>
                  <div className="goal-bar" style={{ height: 14 }}>
                    <div style={{
                      width: `${r.fv / maxFv * 100}%`, height: '100%', borderRadius: 99, display: 'flex', overflow: 'hidden',
                    }}>
                      <span style={{ width: `${r.aportado / r.fv * 100}%`, background: 'var(--accent)' }} />
                      <span style={{ flex: 1, background: 'var(--green)' }} />
                    </div>
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3 }}>
                    <span style={{ color: 'var(--accent)' }}>■</span> {t('evolve.contributed')} {fmtMoney(r.aportado)} ·{' '}
                    <span style={{ color: 'var(--green)' }}>■</span> {t('evolve.earnings')} {fmtMoney(r.rendimento)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty" style={{ padding: 24 }}>
              {t('evolve.fillToSimulate')}
            </div>
          )}

          <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            ⚠️ {t('evolve.disclaimer')}
          </p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>{t('evolve.ideasTitle')}</h2>
          <div style={{ display: 'flex', gap: 6 }}>
            {CATS.map(([k, ico, labelKey]) => (
              <button key={k} className="hbtn" style={{ height: 28, fontSize: 12,
                ...(filtro === k ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}) }}
                onClick={() => setFiltro(k)}>{ico ? `${ico} ` : ''}{t(labelKey)}</button>
            ))}
          </div>
        </div>
        <div className="panel-body">
          <div className="acc-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {ideias.map(i => (
              <div className="acc-card" key={i.key}>
                <b>{i.titulo}</b>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {t('evolve.ideaMeta', { invest: i.investimento, effort: i.esforco })}
                </div>
                <div style={{ fontSize: 12.5, marginTop: 4 }}>
                  <div style={{ fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', marginBottom: 4 }}>{t('evolve.howToStart')}</div>
                  {i.passos.map((p, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
                      <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{idx + 1}.</span>
                      <span>{p}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 12 }}>
            {t('evolve.ideasFooter')}
          </p>
        </div>
      </div>
    </div>
  );
}
