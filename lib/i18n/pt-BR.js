// Dicionário pt-BR — idioma de referência do projeto.
// Chave ausente aqui vira fallback de todos os outros locales, então este
// arquivo é o contrato: toda chave nova nasce aqui primeiro.
//
// Convenção de chaves: <area>.<coisa>[.variante]
//   cat.*      nomes de categoria canônica
//   common.*   verbos e rótulos reusados (salvar, cancelar, desfazer…)
//   month.*    nomes de mês (1–12), para seletor de conta anual
//   nav.*      navegação
//   filter.*   opções de filtro de lista (período, categoria, tipo)
//   dash.*     página inicial
//   manage.*   /gerenciar
//   cards.*    /cartoes
//   evolve.*   /evoluir (calculadora de juros compostos)
//   report.*   /relatorio
//   import.*   pipeline de importação e mensagens de erro de parser
//   export.*   exportação de CSV
//   bank.*     nomes e rótulos de instituições/formatos
//   insight.*  motor de insights
//   bills.*    contas a pagar
//   review.*   revisão em massa
//   quick.*    lançamento rápido
//   pin.*      tela de PIN
//   error.*    fronteiras de erro (error.js, global-error.js, not-found.js)
//   empty.*    estados vazios que ensinam o próximo passo
//   trash.*    lixeira de lançamentos excluídos
//   split.*    divisão de um lançamento em partes
//   offline.*  tarja de sem conexão (service worker)
// Plural: sufixos `.one` / `.other`, interpolando {n}.

