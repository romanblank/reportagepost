'use client';

import { Suspense, useState } from 'react';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ru } from '@/i18n/ru';
import { AuthScene } from '@/components/AuthScene';

export default function ResetPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}

function ResetForm() {
  const token = useSearchParams().get('token') ?? '';
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const password = new FormData(e.currentTarget).get('password');
    const res = await apiFetch('/api/auth/password/reset', { method: 'POST', body: { token, password } });
    setPending(false);
    if (res?.ok) { setDone(true); return; }
    setError(ru.auth.pwreset.resetInvalid);
  }

  return (
    <AuthScene>
        <h1 className="t-h2">{ru.auth.pwreset.resetTitle}</h1>
        {done ? (
          <>
            <p className="mt-4 text-sm muted">{ru.auth.pwreset.resetDone}</p>
            <Link href="/ru/login" className="btn btn-accent mt-5">{ru.auth.pwreset.backToLogin}</Link>
          </>
        ) : !token ? (
          <p className="mt-4 text-sm text-danger">{ru.auth.pwreset.resetInvalid}</p>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
            <p className="text-sm muted">{ru.auth.pwreset.resetLead}</p>
            <div>
              <label htmlFor="reset-password" className="field-label">{ru.auth.pwreset.newPassword}</label>
              <input id="reset-password" name="password" type="password" required minLength={10} autoComplete="new-password" className="input" />
              <span className="field-hint">{ru.auth.passwordHint}</span>
            </div>
            {error && <p role="alert" className="text-sm text-danger">{error}</p>}
            <button type="submit" disabled={pending} className="btn btn-accent btn-lg mt-1">{ru.auth.pwreset.resetSubmit}</button>
          </form>
        )}
    </AuthScene>
  );
}
