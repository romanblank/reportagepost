'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { ru } from '@/i18n/ru';

/** Решение по одному элементу очереди: опубликовать или отклонить с причиной. */
export function QueueDecision({ kind, id }: { kind: string; id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('off_topic');

  async function decide(publish: boolean) {
    setBusy(true);
    const res = await apiFetch('/api/admin/queue', { body: { kind, id, publish, reason } });
    setBusy(false);
    if (res.ok) router.refresh();
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button type="button" disabled={busy} onClick={() => decide(true)} className="btn btn-primary btn-sm">
        {ru.adminQueue.publish}
      </button>
      <select value={reason} onChange={(e) => setReason(e.target.value)} className="input input-sm">
        {Object.entries(ru.moderation.reasons).map(([code, label]) => (
          <option key={code} value={code}>{label}</option>
        ))}
      </select>
      <button type="button" disabled={busy} onClick={() => decide(false)} className="btn btn-outline btn-sm">
        {ru.adminQueue.reject}
      </button>
    </div>
  );
}
