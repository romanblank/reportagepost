'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ru } from '@/i18n/ru';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';

export interface PendingShoot {
  id: string;
  clientName: string;
  eventDate: string | null;
}

/**
 * Отметки съёмок, ждущие ответа автора (S4 trust-хардеринг, 2026-08-02).
 *
 * Заказчик отмечает съёмку, но публичной она становится только после
 * подтверждения фотографа. Односторонняя отметка была self-attested: после
 * снятия инвайт-гейта автор мог бы завести фейковых «заказчиков» и накрутить
 * себе verified-отзывы и факты совместных съёмок.
 */
export function PendingShoots({ items }: { items: PendingShoot[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [answered, setAnswered] = useState<Set<string>>(new Set());

  const rest = items.filter((i) => !answered.has(i.id));
  if (rest.length === 0) return null;

  async function respond(shootId: string, accept: boolean) {
    if (busyId) return;
    setBusyId(shootId);
    const res = await apiFetch('/api/shoots/respond', { method: 'POST', body: { shootId, accept } });
    setBusyId(null);
    if (!res.ok) {
      toast(res.error, 'danger');
      return;
    }
    setAnswered((prev) => new Set(prev).add(shootId));
    router.refresh();
  }

  return (
    <section className="mt-6 card p-4">
      <h2 className="t-h3">{ru.cabinet.shootsPendingTitle}</h2>
      <p className="mt-1 text-sm muted">{ru.cabinet.shootsPendingLead}</p>
      <ul className="mt-3 flex flex-col gap-3">
        {rest.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
            <span className="text-sm">
              {s.clientName}
              <span className="muted"> · {s.eventDate ?? ru.cabinet.shootNoDate}</span>
            </span>
            <span className="flex gap-2">
              <button type="button" onClick={() => void respond(s.id, true)} disabled={busyId === s.id}
                className="btn btn-accent btn-sm disabled:opacity-60">
                {ru.cabinet.shootConfirm}
              </button>
              <button type="button" onClick={() => void respond(s.id, false)} disabled={busyId === s.id}
                className="btn btn-ghost btn-sm disabled:opacity-60">
                {ru.cabinet.shootDispute}
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
