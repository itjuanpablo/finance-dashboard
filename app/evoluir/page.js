'use client';

import { useEffect, useMemo, useState } from 'react';
import { IDEIAS } from '@/lib/ideias-renda';

const fmtBRL = c => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const parseMoney = s => {
  const v = parseFloat(String(s).replace(/R\$\s?/g, '').replace(/\./g, '').replace(',', '.'));
  return isFinite(v) ? Math.round(Math.abs(v) * 100) : 0;
};

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

const CATS = [['todas', 'Todas'], ['digital', '💻 Digital'], ['servicos', '🛠 Serviços'], ['vendas', '🛍 Vendas']];

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
    const ini = parseMoney(inicial), apo = parseMoney(aporte);
    if (!ini && !apo) return null;
    return [['1 ano', 12], ['5 anos', 60], ['10 anos', 120]]
      .map(([label, n]) => ({ label, ...simulate(ini, apo, taxaNum, n) }));
  }, [inicial, aporte, taxaNum]);

  const maxFv = rows ? Math.max(...rows.map(r => r.fv)) : 1;
  const ideias = IDEIAS.filter(i => filtro === 'todas' || i.categoria === filtro);

  return (
    <div className="container">
      <header>
        <div className="logo" style={{ gap: 14 }}>
          <a href="/" className="hbtn" style={{ textDecoration: 'none' }}>← Dashboard</a>
          <span><img src="/icon.svg" alt="" width={26} height={26} style={{ borderRadius: 8, verticalAlign: 'middle', marginRight: 8 }} />Evoluir</span>
        </div>
        <button className="theme-toggle" title="Modo privacidade: esconder valores" onClick={() => {
          const on = document.documentElement.classList.toggle('privacy');
          try { localStorage.setItem('fluxo-privacy', on ? '1' : '0'); } catch (e) {}
        }} style={{ marginRight: 8 }}>👁</button>
        <button className="theme-toggle" title="Alternar tema" onClick={() => {
          document.documentElement.classList.toggle('dark');
          try {
            localStorage.setItem('fluxo-theme',
              document.documentElement.classList.contains('dark') ? 'dark' : 'light');
          } catch (e) {}
        }}>◐</button>
      </header>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-head"><h2>Calculadora de reinvestimento</h2></div>
        <div className="panel-body">
          <div className="acc-form" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Valor inicial
              <input style={{ width: '100%', marginTop: 4 }} value={inicial}
                onChange={e => setInicial(e.target.value)} inputMode="decimal" />
            </label>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Aporte mensal
              <input style={{ width: '100%', marginTop: 4 }} value={aporte}
                onChange={e => setAporte(e.target.value)} inputMode="decimal" />
            </label>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>Taxa anual (%)
              <input style={{ width: '100%', marginTop: 4 }} value={taxa} placeholder="ex: taxa do CDI hoje"
                onChange={e => setTaxa(e.target.value)} inputMode="decimal" />
            </label>
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '10px 0 0' }}>
            A taxa muda com o tempo — pesquise "taxa CDI hoje" ou a rentabilidade do investimento que você
            está avaliando e digite aqui. Compare cenários trocando o valor.
          </p>

          {rows ? (
            <div style={{ marginTop: 16 }}>
              {rows.map(r => (
                <div key={r.label} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                    <b>{r.label}</b>
                    <span className="amount">{fmtBRL(r.fv)}</span>
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
                    <span style={{ color: 'var(--accent)' }}>■</span> aportado {fmtBRL(r.aportado)} ·{' '}
                    <span style={{ color: 'var(--green)' }}>■</span> rendimento {fmtBRL(r.rendimento)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty" style={{ padding: 24 }}>
              Preencha aporte e taxa para simular 1, 5 e 10 anos.
            </div>
          )}

          <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            ⚠️ Simulação educativa com juros compostos constantes — rentabilidade real varia e há impostos e
            inflação. Isto não é recomendação de investimento.
          </p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Ideias de renda extra</h2>
          <div style={{ display: 'flex', gap: 6 }}>
            {CATS.map(([k, label]) => (
              <button key={k} className="hbtn" style={{ height: 28, fontSize: 12,
                ...(filtro === k ? { borderColor: 'var(--accent)', color: 'var(--accent)' } : {}) }}
                onClick={() => setFiltro(k)}>{label}</button>
            ))}
          </div>
        </div>
        <div className="panel-body">
          <div className="acc-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {ideias.map(i => (
              <div className="acc-card" key={i.titulo}>
                <b>{i.titulo}</b>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  investimento: {i.investimento} · esforço: {i.esforco}
                </div>
                <div style={{ fontSize: 12.5, marginTop: 4 }}>
                  <div style={{ fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', marginBottom: 4 }}>Como começar</div>
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
            Cadastrou uma renda extra? Lance como receita no dashboard e use a calculadora acima para ver
            o que ela vira em 10 anos.
          </p>
        </div>
      </div>
    </div>
  );
}
