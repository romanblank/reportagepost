'use client';

import Link from 'next/link';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ru } from '@/i18n/ru';

export default function LoginPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
    }).catch(() => null);
    setPending(false);

    if (res?.ok) {
      router.push('/ru/cabinet');
      return;
    }
    if (res?.status === 401) setError(ru.auth.errorInvalid);
    else if (res?.status === 403) setError(ru.auth.errorBanned);
    else if (res?.status === 429) setError(ru.auth.errorRate);
    else setError(ru.auth.errorGeneric);
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16">
      <div className="card p-6 sm:p-8">
        <h1 className="text-2xl font-semibold">{ru.auth.loginTitle}</h1>
        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
          <div>
            <label className="field-label" htmlFor="email">{ru.auth.email}</label>
            <input id="email" name="email" type="email" required autoComplete="email" className="input" />
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <label className="field-label" htmlFor="password">{ru.auth.password}</label>
              <Link href="/ru/forgot" className="text-xs underline muted hover:text-ink">{ru.auth.pwreset.forgotLink}</Link>
            </div>
            <input id="password" name="password" type="password" required autoComplete="current-password" className="input" />
          </div>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <button type="submit" disabled={pending} className="btn btn-accent mt-1">
            {ru.auth.submitLogin}
          </button>
        </form>
      </div>
    </main>
  );
}
