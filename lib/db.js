// SQLite embutido do Node (>= 22.13) — sem dependência nativa, sem compilação.
// Inicialização preguiçosa + migração automática: bancos criados em versões
// anteriores ganham as tabelas/colunas novas sem perder nada.
import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import {
  CAT,
  CATEGORY_SEED,
  SYSTEM_CATEGORIES,
  LEGACY_NAME_TO_KEY,
  normalizeName,
  slugifyCategory,
  isCanonicalKey,
} from './categories.js';
import { t, catLabel } from './i18n/index.js';
import { setActive, getBrowserLocale } from './locale-state.js';
import { BUILD_LOCALE, DEFAULT_LOCALE, ENV_LOCALE, isSupportedLocale, defaultCurrencyFor } from './config.js';

// Versão do esquema (PRAGMA user_version). Histórico:
//   0–3  categorias identificadas pelo nome em português (Fluxo v1–v3.2)
//   4    categorias identificadas por chave estável (internacionalização)
//   5    tabela `settings` (idioma e moeda escolhidos na tela)
//   6    divisão de lançamento: transactions.parent_id + has_children
//   7    idioma deixa de ser semeado; ausência = "ninguém escolheu ainda"
//   8    transactions.currency: moeda do LANÇAMENTO (nulo = a da instalação)
//   9    accounts.currency: conta inteira em outra moeda (Conta Global do Inter)
//  10    invoice_settlements: quitação de fatura de cartão. Até aqui, "paga"
//        era reinferido a cada carregamento a partir de um crédito impresso
//        dentro do PDF da fatura SEGUINTE — quem pagava e não importava o mês
//        seguinte via "FATURA FECHADA" para sempre.
//  11    categories.parent_key: subcategoria (UM nível). O total do pai sempre
//        inclui os filhos — ver lib/arvore-categorias.js.
const SCHEMA_VERSION = 11;

/**
 * Predicado das transações que CONTAM. Use SEMPRE isto no WHERE, nunca
 * `deleted_at IS NULL` sozinho.
 *
 * São duas exclusões, e esquecer a segunda dá número errado em silêncio:
 *
 *  · `deleted_at IS NULL` — exclusão reversível (lixeira).
 *  · `has_children = 0`   — lançamento DIVIDIDO. Quando você reparte uma compra
 *    de mercado em "comida" e "limpeza", o original vira um contêiner: ele
 *    continua no banco porque guarda o `hash` que impede a reimportação do
 *    extrato duplicar tudo, mas quem vale são as partes. Contar os dois soma o
 *    valor duas vezes — e ninguém percebe, porque o total simplesmente fica
 *    maior.
 *
 * `scripts/testar-importacao.mjs` falha se alguma query em app/ ou lib/ filtrar
 * `deleted_at` sem este predicado.
 */
export const ACTIVE_TX = 'deleted_at IS NULL AND has_children = 0';

/**
 * Predicado da MOEDA DA INSTALAÇÃO. Use SEMPRE isto em qualquer soma de
 * `amount_cents`.
 *
 * `currency IS NULL` significa "na moeda da instalação" — o caso de quase toda
 * linha. Um extrato em dólar (Conta Global do Inter) grava 'USD', e somar essas
 * linhas com as demais produziria um total que nunca existiu: 86,69 dólares
 * viram 86,69 reais, errado por cerca de cinco vezes, e errado EM SILÊNCIO,
 * porque o número continua plausível.
 *
 * O app não converte moeda em lugar nenhum. Não há cotação no extrato — o do
 * Inter cobra em dólar e ponto —, e usar a cotação de hoje para um gasto de
 * julho dá um número que não corresponde a nada. Então as moedas são somadas
 * em separado e exibidas lado a lado, cada uma com seu símbolo.
 *
 * `scripts/testar-importacao.mjs` falha se alguma soma de `amount_cents` em
 * app/ ou lib/ esquecer este predicado.
 */
