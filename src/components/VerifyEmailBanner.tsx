'use client';

import { useState } from 'react';
import { ru } from '@/i18n/ru';

// Баннер «подтвердите адрес» в кабинете. Показывается только когда почта
// реально настроена (иначе просить нечего) и адрес ещё не подтверждён.
export function VerifyEmailBanner() {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function resend() {
    setBusy(true);
    setError(false);
    const res = await fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) { setSent(true); return; }
    setError(true);
  }

  return (
    <section className="card border-recognition/40 bg-recognition-soft/20 p-4">
      <p className="text-sm font-medium">{ru.auth.emailVerify.bannerTitle}</p>
      <p className="mt-1 text-sm muted">{ru.auth.emailVerify.bannerText}</p>
      {sent ? (
        <p className="mt-2 text-sm text-recognition">{ru.auth.emailVerify.sent}</p>
      ) : (
        <button type="button" onClick={resend} disabled={busy}
          className="btn btn-outline mt-3 px-3 py-1.5 text-sm">
          {ru.auth.emailVerify.resend}
        </button>
      )}
      {error && <p role="alert" className="mt-1 text-sm text-danger">{ru.ui.toastError}</p>}
    </section>
  );
}
