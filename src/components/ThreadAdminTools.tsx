'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { ru } from '@/i18n/ru';

/** Закрыть, открыть или закрепить тему — только администратору. */
export function ThreadAdminTools({
  threadId,
  closed,
  pinned,
}: {
  threadId: string;
  closed: boolean;
  pinned: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function set(flags: { closed?: boolean; pinned?: boolean }) {
    setBusy(true);
    const res = await apiFetch('/api/admin/forum', { body: { threadId, ...flags } });
    setBusy(false);
    if (res.ok) router.refresh();
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" disabled={busy} onClick={() => set({ closed: !closed })} className="btn btn-outline btn-sm">
        {closed ? ru.forum.reopen : ru.forum.close}
      </button>
      <button type="button" disabled={busy} onClick={() => set({ pinned: !pinned })} className="btn btn-outline btn-sm">
        {pinned ? ru.forum.unpin : ru.forum.pin}
      </button>
    </div>
  );
}
