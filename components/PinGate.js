'use client';

import { useEffect, useState } from 'react';
import { t } from '@/lib/i18n';

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
    const check = prompt(t('pin.promptCurrent'));
    if (check === null) return null;
    if (await sha256(check) !== current) return t('pin.wrongCurrent');
  }
  const next = prompt(t('pin.promptNew'));
  if (next === null) return null;
  if (next === '') {
    localStorage.removeItem('fluxo-pin');
    sessionStorage.removeItem('fluxo-unlocked');
    return t('pin.removed');
  }
  if (!/^\d{4,8}$/.test(next)) return t('pin.lengthRule');
  localStorage.setItem('fluxo-pin', await sha256(next));
  sessionStorage.setItem('fluxo-unlocked', '1');
  return t('pin.set');
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
        <img src="/icon.svg" alt={t('app.name')} width={64} height={64} style={{ borderRadius: 18, marginBottom: 16 }} />
        <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-.02em', marginBottom: 14 }}>{t('pin.locked')}</div>
        <input
          autoFocus type="password" inputMode="numeric" maxLength={8}
          placeholder={t('pin.placeholder')}
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
          {erro ? t('pin.wrong') : t('pin.hint')}
        </div>
      </div>
    </div>
  );
}
