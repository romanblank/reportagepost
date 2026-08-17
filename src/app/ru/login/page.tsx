'use client';

import Link from 'next/link';
import { apiFetch } from '@/lib/api';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ru } from '@/i18n/ru';
import { AuthScene } from '@/components/AuthScene';
import { YandexLoginButton } from '@/components/YandexLoginButton';

// useSearchParams требует Suspense (иначе падает next build — урок Брендоскопа).
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Возврат по ?next= (приглашение подтвердить съёмку): только локальный путь
  const next = searchParams?.get('next');
  const safeNext = next && /^\/ru\//.test(next) ? next : '/ru/cabinet';
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [twoFactor, setTwoFactor] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await apiFetch('/api/auth/login', { method: 'POST', body: { email: form.get('email'), password: form.get('password') } });
    setPending(false);

    if (res.ok) {
      const data = res.data as { twoFactor?: boolean } | undefined;
      if (data?.twoFactor) { setTwoFactor(true); return; }
      router.push(safeNext);
      router.refresh(); // обновить серверный layout (шапку) под новую сессию
      return;
    }
    if (res.status === 401) setError(ru.auth.errorInvalid);
    else if (res.status === 403) setError(ru.auth.errorBanned);
    else if (res.status === 429) setError(ru.auth.errorRate);
    else setError(ru.auth.errorGeneric);
  }

  async function onVerify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const code = new FormData(e.currentTarget).get('code');
    const res = await apiFetch('/api/auth/2fa/verify', { method: 'POST', body: { code } });
    setPending(false);
    if (res?.ok) { router.push(safeNext); router.refresh(); return; }
    setError(ru.auth.twoFa.badCode);
  }

  if (twoFactor) {
    return (
      <AuthScene>
        <h1 className="t-h2">{ru.auth.twoFa.challengeTitle}</h1>
        <form onSubmit={onVerify} className="mt-6 flex flex-col gap-4">
          <p className="t-small muted">{ru.auth.twoFa.challengeLead}</p>
          <div>
            <label className="field-label" htmlFor="code">{ru.auth.twoFa.codeLabel}</label>
            <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" autoFocus
              placeholder={ru.auth.twoFa.codePlaceholder}
              className="input input-code" />
            <span className="field-hint">{ru.auth.twoFa.recoveryHint}</span>
          </div>
          {error && <p role="alert" className="t-small text-danger">{error}</p>}
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
            <Link href="/ru/forgot" className="t-fine underline muted hover:text-ink">{ru.auth.pwreset.forgotLink}</Link>
          </div>
          <input id="password" name="password" type="password" required autoComplete="current-password" className="input" />
        </div>
        {error && <p role="alert" className="t-small text-danger">{error}</p>}
        <button type="submit" disabled={pending} className="btn btn-accent btn-lg mt-1">
          {ru.auth.submitLogin}
        </button>
        <p className="mt-2 t-small muted">
          {ru.auth.noAccount}{' '}
          <Link href="/ru/register" className="underline hover:text-ink">{ru.auth.toRegister}</Link>
        </p>
      </form>
      <YandexLoginButton />
    </AuthScene>
  );
}
