'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ru } from '@/i18n/ru';
import { describeApiError } from '@/lib/form-errors';
import { AuthScene } from '@/components/AuthScene';
import { YandexLoginButton } from '@/components/YandexLoginButton';

// useSearchParams требует Suspense (иначе падает next build — урок Брендоскопа).
export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const router = useRouter();
  const invitePrefill = useSearchParams().get('invite') ?? '';
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [showInvite, setShowInvite] = useState(Boolean(invitePrefill));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!consent) { setError(ru.auth.consentRequired); return; }
    setPending(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: f.get('role'),
        firstName: f.get('firstName'),
        lastName: f.get('lastName'),
        email: f.get('email'),
        password: f.get('password'),
        inviteCode: f.get('inviteCode') || undefined,
        pdnConsent: consent,
      }),
    }).catch(() => null);
    setPending(false);

    if (res?.status === 201) {
      router.push('/ru/cabinet');
      router.refresh(); // обновить серверный layout (шапку) под новую сессию
      return;
    }
    setError(await describeApiError(res, {
      codeLabels: {
        invite_required: ru.auth.errorInvite,
        invite_invalid: ru.auth.errorInvite,
        email_taken: ru.auth.errorEmailTaken,
      },
      fieldLabels: { firstName: 'имя', lastName: 'фамилия', email: 'email', password: 'пароль', inviteCode: 'код приглашения' },
      fallback: ru.auth.errorRegister,
    }));
  }

  return (
    <AuthScene>
      <h1 className="t-h2">{ru.auth.registerTitle}</h1>
      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2">
            <label className="chip flex-1 justify-center has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-paper">
              <input type="radio" name="role" value="PHOTOGRAPHER" defaultChecked className="sr-only" /> {ru.auth.rolePhotographer}
            </label>
            <label className="chip flex-1 justify-center has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-paper">
              <input type="radio" name="role" value="CLIENT" className="sr-only" /> {ru.auth.roleClient}
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="reg-firstName" className="field-label">{ru.auth.firstName}</label>
              <input id="reg-firstName" name="firstName" required minLength={2} maxLength={60} autoComplete="given-name" className="input" />
            </div>
            <div>
              <label htmlFor="reg-lastName" className="field-label">{ru.auth.lastName}</label>
              <input id="reg-lastName" name="lastName" required minLength={2} maxLength={60} autoComplete="family-name" className="input" />
            </div>
          </div>
          <div>
            <label htmlFor="reg-email" className="field-label">{ru.auth.email}</label>
            <input id="reg-email" name="email" type="email" required autoComplete="email" className="input" />
          </div>
          <div>
            <label htmlFor="reg-password" className="field-label">{ru.auth.password}</label>
            <input id="reg-password" name="password" type="password" required minLength={10} autoComplete="new-password" className="input" />
            <span className="field-hint">Минимум 10 символов</span>
          </div>
          {showInvite ? (
            <div>
              <label htmlFor="reg-inviteCode" className="field-label">{ru.auth.inviteCode}</label>
              <input id="reg-inviteCode" name="inviteCode" defaultValue={invitePrefill} className="input" />
            </div>
          ) : (
            <button type="button" onClick={() => setShowInvite(true)}
              className="self-start text-sm underline muted hover:text-ink">
              {ru.auth.hasInvite}
            </button>
          )}
          <label className="flex items-start gap-2.5 text-sm">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]" />
            <span className="muted">
              {ru.auth.consentAccept}{' '}
              <Link href="/ru/legal/privacy" target="_blank" className="underline hover:text-ink">{ru.auth.consentPrivacy}</Link>{' '}
              {ru.auth.consentAnd}{' '}
              <Link href="/ru/legal/offer" target="_blank" className="underline hover:text-ink">{ru.auth.consentOffer}</Link>.
            </span>
          </label>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <button type="submit" disabled={pending || !consent} className="btn btn-accent btn-lg mt-1">
            {ru.auth.submitRegister}
          </button>
          <p className="mt-1 text-sm muted">
            {ru.auth.haveAccount}{' '}
            <Link href="/ru/login" className="underline hover:text-ink">{ru.auth.toLogin}</Link>
          </p>
        </form>
        <YandexLoginButton />
    </AuthScene>
  );
}
