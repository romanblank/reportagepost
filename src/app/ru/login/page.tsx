'use client';

import Link from 'next/link';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ru } from '@/i18n/ru';
import { AuthScene } from '@/components/AuthScene';
import { YandexLoginButton } from '@/components/YandexLoginButton';

export default function LoginPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [twoFactor, setTwoFactor] = useState(false);

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
      const data = await res.json().catch(() => ({}));
      if (data?.twoFactor) { setTwoFactor(true); return; }
      router.push('/ru/cabinet');
      router.refresh(); // обновить серверный layout (шапку) под новую сессию
      return;
    }
    if (res?.status === 401) setError(ru.auth.errorInvalid);
    else if (res?.status === 403) setError(ru.auth.errorBanned);
    else if (res?.status === 429) setError(ru.auth.errorRate);
    else setError(ru.auth.errorGeneric);
  }

  async function onVerify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const code = new FormData(e.currentTarget).get('code');
    const res = await fetch('/api/auth/2fa/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    }).catch(() => null);
    setPending(false);
    if (res?.ok) { router.push('/ru/cabinet'); router.refresh(); return; }
    setError(ru.auth.twoFa.badCode);
  }

  if (twoFactor) {
    return (
      <AuthScene>
        <h1 className="t-h2">{ru.auth.twoFa.challengeTitle}</h1>
        <form onSubmit={onVerify} className="mt-6 flex flex-col gap-4">
          <p className="text-sm muted">{ru.auth.twoFa.challengeLead}</p>
          <div>
            <label className="field-label" htmlFor="code">{ru.auth.twoFa.codeLabel}</label>
            <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" autoFocus
              placeholder={ru.auth.twoFa.codePlaceholder}
              className="input tnum text-center text-lg tracking-[0.3em]" />
            <span className="field-hint">{ru.auth.twoFa.recoveryHint}</span>
          </div>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <button type="submit" disabled={pending} className="btn btn-accent btn-lg mt-1">{ru.auth.twoFa.verify}</button>
        </form>
      </AuthScene>
    );
  }

  return (
    <AuthScene>
      <h1 className="t-h1">{ru.auth.loginTitle}</h1>
      <form onSubmit={onSubmit} className="mt-7 flex flex-col gap-4">
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
        <button type="submit" disabled={pending} className="btn btn-accent btn-lg mt-1">
          {ru.auth.submitLogin}
        </button>
        <p className="mt-2 text-sm muted">
          {ru.auth.noAccount}{' '}
          <Link href="/ru/register" className="underline hover:text-ink">{ru.auth.toRegister}</Link>
        </p>
      </form>
      <YandexLoginButton />
    </AuthScene>
  );
}
