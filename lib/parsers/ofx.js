// Parser genérico de OFX (SGML ou XML) — cobre o formato padrão dos bancos brasileiros.

export function parseOfx(text) {
  const txs = [];
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  for (const b of blocks) {
    const get = tag =>
      (b.match(new RegExp(`<${tag}>([^<\\r\\n]+)`, 'i')) || [])[1]?.trim();
    const dt = get('DTPOSTED') || '';
    const m = dt.match(/^(\d{4})(\d{2})(\d{2})/);
    if (!m) continue;
    const amount = parseFloat((get('TRNAMT') || '0').replace(',', '.'));
    if (!isFinite(amount)) continue;
    txs.push({
      date: `${m[1]}-${m[2]}-${m[3]}`,
      description: get('MEMO') || get('NAME') || 'Sem descrição',
      amount,
      externalId: get('FITID') || null,
      source: 'ofx',
      transfer: false,
    });
  }
  return txs;
}
