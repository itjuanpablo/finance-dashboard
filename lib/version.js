// Versão exibida na interface.
//
// Lida do package.json em build time, nunca digitada à mão: uma constante
// duplicada aqui desencontraria da versão real no primeiro `npm version` que
// alguém rodasse — e aí o rodapé mentiria justamente quando importa, que é
// quando alguém relata um problema e você pergunta "qual versão?".
//
// O `import` de JSON funciona no bundle do Next (cliente e servidor) e é
// eliminado do que não usa. `with { type: 'json' }` é a sintaxe estável no
// Node 22; o Next entende igual.
import pkg from '../package.json';

export const VERSION = pkg.version;

/** "v4.3.0" — como aparece na tela. */
export const VERSION_LABEL = `v${pkg.version}`;