export default {
  // ── app ────────────────────────────────────────────────────────────────
  'app.name': 'Fluxo',
  'app.title': 'Fluxo — Finanças Pessoais',
  'app.description': 'Controle de gastos local, automatizado e minimalista',
  'app.shortcut.expense': 'Lançar despesa',
  'app.shortcut.income': 'Lançar receita',

  // ── categorias canônicas ───────────────────────────────────────────────
  'cat.food': 'Alimentação',
  'cat.transport': 'Transporte',
  'cat.housing': 'Moradia',
  'cat.shopping': 'Compras',
  'cat.leisure': 'Lazer',
  'cat.travel': 'Viagem',
  'cat.health': 'Saúde',
  'cat.subscriptions': 'Assinaturas',
  'cat.financial': 'Financeiro',
  'cat.income': 'Renda',
  'cat.transfers': 'Transferências',
  'cat.to_review': 'A revisar',

  // ── importação ─────────────────────────────────────────────────────────
  'import.dropzone': 'Arraste extratos e faturas aqui',
  'import.dropzoneHint': 'PDF do Mercado Pago, OFX ou CSV de qualquer banco',
  'import.detected': 'Detectado: {bank}',
  'import.result': '{file}: {inserted} novos, {skipped} já existentes',
  'import.tx.one': '{n} lançamento',
  'import.tx.other': '{n} lançamentos',
  'import.toReview.one': '{n} lançamento a revisar',
  'import.toReview.other': '{n} lançamentos a revisar',
  'import.undo': 'Desfazer importação',
  'import.batches': 'Importações',
  'import.processing': 'Processando…',
  // a dica da dropzone é quebrada em 3 porque o meio vai em <b>
  'import.hintPrefix': 'PDF (Mercado Pago), OFX ou CSV — ou ',
  'import.hintClick': 'clique para selecionar',
  'import.hintSuffix': '. Reimportar o mesmo arquivo não duplica nada.',
  'import.fail': 'Falha na importação: {msg}',
  'import.undoConfirm': 'Desfazer a importação de "{file}"? {n} transações serão removidas.',
  'import.undone': 'Importação desfeita: {n} transações removidas',
  'import.undoManual.one': '⚠️ {n} transação deste lote foi editada à mão — desfazer descarta essa correção, e ela não volta reimportando o arquivo.',
  'import.undoManual.other': '⚠️ {n} transações deste lote foram editadas à mão — desfazer descarta essas correções, e elas não voltam reimportando o arquivo.',
  'import.undoBackup': 'Cópia de segurança antes de desfazer: data/backups/{file}',
  'import.backupFailed': 'Backup automático falhou ({msg}) — os lançamentos foram gravados, mas SEM cópia de segurança.',
  'import.batchesHelp': 'Cada arquivo importado. Desfazer remove apenas as transações daquele lote.',
  'import.batchesEmpty': 'Nenhuma importação ainda.',
  'import.batchSub': '{kind} · {inserted} novas, {skipped} puladas · {at}',

  // erros de parser — texto longo porque é o que o usuário lê quando falha
  'import.err.empty': 'Nenhuma transação encontrada no arquivo.',
  'import.err.unsupported': 'Formato não suportado: .{ext} (use PDF, OFX ou CSV)',
  'import.err.corrupt':
    'O texto deste PDF está corrompido (fonte com caracteres embaralhados — acontece em ' +
    'algumas exportações do Mercado Pago). Gere o PDF novamente no app/site; se persistir, ' +
    'converta para CSV (colunas: data;descricao;valor) e importe o CSV.',
  'import.err.unknownPdf':
    'Layout de PDF não reconhecido. Hoje o Fluxo lê: extrato e fatura do Mercado Pago ' +
    '(Brasil e Argentina), extrato do Nubank, extrato de conta argentina e Conta Global ' +
    'do Inter. Para outros bancos, prefira OFX ou CSV — costumam trazer o sinal do ' +
    'lançamento escrito, o que o PDF quase nunca traz.',
  'import.err.noColumns':
    'Não identifiquei as colunas de data e valor neste CSV. Renomeie o cabeçalho para ' +
    'data;descricao;valor ou exporte em OFX.',

  // ── resumo de cartão argentino (lib/parsers/resumen-tarjeta-ar.js) ──────
  // ── leitura de CSV (lib/parsers/csv.js) ────────────────────────────────
  'import.warn.csvMixedDates':
    'A coluna de data mistura dd/mm e mm/dd: cada linha foi lida por conta própria, ' +
    'e alguma pode estar com dia e mês trocados.',
  'import.warn.csvMixedDecimals':
    'A coluna de valor mistura vírgula e ponto decimal: cada valor foi lido pelo último ' +
    'separador, e um "1.234" sem casas fica ambíguo.',
  // ── extrato do Nubank (lib/parsers/nubank-extrato.js) ──────────────────
  'import.err.absurdAmount':
    'Um lançamento veio com valor impossível ({value}, em "{desc}"). Isso costuma ' +
    'significar que a coluna de DATA foi lida como valor — ou seja, o arquivo foi lido ' +
    'pelas colunas erradas e as outras linhas também estão. Nada foi importado.',
  // ── Conta Global do Inter em PDF (lib/parsers/inter-global-pdf.js) ─────
  'import.err.interGlobalChain':
    'A cadeia de saldos deste extrato não fecha em {broken} de {total} dias, então nada ' +
    'foi importado. Primeira divergência — {first}. Neste PDF o sinal de cada lançamento ' +
    'é deduzido do tipo da transação e conferido pelo saldo diário: quando não fecha, é ' +
    'porque algum tipo novo foi classificado errado, e metade do extrato entraria invertida.',
  'import.err.interGlobalNoBalance':
    'Não achei o saldo inicial ou os blocos de dia neste extrato. Sem eles não há como ' +
    'conferir o sinal dos lançamentos, e importar seria adivinhar. Prefira o CSV do mesmo ' +
    'período, que traz Débito/Crédito escrito.',
  'import.err.nubankTotals':
    'As entradas e saídas lidas não batem com o que o extrato declara ({problems}). ' +
    'Nada foi importado. Neste extrato o sinal de cada lançamento vem do grupo em que ' +
    'ele está, então divergência costuma significar que metade ficou com o sinal ' +
    'invertido — importar seria gravar receita onde há despesa.',
  'import.err.nubankSign':
    'O extrato traz um grupo com palavra e sinal em desacordo ("{line}"). O formato ' +
    'mudou e adivinhar a direção seria escolher no cara ou coroa. Nada foi importado.',
  'import.warn.nubankNoTotals':
    'Este extrato não declara os totais do período, então a leitura não pôde ser ' +
    'conferida contra o próprio documento.',

  'import.warn.csvOpeningClosing':
    'O arquivo declara saldo inicial {opening} e final {closing} — diferença de {expected} — ' +
    'mas os lançamentos somam {sum}. Se você exportou um recorte do período, é esperado. ' +
    'Se exportou tudo, algum lançamento não foi lido.',
  'import.warn.csvChain':
    'O saldo declarado no arquivo não fecha em {broken} de {total} linhas. A primeira ' +
    'divergência é {date} "{desc}": o saldo anterior mais o valor dariam {expected}, mas o ' +
    'arquivo diz {declared}. Se você exportou uma visão filtrada, é esperado — faltam linhas ' +
    'no arquivo, não na leitura. Se exportou tudo, confira esses lançamentos.',

  'import.err.resumenTotals':
    'Os totais deste resumo de cartão não fecham com o que o próprio documento declara ' +
    '({problems}). Nada foi importado — um resumo errado por uma linha continua ' +
    'parecendo certo na tela. Isso costuma significar mudança de layout.',
  'import.err.resumenNoCycle':
    'Não achei a data de fechamento deste resumo, e sem ela não dá para saber a que ' +
    'mês os lançamentos pertencem. Nada foi importado.',
  'import.warn.inferredYear':
    'Este resumo não traz o ano em nenhuma data. Assumi {year}, a partir do fechamento ' +
    'em {closing}. Se o resumo for de outro ano, confira as datas antes de usar.',
  'import.warn.foreignSkipped':
    '{n} consumo(s) em dólares (US$ {total}) ficaram de fora: o resumo cobra dólar em ' +
    'coluna separada e não traz cotação. Lance à mão se quiser vê-los.',
  'import.warn.noTotals':
    'Este resumo não declara totais, então não foi possível conferir a leitura contra o ' +
    'próprio documento.',

  // ── exportação ─────────────────────────────────────────────────────────
  'export.title': 'Exportar transações filtradas',
  'export.csvHead': 'data;descricao;categoria;valor;origem',
  'export.all': 'tudo',
  'export.done': '{n} transações exportadas',

  // ── bancos e formatos ──────────────────────────────────────────────────
  'bank.generic.ofx': 'OFX genérico',
  'bank.generic.csv': 'CSV genérico',
  'bank.statement': 'extrato',
  'bank.invoice': 'fatura',
  'bank.unknown': 'origem desconhecida',

  // ── comuns ─────────────────────────────────────────────────────────────
  'common.save': 'Salvar',
  'common.cancel': 'Cancelar',
  'common.delete': 'Excluir',
  'common.edit': 'Editar',
  'common.undo': 'Desfazer',
  'common.restore': 'Restaurar',
  'common.close': 'Fechar',
  'common.confirm': 'Confirmar',
  'common.search': 'Buscar',
  'common.all': 'Todas',
  'common.none': 'Nenhum',
  'common.total': 'Total',
  'common.month': 'Mês',
  'common.date': 'Data',
  'common.description': 'Descrição',
  'common.value': 'Valor',
  'common.category': 'Categoria',
  'common.loading': 'Carregando…',
  'common.empty': 'Nada por aqui ainda.',
  'common.error': 'Algo deu errado.',
  'common.archive': 'Arquivar',
  'common.apply': 'Aplicar',
  'common.saving': 'Salvando…',
  'common.archivedTag': 'arquivada',
  'common.categoryPick': 'Categoria…',
  'common.searchPlaceholder': 'Buscar…',
  'common.showMore': 'Mostrar mais ({n} restantes)',
  'common.noTx': 'Nenhuma transação encontrada.',
  'common.invalidAmount': 'Valor inválido',
  'common.amountPlaceholder': '{symbol} 0,00',
  'common.amountField': 'Valor ({symbol})',
  'common.privacyTitle': 'Modo privacidade: esconder valores',
  'common.themeTitle': 'Alternar tema',

  // ── meses ──────────────────────────────────────────────────────────────
  'month.1': 'janeiro',
  'month.2': 'fevereiro',
  'month.3': 'março',
  'month.4': 'abril',
  'month.5': 'maio',
  'month.6': 'junho',
  'month.7': 'julho',
  'month.8': 'agosto',
  'month.9': 'setembro',
  'month.10': 'outubro',
  'month.11': 'novembro',
  'month.12': 'dezembro',

  // ── navegação ──────────────────────────────────────────────────────────
  'nav.home': 'Início',
  'nav.cards': 'Faturas',
  'nav.evolve': 'Evoluir',
  'nav.manage': 'Gerenciar',
  'nav.dashboard': 'Dashboard',

  // ── filtros ────────────────────────────────────────────────────────────
  'filter.allPeriod': 'Todo o período',
  'filter.allCategories': 'Todas as categorias',
  'filter.allTypes': 'Todos os tipos',
  'filter.onlyOut': 'Só saídas',
  'filter.onlyIn': 'Só entradas',
  'filter.allAccounts': 'Todas as contas',
  'filter.searchDesc': 'Buscar por descrição…',

  // ── dashboard ──────────────────────────────────────────────────────────
  'dash.morning': 'Bom dia',
  'dash.afternoon': 'Boa tarde',
  'dash.evening': 'Boa noite',
  'dash.namePrompt': 'Como você quer ser chamado?',
  'dash.editNameTitle': 'Clique para editar seu nome',
  'dash.setName': 'defina seu nome',
  'dash.expense': 'Despesa',
  'dash.incomeEntry': 'Receita',
  'dash.shortcutExpense': 'Atalho: tecla D',
  'dash.shortcutIncome': 'Atalho: tecla R',
  'dash.income': 'Entradas',
  'dash.expenses': 'Saídas',
  'dash.balance': 'Saldo',
  'dash.balanceSub': 'entradas − saídas (sem transferências)',
  'dash.otherCurrency': 'em outra moeda · {n} lançamento(s), não somados',
  'dash.projection': 'Projeção de gastos',
  'dash.projSub': 'ritmo atual até o fim do mês',
  'dash.projNA': 'disponível no mês corrente',
  'dash.projInstallments': '+ parcelas contratadas',
  'dash.byCategory': 'Gastos por categoria',
  'dash.noSpending': 'Sem gastos no período.',
  'dash.totalSpent': 'total gasto',
  'dash.budget': 'Orçamento',
  'dash.allowancePrefix': 'Você pode gastar',
  'dash.allowancePerDay': '{v}/dia',
  'dash.allowanceRest': '{v} restantes ÷ {n} dias',
  'dash.overrunPrefix': 'Orçamento estourado em',
  'dash.overrunNote': 'todo gasto extra sai do mês que vem',
  'dash.goalsHelp': 'Defina limites de gasto por categoria e acompanhe o progresso do mês.',
  'dash.rolloverOn': 'Rollover ativo: sobra/estouro do mês anterior ajusta o orçamento',
  'dash.rolloverOff': 'Ativar rollover: sobra/estouro do mês anterior ajusta o orçamento',
  'dash.rolloverCarry': '({sign}{v} este mês)',
  'dash.goalCarryTitle': 'meta {goal} {sign} {carry} do mês anterior',
  'dash.removeGoal': 'Remover meta',
  'dash.goalPlaceholder': '{symbol} 500,00',
  'dash.upcoming': 'Próximos vencimentos',
  'dash.manageLink': 'gerenciar',
  'dash.evolution': 'Evolução mensal',
  'dash.evoIn': '{m}: entradas {v}',
  'dash.evoOut': '{m}: saídas {v}',
  'dash.future': 'Parcelas já contratadas',
  'dash.futureNote': 'Estimado a partir das parcelas visíveis nas faturas importadas.',
  'dash.futureApprox.one': '{n} compra sem competência de fatura gravada: nela o mês foi estimado pela data da compra.',
  'dash.futureApprox.other': '{n} compras sem competência de fatura gravada: nelas o mês foi estimado pela data da compra.',
  'dash.transactions': 'Transações',
  'dash.toReviewBtn': '{n} a revisar',
  'dash.recurring': 'Despesa recorrente',
  'dash.recChanged': 'valor mudou: {prev} → {last}',
  'dash.emptyFirst': 'Nada por aqui ainda. Arraste um extrato acima para começar.',
  'dash.ruleCreated': 'Regra criada: "{pattern}" → {cat}',
  'dash.ruleApplied': '(aplicada a {n} transações)',

  // ── gerenciar ──────────────────────────────────────────────────────────
  'manage.tab.tx': 'Lançamentos',
  'manage.tab.cats': 'Categorias',
  'manage.tab.accounts': 'Contas e cartões',
  'manage.tab.rules': 'Regras',
  'manage.txHint': 'clique numa célula para editar · shift+clique seleciona intervalo',
  'manage.clickToEdit': 'Clique para editar',
  'manage.changed': 'Alterado',
  'manage.dateChanged': 'Data alterada',
  'manage.descChanged': 'Descrição alterada',
  'manage.amountChanged': 'Valor alterado',
  'manage.origRestored': 'Original restaurado',
  'manage.editedTitle': 'Editada manualmente — clique para restaurar o original',
  'manage.editedMark': 'editada',
  'manage.catChanged': 'Categoria: {cat}',
  'manage.selected.one': '{n} selecionada',
  'manage.selected.other': '{n} selecionadas',
  'manage.bulkCat': 'Mudar categoria…',
  'manage.bulkDone': '{n} transações: {what}',
  'manage.bulkDeleted': 'excluídas',
  'manage.bulkDeleteConfirm': 'Excluir {n} transações?',
  'manage.newCat': 'Nova categoria',
  'manage.catName': 'Nome da categoria',
  'manage.catCreated': 'Categoria criada',
  'manage.catUpdated': 'Categoria atualizada',
  'manage.systemTag': 'sistema',
  'manage.txCount.one': '{n} transação',
  'manage.txCount.other': '{n} transações',
  'manage.perMonth': '{v}/mês',
  'manage.rulesCount.one': '{n} regra',
  'manage.rulesCount.other': '{n} regras',
  'manage.archiveTitle': 'Some dos seletores; histórico intacto',
  'manage.catArchived': '"{name}" arquivada',
  'manage.moveTxTo': 'Mover as {n} transações para:',
  'manage.deleteEmptyCat': 'Excluir categoria vazia?',
  'manage.choose': 'Escolher…',
  'manage.confirmDelete': 'Confirmar exclusão',
  'manage.catDeletedMoved': 'Excluída — {n} transações movidas para {dest}',
  'manage.catDeleted': 'Categoria excluída',
  'manage.archivedSection': 'Arquivadas',
  'manage.catRestored': '"{name}" restaurada',
  'manage.rulesTitle': 'Regras de categorização',
  'manage.rulesHelp': 'Criadas quando você corrige uma transação. Excluir não altera o que já foi categorizado.',
  'manage.rulesEmpty': 'Nenhuma regra ainda. Corrija uma transação "{cat}" para criar a primeira.',
  'manage.ruleSub': 'contém no texto → categoria ao lado',
  'manage.ruleRemoved': 'Regra removida: "{pattern}"',
  'manage.accounts': 'Contas',
  'manage.accHint': 'saldo = inicial + movimentos das origens vinculadas',
  'manage.accSaved': 'Conta salva — saldo recalculado',
  'manage.accArchived': 'Conta arquivada',
  'manage.addAccount': 'conta',
  'manage.accNamePh': 'Nome (ex: Mercado Pago)',
  'manage.institution': 'Instituição',
  'manage.accCurrencyDefault': 'Moeda: {code} (padrão)',
  'manage.initialBalance': 'Saldo inicial ({symbol})',
  'manage.kind.corrente': 'Conta corrente',
  'manage.kind.pagamento': 'Conta de pagamento',
  'manage.kind.poupanca': 'Poupança',
  'manage.noLinkedSource': 'sem origem vinculada',
  'manage.linkedSources': 'Origens vinculadas:',
  'manage.noSourcesYet': 'importe um arquivo primeiro',
  'manage.creditCards': 'Cartões de crédito',
  'manage.cardsHint': 'fatura aberta = gastos das origens desde o último fechamento',
  'manage.cardSaved': 'Cartão salvo',
  'manage.cardArchived': 'Cartão arquivado',
  'manage.addCard': 'cartão',
  'manage.cardDays': 'fecha {closing} · vence {due}',
  'manage.cardLimitLine': 'limite {limit} · disponível ≈\u00A0{available}',
  'manage.cardNamePh': 'Nome (ex: MP Visa)',
  'manage.last4': '4 últimos dígitos',
  'manage.cardLimitPh': 'Limite ({symbol})',
  'manage.closingDay': 'Dia de fechamento',
  'manage.dueDay': 'Dia de vencimento',
  // mensagens de erro da API de categorias (app/api/categories/route.js)
  'manage.catErrName': 'Nome (mín. 2 letras) e cor são obrigatórios',
  'manage.catErrShortName': 'Nome muito curto',
  'manage.catErrColor': 'Cor inválida',
  'manage.catErrDuplicate': 'Já existe uma categoria com esse nome',
  'manage.catNotFound': 'Categoria não encontrada',
  'manage.catSystemRename': 'Categoria de sistema não pode ser renomeada',
  'manage.catSystemArchive': 'Categoria de sistema não pode ser arquivada',
  'manage.catSystemDelete': 'Categoria de sistema não pode ser excluída',
  'manage.catNeedsTarget': '{n} transações usam esta categoria — informe para onde movê-las',

  // ── cartões / faturas ──────────────────────────────────────────────────
  'cards.title': 'Cartões',
  'cards.status.open': 'FATURA ABERTA',
  'cards.status.closed': 'FATURA FECHADA',
  'cards.status.partial': 'PAGA PARCIALMENTE',
  'cards.status.paid': 'PAGA ✓',
  'cards.status.future': 'PARCELAS FUTURAS',
  'cards.noCards': 'Nenhum cartão cadastrado. Crie um em',
  'cards.linkAccounts': 'Gerenciar → Contas e cartões',
  'cards.noCardsTail': ' e vincule a origem',
  'cards.noSource': 'Este cartão não tem origem vinculada — sem isso, não há como saber quais transações são dele.',
  'cards.noSourceGo': 'Vá em',
  'cards.linkAccountsEdit': 'Gerenciar → Contas e cartões → Editar',
  'cards.noSourceMark': ' e marque',
  'cards.noInvoices': 'Nenhuma fatura encontrada — importe faturas do cartão no dashboard.',
  'cards.invoice': 'Fatura',
  'cards.invoiceAmount': 'Valor da fatura',
  'cards.paidAmount': 'pago {v}',
  'cards.closing': 'Fechamento',
  'cards.closingSub': 'compras após essa data caem na próxima',
  'cards.due': 'Vencimento',
  'cards.dueSub': 'pague pela sua conta',
  'cards.settled': 'quitada',
  'cards.byCategory': 'Categorias da fatura',
  'cards.noSpending': 'Sem gastos nesta fatura.',
  'cards.history': 'Histórico',
  'cards.invoiceTxs': 'Lançamentos da fatura',
  'cards.noTxs': 'Nenhum lançamento nesta fatura.',
  'cards.openInvoice': 'fatura aberta',

  // ── contas a pagar ─────────────────────────────────────────────────────
  'bills.title': 'Contas a pagar',
  'bills.help': 'Quando uma transação importada bater com o padrão, valor (±tolerância) e a janela do vencimento, a conta é marcada como paga sozinha.',
  'bills.new': 'Nova conta',
  'bills.presets': 'Presets:',
  // presets são regionais: a conta fixa típica muda de país
  'bills.preset.condo.desc': 'Condomínio',
  'bills.preset.condo.pattern': 'condominio',
  'bills.preset.tax.desc': 'DAS MEI',
  'bills.preset.tax.pattern': 'DAS',
  'bills.preset.tithe.desc': 'Dízimo',
  'bills.preset.tithe.pattern': 'fed snt',
  'bills.f.desc': 'Descrição (ex: Condomínio)',
  'bills.f.dueDay': 'Dia do vencimento',
  'bills.f.pattern': 'Padrão p/ conciliar (ex: condominio)',
  'bills.freq.monthly': 'Mensal',
  'bills.freq.yearly': 'Anual',
  'bills.everyYear': 'todo ano em {month}, dia {day}',
  'bills.everyMonth': 'todo dia {day}',
  'bills.matches': 'concilia com "{pattern}"',
  'bills.noMatch': 'sem conciliação automática',
  'bills.status.late': 'atrasada ({ref})',
  'bills.status.next': 'próxima: {d}',
  'bills.status.ok': 'em dia',
  'bills.saved': 'Conta salva — conciliação automática ativa',
  'bills.archived': 'Conta arquivada',
  'bills.deleted': 'Conta excluída',
  'bills.restored': 'Conta restaurada',
  'bills.confirmDelete': 'Excluir "{desc}" e seu histórico de pagamentos?',
  'bills.empty': 'Cadastre suas contas fixas (condomínio, DAS MEI, dízimo…) e o Fluxo avisa no dashboard quando vencerem — e marca como pagas sozinho quando a transação aparecer.',
  'bills.markedPaid': '{desc} ({ref}) marcada como paga',
  'bills.markPaid': 'Marcar como paga',
  'bills.reconcileFailed': 'A conciliação automática não conseguiu gravar ({msg}) — as contas pagas vão voltar a aparecer como não pagas.',
  'bills.lateShort': 'atrasada',
  'bills.dueShort': 'venc {d}',

  // ── relatório ──────────────────────────────────────────────────────────
  'report.title': 'Relatório',
  'report.print': 'Imprimir / Salvar PDF',
  'report.heading': 'Relatório mensal — {month}',
  'report.generated': 'Fluxo · gerado em {date} · {n} lançamentos no mês (transferências internas excluídas)',
  'report.monthBalance': 'Saldo do mês',
  'report.vsMonth': 'vs {month}',
  'report.pctOut': '% das saídas',
  'report.vsPrevMonth': 'vs mês anterior',
  'report.budgetVsReal': 'Orçado × realizado',
  'report.budgeted': 'Orçado',
  'report.spent': 'Gasto',
  'report.result': 'Resultado',
  'report.rollover': 'meta {goal} {sign} {carry} rollover',
  'report.left': 'sobrou {v}',
  'report.over': 'estourou {v}',
  'report.top10': '10 maiores gastos do mês',
  'report.tip': 'Dica: no diálogo de impressão, escolha "Salvar como PDF". Para outro mês, mude o seletor no dashboard e clique em 📄 Relatório.',

  // ── evoluir ────────────────────────────────────────────────────────────
  'evolve.calcTitle': 'Calculadora de reinvestimento',
  'evolve.initial': 'Valor inicial',
  'evolve.monthly': 'Aporte mensal',
  'evolve.rate': 'Taxa anual (%)',
  'evolve.ratePlaceholder': 'ex: taxa do CDI hoje',
  'evolve.rateHelp': 'A taxa muda com o tempo — pesquise "taxa CDI hoje" ou a rentabilidade do investimento que você está avaliando e digite aqui. Compare cenários trocando o valor.',
  'evolve.y1': '1 ano',
  'evolve.y5': '5 anos',
  'evolve.y10': '10 anos',
  'evolve.contributed': 'aportado',
  'evolve.earnings': 'rendimento',
  'evolve.fillToSimulate': 'Preencha aporte e taxa para simular 1, 5 e 10 anos.',
  'evolve.disclaimer': 'Simulação educativa com juros compostos constantes — rentabilidade real varia e há impostos e inflação. Isto não é recomendação de investimento.',

  // ── insights ───────────────────────────────────────────────────────────
  'insight.dismiss': 'Não mostrar de novo neste mês',
  'insight.seeTx': 'Ver transações',
  'insight.when.today': 'hoje',
  'insight.when.tomorrow': 'amanhã',
  'insight.when.inDays': 'em {n} dias',
  'insight.billLate.title': 'Conta atrasada: {desc}',
  'insight.billLate.detail': 'Venceu em {date} · {v}',
  'insight.billDue.title': '{desc} vence {when}',
  'insight.overAvg.title': '{cat} {pct}% acima da média',
  'insight.overAvg.detail': 'Projeção de {proj} este mês vs. média de {avg} ({n} meses)',
  'insight.priceUp.title': '{name} subiu de preço',
  'insight.priceUp.detail': '{prev} → {last} (+{pct}% · {year}/ano)',
  'insight.goalOver.title': 'Meta de {cat} estourada',
  'insight.goalOver.detail': '{spent} de {limit} ({pct}%)',
  'insight.goalRisk.title': 'Meta de {cat} em risco',
  'insight.goalRisk.detail': 'No ritmo atual, estoura por volta do dia {day} (projeção {proj} / meta {limit})',
  'insight.invoiceClosing.title': '{card} fecha {when}',
  'insight.invoiceClosing.detail': 'Fatura aberta: {v}{above}',
  'insight.invoiceClosing.above': ', {pct}% acima do normal',
  'insight.cut.title': 'Corte com maior impacto: {cat}',
  'insight.cut.detail': '−{cut}/mês (de {base}) = {year}/ano para investir',
  'insight.cut.action': 'Simular investindo isso',

  // ── revisão em massa ───────────────────────────────────────────────────
  'review.title': 'Revisão em massa',
  'review.help': 'Pendências agrupadas por estabelecimento. Escolher a categoria cria a regra e aplica a todo o grupo — importações futuras já vêm certas.',
  'review.empty': 'Nada a revisar. 🎉',
  'review.sample': 'ex: {s}',
  'review.applying': 'Aplicando…',
  'review.pick': 'Categorizar…',
  'review.applied': '"{pattern}" → {cat} ({n} transações + regra criada)',
  'review.buttonTitle': 'Revisar em massa, agrupado por estabelecimento',

  // ── lançamento rápido ──────────────────────────────────────────────────
  'quick.title.expense': '− Nova despesa',
  'quick.title.income': '+ Nova receita',
  'quick.descExpense': 'Onde gastou? (ex: Padaria)',
  'quick.descIncome': 'De onde veio? (ex: Freelance)',
  'quick.submit': 'Lançar',
  'quick.err.desc': 'Descrição obrigatória',
  'quick.err.cat': 'Escolha a categoria',
  'quick.done.expense': 'Despesa lançada',
  'quick.done.income': 'Receita lançada',

  // ── PIN ────────────────────────────────────────────────────────────────
  'pin.promptCurrent': 'PIN atual:',
  'pin.wrongCurrent': 'PIN atual incorreto',
  'pin.promptNew': 'Novo PIN (4+ dígitos; vazio remove):',
  'pin.removed': 'PIN removido',
  'pin.lengthRule': 'Use de 4 a 8 dígitos',
  'pin.set': 'PIN definido — será pedido ao abrir o app',
  'pin.locked': 'Fluxo bloqueado',
  'pin.placeholder': 'PIN',
  'pin.wrong': 'PIN incorreto',
  'pin.hint': 'digite o PIN para entrar',
  'pin.configTitle': 'Definir/alterar PIN de bloqueio',

  // ── erros das rotas de API ─────────────────────────────────────────────
  'api.invalidDate': "Data inválida",
  'api.invalidDateFormat': "Data inválida (use AAAA-MM-DD)",
  'api.descRequired': "Descrição obrigatória",
  'api.descEmpty': "Descrição vazia",
  'api.invalidAmount': "Valor inválido",
  'api.invalidCategory': "Categoria inválida",
  'api.txNotFound': "Transação não encontrada",
  'api.accountNotFound': "Conta não encontrada",
  'api.cardNotFound': "Cartão não encontrado",
  'api.billNotFound': "Conta a pagar não encontrada",
  'api.nothingToChange': "Nada para alterar",
  'api.noFile': "Nenhum arquivo enviado",
  'api.nameRequired': "Nome obrigatório",
  'api.invalidParams': "Parâmetros inválidos",
  'api.unknownAction': "Ação desconhecida",
  'api.invalidFrequency': "Frequência inválida",
  'api.idRequired': "id obrigatório",
  'api.invalidIds': "ids inválidos",
  'api.backupFailed': "Backup falhou ({msg}) — operação cancelada para não apagar nada sem cópia de segurança",

  // ── configuração (idioma, moeda) ───────────────────────────────────────
  'settings.title': "Idioma e moeda",
  'settings.help': "Vale para esta instalação. A escolha fica salva no seu banco.",
  'settings.language': "Idioma",
  'settings.currency': "Moeda",
  'settings.currencyWarning': "Trocar o idioma não converte valores. Os lançamentos são guardados em centavos, sem moeda: mudar a moeda só troca o símbolo exibido.",
  'settings.apply': "Aplicar e recarregar",
  'import.confidence.alta': "reconhecido com alta confiança",
  'import.confidence.media': "reconhecido com confiança média",
  'import.confidence.baixa': "reconhecido com baixa confiança — confira os valores",
  'import.encoding': "codificação: {enc}",

  // ── erro, estado vazio e lixeira ───────────────────────────────────────
  'error.title': "Algo quebrou nesta tela",
  'error.dataSafe': "Seus dados estão salvos.",
  'error.dataSafeText': "Isto é um erro de desenho de tela. Nenhum lançamento foi alterado ou perdido — o banco de dados só muda quando você importa ou edita algo.",
  'error.whatToDo': "Tente de novo. Se continuar, volte ao início e me conte o que você estava fazendo.",
  'error.retry': "Tentar de novo",
  'error.home': "Voltar ao início",
  'error.details': "Detalhes técnicos (para relatar o problema)",
  'error.digest': "Código: {digest}",
  'error.copy': "Copiar",
  'error.copied': "Copiado",
  'error.globalTitle': "O aplicativo não conseguiu carregar",
  'error.globalText': "O erro aconteceu antes da tela montar. Seus dados continuam no seu computador, intactos.",
  'error.reload': "Recarregar",
  'error.notFoundTitle': "Esta página não existe",
  'error.notFoundText': "O endereço pode ter mudado ou o link estar errado.",
  'empty.dashTitle': "Nada por aqui ainda",
  'empty.dashText': "O Fluxo lê o extrato do seu banco e organiza seus gastos sozinho. Arraste o arquivo na área acima — PDF, OFX ou CSV.",
  'empty.dashPrivacy': "Tudo fica no seu computador. Nada é enviado para lugar nenhum.",
  'empty.dashAction': "Escolher arquivo",
  'empty.monthTitle': "Nenhum lançamento em {month}",
  'empty.monthText': "Você tem dados em outros meses. Troque o período no seletor acima.",
  'empty.monthAction': "Ver todo o período",
  'empty.searchTitle': "Nada encontrado",
  'empty.searchText': "Nenhum lançamento combina com esse filtro. Tente uma busca mais curta ou limpe os filtros.",
  'empty.searchAction': "Limpar filtros",
  'empty.rulesTitle': "Nenhuma regra ainda",
  'empty.rulesText': "Quando você corrige a categoria de um lançamento, o Fluxo aprende e aplica nos parecidos. As regras aprendidas aparecem aqui.",
  'empty.batchesTitle': "Nenhuma importação ainda",
  'empty.batchesText': "Cada arquivo importado vira um lote que pode ser desfeito inteiro, caso você importe o arquivo errado.",
  'empty.accountsTitle': "Nenhuma conta cadastrada",
  'empty.accountsText': "Cadastre a conta e vincule a origem dos lançamentos importados. O saldo é calculado a partir do saldo inicial mais os movimentos — nunca digitado.",
  'empty.cardsTitle': "Nenhum cartão cadastrado",
  'empty.cardsText': "Com o cartão cadastrado (limite, fechamento e vencimento), o Fluxo estima a fatura aberta e o limite disponível.",
  'empty.billsTitle': "Nenhuma conta fixa",
  'empty.billsText': "Cadastre o que se repete todo mês — aluguel, internet, assinatura. O Fluxo avisa quando vence e marca como paga sozinho quando o lançamento aparece no extrato.",
  'empty.goalsTitle': "Nenhuma meta definida",
  'empty.goalsText': "Defina um limite de gasto por categoria e acompanhe a barra encher ao longo do mês.",
  'empty.trashTitle': "Lixeira vazia",
  'empty.trashText': "Lançamentos excluídos ficam aqui e podem ser restaurados a qualquer momento.",
  'trash.tab': "Excluídas",
  'trash.deletedAt': "excluída em {date}",
  'trash.restore': "Restaurar",
  'trash.restored': "{n} lançamento(s) restaurado(s)",
  'trash.count': "{n} na lixeira",

  // ── divisão de lançamento ──────────────────────────────────────────────
  'split.title': "Dividir lançamento",
  'split.help': "Reparta este lançamento entre categorias. A soma das partes tem de dar exatamente o valor original.",
  'split.action': "Dividir",
  'split.addPart': "Adicionar parte",
  'split.remaining': "Falta distribuir: {v}",
  'split.balanced': "As partes fecham com o original",
  'split.undo': "Desfazer divisão",
  'split.undone': "Divisão desfeita — o lançamento voltou inteiro",
  'split.done': "Dividido em {n} partes",
  'split.badge': "parte de {n}",
  'split.errSum': "As partes somam {parts} e o lançamento é {total}. Dividir não pode criar nem sumir com dinheiro.",
  'split.errMinParts': "Uma divisão precisa de pelo menos duas partes.",
  'split.errSign': "Todas as partes têm de ter o mesmo sinal do lançamento original.",
  'split.errAlreadySplit': "Este lançamento já está dividido.",
  'split.errIsPart': "Este lançamento já é parte de uma divisão.",
  'split.errNotSplit': "Este lançamento não está dividido.",

  // ── offline (service worker) ───────────────────────────────────────────
  'offline.withData': "Sem conexão com o servidor. Estes números são de {when} — não são os de agora.",
  'offline.noData': "Sem conexão com o servidor e sem dados guardados. Ligue o computador onde o Fluxo roda.",
  'offline.retry': "Tentar de novo",
  'offline.readOnly': "Modo leitura: não dá para lançar nem importar sem conexão.",

  'app.footerLocal': "seus dados ficam neste computador",

  // ── evolução (curva de saldo e visão anual) ────────────────────────────
  'evolution.title': "Evolução",
  'evolution.balanceTitle': "Saldo ao longo do tempo",
  'evolution.balanceHelp': "Saldo nas contas cadastradas. Compra no cartão entra quando a fatura é paga, não no dia da compra.",
  'evolution.variationTitle': "Variação acumulada",
  'evolution.variationHelp': "Quanto você acumulou desde o início — não é o saldo real. Cadastre uma conta com saldo inicial em Gerenciar › Contas para ver o saldo de verdade.",
  'evolution.sincePeriod': "no período",
  'evolution.chartAlt': "Curva de saldo de {from} a {to}, terminando em {value}.",
  'evolution.yearTitle': "Mês a mês",
  'evolution.yearHelp': "Resultado é tudo que entrou menos tudo que saiu, incluindo compras no cartão no mês da compra. Saldo é o que estava na conta no fim do mês — por isso os dois não batem.",
  'evolution.yearHelpNoBalance': "Resultado é tudo que entrou menos tudo que saiu no mês.",
  'evolution.yearFilter': "Filtrar por ano",
  'evolution.emptyTitle': "Ainda não dá para mostrar evolução",
  'evolution.emptyText': "A evolução aparece depois do primeiro extrato importado. Com alguns meses de histórico, dá para ver se você está melhorando.",
  'nav.evolution': "Evolução",
};
