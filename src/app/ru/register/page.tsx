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
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">{ru.auth.registerTitle}</h1>
      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name="role" value="PHOTOGRAPHER" defaultChecked /> {ru.auth.rolePhotographer}
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="role" value="CLIENT" /> {ru.auth.roleClient}
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            {ru.auth.firstName}
            <input name="firstName" required minLength={2} className="mt-1 w-full rounded-lg border px-3 py-2" />
          </label>
          <label className="text-sm">
            {ru.auth.lastName}
            <input name="lastName" required minLength={2} className="mt-1 w-full rounded-lg border px-3 py-2" />
          </label>
        </div>
        <label className="text-sm">
          {ru.auth.email}
          <input name="email" type="email" required autoComplete="email" className="mt-1 w-full rounded-lg border px-3 py-2" />
        </label>
        <label className="text-sm">
          {ru.auth.password}
          <input name="password" type="password" required minLength={10} autoComplete="new-password" className="mt-1 w-full rounded-lg border px-3 py-2" />
        </label>
        <label className="text-sm">
          {ru.auth.inviteCode}
          <input name="inviteCode" required className="mt-1 w-full rounded-lg border px-3 py-2" />
        </label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={pending} className="mt-2 rounded-lg bg-foreground px-4 py-2 text-background disabled:opacity-50">
          {ru.auth.submitRegister}
        </button>
      </form>
    </main>
  );
}
