'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ru } from '@/i18n/ru';

// Карточка модерации серии (репортажа) — approve/reject через /api/admin/stories.
export function StoryModerationCard(props: {
  storyId: string;
  header: string;
  meta: string;
  description?: string | null;
  photoUrls: string[];
}) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(action: 'approve' | 'reject') {
    setPending(true);
    setError(null);
    const res = await fetch('/api/admin/stories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action === 'approve' ? { action, storyId: props.storyId } : { action, storyId: props.storyId, reason }),
    }).catch(() => null);
    setPending(false);
    if (res?.ok) router.refresh();
    else setError(ru.admin.error);
  }

  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">{props.header}</span>
        <span className="text-sm muted">{props.meta}</span>
      </div>
      {props.description && <p className="mt-1 text-sm muted">{props.description}</p>}
      <div className="mt-3 grid grid-cols-4 gap-1 sm:grid-cols-8">
        {props.photoUrls.map((url) => (
          <a key={url} href={url.replace('/thumb.jpg', '/web.jpg')} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" loading="lazy" className="aspect-square w-full rounded object-cover" />
          </a>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button onClick={() => decide('approve')} disabled={pending}
          className="btn btn-accent px-4 py-2 text-sm disabled:opacity-50">
          {ru.admin.approve}
        </button>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={ru.admin.rejectReason}
          className="input min-w-64 flex-1 text-sm" />
        <button onClick={() => decide('reject')} disabled={pending || reason.trim().length < 5}
          className="btn btn-danger px-4 py-2 text-sm disabled:opacity-40">
          {ru.admin.reject}
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </li>
  );
}
