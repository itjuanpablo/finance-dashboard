'use client';

// Estado vazio reutilizável.
//
// A regra que este componente impõe: TODO estado vazio diz para que serve
// aquilo e como criar o primeiro. "Nenhum X ainda" não ensina nada — quem
// chegou ali já sabe que está vazio; o que falta é saber o próximo passo.
//
// Sem tour, sem modal, sem carrossel: título, uma ou duas frases, uma ação.
// Quem instala um app de finanças quer ver os próprios números, não um tutorial.

export default function EstadoVazio({
  icone = '📭',
  titulo,
  texto,
  nota,          // linha secundária (ex.: "os dados ficam no seu computador")
  acao,          // { label, onClick } ou { label, href }
  inline = false, // true = dentro de painel; false = ocupa a página
}) {
  return (
    <div className={`state${inline ? ' inline' : ''}`}>
      <div className="state-ico" aria-hidden="true">{icone}</div>
      {titulo && <h3>{titulo}</h3>}
      {texto && <p>{texto}</p>}
      {nota && <p style={{ fontSize: 12, opacity: 0.85 }}>{nota}</p>}
      {acao && (
        <div className="state-actions">
          {acao.href
            ? <a className="state-btn primary" href={acao.href}>{acao.label}</a>
            : <button className="state-btn primary" onClick={acao.onClick}>{acao.label}</button>}
        </div>
      )}
    </div>
  );
}
