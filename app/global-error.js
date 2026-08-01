'use client';

// Fronteira de erro do LAYOUT. Só entra em cena quando app/layout.js quebra —
// e nesse caso o React descarta a árvore inteira, por isso este arquivo tem de
// renderizar <html> e <body> por conta própria.
//
// POR QUE O TEXTO ESTÁ AQUI E NÃO NO DICIONÁRIO
//
// `t()` vem de lib/i18n, que importa lib/config → lib/locale-state. Se o erro
// que derrubou o layout tiver origem justamente nessa cadeia (uma preferência
// corrompida na tabela settings, por exemplo), importar o dicionário aqui
// quebraria a tela de erro também — e aí a pessoa volta ao ponto de partida:
// tela branca. Uma fronteira de erro não pode depender do que pode ter falhado.
//
// O custo é duplicar seis frases. O benefício é que esta tela aparece sempre.
// O idioma vem de `window.__FLUXO_LOCALE__`, injetado pelo servidor antes da
// hidratação (ver app/layout.js) — e, se nem isso existir, cai no português.

const TEXTO = {
  'pt-BR': {
    title: 'O aplicativo não conseguiu carregar',
    safe: 'Seus dados estão salvos.',
    text: 'O erro aconteceu antes da tela montar. Seus dados continuam no seu computador, intactos — o banco de dados só muda quando você importa ou edita algo.',
    reload: 'Recarregar',
    details: 'Detalhes técnicos',
    lang: 'pt-BR',
  },
  'es-AR': {
    title: 'La aplicación no pudo cargar',
    safe: 'Tus datos están guardados.',
    text: 'El error pasó antes de que la pantalla se armara. Tus datos siguen en tu computadora, intactos — la base solo cambia cuando importás o editás algo.',
    reload: 'Recargar',
    details: 'Detalles técnicos',
    lang: 'es-AR',
  },
};

export default function GlobalError({ error, reset }) {
  const locale = (typeof window !== 'undefined' && window.__FLUXO_LOCALE__) || 'pt-BR';
  const s = TEXTO[locale] || TEXTO['pt-BR'];

  return (
    <html lang={s.lang}>
      <body style={{
        fontFamily: 'system-ui, -apple-system, sans-serif',
        background: '#f8f9fb', color: '#1a1d29', margin: 0, padding: '48px 20px',
      }}>
        <div style={{
          maxWidth: 460, margin: '0 auto', padding: '32px 24px', textAlign: 'center',
          background: '#fff', border: '1px solid #e4e6ee', borderRadius: 16,
        }}>
          <div style={{ fontSize: 40, marginBottom: 14 }} aria-hidden="true">⚠️</div>
          <h1 style={{ fontSize: 18, margin: '0 0 10px' }}>{s.title}</h1>
          <p style={{
            background: '#eef0ff', borderRadius: 10, padding: '10px 14px',
            fontSize: 13.5, lineHeight: 1.6, margin: '14px 0',
          }}>
            <b>{s.safe}</b> {s.text}
          </p>
          <button onClick={() => reset()} style={{
            minHeight: 44, padding: '11px 18px', borderRadius: 10,
            border: 'none', background: '#4f46e5', color: '#fff',
            fontSize: 14, fontWeight: 500, cursor: 'pointer',
          }}>↻ {s.reload}</button>

          <details style={{ marginTop: 22, textAlign: 'left' }}>
            <summary style={{ cursor: 'pointer', fontSize: 12.5, color: '#71768a' }}>
              {s.details}
            </summary>
            <pre style={{
              background: '#f8f9fb', border: '1px solid #e4e6ee', borderRadius: 8,
              padding: 12, fontSize: 11.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>{error?.message || String(error)}{error?.digest ? `\n${error.digest}` : ''}</pre>
          </details>
        </div>
      </body>
    </html>
  );
}
