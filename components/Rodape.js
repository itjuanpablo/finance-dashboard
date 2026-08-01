'use client';

// Rodapé com a versão instalada.
//
// Por que existe: quando alguém diz "isso está errado" ou "não funciona", a
// primeira pergunta é "qual versão você tem?" — e sem isso na tela a resposta é
// sempre "não sei". Num app que a pessoa instala e atualiza pela própria mão
// (git pull), duas máquinas rodando versões diferentes é a regra, não a exceção.
//
// Fica no rodapé, discreto, e some na impressão do relatório.

import { VERSION_LABEL } from '@/lib/version';
import { t } from '@/lib/i18n';

export default function Rodape() {
  return (
    <footer className="rodape no-print">
      <span>{t('app.name')} {VERSION_LABEL}</span>
      <span className="rodape-sep" aria-hidden="true">·</span>
      <span>{t('app.footerLocal')}</span>
    </footer>
  );
}
