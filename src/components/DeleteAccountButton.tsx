'use client';

import { useState } from 'react';
import { ru } from '@/i18n/ru';

// Удаление аккаунта с подтверждением паролем (необратимо). После успеха — на главную.
export function DeleteAccountButton() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!password) return;
    setPending(true);
    setError(null);
    const res = await fetch('/api/account', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    }).catch(() => null);
    if (res?.ok) {
      window.location.href = '/'; // сессия убита, уходим на лендинг
      return;
    }
    setPending(false);
    setError(res?.status === 403 ? ru.account.wrongPassword : ru.inquiry.errorGeneric);
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="text-sm text-muted underline transition hover:text-accent">
        {ru.account.deleteBtn}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm muted">{ru.account.dangerHint}</p>
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
        placeholder={ru.account.passwordLabel} autoComplete="current-password" className="input max-w-xs" />
      {error && <p role="alert" className="text-sm text-accent">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={confirm} disabled={pending || !password}
          className="btn btn-accent px-4 py-2 text-sm">{pending ? ru.account.deleting : ru.account.confirm}</button>
        <button type="button" onClick={() => { setOpen(false); setPassword(''); setError(null); }}
          className="btn btn-ghost px-4 py-2 text-sm">{ru.account.cancel}</button>
      </div>
    </div>
  );
}
