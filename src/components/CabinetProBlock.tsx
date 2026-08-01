'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';
import { ru } from '@/i18n/ru';
import { useToast } from '@/components/ui/Toast';

interface Props {
  tier: 'FREE' | 'PRIME' | 'ELITE';
  isFounding: boolean;
  graceUntil: string | null; // отформатированная дата или null
  proRequested: boolean;
  lockedPerks: string[]; // подписи выгод подписки (золотом)
  teaser?: { saves: number; reviews: number }; // хук для FREE: их скрытые метрики
}

export function CabinetProBlock({ tier, isFounding, graceUntil, proRequested, lockedPerks, teaser }: Props) {
  const { toast } = useToast();
  const [requested, setRequested] = useState(proRequested);
  const [busy, setBusy] = useState(false);

  async function request() {
    setBusy(true);
    // Сначала пробуем оплату через Т-Кассу. Если терминал ещё не выдан
    // (not_configured), роут вернёт не-ok → откатываемся на ручную заявку.
    const pay = await apiFetch('/api/subscription/checkout', { method: 'POST', body: { tier: 'PRIME' } });
    if (pay.ok) {
      const data = pay.data as { paymentUrl?: string } | null;
      if (data?.paymentUrl) {
        window.location.href = data.paymentUrl; // уходим на страницу оплаты
        return;
      }
    }
    // Фолбэк — ручная заявка (оператор активирует в закрытой бете).
    const res = await apiFetch('/api/subscription/request', { method: 'POST' });
    setBusy(false);
    if (!res?.ok) return toast(ru.cabinet.proError, 'danger');
    setRequested(true);
  }

  if (tier !== 'FREE') {
    return (
      <section className="card border-recognition/40 bg-recognition-soft/30 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="t-caption text-recognition">{ru.cabinet.proTitle}</p>
          <span className="rounded-sm bg-recognition-soft px-2 py-0.5 text-xs font-medium text-recognition">{ru.pro.tierName[tier]}</span>
        </div>
        <p className="mt-1 font-medium">{ru.cabinet.proOnPro}</p>
        {isFounding && <p className="mt-0.5 text-sm text-recognition">{ru.cabinet.proFounding}</p>}
        {graceUntil && <p className="mt-0.5 text-sm muted">{ru.cabinet.proGraceUntil(graceUntil)}</p>}
        {tier === 'PRIME' && (
          <Link href="/ru/pro" className="mt-2 inline-block text-sm text-recognition underline">{ru.cabinet.upsellElite}</Link>
        )}
      </section>
    );
  }

  return (
    <section className="card p-4">
      <p className="t-caption muted">{ru.cabinet.proTitle}</p>
      <p className="mt-1 font-medium">{ru.cabinet.proOnFree}</p>
      {teaser && (teaser.saves > 0 || teaser.reviews > 0) && (
        <p className="mt-2 text-sm text-recognition">{ru.cabinet.proTeaser(teaser.saves, teaser.reviews)}</p>
      )}
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
