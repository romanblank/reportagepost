'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ru } from '@/i18n/ru';

export default function ForgotPage() {
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const email = new FormData(e.currentTarget).get('email');
    await fetch('/api/auth/password/forgot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }).catch(() => null);
    setPending(false);
    setDone(true);
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16">
      <div className="card p-6 sm:p-8">
        <h1 className="t-h3">{ru.auth.pwreset.forgotTitle}</h1>
        {done ? (
          <>
            <p className="mt-4 text-sm muted">{ru.auth.pwreset.forgotDone}</p>
            <Link href="/ru/login" className="mt-5 inline-block text-sm underline">{ru.auth.pwreset.backToLogin}</Link>
          </>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
            <p className="text-sm muted">{ru.auth.pwreset.forgotLead}</p>
            <div>
              <label className="field-label">{ru.auth.email}</label>
              <input name="email" type="email" required autoComplete="email" className="input" />
            </div>
            <button type="submit" disabled={pending} className="btn btn-accent mt-1">{ru.auth.pwreset.forgotSubmit}</button>
            <Link href="/ru/login" className="self-start text-sm underline muted hover:text-ink">{ru.auth.pwreset.backToLogin}</Link>
          </form>
        )}
      </div>
    </main>
  );
}
