'use client';

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
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">{ru.auth.loginTitle}</h1>
      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
        <label className="text-sm">
          {ru.auth.email}
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        <label className="text-sm">
          {ru.auth.password}
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="mt-1 w-full rounded-lg border px-3 py-2"
          />
        </label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="mt-2 rounded-lg bg-foreground px-4 py-2 text-background disabled:opacity-50"
        >
          {ru.auth.submitLogin}
        </button>
      </form>
    </main>
  );
}