export const BASE_CURRENCY = 'currency IS NULL';

/** O contrário: só o que está em moeda estrangeira. */
export const FOREIGN_CURRENCY = 'currency IS NOT NULL';

export { CATEGORY_SEED, SYSTEM_CATEGORIES, CAT };

export const dataDir = () =>
  process.env.FLUXO_DATA_DIR || path.join(process.cwd(), 'data');

function ensureColumns(db, table, cols) {
  const existing = new Set(
    db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name));
  for (const [name, ddl] of Object.entries(cols)) {
    if (!existing.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${ddl}`);
  }
}

/**
 * Cópia datada do banco. Roda após cada importação (mantém as 30 últimas) e
 * antes de operação destrutiva — nesse caso com prefixo próprio, para a cópia
 * pré-migração não ser descartada pela rotação das cópias de importação.
 *
 * Devolve `{ path, error }` em vez de `path | null`. Motivo: backup que falha
 * calado é pior do que backup que não existe. Antes, `catch { return null }`
 * engolia disco cheio e permissão negada — a pessoa passava meses achando que
 * tinha cópia diária. Agora quem chama decide: importação AVISA e segue (o dado
 * já foi gravado), operação destrutiva ABORTA.
 *
 * O carimbo inclui milissegundos e a cópia usa criação exclusiva. Mesmo duas
 * importações que caiam no mesmo milissegundo ganham sufixos distintos: backup
 * não pode depender de a máquina ser lenta o bastante para não colidir.
 */
export function backupDb(db, tag = '') {
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    const dir = dataDir();
    const bdir = path.join(dir, 'backups');
    fs.mkdirSync(bdir, { recursive: true, mode: 0o700 });
    try { fs.chmodSync(bdir, 0o700); } catch {}
    const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
    const prefix = `fluxo-${tag ? `${tag}-` : ''}${stamp}`;
    let dest, attempt = 0;
    // COPYFILE_EXCL fecha a corrida entre "ver se existe" e copiar. O sufixo
    // também cobre chamadas no mesmo milissegundo, que são comuns em lote.
    while (true) {
      dest = path.join(bdir, `${prefix}${attempt ? `-${attempt + 1}` : ''}.db`);
      try {
        fs.copyFileSync(path.join(dir, 'fluxo.db'), dest, fs.constants.COPYFILE_EXCL);
        try { fs.chmodSync(dest, 0o600); } catch {}
        break;
      } catch (e) {
        if (e.code !== 'EEXIST') throw e;
        attempt++;
      }
    }
    if (!tag) {
      // rotação só das cópias automáticas de importação (fluxo-AAAAMMDD…)
      const olds = fs.readdirSync(bdir).filter(f => /^fluxo-\d/.test(f)).sort();
      while (olds.length > 30) fs.unlinkSync(path.join(bdir, olds.shift()));
    }
    return { path: dest, error: null };
  } catch (e) {
    // Log no servidor + erro no retorno: nunca mais "parou de fazer backup e
    // ninguém notou". A frase para a tela é montada por quem chama, com t().
    console.error(`[backup] falhou (tag=${tag || 'importacao'}): ${e.message}`);
    return { path: null, error: e.message };
  }
}

/**
 * v3 → v4: categorias passam a ser identificadas por chave estável.
 *
 * Antes, o nome em português era o identificador, copiado em
 * transactions.category, rules.category, goals.category e bills.category.
 * Aqui cada categoria recebe uma chave e todas as referências são reescritas
 * numa única transação. Categorias criadas pelo usuário (não reconhecidas pelo
 * mapa de nomes históricos) viram `custom = 1` e mantêm o nome digitado:
 * traduzir o "Dízimo" de alguém seria presunção do programa.
 *
 * @returns {Array<{oldName: string, key: string, custom: number}>|null}
 *          o mapeamento aplicado, ou null se não havia nada a migrar
 */
function migrateCategoryKeys(db) {
  const rows = db.prepare('SELECT id, name, key FROM categories').all();
  const pending = rows.filter(r => !r.key);
  if (!pending.length) return null;

  // Aborta sem backup: a mensagem de erro logo abaixo promete uma cópia em
  // data/backups/ — prometer cópia que não existe é pior do que não migrar.
  const bkp = backupDb(db, 'pre-v4');
  if (!bkp.path) {
    throw new Error(
      `Migração v4 abortada: não foi possível gravar o backup (${bkp.error}). ` +
      'O banco não foi alterado.');
  }

  const used = new Set(rows.filter(r => r.key).map(r => r.key));
  const mapping = [];
  for (const r of pending) {
    const known = LEGACY_NAME_TO_KEY[normalizeName(r.name)];
    const base = known && !used.has(known) ? known : slugifyCategory(r.name);
    let key = base, i = 2;
    while (used.has(key)) key = `${base}-${i++}`; // nomes que normalizam igual
    used.add(key);
    mapping.push({
      id: r.id,
      oldName: r.name,
      key,
      custom: isCanonicalKey(key) ? 0 : 1,
    });
  }

  db.exec('BEGIN');
  try {
    const setKey = db.prepare('UPDATE categories SET key = ?, custom = ? WHERE id = ?');
    const updaters = ['transactions', 'rules', 'goals', 'bills'].map(tb =>
      db.prepare(`UPDATE ${tb} SET category = ? WHERE category = ?`));

    for (const m of mapping) {
      setKey.run(m.key, m.custom, m.id);
      // `name` NÃO é reescrito: para chave canônica o nome exibido vem de i18n,
      // e sobrescrever aqui poderia colidir com o UNIQUE de uma categoria que o
      // usuário criou com esse mesmo nome no outro idioma.
      updaters.forEach(u => u.run(m.key, m.oldName));
    }
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_cat_key ON categories(key)');
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw new Error(
      `Falha na migração de categorias para chaves (v4): ${e.message}. ` +
      'O banco não foi alterado; há uma cópia em data/backups/fluxo-pre-v4-*.db');
  }
  return mapping;
}

function createDb() {
  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  // Dados financeiros locais não devem ficar legíveis para outras contas do
  // computador. Em plataformas sem chmod POSIX, a proteção é simplesmente
  // ignorada sem impedir a abertura do app.
  try { fs.chmodSync(dir, 0o700); } catch {}
  const dbPath = path.join(dir, 'fluxo.db');
  const db = new DatabaseSync(dbPath);
  try { fs.chmodSync(dbPath, 0o600); } catch {}
  try {
    db.exec('PRAGMA journal_mode = WAL;');
  } catch {
    // alguns filesystems não suportam WAL; o journal padrão resolve
  }
  // Dois processos no mesmo arquivo é rotina aqui: `npm run dev` na 3000
  // enquanto o serviço launchd atende na 3210. Com o padrão (busy_timeout = 0)
  // a segunda escrita estoura SQLITE_BUSY na hora, no meio de uma importação.
  // 5 s é folgado para as transações deste app (milissegundos) e ainda evita
  // travar a interface caso o outro processo esteja de fato parado.
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_name TEXT NOT NULL,
      kind TEXT NOT NULL,
      inserted INTEGER NOT NULL DEFAULT 0,
      skipped INTEGER NOT NULL DEFAULT 0,
      imported_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      category TEXT NOT NULL,
      transfer INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL,
      external_id TEXT,
      hash TEXT NOT NULL UNIQUE,
      batch_id INTEGER REFERENCES batches(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date);
    -- Índices confirmados com EXPLAIN QUERY PLAN sobre o banco real: sem eles o
    -- SQLite fazia SCAN da tabela inteira. Não é performance teórica — é o
    -- desfazer de importação e a tela de categorias varrendo tudo a cada clique.
    --   batch_id      → DELETE ... WHERE batch_id = ? (desfazer importação)
    --   category      → GROUP BY category (estatísticas de /api/categories)
    --   (source,date) → faturas/cartões/contas filtram por origem E janela de
    --                   data; só com idx_tx_date o SQLite tem de reler as linhas
    --                   para testar a coluna source.
    CREATE INDEX IF NOT EXISTS idx_tx_batch ON transactions(batch_id);
    CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category);
    CREATE INDEX IF NOT EXISTS idx_tx_source_date ON transactions(source, date);
    -- idx_tx_parent fica DEPOIS de ensureColumns: a coluna parent_id é
    -- adicionada por ALTER TABLE (é da v6), então indexá-la aqui daria
    -- "SQL logic error" em qualquer banco novo.
    CREATE TABLE IF NOT EXISTS rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pattern TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS goals (
      category TEXT PRIMARY KEY,
      limit_cents INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT NOT NULL,
      emoji TEXT NOT NULL DEFAULT '',
      archived INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      institution TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT 'corrente',
      initial_cents INTEGER NOT NULL DEFAULT 0,
      initial_date TEXT NOT NULL DEFAULT '1970-01-01',
      archived INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      last4 TEXT NOT NULL DEFAULT '',
      limit_cents INTEGER NOT NULL DEFAULT 0,
      closing_day INTEGER NOT NULL DEFAULT 1,
      due_day INTEGER NOT NULL DEFAULT 10,
      archived INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS source_bindings (
      source TEXT PRIMARY KEY,
      account_id INTEGER REFERENCES accounts(id),
      card_id INTEGER REFERENCES cards(id)
    );
    CREATE TABLE IF NOT EXISTS bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      category TEXT NOT NULL,
      due_day INTEGER NOT NULL,
      frequency TEXT NOT NULL DEFAULT 'mensal',
      due_month INTEGER,
      match_pattern TEXT NOT NULL DEFAULT '',
      tolerance_pct INTEGER NOT NULL DEFAULT 10,
      archived INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bill_payments (
      bill_id INTEGER NOT NULL REFERENCES bills(id),
      ref TEXT NOT NULL,
      paid_at TEXT NOT NULL DEFAULT (datetime('now')),
      tx_id INTEGER,
      PRIMARY KEY (bill_id, ref)
    );

    -- Quitação de FATURA DE CARTÃO, afirmada pelo usuário.
    --
    -- Faturas continuam sendo derivadas das transações — não há tabela de
    -- faturas, e não deve haver. Mas "esta fatura foi paga" é um FATO que o
    -- usuário sabe e os dados não contam: o débito mora no extrato da conta,
    -- não no cartão, e o crédito de quitação só é impresso no PDF do mês
    -- seguinte. Antes disto, quem pagava em dia e não importava o mês seguinte
    -- via "FATURA FECHADA" indefinidamente.
    --
    -- tx_id guarda o lançamento do extrato que quitou, QUANDO a conciliação
    -- sugeriu e o usuário confirmou. Nulo = o usuário marcou na mão. Guardar a
    -- origem é o que permite desfazer com honestidade e é o que impede a
    -- sugestão de reaparecer para algo já resolvido.
    CREATE TABLE IF NOT EXISTS invoice_settlements (
      card_id    INTEGER NOT NULL REFERENCES cards(id),
      ref        TEXT    NOT NULL,               -- competência AAAA-MM
      paid_cents INTEGER NOT NULL,
      paid_on    TEXT,                           -- data do pagamento (AAAA-MM-DD)
      tx_id      INTEGER,                        -- lançamento conciliado, se houver
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (card_id, ref)
    );
  `);

  // migração: colunas novas em bancos antigos
  ensureColumns(db, 'goals', {
    rollover: 'INTEGER NOT NULL DEFAULT 0', // sobra/estouro do mês anterior ajusta o orçamento
  });
  ensureColumns(db, 'accounts', {
    // Moeda da CONTA. Nulo = a da instalação, que é o caso normal.
    //
    // Diferente de transactions.currency, que responde "este movimento foi em
    // quê"; aqui a pergunta é "esta conta guarda o quê". A Conta Global do
    // Inter é inteira em dólar: saldo, extrato e cartão. Sem esta coluna o
    // saldo dela apareceria com R$ na frente de um número em US$.
    currency: 'TEXT',
  });

  ensureColumns(db, 'transactions', {
    deleted_at: 'TEXT',
    original_date: 'TEXT',
    original_description: 'TEXT',
    original_amount_cents: 'INTEGER',
    account_id: 'INTEGER',
    invoice_ref: 'TEXT', // competência da fatura (AAAA-MM), gravada na importação
    // ─── Moeda do LANÇAMENTO, não da instalação ────────────────────────────
    // NULO significa "a moeda da instalação" — é o caso de 99% das linhas, e
    // manter nulo evita reescrever o banco inteiro numa migração.
    //
    // Por que no lançamento e não na conta: se ficasse só na conta, um extrato
    // em dólar importado ANTES de alguém vincular a conta entraria como real e
    // somaria com o resto. O fato "isto foi em dólar" nasce no arquivo, e o
    // parser é quem sabe — então é ali que tem de ser gravado, não depois.
    //
    // A regra que isto existe para sustentar: SOMA NUNCA CRUZA MOEDA. Nenhuma
    // cotação é inventada em lugar nenhum do app.
    currency: 'TEXT',
    // v6 — divisão de lançamento (ver ACTIVE_TX no topo do arquivo)
    parent_id: 'INTEGER REFERENCES transactions(id)',
    // Denormalizado de propósito: `has_children` poderia ser derivado com um
    // NOT EXISTS, mas ele entra em TODA query de listagem e soma. Coluna simples
    // é indexável, legível no WHERE e não deixa dúvida de leitura — o custo é
    // manter a coerência em dois lugares (dividir e desfazer), ambos numa
    // transação só.
    has_children: 'INTEGER NOT NULL DEFAULT 0',
  });
  // agora que parent_id existe (ver nota no bloco CREATE acima)
  db.exec('CREATE INDEX IF NOT EXISTS idx_tx_parent ON transactions(parent_id);');
  ensureColumns(db, 'categories', {
    key: 'TEXT',
    custom: 'INTEGER NOT NULL DEFAULT 0',
    // Categoria-mãe. Nulo = está no topo, que é o caso de todas até alguém
    // aninhar a primeira. Guarda a CHAVE, não o id, pelo mesmo motivo de
    // transactions.category: a chave é o eixo do app inteiro.
    //
    // Sem FK de propósito. O SQLite não a aplicaria por padrão aqui, e uma
    // restrição que não é verificada é pior que nenhuma — dá a impressão de
    // garantia. Quem garante são as guardas em lib/arvore-categorias.js e a
    // API; e `ordenarComFilhos` cuida do filho que ficou órfão.
    parent_key: 'TEXT',
  });

  const count = db.prepare('SELECT COUNT(*) AS n FROM categories').get().n;
  if (count === 0) {
    // primeira execução: chave canônica + nome no idioma da instância
    const ins = db.prepare(
      'INSERT INTO categories (key, name, color, emoji, sort_order, custom) VALUES (?, ?, ?, ?, ?, 0)');
    CATEGORY_SEED.forEach(([key, color, emoji], i) =>
      ins.run(key, t(`cat.${key}`), color, emoji, i));
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_cat_key ON categories(key)');
  } else {
    migrateCategoryKeys(db);
  }

  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version < 7) desemearIdioma(db);
  if (version < SCHEMA_VERSION) db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);

  // A escolha do .env, se houver, vira valor inicial de settings. A partir daí
  // quem manda é a tela — o .env passa a ser só semente.
  seedSettings(db);
  publishLocale(db);

  return db;
}

