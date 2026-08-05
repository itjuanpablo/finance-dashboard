// Dicionário es-AR — español rioplatense.
//
// Convenções de tradução deste arquivo (siga ao adicionar chaves):
//  · VOSEO no imperativo: "arrastrá", "elegí", "guardá", "corregí", "revisá",
//    "agregá", "ingresá" — nunca "arrastra"/"elige"/"guarda" (tuteo).
//  · Vocabulário financeiro argentino:
//      fatura (cartão) ....... resumen
//      extrato ............... extracto / movimientos
//      lançamento ............ movimiento
//      entradas / saídas ..... ingresos / egresos
//      conta corrente ........ cuenta corriente
//      cartão ................ tarjeta
//      parcela ............... cuota
//      meta de gasto ......... meta
//      boleto/conta a pagar .. factura / servicio
//  · Moeda: peso argentino, símbolo "$" (ver lib/config.js).

export default {
  // ── app ────────────────────────────────────────────────────────────────
  'app.name': 'Fluxo',
  'app.title': 'Fluxo — Finanzas Personales',
  'app.description': 'Control de gastos local, automatizado y minimalista',
  'app.shortcut.expense': 'Cargar egreso',
  'app.shortcut.income': 'Cargar ingreso',

  // ── categorías canónicas ───────────────────────────────────────────────
  'cat.food': 'Comida',
  'cat.transport': 'Transporte',
  'cat.housing': 'Hogar',
  'cat.shopping': 'Compras',
  'cat.leisure': 'Entretenimiento',
  'cat.travel': 'Viajes',
  'cat.health': 'Salud',
  'cat.subscriptions': 'Suscripciones',
  'cat.financial': 'Financiero',
  'cat.income': 'Ingresos',
  'cat.transfers': 'Transferencias',
  'cat.to_review': 'Por revisar',

  // ── importación ────────────────────────────────────────────────────────
  'import.dropzone': 'Arrastrá acá tus extractos y resúmenes',
  'import.dropzoneHint': 'PDF de Mercado Pago, OFX o CSV de cualquier banco',
  'import.detected': 'Detectado: {bank}',
  'import.result': '{file}: {inserted} nuevos, {skipped} ya estaban',
  'import.tx.one': '{n} movimiento',
  'import.tx.other': '{n} movimientos',
  'import.toReview.one': '{n} movimiento por revisar',
  'import.toReview.other': '{n} movimientos por revisar',
  'import.undo': 'Deshacer importación',
  'import.batches': 'Importaciones',
  'import.processing': 'Procesando…',
  'import.hintPrefix': 'PDF (Mercado Pago), OFX o CSV — o ',
  'import.hintClick': 'hacé clic para elegir',
  'import.hintSuffix': '. Volver a importar el mismo archivo no duplica nada.',
  'import.fail': 'Falló la importación: {msg}',
  'import.undoConfirm': '¿Deshacer la importación de "{file}"? Se van a borrar {n} movimientos.',
  'import.undone': 'Importación deshecha: {n} movimientos borrados',
  'import.undoManual.one': '⚠️ {n} movimiento de este lote fue editado a mano — deshacer descarta esa corrección, y no vuelve al reimportar el archivo.',
  'import.undoManual.other': '⚠️ {n} movimientos de este lote fueron editados a mano — deshacer descarta esas correcciones, y no vuelven al reimportar el archivo.',
  'import.undoBackup': 'Copia de seguridad antes de deshacer: data/backups/{file}',
  'import.backupFailed': 'Falló la copia de seguridad automática ({msg}) — los movimientos quedaron guardados, pero SIN respaldo.',
  'import.batchesHelp': 'Cada archivo importado. Deshacer borra solo los movimientos de ese lote.',
  'import.batchesEmpty': 'Todavía no hay importaciones.',
  'import.batchSub': '{kind} · {inserted} nuevos, {skipped} salteados · {at}',

  'import.err.empty': 'No encontré ningún movimiento en el archivo.',
  'import.err.unsupported': 'Formato no soportado: .{ext} (usá PDF, OFX o CSV)',
  'import.err.corrupt':
    'El texto de este PDF está corrupto (la fuente tiene los caracteres mezclados — pasa en ' +
    'algunas exportaciones de Mercado Pago). Generá el PDF de nuevo desde la app o la web; si ' +
    'sigue igual, convertilo a CSV (columnas: fecha;descripcion;importe) e importá el CSV.',
  'import.err.unknownPdf':
    'No reconozco el formato de este PDF. Hoy Fluxo lee: extracto y resumen de Mercado Pago ' +
    '(Argentina y Brasil), extracto de Nubank, extracto de cuenta argentina y Cuenta Global ' +
    'del Inter. Para otros bancos, mejor usá OFX o CSV — suelen traer el signo del ' +
    'movimiento escrito, cosa que el PDF casi nunca trae.',
  'import.err.noColumns':
    'No pude identificar las columnas de fecha e importe en este CSV. Renombrá el encabezado a ' +
    'fecha;descripcion;importe o exportá en OFX.',

  // ── resumen de tarjeta (lib/parsers/resumen-tarjeta-ar.js) ──────────────
  // ── lectura de CSV (lib/parsers/csv.js) ────────────────────────────────
  'import.warn.csvMixedDates':
    'La columna de fecha mezcla dd/mm y mm/dd: cada línea se leyó por su cuenta, ' +
    'y alguna puede tener el día y el mes cambiados.',
  'import.warn.csvMixedDecimals':
    'La columna de importe mezcla coma y punto decimal: cada valor se leyó por el último ' +
    'separador, y un "1.234" sin decimales queda ambiguo.',
  // ── extracto de Nubank (lib/parsers/nubank-extrato.js) ─────────────────
  'import.err.absurdAmount':
    'Un movimiento vino con un importe imposible ({value}, en "{desc}"). Suele significar ' +
    'que la columna de FECHA se leyó como importe — es decir, el archivo se leyó por las ' +
    'columnas equivocadas y las demás líneas también. No se importó nada.',
  // ── Cuenta Global del Inter en PDF (lib/parsers/inter-global-pdf.js) ───
  'import.err.interGlobalChain':
    'La cadena de saldos de este extracto no cierra en {broken} de {total} días, así que no ' +
    'se importó nada. Primera diferencia — {first}. En este PDF el signo de cada movimiento ' +
    'se deduce del tipo de transacción y se verifica con el saldo diario: cuando no cierra, ' +
    'es porque algún tipo nuevo quedó mal clasificado y la mitad entraría invertida.',
  'import.err.interGlobalNoBalance':
    'No encontré el saldo inicial ni los bloques de día en este extracto. Sin ellos no hay ' +
    'forma de verificar el signo, e importar sería adivinar. Preferí el CSV del mismo ' +
    'período, que trae Débito/Crédito escrito.',
  'import.err.nubankTotals':
    'Los ingresos y egresos leídos no coinciden con lo que declara el extracto ({problems}). ' +
    'No se importó nada. En este extracto el signo de cada movimiento viene del grupo en ' +
    'el que está, así que una diferencia suele significar que la mitad quedó con el signo ' +
    'invertido — importar sería registrar ingreso donde hay gasto.',
  'import.err.nubankSign':
    'El extracto trae un grupo con la palabra y el signo en desacuerdo ("{line}"). El ' +
    'formato cambió y adivinar la dirección sería elegir a cara o cruz. No se importó nada.',
  'import.warn.nubankNoTotals':
    'Este extracto no declara los totales del período, así que la lectura no se pudo ' +
    'verificar contra el propio documento.',

  'import.warn.csvOpeningClosing':
    'El archivo declara saldo inicial {opening} y final {closing} — diferencia de {expected} — ' +
    'pero los movimientos suman {sum}. Si exportaste un recorte del período, es esperable. ' +
    'Si exportaste todo, algún movimiento no se leyó.',
  'import.warn.csvChain':
    'El saldo que declara el archivo no cierra en {broken} de {total} líneas. La primera ' +
    'diferencia es {date} "{desc}": el saldo anterior más el importe darían {expected}, pero ' +
    'el archivo dice {declared}. Si exportaste una vista filtrada, es esperable — faltan ' +
    'líneas en el archivo, no en la lectura. Si exportaste todo, revisá esos movimientos.',

  'import.err.resumenTotals':
    'Los totales de este resumen no coinciden con lo que declara el propio documento ' +
    '({problems}). No se importó nada — un resumen con una línea mal leída igual parece ' +
    'correcto en pantalla. Suele significar que cambió el formato.',
  'import.err.resumenNoCycle':
    'No encontré la fecha de cierre de este resumen, y sin ella no se puede saber a qué ' +
    'mes pertenecen los movimientos. No se importó nada.',
  'import.warn.inferredYear':
    'Este resumen no trae el año en ninguna fecha. Asumí {year}, a partir del cierre del ' +
    '{closing}. Si el resumen es de otro año, revisá las fechas antes de usarlo.',
  'import.warn.foreignSkipped':
    'Quedaron afuera {n} consumo(s) en dólares (US$ {total}): el resumen cobra el dólar en ' +
    'una columna aparte y no trae cotización. Cargalos a mano si querés verlos.',
  'import.warn.noTotals':
    'Este resumen no declara totales, así que no se pudo verificar la lectura contra el ' +
    'propio documento.',

  // ── exportación ────────────────────────────────────────────────────────
  'export.title': 'Exportar los movimientos filtrados',
  'export.csvHead': 'fecha;descripcion;categoria;importe;origen',
  'export.all': 'todo',
  'export.done': '{n} movimientos exportados',

  // ── bancos y formatos ──────────────────────────────────────────────────
  'bank.generic.ofx': 'OFX genérico',
  'bank.generic.csv': 'CSV genérico',
  'bank.statement': 'extracto',
  'bank.invoice': 'resumen',
  'bank.unknown': 'origen desconocido',

  // ── comunes ────────────────────────────────────────────────────────────
  'common.save': 'Guardar',
  'common.cancel': 'Cancelar',
  'common.delete': 'Eliminar',
  'common.edit': 'Editar',
  'common.undo': 'Deshacer',
  'common.restore': 'Restaurar',
  'common.close': 'Cerrar',
  'common.confirm': 'Confirmar',
  'common.search': 'Buscar',
  'common.all': 'Todas',
  'common.none': 'Ninguno',
  'common.total': 'Total',
  'common.month': 'Mes',
  'common.date': 'Fecha',
  'common.description': 'Descripción',
  'common.value': 'Importe',
  'common.category': 'Categoría',
  'common.loading': 'Cargando…',
  'common.empty': 'Todavía no hay nada acá.',
  'common.error': 'Algo salió mal.',
  'common.archive': 'Archivar',
  'common.apply': 'Aplicar',
  'common.saving': 'Guardando…',
  'common.archivedTag': 'archivada',
  'common.categoryPick': 'Categoría…',
  'common.searchPlaceholder': 'Buscar…',
  'common.showMore': 'Mostrar más ({n} restantes)',
  'common.noTx': 'No encontré ningún movimiento.',
  'common.invalidAmount': 'Importe inválido',
  'common.amountPlaceholder': '{symbol} 0,00',
  'common.amountField': 'Importe ({symbol})',
  'common.privacyTitle': 'Modo privacidad: ocultar importes',
  'common.themeTitle': 'Cambiar tema',

  // ── meses ──────────────────────────────────────────────────────────────
  'month.1': 'enero',
  'month.2': 'febrero',
  'month.3': 'marzo',
  'month.4': 'abril',
  'month.5': 'mayo',
  'month.6': 'junio',
  'month.7': 'julio',
  'month.8': 'agosto',
  'month.9': 'septiembre',
  'month.10': 'octubre',
  'month.11': 'noviembre',
  'month.12': 'diciembre',

  // ── navegación ─────────────────────────────────────────────────────────
  'nav.home': 'Inicio',
  'nav.cards': 'Resúmenes',
  // REVISAR: "Evoluir" é nome de seção (investir/crescer). "Crecer" soa natural
  // em es-AR, mas é escolha de naming — confirmar com o dono do produto.
  'nav.evolve': 'Crecer',
  'nav.manage': 'Administrar',
  'nav.dashboard': 'Panel',

  // ── filtros ────────────────────────────────────────────────────────────
  'filter.allPeriod': 'Todo el período',
  'filter.allCategories': 'Todas las categorías',
  'filter.allTypes': 'Todos los tipos',
  'filter.onlyOut': 'Solo egresos',
  'filter.onlyIn': 'Solo ingresos',
  'filter.allAccounts': 'Todas las cuentas',
  'filter.searchDesc': 'Buscar por descripción…',

  // ── dashboard ──────────────────────────────────────────────────────────
  'dash.morning': 'Buen día',
  'dash.afternoon': 'Buenas tardes',
  'dash.evening': 'Buenas noches',
  'dash.namePrompt': '¿Cómo querés que te llame?',
  'dash.editNameTitle': 'Hacé clic para editar tu nombre',
  'dash.setName': 'poné tu nombre',
  'dash.expense': 'Egreso',
  'dash.incomeEntry': 'Ingreso',
  'dash.shortcutExpense': 'Atajo: tecla D',
  'dash.shortcutIncome': 'Atajo: tecla R',
  'dash.income': 'Ingresos',
  'dash.expenses': 'Egresos',
  'dash.balance': 'Saldo',
  'dash.balanceSub': 'ingresos − egresos (sin transferencias)',
  'dash.otherCurrency': 'en otra moneda · {n} movimiento(s), no sumados',
  'dash.projection': 'Proyección de gastos',
  'dash.projSub': 'al ritmo actual hasta fin de mes',
  'dash.projNA': 'disponible en el mes en curso',
  'dash.projInstallments': '+ cuotas ya comprometidas',
  'dash.byCategory': 'Gastos por categoría',
  'dash.noSpending': 'Sin gastos en el período.',
  'dash.totalSpent': 'total gastado',
  'dash.budget': 'Presupuesto',
  'dash.allowancePrefix': 'Podés gastar',
  'dash.allowancePerDay': '{v}/día',
  'dash.allowanceRest': '{v} restantes ÷ {n} días',
  'dash.overrunPrefix': 'Te pasaste del presupuesto en',
  'dash.overrunNote': 'cada gasto extra sale del mes que viene',
  'dash.goalsHelp': 'Definí límites de gasto por categoría y seguí el avance del mes.',
  'dash.rolloverOn': 'Rollover activo: lo que sobra o falta del mes anterior ajusta el presupuesto',
  'dash.rolloverOff': 'Activar rollover: lo que sobra o falta del mes anterior ajusta el presupuesto',
  'dash.rolloverCarry': '({sign}{v} este mes)',
  'dash.goalCarryTitle': 'meta {goal} {sign} {carry} del mes anterior',
  'dash.removeGoal': 'Quitar meta',
  'dash.goalPlaceholder': '{symbol} 500,00',
  'dash.upcoming': 'Próximos vencimientos',
  'dash.manageLink': 'administrar',
  'dash.evolution': 'Evolución mensual',
  'dash.evoIn': '{m}: ingresos {v}',
  'dash.evoOut': '{m}: egresos {v}',
  'dash.future': 'Cuotas ya comprometidas',
  'dash.futureNote': 'Estimado a partir de las cuotas visibles en los resúmenes importados.',
  'dash.futureApprox.one': '{n} compra sin período de resumen guardado: ahí el mes se estimó por la fecha de la compra.',
  'dash.futureApprox.other': '{n} compras sin período de resumen guardado: ahí el mes se estimó por la fecha de la compra.',
  'dash.transactions': 'Movimientos',
  'dash.toReviewBtn': '{n} por revisar',
  'dash.recurring': 'Gasto recurrente',
  'dash.recChanged': 'cambió el importe: {prev} → {last}',
  'dash.emptyFirst': 'Todavía no hay nada acá. Arrastrá un extracto arriba para empezar.',
  'dash.ruleCreated': 'Regla creada: "{pattern}" → {cat}',
  'dash.ruleApplied': '(aplicada a {n} movimientos)',

  // ── administrar ────────────────────────────────────────────────────────
  'manage.tab.tx': 'Movimientos',
  'manage.tab.cats': 'Categorías',
  'manage.tab.accounts': 'Cuentas y tarjetas',
  'manage.tab.rules': 'Reglas',
  'manage.txHint': 'hacé clic en una celda para editar · shift+clic selecciona un rango',
  'manage.clickToEdit': 'Hacé clic para editar',
  'manage.changed': 'Modificado',
  'manage.dateChanged': 'Fecha modificada',
  'manage.descChanged': 'Descripción modificada',
  'manage.amountChanged': 'Importe modificado',
  'manage.origRestored': 'Original restaurado',
  'manage.editedTitle': 'Editada a mano — hacé clic para restaurar el original',
  'manage.editedMark': 'editada',
  'manage.catChanged': 'Categoría: {cat}',
  'manage.selected.one': '{n} seleccionada',
  'manage.selected.other': '{n} seleccionadas',
  'manage.bulkCat': 'Cambiar categoría…',
  'manage.bulkDone': '{n} movimientos: {what}',
  'manage.bulkDeleted': 'eliminados',
  'manage.bulkDeleteConfirm': '¿Eliminar {n} movimientos?',
  'manage.newCat': 'Nueva categoría',
  'manage.catName': 'Nombre de la categoría',
  'manage.catCreated': 'Categoría creada',
  'manage.catUpdated': 'Categoría actualizada',
  'manage.systemTag': 'sistema',
  'manage.txCount.one': '{n} movimiento',
  'manage.txCount.other': '{n} movimientos',
  'manage.perMonth': '{v}/mes',
  'manage.rulesCount.one': '{n} regla',
  'manage.rulesCount.other': '{n} reglas',
  'manage.archiveTitle': 'Desaparece de los selectores; el historial queda intacto',
  'manage.catArchived': '"{name}" archivada',
  'manage.moveTxTo': 'Mover los {n} movimientos a:',
  'manage.deleteEmptyCat': '¿Eliminar la categoría vacía?',
  'manage.choose': 'Elegí…',
  'manage.confirmDelete': 'Confirmar eliminación',
  'manage.catDeletedMoved': 'Eliminada — {n} movimientos movidos a {dest}',
  'manage.catDeleted': 'Categoría eliminada',
  'manage.archivedSection': 'Archivadas',
  'manage.catRestored': '"{name}" restaurada',
  'manage.rulesTitle': 'Reglas de categorización',
  'manage.rulesHelp': 'Se crean cuando corregís un movimiento. Eliminarlas no cambia lo que ya está categorizado.',
  'manage.rulesEmpty': 'Todavía no hay reglas. Corregí un movimiento "{cat}" para crear la primera.',
  'manage.ruleSub': 'si el texto lo contiene → la categoría de al lado',
  'manage.ruleRemoved': 'Regla eliminada: "{pattern}"',
  'manage.accounts': 'Cuentas',
  'manage.accHint': 'saldo = inicial + movimientos de los orígenes vinculados',
  'manage.accSaved': 'Cuenta guardada — saldo recalculado',
  'manage.accArchived': 'Cuenta archivada',
  'manage.addAccount': 'cuenta',
  'manage.accNamePh': 'Nombre (ej: Mercado Pago)',
  'manage.institution': 'Institución',
  'manage.accCurrencyDefault': 'Moneda: {code} (predeterminada)',
  'manage.initialBalance': 'Saldo inicial ({symbol})',
  'manage.kind.corrente': 'Cuenta corriente',
  'manage.kind.pagamento': 'Cuenta de pago',
  'manage.kind.poupanca': 'Caja de ahorro',
  'manage.noLinkedSource': 'sin origen vinculado',
  'manage.linkedSources': 'Orígenes vinculados:',
  'manage.noSourcesYet': 'importá un archivo primero',
  'manage.creditCards': 'Tarjetas de crédito',
  'manage.cardsHint': 'resumen abierto = gastos de los orígenes desde el último cierre',
  'manage.cardSaved': 'Tarjeta guardada',
  'manage.cardArchived': 'Tarjeta archivada',
  'manage.addCard': 'tarjeta',
  'manage.cardDays': 'cierra {closing} · vence {due}',
  'manage.cardLimitLine': 'límite {limit} · disponible ≈\u00A0{available}',
  'manage.cardNamePh': 'Nombre (ej: MP Visa)',
  'manage.last4': 'Últimos 4 dígitos',
  'manage.cardLimitPh': 'Límite ({symbol})',
  'manage.closingDay': 'Día de cierre',
  'manage.dueDay': 'Día de vencimiento',
  // mensajes de error de la API de categorías (app/api/categories/route.js)
  'manage.catErrName': 'El nombre (mín. 2 letras) y el color son obligatorios',
  'manage.catErrShortName': 'El nombre es muy corto',
  'manage.catErrColor': 'Color inválido',
  'manage.catErrDuplicate': 'Ya existe una categoría con ese nombre',
  'manage.catNotFound': 'No encontré la categoría',
  'manage.catSystemRename': 'Una categoría de sistema no se puede renombrar',
  'manage.catSystemArchive': 'Una categoría de sistema no se puede archivar',
  'manage.catSystemDelete': 'Una categoría de sistema no se puede eliminar',
  'manage.catNeedsTarget': '{n} movimientos usan esta categoría — indicá a dónde moverlos',

  // ── tarjetas / resúmenes ───────────────────────────────────────────────
  'cards.title': 'Tarjetas',
  'cards.status.open': 'RESUMEN ABIERTO',
  'cards.status.closed': 'RESUMEN CERRADO',
  'cards.status.partial': 'PAGO PARCIAL',
  'cards.status.paid': 'PAGADO ✓',
  'cards.status.future': 'CUOTAS FUTURAS',
  'cards.noCards': 'No hay ninguna tarjeta cargada. Creá una en',
  'cards.linkAccounts': 'Administrar → Cuentas y tarjetas',
  'cards.noCardsTail': ' y vinculá el origen',
  'cards.noSource': 'Esta tarjeta no tiene origen vinculado — sin eso no hay forma de saber qué movimientos son de ella.',
  'cards.noSourceGo': 'Andá a',
  'cards.linkAccountsEdit': 'Administrar → Cuentas y tarjetas → Editar',
  'cards.noSourceMark': ' y marcá',
  'cards.noInvoices': 'No encontré ningún resumen — importá los resúmenes de la tarjeta en el panel.',
  'cards.invoice': 'Resumen',
  'cards.invoiceAmount': 'Total del resumen',
  'cards.paidAmount': 'pagado {v}',
  'cards.closing': 'Cierre',
  'cards.closingSub': 'las compras posteriores a esa fecha caen en el próximo',
  'cards.due': 'Vencimiento',
  'cards.dueSub': 'pagalo desde tu cuenta',
  'cards.settled': 'pagado',
  'cards.byCategory': 'Categorías del resumen',
  'cards.noSpending': 'Sin gastos en este resumen.',
  'cards.history': 'Historial',
  'cards.invoiceTxs': 'Movimientos del resumen',
  'cards.noTxs': 'Ningún movimiento en este resumen.',
  'cards.openInvoice': 'resumen abierto',

  // ── facturas y servicios ───────────────────────────────────────────────
  'bills.title': 'Facturas y servicios',
  'bills.help': 'Cuando un movimiento importado coincida con el patrón, el importe (±tolerancia) y la ventana del vencimiento, la factura se marca como pagada sola.',
  'bills.new': 'Nueva factura',
  'bills.presets': 'Presets:',
  // presets regionais: expensas e monotributo são o equivalente argentino
  'bills.preset.condo.desc': 'Expensas',
  'bills.preset.condo.pattern': 'expensas',
  'bills.preset.tax.desc': 'Monotributo',
  'bills.preset.tax.pattern': 'monotributo',
  'bills.preset.tithe.desc': 'Diezmo',
  // REVISAR: em pt o padrão é o descritor bancário "fed snt"; em AR não há
  // equivalente conhecido, deixei o próprio nome como palpite de conciliação.
  'bills.preset.tithe.pattern': 'diezmo',
  'bills.f.desc': 'Descripción (ej: Expensas)',
  'bills.f.dueDay': 'Día de vencimiento',
  'bills.f.pattern': 'Patrón para conciliar (ej: expensas)',
  'bills.freq.monthly': 'Mensual',
  'bills.freq.yearly': 'Anual',
  'bills.everyYear': 'todos los años en {month}, día {day}',
  'bills.everyMonth': 'todos los {day}',
  'bills.matches': 'concilia con "{pattern}"',
  'bills.noMatch': 'sin conciliación automática',
  // "vencida" é o termo usado na Argentina para factura em atraso
  'bills.status.late': 'vencida ({ref})',
  'bills.status.next': 'próxima: {d}',
  'bills.status.ok': 'al día',
  'bills.saved': 'Factura guardada — conciliación automática activa',
  'bills.archived': 'Factura archivada',
  'bills.deleted': 'Factura eliminada',
  'bills.restored': 'Factura restaurada',
  'bills.confirmDelete': '¿Eliminar "{desc}" y su historial de pagos?',
  'bills.empty': 'Cargá tus gastos fijos (expensas, monotributo, diezmo…) y Fluxo te avisa en el panel cuando vencen — y las marca como pagadas solo cuando aparece el movimiento.',
  'bills.markedPaid': '{desc} ({ref}) marcada como pagada',
  'bills.markPaid': 'Marcar como pagada',
  'bills.reconcileFailed': 'La conciliación automática no pudo guardar ({msg}) — las facturas pagadas van a volver a aparecer como impagas.',
  'bills.lateShort': 'vencida',
  'bills.dueShort': 'vence {d}',

  // ── informe ────────────────────────────────────────────────────────────
  'report.title': 'Informe',
  'report.print': 'Imprimir / Guardar PDF',
  'report.heading': 'Informe mensual — {month}',
  'report.generated': 'Fluxo · generado el {date} · {n} movimientos en el mes (transferencias internas excluidas)',
  'report.monthBalance': 'Saldo del mes',
  'report.vsMonth': 'vs {month}',
  'report.pctOut': '% de los egresos',
  'report.vsPrevMonth': 'vs mes anterior',
  'report.budgetVsReal': 'Presupuestado × real',
  'report.budgeted': 'Presupuestado',
  'report.spent': 'Gastado',
  'report.result': 'Resultado',
  'report.rollover': 'meta {goal} {sign} {carry} rollover',
  'report.left': 'sobró {v}',
  'report.over': 'se pasó {v}',
  'report.top10': 'Los 10 gastos más grandes del mes',
  'report.tip': 'Tip: en el diálogo de impresión elegí "Guardar como PDF". Para otro mes, cambiá el selector en el panel y tocá 📄 Informe.',

  // ── crecer ─────────────────────────────────────────────────────────────
  'evolve.calcTitle': 'Calculadora de reinversión',
  'evolve.initial': 'Importe inicial',
  'evolve.monthly': 'Aporte mensual',
  'evolve.rate': 'Tasa anual (%)',
  // REVISAR: o CDI é referência brasileira; usei o plazo fijo (TNA) como
  // equivalente argentino — confirmar se é a referência que você quer sugerir.
  'evolve.ratePlaceholder': 'ej: TNA del plazo fijo hoy',
  'evolve.rateHelp': 'La tasa cambia con el tiempo — buscá "TNA plazo fijo hoy" o el rendimiento de la inversión que estás evaluando y ponelo acá. Compará escenarios cambiando el valor.',
  'evolve.y1': '1 año',
  'evolve.y5': '5 años',
  'evolve.y10': '10 años',
  'evolve.contributed': 'aportado',
  'evolve.earnings': 'rendimiento',
  'evolve.fillToSimulate': 'Completá aporte y tasa para simular 1, 5 y 10 años.',
  'evolve.disclaimer': 'Simulación educativa con interés compuesto constante — el rendimiento real varía y hay impuestos e inflación. Esto no es una recomendación de inversión.',

  // ── insights ───────────────────────────────────────────────────────────
  'insight.dismiss': 'No mostrar de nuevo este mes',
  'insight.seeTx': 'Ver movimientos',
  'insight.when.today': 'hoy',
  'insight.when.tomorrow': 'mañana',
  'insight.when.inDays': 'en {n} días',
  'insight.billLate.title': 'Factura atrasada: {desc}',
  'insight.billLate.detail': 'Venció el {date} · {v}',
  'insight.billDue.title': '{desc} vence {when}',
  'insight.overAvg.title': '{cat} {pct}% arriba del promedio',
  'insight.overAvg.detail': 'Proyección de {proj} este mes vs. promedio de {avg} ({n} meses)',
  'insight.priceUp.title': '{name} aumentó',
  'insight.priceUp.detail': '{prev} → {last} (+{pct}% · {year}/año)',
  'insight.goalOver.title': 'Te pasaste de la meta de {cat}',
  'insight.goalOver.detail': '{spent} de {limit} ({pct}%)',
  'insight.goalRisk.title': 'Meta de {cat} en riesgo',
  'insight.goalRisk.detail': 'Al ritmo actual, se pasa cerca del día {day} (proyección {proj} / meta {limit})',
  'insight.invoiceClosing.title': '{card} cierra {when}',
  'insight.invoiceClosing.detail': 'Resumen abierto: {v}{above}',
  'insight.invoiceClosing.above': ', {pct}% arriba de lo normal',
  'insight.cut.title': 'Recorte de mayor impacto: {cat}',
  'insight.cut.detail': '−{cut}/mes (de {base}) = {year}/año para invertir',
  'insight.cut.action': 'Simulá invirtiendo eso',

  // ── revisión en masa ───────────────────────────────────────────────────
  'review.title': 'Revisión en masa',
  'review.help': 'Pendientes agrupados por comercio. Al elegir la categoría se crea la regla y se aplica a todo el grupo — las próximas importaciones ya vienen bien.',
  'review.empty': 'Nada por revisar. 🎉',
  'review.sample': 'ej: {s}',
  'review.applying': 'Aplicando…',
  'review.pick': 'Categorizar…',
  'review.applied': '"{pattern}" → {cat} ({n} movimientos + regla creada)',
  'review.buttonTitle': 'Revisar en masa, agrupado por comercio',

  // ── carga rápida ───────────────────────────────────────────────────────
  'quick.title.expense': '− Nuevo egreso',
  'quick.title.income': '+ Nuevo ingreso',
  'quick.descExpense': '¿En qué gastaste? (ej: Panadería)',
  'quick.descIncome': '¿De dónde vino? (ej: Freelance)',
  'quick.submit': 'Cargar',
  'quick.err.desc': 'La descripción es obligatoria',
  'quick.err.cat': 'Elegí la categoría',
  'quick.done.expense': 'Egreso cargado',
  'quick.done.income': 'Ingreso cargado',

  // ── PIN ────────────────────────────────────────────────────────────────
  'pin.promptCurrent': 'PIN actual:',
  'pin.wrongCurrent': 'PIN actual incorrecto',
  'pin.promptNew': 'PIN nuevo (4+ dígitos; vacío lo quita):',
  'pin.removed': 'PIN eliminado',
  'pin.lengthRule': 'Usá de 4 a 8 dígitos',
  'pin.set': 'PIN definido — te lo va a pedir al abrir la app',
  'pin.locked': 'Fluxo bloqueado',
  'pin.placeholder': 'PIN',
  'pin.wrong': 'PIN incorrecto',
  'pin.hint': 'ingresá el PIN para entrar',
  'pin.configTitle': 'Definir o cambiar el PIN de bloqueo',

  // ── erros das rotas de API ─────────────────────────────────────────────
  'api.invalidDate': "Fecha inválida",
  'api.invalidDateFormat': "Fecha inválida (usá AAAA-MM-DD)",
  'api.descRequired': "La descripción es obligatoria",
  'api.descEmpty': "Descripción vacía",
  'api.invalidAmount': "Importe inválido",
  'api.invalidCategory': "Categoría inválida",
  'api.txNotFound': "No encontré el movimiento",
  'api.accountNotFound': "No encontré la cuenta",
  'api.cardNotFound': "No encontré la tarjeta",
  'api.billNotFound': "No encontré la factura",
  'api.nothingToChange': "No hay nada para cambiar",
  'api.noFile': "No se envió ningún archivo",
  'api.nameRequired': "El nombre es obligatorio",
  'api.invalidParams': "Parámetros inválidos",
  'api.unknownAction': "Acción desconocida",
  'api.invalidFrequency': "Frecuencia inválida",
  'api.idRequired': "id obligatorio",
  'api.invalidIds': "ids inválidos",
  'api.backupFailed': "Falló la copia de seguridad ({msg}) — operación cancelada para no borrar nada sin respaldo",

  // ── configuração (idioma, moeda) ───────────────────────────────────────
  'settings.title': "Idioma y moneda",
  'settings.help': "Vale para esta instalación. La elección queda guardada en tu base.",
  'settings.language': "Idioma",
  'settings.currency': "Moneda",
  'settings.currencyWarning': "Cambiar el idioma no convierte importes. Los movimientos se guardan en centavos, sin moneda: cambiar la moneda solo cambia el símbolo que se muestra.",
  'settings.apply': "Aplicar y recargar",
  'import.confidence.alta': "reconocido con alta confianza",
  'import.confidence.media': "reconocido con confianza media",
  'import.confidence.baixa': "reconocido con baja confianza — revisá los importes",
  'import.encoding': "codificación: {enc}",

  // ── erro, estado vazio e lixeira ───────────────────────────────────────
  'error.title': "Algo se rompió en esta pantalla",
  'error.dataSafe': "Tus datos están guardados.",
  'error.dataSafeText': "Esto es un error de la pantalla. Ningún movimiento se modificó ni se perdió — la base solo cambia cuando importás o editás algo.",
  'error.whatToDo': "Probá de nuevo. Si sigue, volvé al inicio y contame qué estabas haciendo.",
  'error.retry': "Probar de nuevo",
  'error.home': "Volver al inicio",
  'error.details': "Detalles técnicos (para reportar el problema)",
  'error.digest': "Código: {digest}",
  'error.copy': "Copiar",
  'error.copied': "Copiado",
  'error.globalTitle': "La aplicación no pudo cargar",
  'error.globalText': "El error pasó antes de que la pantalla se armara. Tus datos siguen en tu computadora, intactos.",
  'error.reload': "Recargar",
  'error.notFoundTitle': "Esta página no existe",
  'error.notFoundText': "La dirección puede haber cambiado o el enlace estar mal.",
  'empty.dashTitle': "Todavía no hay nada acá",
  'empty.dashText': "Fluxo lee el extracto de tu banco y ordena tus gastos solo. Arrastrá el archivo en el área de arriba — PDF, OFX o CSV.",
  'empty.dashPrivacy': "Todo queda en tu computadora. No se envía nada a ningún lado.",
  'empty.dashAction': "Elegir archivo",
  'empty.monthTitle': "Ningún movimiento en {month}",
  'empty.monthText': "Tenés datos en otros meses. Cambiá el período en el selector de arriba.",
  'empty.monthAction': "Ver todo el período",
  'empty.searchTitle': "No encontré nada",
  'empty.searchText': "Ningún movimiento coincide con ese filtro. Probá una búsqueda más corta o limpiá los filtros.",
  'empty.searchAction': "Limpiar filtros",
  'empty.rulesTitle': "Todavía no hay reglas",
  'empty.rulesText': "Cuando corregís la categoría de un movimiento, Fluxo aprende y la aplica a los parecidos. Las reglas aprendidas aparecen acá.",
  'empty.batchesTitle': "Todavía no hay importaciones",
  'empty.batchesText': "Cada archivo importado es un lote que se puede deshacer entero, por si importaste el archivo equivocado.",
  'empty.accountsTitle': "Ninguna cuenta cargada",
  'empty.accountsText': "Cargá la cuenta y vinculá el origen de los movimientos importados. El saldo se calcula con el saldo inicial más los movimientos — nunca se escribe a mano.",
  'empty.cardsTitle': "Ninguna tarjeta cargada",
  'empty.cardsText': "Con la tarjeta cargada (límite, cierre y vencimiento), Fluxo estima el resumen abierto y el límite disponible.",
  'empty.billsTitle': "Ningún gasto fijo",
  'empty.billsText': "Cargá lo que se repite todos los meses — alquiler, internet, suscripción. Fluxo te avisa cuando vence y lo marca como pagado solo cuando el movimiento aparece en el extracto.",
  'empty.goalsTitle': "Ninguna meta definida",
  'empty.goalsText': "Definí un límite de gasto por categoría y mirá la barra llenarse a lo largo del mes.",
  'empty.trashTitle': "Papelera vacía",
  'empty.trashText': "Los movimientos eliminados quedan acá y se pueden restaurar cuando quieras.",
  'trash.tab': "Eliminadas",
  'trash.deletedAt': "eliminada el {date}",
  'trash.restore': "Restaurar",
  'trash.restored': "{n} movimiento(s) restaurado(s)",
  'trash.count': "{n} en la papelera",

  // ── divisão de lançamento ──────────────────────────────────────────────
  'split.title': "Dividir movimiento",
  'split.help': "Repartí este movimiento entre categorías. La suma de las partes tiene que dar exactamente el importe original.",
  'split.action': "Dividir",
  'split.addPart': "Agregar parte",
  'split.remaining': "Falta repartir: {v}",
  'split.balanced': "Las partes cierran con el original",
  'split.undo': "Deshacer división",
  'split.undone': "División deshecha — el movimiento volvió entero",
  'split.done': "Dividido en {n} partes",
  'split.badge': "parte de {n}",
  'split.errSum': "Las partes suman {parts} y el movimiento es {total}. Dividir no puede crear ni hacer desaparecer plata.",
  'split.errMinParts': "Una división necesita al menos dos partes.",
  'split.errSign': "Todas las partes tienen que tener el mismo signo que el movimiento original.",
  'split.errAlreadySplit': "Este movimiento ya está dividido.",
  'split.errIsPart': "Este movimiento ya es parte de una división.",
  'split.errNotSplit': "Este movimiento no está dividido.",

  // ── offline (service worker) ───────────────────────────────────────────
  'offline.withData': "Sin conexión con el servidor. Estos números son del {when} — no son los de ahora.",
  'offline.noData': "Sin conexión con el servidor y sin datos guardados. Prendé la computadora donde corre Fluxo.",
  'offline.retry': "Probar de nuevo",
  'offline.readOnly': "Modo lectura: no se puede cargar ni importar sin conexión.",

  'app.footerLocal': "tus datos quedan en esta computadora",

  // ── evolução (curva de saldo e visão anual) ────────────────────────────
  'evolution.title': "Evolución",
  'evolution.balanceTitle': "Saldo a lo largo del tiempo",
  'evolution.balanceHelp': "Saldo en las cuentas cargadas. La compra con tarjeta entra cuando se paga el resumen, no el día de la compra.",
  'evolution.variationTitle': "Variación acumulada",
  'evolution.variationHelp': "Cuánto acumulaste desde el inicio — no es el saldo real. Cargá una cuenta con saldo inicial en Administrar › Cuentas para ver el saldo de verdad.",
  'evolution.sincePeriod': "en el período",
  'evolution.chartAlt': "Curva de saldo del {from} al {to}, terminando en {value}.",
  'evolution.yearTitle': "Mes a mes",
  'evolution.yearHelp': "Resultado es todo lo que entró menos todo lo que salió, incluyendo compras con tarjeta en el mes de la compra. Saldo es lo que había en la cuenta a fin de mes — por eso los dos no coinciden.",
  'evolution.yearHelpNoBalance': "Resultado es todo lo que entró menos todo lo que salió en el mes.",
  'evolution.yearFilter': "Filtrar por año",
  'evolution.emptyTitle': "Todavía no se puede mostrar la evolución",
  'evolution.emptyText': "La evolución aparece después del primer extracto importado. Con algunos meses de historial, se ve si estás mejorando.",
  'nav.evolution': "Evolución",
};
