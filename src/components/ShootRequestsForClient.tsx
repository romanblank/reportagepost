'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { ru } from '@/i18n/ru';

export interface ShootRequest {
  id: string;
  authorName: string;
  username: string;
  eventDate: string | null;
}

/**
 * Запросы фотографов, ждущие ответа заказчика.
 *
 * Ровно одно решение и два слова: «да, снимали» или «нет». Всё, что сложнее,
 * заказчик после закрытой сделки делать не станет — и именно поэтому прежняя
 * механика, где он должен был сам вспомнить, зайти и отметить, не работала.
 */
export function ShootRequestsForClient({ requests }: { requests: ShootRequest[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  if (requests.length === 0) return null;

  async function answer(id: string, accept: boolean) {
    setBusy(id);
    await apiFetch('/api/shoots/respond-client', { method: 'POST', body: { shootId: id, accept } });
    setBusy(null);
    router.refresh();
  }

  return (
    <section className="mt-8">
      <h2 className="t-title">{ru.shoots.clientTitle}</h2>
      <p className="mt-1 text-sm muted">{ru.shoots.clientLead}</p>
      <ul className="mt-3 grid gap-2">
        {requests.map((r) => (
          <li key={r.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-media border border-line bg-surface-2 px-4 py-3">
            <span className="t-small">
              <Link href={`/ru/photographer/${r.username}`} className="underline">{r.authorName}</Link>
              {r.eventDate && <span className="muted"> · {r.eventDate}</span>}
            </span>
            <span className="flex gap-2">
              <button type="button" onClick={() => answer(r.id, true)} disabled={busy === r.id}
                className="btn btn-primary btn-sm">{ru.shoots.yes}</button>
              <button type="button" onClick={() => answer(r.id, false)} disabled={busy === r.id}
                className="btn btn-ghost btn-sm">{ru.shoots.no}</button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