// ── settings: preferências da instalação ────────────────────────────────────

/** Valor de uma preferência, ou `fallback` se não existir. */
export function getSetting(db, key, fallback = null) {
  return db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? fallback;
}

/** Grava uma preferência. Locale/moeda passam a valer no próximo render. */
export function setSetting(db, key, value) {
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, String(value));
  if (key === 'locale' || key === 'currency') publishLocale(db);
}

/**
 * v7 — apaga o idioma que a v5/v6 semeou sozinha, para que as instalações que
 * já existem passem a detectar o idioma como as novas.
 *
 * Sem isto, a correção da v4.3.2 só valeria para quem instalasse do zero: quem
 * já abriu o app uma vez tem `settings.locale` gravado desde o primeiro boot e
 * continuaria vendo português para sempre.
 *
 * SÓ apaga se o valor for idêntico ao que a semeadura teria escrito
 * (BUILD_LOCALE). Se for diferente, alguém mexeu no seletor — é escolha
 * humana, e escolha humana não se desfaz por migração. O falso positivo
 * possível é quem escolheu na tela exatamente o mesmo idioma do build; para
 * essa pessoa, a detecção devolve o mesmo idioma que o navegador dela já usa,
 * então o resultado visível não muda.
 */
function desemearIdioma(db) {
  const atual = getSetting(db, 'locale');
  if (atual != null && atual === BUILD_LOCALE) {
    db.prepare("DELETE FROM settings WHERE key = 'locale'").run();
  }
}

