// Subcategorias: uma regra só, aplicada na borda de cada soma.
//
// ─── O problema que quase matou a ideia ──────────────────────────────────────
// Categoria atravessa o app inteiro: a rosca do painel, o relatório mensal, a
// fatura do cartão, os insights, as metas, catorze seletores. Assim que existe
// pai e filho, TODA soma passa a ter duas respostas possíveis — "Alimentação"
// é o gasto dela sozinha, ou ela mais Mercado mais Restaurante?
//
// Reescrever dez lugares para decidir isso é como se produz dois números
// discordando na mesma tela: basta um deles escolher diferente, e ninguém nota
// até alguém somar na mão. Já aconteceu neste projeto — a contagem por
// categoria filtrava moeda e a exclusão não, e só um teste pegou.
//
// ─── A regra ─────────────────────────────────────────────────────────────────
// O total de um pai SEMPRE inclui os filhos. Em todo lugar. Sem exceção.
//
// Uma regra universal não precisa ser decidida em lugar nenhum — e é por isso
// que ela cabe numa função. Cada soma continua sendo escrita do jeito ingênuo,
// agrupando por chave; no fim, passa o resultado por `dobrar()`. Uma linha por
// lugar, e um único ponto para acertar ou errar.
//
// ─── Por que só um nível ─────────────────────────────────────────────────────
// Pai não pode ter pai. Com dois níveis a dobra vira recursão, o seletor vira
// árvore, e a pergunta "quanto gastei em X" ganha três respostas. Um nível
// resolve organizar e ver; o resto é complexidade comprada adiantado.

/**
 * Mapa chave→pai, a partir da lista que a API devolve.
 *
 * Só registra a mãe se ela EXISTIR na lista. Um `parent_key` apontando para
 * categoria apagada criaria, na dobra, uma linha fantasma no gráfico — com
 * nome de chave crua e dinheiro de verdade dentro. O filho órfão vira raiz,
 * que é o mesmo tratamento de `ordenarComFilhos`.
 */
export function paisDe(categorias) {
  const lista = categorias || [];
  const existe = new Set(lista.map(c => c?.key).filter(Boolean));
  const pai = {};
  for (const c of lista) {
    if (c?.key && c.parent_key && existe.has(c.parent_key)) pai[c.key] = c.parent_key;
  }
  return pai;
}

/**
 * Soma cada filho no pai, PRESERVANDO o valor próprio do filho.
 *
 * Entra `{ mercado: 300, alimentacao: 50 }` com mercado filho de alimentação,
 * sai `{ mercado: 300, alimentacao: 350 }`.
 *
 * O filho continua no mapa de propósito: quem quer ver o detalhe já tem, e
 * quem quer o total do pai também. Quem NÃO pode fazer as duas coisas ao mesmo
 * tempo é o somatório geral — daí `apenasRaizes` abaixo.
 *
 * @param {Record<string, number>} mapa chave da categoria → valor
 * @param {Array} categorias lista da API (precisa de `key` e `parent_key`)
 * @returns {Record<string, number>} novo mapa; o original não é tocado
 */
export function dobrar(mapa, categorias) {
  const pai = paisDe(categorias);
  const saida = { ...(mapa || {}) };
  for (const [chave, valor] of Object.entries(mapa || {})) {
    const p = pai[chave];
    if (p && p !== chave) saida[p] = (saida[p] || 0) + valor;
  }
  return saida;
}

/**
 * Só as categorias de topo, já com os filhos dobrados dentro.
 *
 * É isto que a rosca e o total do mês usam. Somar o mapa dobrado inteiro
 * contaria cada filho DUAS vezes — uma nele, outra dentro do pai. Esse é o
 * erro óbvio que este arquivo existe para impedir, e tem teste próprio.
 */
export function apenasRaizes(mapa, categorias) {
  const pai = paisDe(categorias);
  const dobrado = dobrar(mapa, categorias);
  const saida = {};
  for (const [chave, valor] of Object.entries(dobrado)) {
    if (!pai[chave]) saida[chave] = valor;
  }
  return saida;
}

/** Filhos diretos de uma categoria, na ordem em que a API os devolveu. */
export const filhosDe = (chave, categorias) =>
  (categorias || []).filter(c => c.parent_key === chave);

/**
 * Ordena para exibição: cada pai seguido dos seus filhos.
 *
 * Devolve `{ ...categoria, nivel }` — 0 para topo, 1 para filho — para a tela
 * indentar sem precisar consultar a árvore de novo.
 */
export function ordenarComFilhos(categorias) {
  const lista = categorias || [];
  const raizes = lista.filter(c => !c.parent_key);
  const saida = [];
  for (const r of raizes) {
    saida.push({ ...r, nivel: 0 });
    for (const f of filhosDe(r.key, lista)) saida.push({ ...f, nivel: 1 });
  }
  // Filho cujo pai sumiu (arquivado, apagado) não pode desaparecer da tela:
  // ele ainda tem lançamentos, e uma categoria invisível é dinheiro invisível.
  for (const c of lista) {
    if (c.parent_key && !saida.some(x => x.key === c.key)) saida.push({ ...c, nivel: 0 });
  }
  return saida;
}

/**
 * Opções prontas para um `<select>`: pai seguido dos filhos, filho recuado.
 *
 * O recuo é feito com espaços sem quebra porque `<option>` ignora CSS de
 * indentação na maioria dos navegadores — `optgroup` até resolveria, mas ele
 * torna o pai NÃO SELECIONÁVEL, e aqui a mãe é uma categoria de verdade, que
 * pode receber lançamento.
 */
export function opcoesDeCategoria(categorias) {
  return ordenarComFilhos(categorias).map(c => ({
    key: c.key,
    texto: (c.nivel ? '    ↳ ' : '') +
           (c.emoji ? `${c.emoji} ` : '') + (c.label ?? c.key),
  }));
}

/** "Alimentação › Mercado" — para quando a linha aparece fora do contexto do pai. */
export function rotuloCompleto(chave, categorias) {
  const c = (categorias || []).find(x => x.key === chave);
  if (!c) return chave;
  const p = c.parent_key && (categorias || []).find(x => x.key === c.parent_key);
  return p ? `${p.label ?? p.key} › ${c.label ?? c.key}` : (c.label ?? c.key);
}

/**
 * O pai escolhido é válido?
 *
 * Regras, e cada uma tem motivo:
 *  - não pode ser ela mesma        → ciclo de um nó
 *  - o pai não pode ter pai        → o limite de um nível
 *  - quem já tem filho não vira filho → idem, pelo outro lado
 *  - categoria de sistema fica fora → "Transferências" e "A revisar" são
 *    mecanismo do app, não gaveta do usuário
 *
 * @returns {string|null} chave do problema (para traduzir), ou null se ok
 */
export function problemaComPai(chave, paiPretendido, categorias) {
  if (!paiPretendido) return null;
  const lista = categorias || [];
  const eu = lista.find(c => c.key === chave);
  const pai = lista.find(c => c.key === paiPretendido);

  if (!pai) return 'manage.parentNotFound';
  if (paiPretendido === chave) return 'manage.parentSelf';
  if (pai.parent_key) return 'manage.parentTooDeep';
  if (eu && lista.some(c => c.parent_key === chave)) return 'manage.parentHasKids';
  if (pai.system || eu?.system) return 'manage.parentSystem';
  return null;
}
