'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { ru } from '@/i18n/ru';

/**
 * Действия над человеком.
 *
 * Блокировка требует причины: она попадает в аудит-лог и объясняет решение
 * тому, кто будет разбираться позже — включая самого администратора через
 * полгода. Разблокировка причины не требует: вернуть доступ должно быть проще,
 * чем отнять.
 */
export function UserActions({ userId, blocked, isAdmin }: { userId: string; blocked: boolean; isAdmin: boolean }) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isAdmin) return <p className="t-small muted">{ru.adminUsers.adminImmune}</p>;

  async function run(action: 'block' | 'unblock') {
    setBusy(true);
    setError(null);
    const res = await apiFetch('/api/admin/users', {
      method: 'POST',
      body: { userId, action, reason },
      codeLabels: {
        cannot_block_admin: ru.adminUsers.errAdmin,
        cannot_block_self: ru.adminUsers.errSelf,
      },
      fallback: ru.admin.error,
    });
    setBusy(false);
    if (res.ok) router.refresh();
    else setError(res.error);
  }

  return (
    <div>
      <h2 className="t-title">{ru.adminUsers.actionsTitle}</h2>
      {blocked ? (
        <div className="mt-3">
          <p className="t-small muted">{ru.adminUsers.blockedHint}</p>
          <button type="button" onClick={() => run('unblock')} disabled={busy}
            className="btn btn-outline mt-3">{ru.adminUsers.unblockCta}</button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder={ru.adminUsers.reasonPlaceholder} className="field-input min-w-[220px] flex-1" />
          {/* Без причины кнопка неактивна: решение без объяснения через месяц
              невозможно ни оспорить, ни подтвердить */}
          <button type="button" onClick={() => run('block')} disabled={busy || reason.trim().length < 3}
            className="btn btn-ghost text-danger">{ru.adminUsers.blockCta}</button>
        </div>
      )}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
