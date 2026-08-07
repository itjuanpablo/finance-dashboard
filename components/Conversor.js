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
import { fmtDate } from '@/lib/format';

// Quais moedas existem e em que ordem é decisão de app/api/rates/route.js
// (const MOEDAS). Repetir a lista aqui criaria duas versões da mesma verdade,
// e a segunda a envelhecer seria esta.

// Aceita "1.234,56" e "1234.56": o usuário digita do jeito dele, e num app que
// existe em dois países não dá para presumir qual separador é o decimal.
const num = (s) => {
  const txt = String(s).trim();
  if (!txt) return null;
  const v = parseFloat(
    txt.includes(',') ? txt.replace(/\./g, '').replace(',', '.') : txt);
  return Number.isFinite(v) ? v : null;
};

const exibir = (v) => v == null ? '' : new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(v);

export default function Conversor({ onClose }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [de, setDe] = useState('USD');
  const [para, setPara] = useState('BRL');
  const [valor, setValor] = useState('100');
  // Qual dos dois campos o usuário está editando. Sem isto, formatar o campo
  // de baixo enquanto ele digita nele apagaria a vírgula no meio da digitação.
  const [lado, setLado] = useState('de');

  useEffect(() => {
    fetch('/api/rates')
      .then(r => r.json())
      .then(d => (d.error ? setErro(d.error) : setDados(d)))
      .catch(e => setErro(String(e.message || e)));
  }, []);

  const moedas = dados ? Object.keys(dados.rates) : [];

  // Regra de três sobre a base da fonte. Uma única requisição cobre todos os
  // pares, e nenhuma taxa é interpolada ou arredondada antes da hora.
  const taxa = dados && dados.rates[de] && dados.rates[para]
    ? dados.rates[para] / dados.rates[de] : null;

  const digitado = num(valor);
  const convertido = taxa == null || digitado == null ? null
    : lado === 'de' ? digitado * taxa : digitado / taxa;

  // O campo que está sendo digitado mostra o texto cru; o outro mostra o
  // resultado formatado.
  const textoDe = lado === 'de' ? valor : exibir(convertido);
  const textoPara = lado === 'para' ? valor : exibir(convertido);

  function inverter() {
    setDe(para); setPara(de);
    // O que estava embaixo sobe: inverter tem de preservar a conta na tela,
    // não zerá-la.
    if (convertido != null) { setValor(exibir(convertido)); setLado(lado); }
  }

  // Alguma das duas moedas escolhidas vem da fonte complementar?
  const extras = dados?.extra ?? [];
  const outraFonte = extras.includes(de) || extras.includes(para);
  // O peso argentino merece aviso próprio: na Argentina convivem oficial, blue
  // e MEP ao mesmo tempo, legalmente. Mostrar UM número sem dizer isso é o tipo
  // de precisão falsa que faz alguém fechar negócio pelo valor errado.
  const temArs = de === 'ARS' || para === 'ARS';

  const painel = (rotulo, moeda, setMoeda, texto, qual) => (
    <div className="fx-panel">
      <div className="fx-panel-head">
        <span>{rotulo}</span>
        <select value={moeda} onChange={e => setMoeda(e.target.value)}>
          {moedas.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <input inputMode="decimal" value={texto} placeholder="0,00"
        aria-label={`${rotulo} — ${moeda}`}
        onChange={e => { setLado(qual); setValor(e.target.value); }} />
    </div>
  );

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
              <div className="fx-stack">
                {painel(t('fx.from'), de, setDe, textoDe, 'de')}
                <button className="fx-swap" title={t('fx.swap')}
                  aria-label={t('fx.swap')} onClick={inverter}>⇅</button>
                {painel(t('fx.to'), para, setPara, textoPara, 'para')}
              </div>

              {taxa != null && (
                <div className="fx-rate">1 {de} = {taxa.toFixed(4)} {para}</div>
              )}

              {/* Procedência. Não é rodapé legal: é o que separa um número
                  confiável de um número que parece confiável. */}
              <div className="fx-source">
                {dados.stale
                  ? t('fx.stale', { d: fmtDate(dados.date) })
                  : t('fx.asOf', { d: fmtDate(dados.date) })}
                <div>{t('fx.disclaimer')}</div>

                {/* Procedência por moeda. Só aparece quando é o caso: aviso que
                    sai sempre vira paisagem e ninguém lê no dia que importa. */}
                {outraFonte && <div className="fx-warn">{t('fx.extraSource')}</div>}
                {temArs && <div className="fx-warn">{t('fx.arsWarn')}</div>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
