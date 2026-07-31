'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ru } from '@/i18n/ru';

// Карточка модерации ОДНОГО кадра (аудит 2026-07-31, P0): кадры, добавленные
// после одобрения профиля, ждали проверки, которой не существовало.
export function PhotoModerationCard(props: {
  photoId: string;
  authorName: string;
  username: string;
  webUrl: string;
  fullUrl: string;
  meta: string;
  aiHint?: string | null;
}) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(action: 'approve' | 'reject') {
    setPending(true);
    setError(null);
    const res = await fetch('/api/admin/moderation/photos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        action === 'approve' ? { action, photoId: props.photoId } : { action, photoId: props.photoId, reason },
      ),
    }).catch(() => null);
    setPending(false);
    if (res?.ok) router.refresh();
    else setError(ru.admin.error);
  }

  return (
    <li className="card overflow-hidden">
      <a href={props.fullUrl} target="_blank" rel="noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={props.webUrl} alt="" loading="lazy" className="aspect-[4/3] w-full bg-surface-2 object-cover" />
      </a>
      <div className="p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Link href={`/ru/photographer/${props.username}`} target="_blank" className="font-medium hover:underline">
            {props.authorName}
          </Link>
          <span className="text-xs muted">{props.meta}</span>
        </div>
        {props.aiHint && <p className="mt-1 text-xs text-recognition">{props.aiHint}</p>}
        <div className="mt-3 flex flex-col gap-2">
          <button type="button" onClick={() => decide('approve')} disabled={pending}
            className="btn btn-accent px-4 py-2 text-sm disabled:opacity-50">
            {ru.admin.approve}
          </button>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={ru.admin.rejectReason}
            className="input text-sm" />
          <button type="button" onClick={() => decide('reject')} disabled={pending || reason.trim().length < 5}
            className="btn btn-danger px-4 py-2 text-sm disabled:opacity-40">
            {ru.admin.reject}
          </button>
        </div>
        {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
      </div>
    </li>
  );
}
