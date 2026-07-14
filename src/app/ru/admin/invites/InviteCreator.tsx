'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ru } from '@/i18n/ru';

// Форма создания инвайта (админ). После создания — refresh списка.
export function InviteCreator() {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [maxUses, setMaxUses] = useState('1');
  const [expiresDays, setExpiresDays] = useState('');
  const [pending, setPending] = useState(false);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const res = await fetch('/api/admin/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        note: note.trim() || undefined,
        maxUses: Number(maxUses) || 1,
        expiresDays: expiresDays.trim() ? Number(expiresDays) : undefined,
      }),
    }).catch(() => null);
    setPending(false);
    if (res?.ok) {
      setNote(''); setMaxUses('1'); setExpiresDays('');
      router.refresh();
    }
  }

  return (
    <form onSubmit={create} className="card mt-4 flex flex-wrap items-end gap-3 p-4">
      <div className="min-w-[200px] flex-1">
        <label className="field-label">{ru.adminInvites.note}</label>
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200}
          placeholder={ru.adminInvites.notePlaceholder} className="input" />
      </div>
      <div>
        <label className="field-label">{ru.adminInvites.maxUses}</label>
        <input value={maxUses} onChange={(e) => setMaxUses(e.target.value)} type="number" min={1} max={1000} className="input w-24" />
      </div>
      <div>
        <label className="field-label">{ru.adminInvites.expiresDays}</label>
        <input value={expiresDays} onChange={(e) => setExpiresDays(e.target.value)} type="number" min={1} max={365} className="input w-28" />
      </div>
      <button type="submit" disabled={pending} className="btn btn-accent px-4 py-2.5">
        {pending ? ru.adminInvites.creating : ru.adminInvites.create}
      </button>
    </form>
  );
}
