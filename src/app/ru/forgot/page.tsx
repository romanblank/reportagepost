'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';
import { ru } from '@/i18n/ru';
import { AuthScene } from '@/components/AuthScene';

export default function ForgotPage() {
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const email = new FormData(e.currentTarget).get('email');
    await apiFetch('/api/auth/password/forgot', { method: 'POST', body: { email } });
    setPending(false);
    setDone(true);
  }

  return (
    <AuthScene>
        <h1 className="t-h2">{ru.auth.pwreset.forgotTitle}</h1>
        {done ? (
          <>
            <p className="mt-4 t-small muted">{ru.auth.pwreset.forgotDone}</p>
            <Link href="/ru/login" className="mt-5 inline-block t-small underline">{ru.auth.pwreset.backToLogin}</Link>
          </>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
            <p className="t-small muted">{ru.auth.pwreset.forgotLead}</p>
            <div>
              <label htmlFor="forgot-email" className="field-label">{ru.auth.email}</label>
              <input id="forgot-email" name="email" type="email" required autoComplete="email" className="input" />
            </div>
            <button type="submit" disabled={pending} className="btn btn-accent mt-1">{ru.auth.pwreset.forgotSubmit}</button>
            <Link href="/ru/login" className="self-start t-small underline muted hover:text-ink">{ru.auth.pwreset.backToLogin}</Link>
          </form>
        )}
    </AuthScene>
  );
}
