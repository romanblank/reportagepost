'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { ru } from '@/i18n/ru';

export function ConfirmInviteForm({ token, authorUsername }: { token: string; authorUsername: string }) {
  const t = ru.shootInvite;
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await apiFetch<{ needsReview: boolean }>('/api/shoots/confirm-invite', {
      body: { token, ...(date ? { eventDate: date } : {}) },
      codeLabels: {
        invite_invalid: t.invalidText,
        shoot_already_marked: t.alreadyMarked,
        shoot_self: t.ownOwn,
      },
      fallback: ru.ui.toastError,
    });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setDone(true);
  }

  if (done) {
    return (
      <div className="mt-6 card p-4">
        <p className="t-small font-medium">{t.doneTitle}</p>
        {/* Про проверку говорим прямо: обещать мгновенный публичный факт нельзя */}
        <p className="mt-1 t-small muted">{t.doneText}</p>
        <Link href={`/ru/photographer/${authorUsername}`} className="mt-3 inline-block t-small underline">
          {t.toAuthor}
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <label className="field-label" htmlFor="shoot-date">{t.dateLabel}</label>
      <input
        id="shoot-date"
        type="date"
        value={date}
        max={new Date().toISOString().slice(0, 10)}
        onChange={(e) => setDate(e.target.value)}
        className="input w-48"
      />
      <p className="field-hint">{t.dateHint}</p>
      {error ? <p role="alert" className="mt-2 t-small text-danger">{error}</p> : null}
      <button type="button" onClick={submit} disabled={busy} className="btn btn-accent mt-4 px-4 py-2">
        {busy ? t.sending : t.confirmCta}
      </button>
    </div>
  );
}
