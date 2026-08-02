'use client';

import { useRef, useState } from 'react';
import { apiFetch, UPLOAD_TIMEOUT_MS } from '@/lib/api';
import { useRouter } from 'next/navigation';
import type { ModerationStatus, VideoProcessing } from '@prisma/client';
import { ru } from '@/i18n/ru';

export interface ManagedVideo {
  id: string;
  /** Ссылка на готовый web-вариант; `null`, пока ролик не обработан. */
  url: string | null;
  poster: string | null;
  title: string | null;
  status: ModerationStatus;
  processing: VideoProcessing;
  failureReason: string | null;
  durationSec: number | null;
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
    const res = await apiFetch('/api/profile/videos', {
      method: 'POST',
      headers: { 'Content-Type': file.type, 'X-Video-Title': encodeURIComponent(file.name) },
      body: file,
      // Ролик на 200 МБ по мобильной сети идёт дольше обычного потолка
      timeoutMs: UPLOAD_TIMEOUT_MS,
      codeLabels: {
        file_too_large: ru.cabinetVideos.errTooLarge,
        unsupported_format: ru.cabinetVideos.errFormat,
        video_limit: ru.cabinetVideos.errLimit,
      },
      fallback: ru.cabinetVideos.errGeneric,
    });
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
    if (res.ok) {
      router.refresh();
      return;
    }
    setError(res.error);
  }

  async function remove(id: string) {
    setBusy(true);
    await apiFetch('/api/profile/videos', { method: 'DELETE', body: { videoId: id } });
    setBusy(false);
    router.refresh();
  }

  return (
    <div>
      {videos.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2">
          {videos.map((v) => (
            <li key={v.id} className="overflow-hidden rounded-media border border-line bg-surface-2">
              {v.url ? (
                <video src={v.url} poster={v.poster ?? undefined} controls preload="none"
                  className="aspect-video w-full bg-black" />
              ) : (
                // Ожидание обработки — не ошибка: автор должен видеть, что ролик
                // принят и над ним идёт работа, иначе он загрузит его ещё раз
                <div className="grid aspect-video w-full place-items-center bg-surface px-4 text-center">
                  <span className="t-small text-muted">
                    {v.processing === 'FAILED'
                      ? ru.cabinetVideos.statusFailed(v.failureReason)
                      : ru.cabinetVideos.statusProcessing}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="t-small truncate">
                  {v.title || ru.cabinetVideos.untitled}
                  {v.durationSec != null && (
                    <span className="ml-2 t-caption text-muted">{ru.cabinetVideos.duration(v.durationSec)}</span>
                  )}
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
