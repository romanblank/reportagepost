'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ModerationStatus } from '@prisma/client';
import { ru } from '@/i18n/ru';

export interface ManagedVideo {
  id: string;
  url: string;
  title: string | null;
  status: ModerationStatus;
}

// Управление загруженными видео автора (кабинет). Multipart-загрузка на
// /api/profile/videos, удаление своих. Публикация — после модерации (как фото).
export function VideoManager({ videos, limit }: { videos: ManagedVideo[]; limit: number }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const atLimit = videos.length >= limit;

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    // Шлём файл СЫРЫМ телом, а не multipart (аудит 2026-08-01, P2): сервер
    // стримит его в хранилище, не собирая 200 МБ в памяти контейнера.
    // Название ролика — заголовком (только ASCII, потому encodeURIComponent).
    const res = await fetch('/api/profile/videos', {
      method: 'POST',
      headers: { 'Content-Type': file.type, 'X-Video-Title': encodeURIComponent(file.name) },
      body: file,
    }).catch(() => null);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
    if (res?.ok) {
      router.refresh();
      return;
    }
    const code = (await res?.json().catch(() => null))?.error as string | undefined;
    setError(
      code === 'file_too_large' ? ru.cabinetVideos.errTooLarge
      : code === 'unsupported_format' ? ru.cabinetVideos.errFormat
      : code === 'video_limit' ? ru.cabinetVideos.errLimit
      : ru.cabinetVideos.errGeneric,
    );
  }

  async function remove(id: string) {
    setBusy(true);
    await fetch('/api/profile/videos', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId: id }),
    }).catch(() => null);
    setBusy(false);
    router.refresh();
  }

  return (
    <div>
      {videos.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2">
          {videos.map((v) => (
            <li key={v.id} className="overflow-hidden rounded-media border border-line bg-surface-2">
              <video src={v.url} controls preload="metadata" className="aspect-video w-full bg-black" />
              <div className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="t-small truncate">
                  {v.title || ru.cabinetVideos.untitled}
                  {v.status !== 'APPROVED' && (
                    <span className="ml-2 t-caption text-warning">{ru.cabinetVideos.statusPending}</span>
                  )}
                </span>
                <button type="button" onClick={() => remove(v.id)} disabled={busy}
                  className="btn btn-ghost btn-sm shrink-0 text-danger">{ru.cabinetVideos.delete}</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4">
        <input ref={inputRef} type="file" accept="video/mp4,video/webm,video/quicktime"
          onChange={onPick} disabled={busy || atLimit} className="hidden" id="video-upload" />
        <label htmlFor="video-upload"
          className={`btn btn-outline ${busy || atLimit ? 'pointer-events-none opacity-40' : 'cursor-pointer'}`}>
          {busy ? ru.cabinetVideos.uploading : ru.cabinetVideos.uploadCta}
        </label>
        <p className="field-hint mt-2">{atLimit ? ru.cabinetVideos.errLimit : ru.cabinetVideos.hint}</p>
        {error && <p className="field-error">{error}</p>}
      </div>
    </div>
  );
}
