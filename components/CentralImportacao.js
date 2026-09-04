'use client';

import { useRef, useState } from 'react';
import { fmtMoney } from '@/lib/format';

const GUIDES = [
  ['🟣', 'Nubank', 'CSV da conta ou fatura; PDF do extrato também funciona.', 'CSV ou PDF'],
  ['∞', 'InfinitePay', 'No app: saldo → filtros → baixar extrato em OFX ou CSV.', 'OFX ou CSV'],
  ['◉', 'Mercado Pago', 'Use o PDF do extrato ou da fatura baixado pelo app.', 'PDF'],
  ['↗', 'Outro banco', 'Prefira OFX; CSV é aceito quando houver cabeçalhos de data e valor.', 'OFX ou CSV'],
];

export default function CentralImportacao({ onClose, onImport }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function select(next) {
    const chosen = next?.[0];
    if (!chosen) return;
    setFile(chosen); setPreview(null); setError(''); setLoading(true);
    try {
      const form = new FormData(); form.append('file', chosen);
      const res = await fetch('/api/import/preview', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPreview(data);
    } catch (e) { setError(e.message || 'Não foi possível gerar a prévia.'); }
    finally { setLoading(false); }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Central de importação">
      <div className="modal import-hub">
        <div className="modal-head"><div><span className="import-eyebrow">IMPORTAÇÃO SEGURA</span><h3>Importe sem surpresa</h3><p>Veja como exportar de cada banco e confira o arquivo antes de gravar.</p></div><button className="modal-close" aria-label="Fechar" onClick={onClose}>×</button></div>
        <div className="modal-body import-hub-body">
          <div className="import-guides">
            {GUIDES.map(([icon, name, help, format]) => <div className="import-guide" key={name}><span className="import-bank-icon">{icon}</span><div><strong>{name}</strong><span>{help}</span><small>{format}</small></div></div>)}
          </div>
          <button className="import-picker" onClick={() => inputRef.current?.click()} disabled={loading}>
            <span>⇪</span>{loading ? 'Lendo arquivo…' : file ? `Trocar ${file.name}` : 'Escolher arquivo para prévia'}
          </button>
          <input ref={inputRef} type="file" accept=".pdf,.ofx,.csv,.txt" hidden onChange={e => { select(e.target.files); e.target.value = ''; }} />
          <p className="import-privacy">Seus arquivos são processados somente neste computador.</p>
          {error && <p className="import-error">⚠️ {error}</p>}
          {preview && <div className="import-preview">
            <strong>{preview.bank || 'Arquivo reconhecido'}</strong>
            <p>{preview.transactions} lançamentos encontrados{preview.knownDuplicates ? ` · ${preview.knownDuplicates} já existem e serão ignorados` : ''}.</p>
            {preview.confidence && <small>Reconhecimento: {preview.confidence}.</small>}
            <div className="import-sample">{preview.sample.map((tx, i) => <div key={i}><span>{tx.date} · {tx.description}</span><b>{fmtMoney(Math.round(tx.amount * 100))}</b></div>)}</div>
            {preview.warnings.map((warning, i) => <p className="import-warning" key={i}>⚠️ {warning}</p>)}
            <div className="btn-row end"><button className="hbtn" onClick={onClose}>Cancelar</button><button className="attention-btn primary" onClick={() => { onImport([file]); onClose(); }}>Importar {preview.transactions} lançamentos</button></div>
          </div>}
        </div>
      </div>
    </div>
  );
}
