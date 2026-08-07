'use client';

// Conversor de moeda — uma CALCULADORA, não uma conversão de dados.
//
// Nada daqui toca em lançamento, saldo ou total. Ver o comentário longo em
// app/api/rates/route.js sobre por que essa linha não pode ser cruzada.
//
// O que a tela precisa dizer, e diz: de onde vem a taxa, de que dia ela é, e
// que ela não é a taxa que o seu banco cobra. Um conversor que mostra
// "R$ 5,0998" sem contexto faz o usuário achar que foi enganado quando comprar
// a R$ 5,42 — e o culpado vai parecer o app.

import { useEffect, useState } from 'react';
import { t } from '@/lib/i18n';

// As mais prováveis primeiro; o resto vem do que a fonte devolver.
const DESTAQUE = ['USD', 'BRL', 'EUR', 'GBP', 'ARS'];

const num = (s) => {
  const v = parseFloat(String(s).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(v) ? v : null;
};

export default function Conversor({ onClose }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [de, setDe] = useState('USD');
  const [para, setPara] = useState('BRL');
  const [valor, setValor] = useState('100');

  useEffect(() => {
    fetch('/api/rates')
      .then(r => r.json())
      .then(d => (d.error ? setErro(d.error) : setDados(d)))
      .catch(e => setErro(String(e.message || e)));
  }, []);

  const moedas = dados
    ? [...DESTAQUE.filter(c => dados.rates[c]),
       ...Object.keys(dados.rates).filter(c => !DESTAQUE.includes(c)).sort()]
    : [];

  // Regra de três sobre a base da fonte. Uma única requisição cobre todos os
  // pares, e nenhuma taxa é interpolada ou arredondada antes da hora.
  const taxa = dados && dados.rates[de] && dados.rates[para]
    ? dados.rates[para] / dados.rates[de] : null;
  const entrada = num(valor);
  const saida = taxa != null && entrada != null ? entrada * taxa : null;

  const fmt = (v, moeda) => new Intl.NumberFormat(undefined, {
    style: 'currency', currency: moeda, maximumFractionDigits: 2,
  }).format(v);

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-head">
          <div>
            <h3>{t('fx.title')}</h3>
            <p>{t('fx.help')}</p>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {erro && <div className="empty">{t('fx.offline')}</div>}
          {!erro && !dados && <div className="empty">{t('common.loading')}</div>}

          {dados && (
            <>
              <div className="fx-row">
                <input className="control" inputMode="decimal" value={valor}
                  onChange={e => setValor(e.target.value)} aria-label={t('fx.amount')} />
                <select className="control" value={de} onChange={e => setDe(e.target.value)}>
                  {moedas.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <button className="hbtn" title={t('fx.swap')}
                  onClick={() => { setDe(para); setPara(de); }}>⇄</button>
                <select className="control" value={para} onChange={e => setPara(e.target.value)}>
                  {moedas.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div className="fx-result">
                {saida == null ? '—' : fmt(saida, para)}
              </div>
              {taxa != null && (
                <div className="fx-rate">1 {de} = {taxa.toFixed(4)} {para}</div>
              )}

              {/* Procedência. Não é rodapé legal: é o que separa um número
                  confiável de um número que parece confiável. */}
              <div className="fx-source">
                {dados.stale
                  ? t('fx.stale', { d: dados.date })
                  : t('fx.asOf', { d: dados.date })}
                <div>{t('fx.disclaimer')}</div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
