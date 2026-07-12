// Motor de insights: regras puras e transparentes — cada insight carrega o
// número que o gerou. Roda no cliente sobre dados já carregados; nada de API nova.
//
// Insight = { id, kind, severity: 'info'|'atencao'|'alerta', title, detail,
//             cents (impacto, ordena), action?: { label, filter?: {cat} } }

const fmtBRL = c =>
  (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const stripParcela = d => d.replace(/\s*\(parcela \d+\/\d+\)$/, '').trim();
const monthOf = iso => iso.slice(0, 7);
const prevMonths = (ym, n) => {
  const out = [];
  let y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1;
  for (let i = 0; i < n; i++) {
    m -= 1;
    if (m < 0) { m = 11; y -= 1; }
    out.push(`${y}-${String(m + 1).padStart(2, '0')}`);
  }
  return out;
};

// Categorias tratadas como flexíveis para a sugestão de corte.
const FLEX_CATEGORIES = ['Lazer', 'Compras', 'Assinaturas'];

export function computeInsights({ transactions, goals = [], cards = [], now = new Date() }) {
  const insights = [];
  const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const day = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  // gasto por categoria por mês (despesas reais, sem transferências)
  const byMonthCat = {};
  const curCount = {}; // nº de lançamentos no mês corrente por categoria
  for (const t of transactions) {
    if (t.amount_cents >= 0 || t.transfer) continue;
    const ym = monthOf(t.date);
    (byMonthCat[ym] = byMonthCat[ym] || {})[t.category] =
      (byMonthCat[ym]?.[t.category] || 0) - t.amount_cents;
    if (ym === curMonth) {
      curCount[t.category] = (curCount[t.category] || 0) + 1;
    }
  }
  const cur = byMonthCat[curMonth] || {};
  const histMonths = prevMonths(curMonth, 3).filter(m => byMonthCat[m]);
  const avgFor = cat => {
    const vals = histMonths.map(m => byMonthCat[m][cat] || 0);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  };

  // ── 1. Gasto acima da média (pró-rateado pelo dia do mês) ──
  if (histMonths.length >= 2 && day >= 5) {
    for (const [cat, spent] of Object.entries(cur)) {
      const avg = avgFor(cat);
      if (avg < 2000) continue; // sem histórico relevante
      // projeção de 1-2 lançamentos não é estatística, é chute
      if ((curCount[cat] || 0) < 3) continue;
      const projected = spent / day * daysInMonth;
      const diff = projected - avg;
      const pct = diff / avg * 100;
      if (pct >= 25 && diff >= 5000) {
        insights.push({
          id: `media:${cat}:${curMonth}`,
          kind: 'gasto_acima_media',
          severity: pct >= 50 ? 'alerta' : 'atencao',
          title: `${cat} ${Math.round(pct)}% acima da média`,
          detail: `Projeção de ${fmtBRL(projected)} este mês vs. média de ${fmtBRL(avg)} (${histMonths.length} meses)`,
          cents: Math.round(diff),
          action: { label: 'Ver transações', filter: { cat } },
        });
      }
    }
  }

  // ── 2. Recorrência que subiu de preço ──
  const groups = {};
  for (const t of transactions) {
    if (t.amount_cents >= 0 || t.transfer) continue;
    const key = stripParcela(t.description).toLowerCase();
    (groups[key] = groups[key] || []).push(t);
  }
  for (const [key, list] of Object.entries(groups)) {
    const ms = new Set(list.map(t => monthOf(t.date)));
    if (ms.size < 3 || list.length / ms.size > 2) continue;
    const vals = list.map(t => -t.amount_cents).sort((a, b) => a - b);
    const median = vals[Math.floor(vals.length / 2)];
    if ((vals[vals.length - 1] - vals[0]) / median > 0.25) continue;
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const last = -sorted[sorted.length - 1].amount_cents;
    const prev = -sorted[sorted.length - 2].amount_cents;
    if (prev > 0 && (last - prev) / prev > 0.05) {
      const name = stripParcela(sorted[sorted.length - 1].description);
      insights.push({
        id: `rec:${key}:${curMonth}`,
        kind: 'recorrencia_subiu',
        severity: 'info',
        title: `${name.slice(0, 32)} subiu de preço`,
        detail: `${fmtBRL(prev)} → ${fmtBRL(last)} (+${Math.round((last - prev) / prev * 100)}% · ${fmtBRL((last - prev) * 12)}/ano)`,
        cents: (last - prev) * 12,
        action: { label: 'Ver transações', filter: { search: name.slice(0, 20) } },
      });
    }
  }

  // ── 3. Meta em risco (ritmo atual estoura antes do fim do mês) ──
  if (day >= 5) {
    for (const g of goals) {
      const spent = cur[g.category] || 0;
      if (!spent) continue;
      const rate = spent / day;
      const projected = rate * daysInMonth;
      if (spent >= g.limit_cents) {
        insights.push({
          id: `meta:${g.category}:${curMonth}`,
          kind: 'meta_em_risco',
          severity: 'alerta',
          title: `Meta de ${g.category} estourada`,
          detail: `${fmtBRL(spent)} de ${fmtBRL(g.limit_cents)} (${Math.round(spent / g.limit_cents * 100)}%)`,
          cents: spent - g.limit_cents,
          action: { label: 'Ver transações', filter: { cat: g.category } },
        });
      } else if (projected > g.limit_cents) {
        const burstDay = Math.ceil(g.limit_cents / rate);
        insights.push({
          id: `meta:${g.category}:${curMonth}`,
          kind: 'meta_em_risco',
          severity: 'atencao',
          title: `Meta de ${g.category} em risco`,
          detail: `No ritmo atual, estoura por volta do dia ${burstDay} (projeção ${fmtBRL(projected)} / meta ${fmtBRL(g.limit_cents)})`,
          cents: Math.round(projected - g.limit_cents),
          action: { label: 'Ver transações', filter: { cat: g.category } },
        });
      }
    }
  }

  // ── 4. Fatura fecha em breve ──
  for (const c of cards) {
    if (c.archived || !c.sources?.length) continue;
    let cy = now.getFullYear(), cm = now.getMonth();
    if (day > c.closing_day) cm += 1;
    const nextClosing = new Date(cy, cm, Math.min(c.closing_day, 28));
    const daysTo = Math.ceil((nextClosing - now) / 86400000);
    if (daysTo < 0 || daysTo > 3) continue;
    // média dos 3 meses anteriores de gasto nas origens do cartão
    const srcSet = new Set(c.sources);
    const perMonth = {};
    for (const t of transactions) {
      if (t.amount_cents >= 0 || t.transfer || !srcSet.has(t.source)) continue;
      const ym = monthOf(t.date);
      if (ym === curMonth) continue;
      perMonth[ym] = (perMonth[ym] || 0) - t.amount_cents;
    }
    const hist = prevMonths(curMonth, 3).map(m => perMonth[m]).filter(v => v > 0);
    const avg = hist.length ? hist.reduce((a, b) => a + b, 0) / hist.length : 0;
    const open = c.open_invoice_cents || 0;
    const aboveTxt = avg > 0 && open > avg * 1.1
      ? `, ${Math.round((open / avg - 1) * 100)}% acima do normal` : '';
    insights.push({
      id: `fatura:${c.id}:${curMonth}:${daysTo}`,
      kind: 'fatura_proxima',
      severity: avg > 0 && open > avg * 1.1 ? 'atencao' : 'info',
      title: `${c.name} fecha ${daysTo === 0 ? 'hoje' : daysTo === 1 ? 'amanhã' : `em ${daysTo} dias`}`,
      detail: `Fatura aberta: ${fmtBRL(open)}${aboveTxt}`,
      cents: open,
    });
  }

  // ── 5. Corte com maior impacto (categorias flexíveis) ──
  if (histMonths.length >= 2) {
    let best = null;
    for (const cat of FLEX_CATEGORIES) {
      const avg = avgFor(cat);
      const spent = cur[cat] || 0;
      const projected = day >= 5 ? spent / day * daysInMonth : avg;
      const base = Math.max(projected, avg);
      if (base < 5000) continue;
      const cut = Math.round(base * 0.5); // corte de metade do flexível
      if (!best || cut > best.cut) best = { cat, cut, base };
    }
    if (best) {
      insights.push({
        id: `corte:${best.cat}:${curMonth}`,
        kind: 'corte_sugerido',
        severity: 'info',
        title: `Corte com maior impacto: ${best.cat}`,
        detail: `−${fmtBRL(best.cut)}/mês (de ${fmtBRL(best.base)}) = ${fmtBRL(best.cut * 12)}/ano para investir`,
        cents: best.cut,
        action: { label: 'Ver de onde vem', filter: { cat: best.cat } },
      });
    }
  }

  return insights.sort((a, b) => b.cents - a.cents);
}
