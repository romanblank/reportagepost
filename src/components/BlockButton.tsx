'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { ru } from '@/i18n/ru';

// Блокировка собеседника в переписке (аудит 2026-07-31, P0): единственный
// способ прекратить нежелательное общение, кроме жалобы. Заблокированный
// не может писать (гейт в sendMessage).
export function BlockButton({ userId, initialBlocked }: { userId: string; initialBlocked: boolean }) {
  const router = useRouter();
  const [blocked, setBlocked] = useState(initialBlocked);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function toggle() {
    setBusy(true);
    setError(false);
    const res = await apiFetch(`/api/users/${userId}/block`, { method: blocked ? 'DELETE' : 'POST' });
    setBusy(false);
    if (res?.ok) {
      setBlocked(!blocked);
      router.refresh();
      return;
    }
    setError(true);
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={toggle} disabled={busy}
        className="text-xs text-muted underline transition hover:text-accent disabled:opacity-60">
        {blocked ? ru.block.undo : ru.block.cta}
      </button>
      {blocked && <span className="text-xs muted">{ru.block.blocked}</span>}
      {error && <span role="alert" className="text-xs text-danger">{ru.block.error}</span>}
    </span>
  );
}
