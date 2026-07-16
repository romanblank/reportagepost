'use client';

import { useState } from 'react';
import { ru } from '@/i18n/ru';
import { useToast } from '@/components/ui/Toast';

interface Initial { firstName: string; lastName: string; email: string | null; hasPassword: boolean }

async function patch(body: Record<string, unknown>) {
  const res = await fetch('/api/account/security', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }).catch(() => null);
  return res;
}

function errText(status: number | undefined, code?: string) {
  if (code === 'wrong_password' || status === 403) return ru.settings.wrongPassword;
  if (code === 'email_taken' || status === 409) return ru.settings.emailTaken;
  if (code === 'weak_password') return ru.settings.weakPassword;
  return ru.settings.genericError;
}

export function AccountSettings({ initial }: { initial: Initial }) {
  const { toast } = useToast();
  const [name, setName] = useState({ firstName: initial.firstName, lastName: initial.lastName });
  const [email, setEmail] = useState(initial.email ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<Record<string, string>>({});

  async function submitName(e: React.FormEvent) {
    e.preventDefault(); setBusy('name'); setErr({});
    const res = await patch({ action: 'name', firstName: name.firstName, lastName: name.lastName });
    setBusy(null);
    if (res?.ok) toast(ru.settings.saved, 'success');
    else setErr({ name: errText(res?.status) });
  }

  async function submitEmail(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy('email'); setErr({});
    const f = new FormData(e.currentTarget);
    const res = await patch({ action: 'email', email, password: f.get('password') });
    setBusy(null);
    if (res?.ok) { toast(ru.settings.saved, 'success'); e.currentTarget.reset(); }
    else { const d = await res?.json().catch(() => ({})); setErr({ email: errText(res?.status, d?.error) }); }
  }

  async function submitPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy('password'); setErr({});
    const f = new FormData(e.currentTarget);
    const res = await patch({ action: 'password', current: f.get('current') ?? '', next: f.get('next') });
    setBusy(null);
    if (res?.ok) { toast(ru.settings.saved, 'success'); e.currentTarget.reset(); }
    else { const d = await res?.json().catch(() => ({})); setErr({ password: errText(res?.status, d?.error) }); }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Имя */}
      <form onSubmit={submitName} className="flex flex-col gap-3">
        <h3 className="t-h3">{ru.settings.nameTitle}</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label">{ru.settings.firstName}</label>
            <input value={name.firstName} onChange={(e) => setName((n) => ({ ...n, firstName: e.target.value }))} className="input" required minLength={2} />
          </div>
          <div>
            <label className="field-label">{ru.settings.lastName}</label>
            <input value={name.lastName} onChange={(e) => setName((n) => ({ ...n, lastName: e.target.value }))} className="input" required minLength={2} />
          </div>
        </div>
        {err.name && <p className="text-sm text-danger">{err.name}</p>}
        <button type="submit" disabled={busy === 'name'} className="btn btn-outline btn-sm w-fit">{ru.settings.saveName}</button>
      </form>

      <div className="border-t border-line" />

      {/* Email */}
      <form onSubmit={submitEmail} className="flex flex-col gap-3">
        <h3 className="t-h3">{ru.settings.emailTitle}</h3>
        <div>
          <label className="field-label">{ru.settings.emailNew}</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="input" required />
        </div>
        {initial.hasPassword && (
          <div>
            <label className="field-label">{ru.settings.emailPassword}</label>
            <input name="password" type="password" className="input" autoComplete="current-password" required />
          </div>
        )}
        {err.email && <p className="text-sm text-danger">{err.email}</p>}
        <button type="submit" disabled={busy === 'email'} className="btn btn-outline btn-sm w-fit">{ru.settings.saveEmail}</button>
      </form>

      <div className="border-t border-line" />

      {/* Пароль */}
      <form onSubmit={submitPassword} className="flex flex-col gap-3">
        <h3 className="t-h3">{initial.hasPassword ? ru.settings.passwordTitle : ru.settings.passwordSetTitle}</h3>
        {!initial.hasPassword && <p className="text-sm muted">{ru.settings.passwordSetHint}</p>}
        {initial.hasPassword && (
          <div>
            <label className="field-label">{ru.settings.currentPassword}</label>
            <input name="current" type="password" className="input" autoComplete="current-password" required />
          </div>
        )}
        <div>
          <label className="field-label">{ru.settings.newPassword}</label>
          <input name="next" type="password" className="input" autoComplete="new-password" required minLength={10} />
          <span className="field-hint">Минимум 10 символов</span>
        </div>
        {err.password && <p className="text-sm text-danger">{err.password}</p>}
        <button type="submit" disabled={busy === 'password'} className="btn btn-outline btn-sm w-fit">{ru.settings.savePassword}</button>
      </form>
    </div>
  );
}
