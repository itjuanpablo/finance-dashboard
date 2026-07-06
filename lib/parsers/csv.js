// Parser genérico de CSV com heurística de colunas (data / descrição / valor).
// Aceita separador ; ou , e datas dd/mm/yyyy, dd-mm-yyyy ou yyyy-mm-dd.

function splitLine(line, sep) {
  const out = [];
  let cur = '', inQ = false;
  for (const ch of line) {
    if (ch === '"') inQ = !inQ;
    else if (ch === sep && !inQ) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(c => c.trim().replace(/^"|"$/g, ''));
}

function parseDate(s) {
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

function parseValue(s) {
  if (!s) return NaN;
  let v = s.replace(/R\$\s?/g, '').trim();
  if (/,\d{1,2}$/.test(v)) v = v.replace(/\./g, '').replace(',', '.'); // formato BR
  else v = v.replace(/,/g, '');                                       // formato US
  return parseFloat(v);
}

export function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  const sep = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';

  const header = splitLine(lines[0], sep).map(h => h.toLowerCase());
  const findCol = names => header.findIndex(h => names.some(n => h.includes(n)));
  let di = findCol(['data', 'date']);
  let de = findCol(['descri', 'hist', 'lancamento', 'lançamento', 'memo', 'title', 'estabelecimento']);
  let vi = findCol(['valor', 'amount', 'value']);
  let rows = lines.slice(1);

  // sem cabeçalho reconhecível: assume posicional (data, descrição, ..., valor)
  if (di < 0 || vi < 0) {
    const first = splitLine(lines[0], sep);
    di = 0; de = 1; vi = first.length - 1;
    rows = lines;
  }

  const txs = [];
  for (const line of rows) {
    const cols = splitLine(line, sep);
    const date = parseDate(cols[di] || '');
    const amount = parseValue(cols[vi] || '');
    if (!date || !isFinite(amount) || amount === 0) continue;
    txs.push({
      date,
      description: (de >= 0 && cols[de]) ? cols[de] : 'Sem descrição',
      amount,
      externalId: null,
      source: 'csv',
      transfer: false,
    });
  }
  return txs;
}
