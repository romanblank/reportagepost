'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { ru } from '@/i18n/ru';

/**
 * Карточка модерации ролика.
 *
 * Ролики публикуются сразу; сюда попадают только те, чьи кадры насторожили
 * премодерацию. До появления этой очереди такой ролик оказывался в тупике:
 * невидим на странице и не показан никому из редакции.
 */
export function VideoModerationCard(props: {
  videoId: string;
  authorName: string;
  username: string;
  title: string | null;
  duration: string | null;
  posterUrl: string | null;
  videoUrl: string | null;
}) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(action: 'approve' | 'reject') {
    setPending(true);
    setError(null);
    const res = await apiFetch('/api/admin/videos', {
      method: 'POST',
      body: action === 'approve'
        ? { action, videoId: props.videoId }
        : { action, videoId: props.videoId, reason },
    });
    setPending(false);
    if (res.ok) router.refresh();
    else setError(res.error);
  }

  return (
    <li className="card overflow-hidden">
      {props.videoUrl ? (
        <video src={props.videoUrl} poster={props.posterUrl ?? undefined} controls preload="none"
          className="aspect-video w-full bg-black" />
      ) : (
        <div className="grid aspect-video w-full place-items-center bg-surface-2">
          <span className="t-small muted">{ru.adminVideos.notReady}</span>
        </div>
      )}
      <div className="p-3">
        <p className="t-small">
          <Link href={`/ru/photographer/${props.username}`} className="underline">{props.authorName}</Link>
          {props.title && <span className="muted"> · {props.title}</span>}
          {props.duration && <span className="muted"> · {props.duration}</span>}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => decide('approve')} disabled={pending}
            className="btn btn-primary btn-sm">{ru.adminVideos.approve}</button>
          <input value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder={ru.adminVideos.reasonPlaceholder} className="field-input min-w-[180px] flex-1" />
          {/* Отклонение без причины запрещено: автор должен понимать, что исправлять */}
          <button type="button" onClick={() => decide('reject')} disabled={pending || reason.trim().length < 3}
            className="btn btn-ghost btn-sm text-danger">{ru.adminVideos.reject}</button>
        </div>
        {error && <p className="field-error">{error}</p>}
      </div>
    </li>
  );
}
