'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ru } from '@/i18n/ru';
import { describeApiError } from '@/lib/form-errors';

export default function RegisterPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
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
        inviteCode: f.get('inviteCode'),
      }),
    }).catch(() => null);
    setPending(false);

    if (res?.status === 201) {
      router.push('/ru/cabinet');
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
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16">
      <div className="card p-6 sm:p-8">
        <h1 className="text-2xl font-semibold">{ru.auth.registerTitle}</h1>
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
              <label className="field-label">{ru.auth.firstName}</label>
              <input name="firstName" required minLength={2} maxLength={60} autoComplete="given-name" className="input" />
            </div>
            <div>
              <label className="field-label">{ru.auth.lastName}</label>
              <input name="lastName" required minLength={2} maxLength={60} autoComplete="family-name" className="input" />
            </div>
          </div>
          <div>
            <label className="field-label">{ru.auth.email}</label>
            <input name="email" type="email" required autoComplete="email" className="input" />
          </div>
          <div>
            <label className="field-label">{ru.auth.password}</label>
            <input name="password" type="password" required minLength={10} autoComplete="new-password" className="input" />
            <span className="field-hint">Минимум 10 символов</span>
          </div>
          <div>
            <label className="field-label">{ru.auth.inviteCode}</label>
            <input name="inviteCode" required className="input" />
          </div>
          {error && <p role="alert" className="text-sm text-accent">{error}</p>}
          <button type="submit" disabled={pending} className="btn btn-accent mt-1">
            {ru.auth.submitRegister}
          </button>
        </form>
      </div>
    </main>
  );
}