function seedSettings(db) {
  // O idioma NÃO é semeado aqui de propósito.
  //
  // Antes, a primeira execução gravava `locale = BUILD_LOCALE` (pt-BR, se o
  // .env não disser outra coisa). Isso fazia o app abrir em português na
  // máquina de quem fala espanhol, e a pessoa tinha de trocar na mão — sendo
  // que o navegador dela já dizia, em toda requisição, qual idioma ela usa.
  //
  // Enquanto `settings.locale` está AUSENTE, o app segue o navegador (ver
  // resolveServerLocale, chamado em app/layout.js). A ausência é a informação:
  // significa "ninguém escolheu ainda". Assim que a pessoa mexe no seletor 🌐,
  // a chave passa a existir e a escolha dela vale para sempre — inclusive se
  // for igual à que o navegador sugeriria.
  // A moeda segue a mesma regra, e pelo mesmo motivo: semeá-la no primeiro boot
  // congelaria BRL antes de o app saber que quem abriu fala espanhol. Só é
  // gravada quando alguém DECLARA — no `.env` ou no seletor. Enquanto isso ela
  // acompanha o idioma resolvido (ver publishLocale).
  //
  // Moeda e idioma são campos separados de propósito: os valores no banco são
  // centavos sem moeda, então trocar o idioma depois NÃO pode arrastar a moeda
  // junto — R$ 1.000 viraria $ 1.000 em pesos sem conversão nenhuma.
  const envCurrency = process.env.NEXT_PUBLIC_FLUXO_CURRENCY;
  if (envCurrency && getSetting(db, 'currency') == null) {
    setSetting(db, 'currency', envCurrency);
  }
}

