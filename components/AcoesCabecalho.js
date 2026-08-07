'use client';

// Os botões do canto direito do cabeçalho: idioma, PIN, privacidade e tema.
//
// ─── Por que virou componente ────────────────────────────────────────────────
// Estes botões estavam COPIADOS em cinco páginas, com o mesmo onClick e as
// mesmas três linhas de localStorage em cada uma. Só o painel tinha o
// invólucro `.header-right`; Administrar, Crescer e Resumos não tinham.
//
// Isso não é detalhe de organização: `header` é flex com
// `justify-content: space-between`, então SEM o invólucro cada botão vira um
// filho direto e o navegador espalha os quatro pela largura inteira da tela —
// exatamente o cabeçalho esparramado que aparecia em Administrar. Com o
// invólucro, os quatro contam como um filho só e ficam juntos à direita.
//
// A duplicação era a causa, não o sintoma: quem escreveu a quinta página não
// tinha como saber que faltava uma div. Agora só existe um lugar para errar.
//
// `children` entra ANTES dos botões fixos: é onde cada página põe o que é dela
// (os atalhos e o seletor de mês no painel, o filtro de ano em Evolução).

import { useState } from 'react';
import SeletorIdioma from './SeletorIdioma';
import Conversor from './Conversor';
import { configurePin } from './PinGate';
import { t } from '@/lib/i18n';

/** Alterna uma classe no <html> e lembra a escolha. */
function alternar(classe, chave) {
  const ligado = document.documentElement.classList.toggle(classe);
  try { localStorage.setItem(chave, ligado ? '1' : '0'); } catch (e) {}
  return ligado;
}

// Os dois botões abaixo mexem em classes do <html> direto, sem estado do
// React: quem "guarda" a escolha é o DOM mais o localStorage, e app/layout.js
// reaplica tudo antes da hidratação. Um useState aqui só criaria uma segunda
// fonte de verdade para a mesma informação.
export default function AcoesCabecalho({ children, pin = false }) {
  // O conversor é o único botão daqui com estado: ele abre um modal. Os outros
  // mexem em classes do <html> e não precisam do React para lembrar nada.
  const [fx, setFx] = useState(false);

  return (
    <div className="header-right">
      {children}

      <button className="theme-toggle" title={t('fx.title')}
        onClick={() => setFx(true)}>⇄</button>
      {fx && <Conversor onClose={() => setFx(false)} />}

      <SeletorIdioma />

      {pin && (
        <button className="theme-toggle" title={t('pin.configTitle')}
          onClick={async () => {
            const msg = await configurePin();
            if (msg) alert(msg);
          }}>🔒</button>
      )}

      <button className="theme-toggle" title={t('common.privacyTitle')}
        onClick={() => alternar('privacy', 'fluxo-privacy')}>
        👁
      </button>

      <button className="theme-toggle" title={t('common.themeTitle')}
        onClick={() => {
          // O tema não usa `alternar` porque a chave guarda 'dark'/'light', e
          // não '1'/'0' — o <script> de app/layout.js lê esse formato antes da
          // hidratação. Mudar aqui e esquecer lá faria a página piscar branca
          // a cada abertura.
          const escuro = document.documentElement.classList.toggle('dark');
          try { localStorage.setItem('fluxo-theme', escuro ? 'dark' : 'light'); } catch (e) {}
        }}>
        ◐
      </button>
    </div>
  );
}
