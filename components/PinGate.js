'use client';

import { useEffect, useState } from 'react';

// PIN local: proteção de tela contra olhares casuais (celular emprestado,
// aba aberta). Honestidade importante: os dados no disco NÃO são
// criptografados — isto é uma fechadura de porta, não um cofre.

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function configurePin() {
  const current = localStorage.getItem('fluxo-pin');
  if (current) {
    const check = prompt('PIN atual:');
    if (check === null) return null;
    if (await sha256(check) !== current) return 'PIN atual incorreto';
  }
  const next = prompt('Novo PIN (4+ dígitos; vazio remove):');
  if (next === null) return null;
  if (next === '') {
    localStorage.removeItem('fluxo-pin');
    sessionStorage.removeItem('fluxo-unlocked');
    return 'PIN removido';
  }
  if (!/^\d{4,8}$/.test(next)) return 'Use de 4 a 8 dígitos';
  localStorage.setItem('fluxo-pin', await sha256(next));
  sessionStorage.setItem('fluxo-unlocked', '1');
  return 'PIN definido — será pedido ao abrir o app';
}

export default function PinGate({ children }) {
  const [state, setState] = useState('checking'); // checking | locked | open
  const [pin, setPin] = useState('');
  const [erro, setErro] = useState(false);

  useEffect(() => {
    try {
      const hash = localStorage.getItem('fluxo-pin');
      if (!hash || sessionStorage.getItem('fluxo-unlocked') === '1') setState('open');
      else setState('locked');
    } catch { setState('open'); }
  }, []);

  async function tryUnlock(value) {
    if (await sha256(value) === localStorage.getItem('fluxo-pin')) {
      sessionStorage.setItem('fluxo-unlocked', '1');
      setState('open');
    } else {
      setErro(true);
      setPin('');
      setTimeout(() => setErro(false), 900);
    }
  }

  if (state === 'open') return children;
  if (state === 'checking') return null;

  return (
    <div style={{
      minHeight: '100vh', display: 'grid', placeItems: 'center',
      background: 'var(--bg)', padding: 20,
    }}>
      <div style={{ textAlign: 'center' }}>
        <img src="/icon.svg" alt="Fluxo" width={64} height={64} style={{ borderRadius: 18, marginBottom: 16 }} />
        <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-.02em', marginBottom: 14 }}>Fluxo bloqueado</div>
        <input
          autoFocus type="password" inputMode="numeric" maxLength={8}
          placeholder="PIN"
          value={pin}
          onChange={e => {
            const v = e.target.value.replace(/\D/g, '');
            setPin(v);
            if (v.length >= 4) {
              const hash = localStorage.getItem('fluxo-pin');
              sha256(v).then(h => { if (h === hash) tryUnlock(v); });
            }
          }}
          onKeyDown={e => e.key === 'Enter' && tryUnlock(pin)}
          style={{
            background: 'var(--surface)', color: 'var(--text)',
            border: `1.5px solid ${erro ? 'var(--red)' : 'var(--border)'}`,
            borderRadius: 12, padding: '12px 16px', fontSize: 22, width: 180,
            textAlign: 'center', letterSpacing: 8, outline: 0, fontFamily: 'inherit',
          }} />
        <div style={{ fontSize: 12, color: erro ? 'var(--red)' : 'var(--muted)', marginTop: 10 }}>
          {erro ? 'PIN incorreto' : 'digite o PIN para entrar'}
        </div>
      </div>
    </div>
  );
}
