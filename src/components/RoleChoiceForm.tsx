'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ru } from '@/i18n/ru';

type Role = 'PHOTOGRAPHER' | 'CLIENT';

export function RoleChoiceForm() {
  const router = useRouter();
  const [role, setRole] = useState<Role>('PHOTOGRAPHER');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!consent) { setError(ru.auth.consentRequired); return; }
    setBusy(true); setError(null);
    const res = await apiFetch('/api/auth/yandex/complete', { method: 'POST', body: { role, pdnConsent: true } });
    if (res?.ok) {
      const d = res.data as { redirect?: string };
      router.push(d.redirect ?? '/ru/cabinet');
      router.refresh();
      return;
    }
    setBusy(false);
    setError(res.status === 401 ? ru.auth.roleExpired : ru.auth.errorYandex);
  }

  const cards: { value: Role; title: string; desc: string }[] = [
    { value: 'PHOTOGRAPHER', title: ru.auth.rolePhotographer, desc: ru.auth.rolePhotographerDesc },
    { value: 'CLIENT', title: ru.auth.roleClient, desc: ru.auth.roleClientDesc },
  ];

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {cards.map((c) => (
          <button key={c.value} type="button" onClick={() => setRole(c.value)}
            className={`card p-4 text-left transition-colors ${role === c.value ? 'border-accent' : 'hover:border-line'}`}>
            <div className="flex items-center gap-2.5">
              <span className={`grid h-4 w-4 place-items-center rounded-full border ${role === c.value ? 'border-accent' : 'border-line'}`}>
                {role === c.value && <span className="h-2 w-2 rounded-full bg-accent" />}
              </span>
              <span className="font-medium">{c.title}</span>
            </div>
            <p className="mt-1.5 pl-[26px] text-sm muted">{c.desc}</p>
          </button>
        ))}
      </div>

      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
        <span>
          {ru.auth.roleConsent}{' '}
          <Link href="/ru/legal/privacy" className="underline" target="_blank">{ru.auth.consentPrivacy}</Link>{' '}
          {ru.auth.consentAnd}{' '}
          <Link href="/ru/legal/offer" className="underline" target="_blank">{ru.auth.consentOffer}</Link>.
        </span>
      </label>

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      <button type="button" onClick={submit} disabled={busy} className="btn btn-accent w-full py-2.5">
        {busy ? ru.ui.loading : ru.auth.roleSubmit}
      </button>
    </div>
  );
}
