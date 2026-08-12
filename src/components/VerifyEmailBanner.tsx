'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { ru } from '@/i18n/ru';

// Баннер «подтвердите адрес» в кабинете. Показывается только когда почта
// реально настроена (иначе просить нечего) и адрес ещё не подтверждён.
export function VerifyEmailBanner({ email }: { email: string | null }) {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function resend() {
    setBusy(true);
    setError(false);
    const res = await apiFetch('/api/auth/verify-email', { method: 'POST', body: {} });
    setBusy(false);
    if (res?.ok) { setSent(true); return; }
    setError(true);
  }

  return (
    <section className="card border-recognition/40 bg-recognition-soft/20 p-4">
      <p className="t-small font-medium">{ru.auth.emailVerify.bannerTitle}</p>
      <p className="mt-1 t-small muted">{ru.auth.emailVerify.bannerText}</p>
      {email ? (
        <p className="mt-1 t-small muted">{ru.auth.emailVerify.bannerAddress(email)}</p>
      ) : null}
      {/* Домен новый, репутации у него нет — письмо часто оказывается в спаме,
          и человек считает, что оно не пришло вовсе */}
      <p className="t-fine mt-1 muted">{ru.auth.emailVerify.bannerSpamHint}</p>
      {sent ? (
        <p className="mt-2 t-small text-recognition">{ru.auth.emailVerify.sent}</p>
      ) : (
        <button type="button" onClick={resend} disabled={busy}
          className="btn btn-outline mt-3 px-3 py-1.5 t-small">
          {ru.auth.emailVerify.resend}
        </button>
      )}
      {error && <p role="alert" className="mt-1 t-small text-danger">{ru.ui.toastError}</p>}
    </section>
  );
}
