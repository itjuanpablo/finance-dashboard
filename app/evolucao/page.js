'use client';

// Curva de saldo + visão anual.
//
// A pergunta que o app não respondia. O dashboard e o relatório são mensais, e
// mês isolado não mostra tendência — dá para ter nove meses seguidos de melhora
// e não perceber nenhuma.
//
// Gráfico em SVG puro, sem biblioteca: são duas séries e um eixo. Puxar uma
// dependência de gráfico para isto custaria mais em peso e manutenção do que o
// código que ela substitui.

import { useEffect, useMemo, useState } from 'react';
import EstadoVazio from '@/components/EstadoVazio';
import AcoesCabecalho from '@/components/AcoesCabecalho';
import { t } from '@/lib/i18n';
import { fmtMoney, fmtMoney0, fmtMonthShort, fmtMonthLong, fmtDate } from '@/lib/format';

export default function Evolucao() {
  const [data, setData] = useState(null);
  const [ano, setAno] = useState('');

  useEffect(() => {
    fetch(`/api/saldo${ano ? `?year=${ano}` : ''}`)
      .then(r => r.json()).then(setData).catch(() => setData({ erro: true }));
  }, [ano]);

  if (!data) return <div className="container"><div className="loading">{t('common.loading')}</div></div>;

  return (
    <div className="container">
      <header>
        <div className="logo" style={{ gap: 14 }}>
          <a href="/" className="hbtn desk-only" title={t('nav.dashboard')} aria-label={t('nav.dashboard')} style={{ textDecoration: 'none' }}>←<span className="hbtn-label">{t('nav.dashboard')}</span></a>
          <span>📈 {t('evolution.title')}</span>
        </div>
        <AcoesCabecalho>
          {data.years?.length > 1 && (
            <select className="control" value={ano} onChange={e => setAno(e.target.value)}
              aria-label={t('evolution.yearFilter')}>
              <option value="">{t('filter.allPeriod')}</option>
              {data.years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
        </AcoesCabecalho>
      </header>

      {(data.erro || !data.months?.length) ? (
        <EstadoVazio icone="📈"
          titulo={t('evolution.emptyTitle')}
          texto={t('evolution.emptyText')}
          acao={{ label: t('empty.dashAction'), href: '/' }} />
      ) : (
        <>
          <Curva data={data} />
          <TabelaAnual months={data.months} absolute={data.absolute} />
        </>
      )}
    </div>
  );
}

// ── curva de saldo ───────────────────────────────────────────────────────────
function Curva({ data }) {
  const { points, absolute } = data;
  const W = 760, H = 220, P = 8;

  const g = useMemo(() => {
    if (!points?.length) return null;
    const vals = points.map(p => p.balance);
    let min = Math.min(...vals, 0), max = Math.max(...vals, 0);
    if (min === max) { min -= 100; max += 100; }
    const x = i => P + (i / Math.max(points.length - 1, 1)) * (W - 2 * P);
    const y = v => P + (1 - (v - min) / (max - min)) * (H - 2 * P);
    const linha = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.balance).toFixed(1)}`).join(' ');
    // A área precisa fechar na linha do ZERO, não na base do gráfico: com saldo
    // negativo, fechar embaixo pintaria como "acumulado" o que é dívida.
    const yZero = y(0);
    const area = `${linha} L${x(points.length - 1).toFixed(1)},${yZero.toFixed(1)} L${x(0).toFixed(1)},${yZero.toFixed(1)} Z`;
    return { linha, area, yZero, min, max, x, y };
  }, [points]);

  if (!g) return null;

  const primeiro = points[0], ultimo = points.at(-1);
  const variacao = ultimo.balance - (primeiro.balance - primeiro.delta);
  const subiu = variacao >= 0;

  return (
    <div className="panel" style={{ marginBottom: 20 }}>
      <div className="panel-head">
        <div>
          <h2>{absolute ? t('evolution.balanceTitle') : t('evolution.variationTitle')}</h2>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
            {absolute ? t('evolution.balanceHelp') : t('evolution.variationHelp')}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{fmtMoney(ultimo.balance)}</div>
          <div className="sub" style={{ color: subiu ? 'var(--green)' : 'var(--red)' }}>
            {subiu ? '↑' : '↓'} {fmtMoney(Math.abs(variacao))} {t('evolution.sincePeriod')}
          </div>
        </div>
      </div>
      <div className="panel-body">
        <svg viewBox={`0 0 ${W} ${H}`} className="curva" role="img"
          aria-label={t('evolution.chartAlt', {
            from: fmtDate(primeiro.date), to: fmtDate(ultimo.date),
            value: fmtMoney(ultimo.balance),
          })}>
          <defs>
            <linearGradient id="grad-saldo" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity=".28" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* linha do zero: a referência que importa quando o saldo é negativo */}
          <line x1={P} y1={g.yZero} x2={W - P} y2={g.yZero}
            stroke="var(--border)" strokeWidth="1" strokeDasharray="4 4" />
          <path d={g.area} fill="url(#grad-saldo)" />
          <path d={g.linha} fill="none" stroke="var(--accent)" strokeWidth="2"
            strokeLinejoin="round" strokeLinecap="round" />
        </svg>
        <div className="curva-eixo">
          <span>{fmtDate(primeiro.date)}</span>
          <span>{fmtMoney0(g.max)} … {fmtMoney0(g.min)}</span>
          <span>{fmtDate(ultimo.date)}</span>
        </div>
      </div>
    </div>
  );
}

// ── visão anual ──────────────────────────────────────────────────────────────
function TabelaAnual({ months, absolute }) {
  const maior = Math.max(...months.map(m => Math.max(m.income, m.expense)), 1);
  const totalIn = months.reduce((s, m) => s + m.income, 0);
  const totalOut = months.reduce((s, m) => s + m.expense, 0);

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h2>{t('evolution.yearTitle')}</h2>
          {/* `resultado` e `saldo` medem universos diferentes (ver api/saldo):
              um inclui compra no cartão no mês da compra, o outro é o que está
              na conta. Sem esta legenda, parecem dois números discordando. */}
          <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
            {absolute ? t('evolution.yearHelp') : t('evolution.yearHelpNoBalance')}
          </p>
        </div>
        <div style={{ textAlign: 'right', fontSize: 12.5 }}>
          <div style={{ color: 'var(--green)' }}>↑ {fmtMoney(totalIn)}</div>
          <div style={{ color: 'var(--red)' }}>↓ {fmtMoney(totalOut)}</div>
        </div>
      </div>
      <div className="panel-body">
        <div className="ano-grid">
          {months.map(m => {
            const sobrou = m.result >= 0;
            return (
              <div className="ano-row" key={m.ym}>
                <div className="ano-mes" title={fmtMonthLong(m.ym)}>{fmtMonthShort(m.ym)}</div>
                <div className="ano-barras">
                  <div className="ano-bar in" style={{ width: `${(m.income / maior) * 100}%` }} />
                  <div className="ano-bar out" style={{ width: `${(m.expense / maior) * 100}%` }} />
                </div>
                <div className={`ano-res ${sobrou ? 'pos' : 'neg'}`}>
                  {sobrou ? '+' : '−'}{fmtMoney(Math.abs(m.result))}
                </div>
                {absolute && (
                  <div className="ano-saldo">{m.balance != null ? fmtMoney(m.balance) : '—'}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