/** A pessoa já escolheu um idioma na tela? (ausência = ainda não) */
export const localeWasChosen = (db) => getSetting(db, 'locale') != null;

/**
 * Decide o idioma desta requisição.
 *
 * PRECEDÊNCIA, do mais forte para o mais fraco:
 *   1. settings.locale     — a pessoa escolheu no seletor 🌐. Vale para sempre.
 *   2. NEXT_PUBLIC_FLUXO_LOCALE — quem instalou declarou no `.env`.
 *   3. Accept-Language     — o navegador informa; usado só na 1ª execução.
 *   4. pt-BR
 *
 * O passo 3 é o que faz o app abrir em espanhol na máquina de quem fala
 * espanhol. Antes da v4.3.2 o passo 1 era gravado no primeiro boot com o valor
 * do passo 4, e a instalação nascia "escolhida" em português sem ninguém ter
 * escolhido nada. Um palpite gravado no banco vira decisão; um palpite deixado
 * de fora continua sendo palpite, e cede assim que a pessoa disser outra coisa.
 */
function resolveServerLocale(db) {
  const escolhido = getSetting(db, 'locale');
  if (isSupportedLocale(escolhido)) return escolhido;
  if (ENV_LOCALE) return ENV_LOCALE;
  const navegador = getBrowserLocale();
  if (isSupportedLocale(navegador)) return navegador;
  return DEFAULT_LOCALE;
}

