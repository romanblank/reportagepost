'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ru } from '@/i18n/ru';
import { useToast } from '@/components/ui/Toast';

interface Props {
  tier: 'FREE' | 'PRO';
  isFounding: boolean;
  graceUntil: string | null; // отформатированная дата или null
  proRequested: boolean;
  lockedPerks: string[]; // подписи PRO-выгод (золотом)
}

export function CabinetProBlock({ tier, isFounding, graceUntil, proRequested, lockedPerks }: Props) {
  const { toast } = useToast();
  const [requested, setRequested] = useState(proRequested);
  const [busy, setBusy] = useState(false);

  async function request() {
    setBusy(true);
    const res = await fetch('/api/subscription/request', { method: 'POST' }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return toast(ru.cabinet.proError, 'danger');
    setRequested(true);
  }

  if (tier === 'PRO') {
    return (
      <section className="card border-recognition/40 bg-recognition-soft/30 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="t-caption text-recognition">{ru.cabinet.proTitle}</p>
          <span className="rounded-sm bg-recognition-soft px-2 py-0.5 text-xs font-medium text-recognition">PRO</span>
        </div>
        <p className="mt-1 font-medium">{ru.cabinet.proOnPro}</p>
        {isFounding && <p className="mt-0.5 text-sm text-recognition">{ru.cabinet.proFounding}</p>}
        {graceUntil && <p className="mt-0.5 text-sm muted">{ru.cabinet.proGraceUntil(graceUntil)}</p>}
      </section>
    );
  }

  return (
    <section className="card p-4">
      <p className="t-caption muted">{ru.cabinet.proTitle}</p>
      <p className="mt-1 font-medium">{ru.cabinet.proOnFree}</p>
      <p className="mt-3 text-sm muted">{ru.cabinet.proLockedLead}</p>
      <ul className="mt-1.5 flex flex-col gap-1.5 text-sm">
        {lockedPerks.map((perk) => (
          <li key={perk} className="flex gap-2.5">
            <span aria-hidden className="text-recognition">✦</span>
            <span>{perk}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {requested ? (
          <span className="text-sm text-recognition">{ru.cabinet.proRequested}</span>
        ) : (
          <button type="button" onClick={request} disabled={busy} className="btn btn-accent px-4 py-2">
            {busy ? ru.cabinet.proRequesting : ru.cabinet.proRequestCta}
          </button>
        )}
        <Link href="/ru/pro" className="text-sm underline muted">{ru.cabinet.proSeeTariff}</Link>
      </div>
    </section>
  );
}
