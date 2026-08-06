'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { ru } from '@/i18n/ru';

/**
 * Подписка на тему.
 *
 * Отписка стоит там же, где подписка, и в один клик: уведомления, от которых
 * нельзя уйти тем же движением, каким подписался, — это рассылка.
 */
export function ThreadSubscribe({ threadId, initial }: { threadId: string; initial: boolean }) {
  const [subscribed, setSubscribed] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const next = !subscribed;
    const res = await apiFetch('/api/forum/subscribe', { body: { threadId, subscribe: next } });
    setBusy(false);
    if (res.ok) setSubscribed(next);
  }

  return (
    <button type="button" onClick={toggle} disabled={busy} className="btn btn-outline btn-sm">
      {subscribed ? ru.forum.unsubscribe : ru.forum.subscribe}
    </button>
  );
}