/**
 * Empurra a escolha do banco para lib/locale-state.js, de onde lib/config.js lê.
 * Roda ao abrir o banco e a cada gravação — assim qualquer código de servidor
 * que já tenha chamado getDb() traduz no idioma certo sem receber parâmetro.
 */
function publishLocale(db) {
  const locale = resolveServerLocale(db);
  setActive({
    locale,
    // Sem moeda gravada, ela acompanha o idioma resolvido — senão uma
    // instalação detectada como espanhola mostraria pesos com "R$" na frente.
    currency: getSetting(db, 'currency') || defaultCurrencyFor(locale),
  });
}

/**
 * Idioma e moeda ativos, para o servidor injetar no HTML.
 *
 * Republica antes de devolver: o palpite do navegador chega DEPOIS que o banco
 * já foi aberto (app/layout.js registra o cabeçalho e só então lê), então o que
 * publishLocale gravou na abertura pode estar desatualizado. Sem isto o HTML
 * sairia em espanhol e o `t()` do servidor continuaria respondendo em
 * português — duas metades da mesma página em línguas diferentes.
 */
export function localeSettings(db) {
  publishLocale(db);
  const locale = resolveServerLocale(db);
  return {
    locale,
    currency: getSetting(db, 'currency') || defaultCurrencyFor(locale),
  };
}

