'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { ru } from '@/i18n/ru';

/**
 * «Мы снимали вместе» — для ФОТОГРАФА, в переписке с заказчиком.
 *
 * Отмечает тот, кому это нужно: для автора подтверждённая съёмка — витрина.
 * Заказчику останется одно действие в его кабинете. Раньше инициатива была на
 * заказчике, у которого после закрытой сделки нет причин возвращаться, —
 * и подтверждений не появлялось вовсе.
 */
export function MarkShootButton({ clientUserId }: { clientUserId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [eventDate, setEventDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function mark() {
    setBusy(true);
    const res = await apiFetch('/api/shoots/request', {
      method: 'POST',
      body: { clientUserId, ...(eventDate ? { eventDate } : {}) },
      codeLabels: {
        shoot_no_contact: ru.profile.shootNoContact,
        shoot_already_marked: ru.profile.shootAlreadyMarked,
      },
      fallback: ru.ui.toastError,
    });
    setBusy(false);
    if (res.ok) {
      setDone(true);
      toast(ru.shoots.requestSent, 'success');
      router.refresh();
    } else {
      toast(res.error, 'danger');
    }
  }

  if (done) return <span className="t-small text-verified">{ru.shoots.requestSent}</span>;

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {/* Дата отличает вторую съёмку от повтора первой — без неё факт
          «заказчики возвращаются» не появится */}
      <label>
        <span className="sr-only">{ru.profile.shootDateLabel}</span>
        <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)}
          max={new Date().toISOString().slice(0, 10)}
          aria-label={ru.profile.shootDateLabel} className="field-input py-1 t-small" />
      </label>
      <button type="button" onClick={mark} disabled={busy} className="btn btn-outline btn-sm">
        {ru.shoots.markCta}
      </button>
    </span>
  );
}