// singleton — sobrevive ao hot reload do Next em dev
export function getDb() {
  const g = globalThis;
  return g.__fluxoDb ?? (g.__fluxoDb = createDb());
}

/** Migração exposta para o script de linha de comando (scripts/migrar-v4.mjs). */
export { migrateCategoryKeys };

/**
 * Categorias com o nome de exibição já resolvido (`label`): traduzido quando a
 * chave é canônica, o nome digitado quando é do usuário.
 */
export function categoryRows(db, { includeArchived = false } = {}) {
  const where = includeArchived ? '' : 'WHERE archived = 0';
  return db
    .prepare(`SELECT id, key, name, color, emoji, archived, sort_order, custom, parent_key
              FROM categories ${where} ORDER BY sort_order, id`)
    .all()
    .map(c => ({
      ...c,
      label: catLabel(c.key, c.name, c.custom),
      system: SYSTEM_CATEGORIES.includes(c.key),
    }));
}

/** Categorias ativas como { chave: cor } (contrato usado pelo dashboard) */
export function categoryColors(db) {
  const map = {};
  db.prepare('SELECT key, color FROM categories WHERE archived = 0 ORDER BY sort_order, id')
    .all().forEach(c => { map[c.key] = c.color; });
  return map;
}

/** Valida chave de categoria contra o banco (ativas) */
export function isValidCategory(db, key) {
  return !!db.prepare('SELECT 1 FROM categories WHERE key = ? AND archived = 0').get(key);
}

/** Chave → nome de exibição, para rótulos montados no servidor (insights, relatório). */
export function categoryLabeler(db) {
  const rows = new Map(
    db.prepare('SELECT key, name, custom FROM categories').all().map(r => [r.key, r]));
  return (key) => {
    const r = rows.get(key);
    return catLabel(key, r?.name, r?.custom);
  };
}
