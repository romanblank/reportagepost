'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { ru } from '@/i18n/ru';

/**
 * Очередь кадров с решением пачкой.
 *
 * Автор публикует съёмку не по одному кадру, а серией: тридцать-сорок штук
 * за раз. Одобрять их поштучно означает не одобрять вовсе — очередь копится,
 * работы висят непубликованными, и виноватой выглядит платформа.
 *
 * Отдельные кнопки у каждого кадра остаются: пачка нужна, когда серия ровная,
 * а разбирать спорный кадр всё равно приходится по одному.
 */
export type QueueItem = {
  photoId: string;
  authorName: string;
  username: string;
  thumbUrl: string;
  fullUrl: string;
  meta: string;
};

export function PhotoQueueBatch({ items }: { items: QueueItem[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Выбрать всё видимое — обычный случай: серия целиком годная. */
  function selectAll() {
    setSelected(new Set(items.map((i) => i.photoId)));
  }

  async function decide(action: 'approve' | 'reject') {
    if (selected.size === 0) return;
    if (action === 'reject' && reason.trim().length < 5) {
      setError(ru.adminPhotoQueue.reasonRequired);
      return;
    }
    setBusy(true);
    setError(null);
    const res = await apiFetch<{ done: number; failed: string[] }>('/api/admin/moderation/photos', {
      method: 'POST',
      body: {
        action,
        photoIds: [...selected],
        ...(action === 'reject' ? { reason: reason.trim() } : {}),
      },
    });
    setBusy(false);
    if (!res.ok) {
      setError(ru.ui.toastError);
      return;
    }
    // Часть кадров могла не пройти (автор удалил их сам) — молчать об этом
    // нельзя: администратор решит, что сделал больше, чем на самом деле
    if (res.data.failed.length > 0) {
      setError(ru.adminPhotoQueue.partial(res.data.done, res.data.failed.length));
    }
    setSelected(new Set());
    setReason('');
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 rounded-media border border-line bg-surface-2 px-4 py-3">
        <span className="t-small">{ru.adminPhotoQueue.selected(selected.size, items.length)}</span>
        <button type="button" onClick={selectAll} className="t-caption underline muted">
          {ru.adminPhotoQueue.selectAll}
        </button>
        {selected.size > 0 && (
          <button type="button" onClick={() => setSelected(new Set())} className="t-caption underline muted">
            {ru.adminPhotoQueue.clear}
          </button>
        )}

        <span className="ml-auto flex flex-wrap items-center gap-2">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={ru.adminPhotoQueue.reasonPlaceholder}
            className="input input-sm w-56"
          />
          <button
            type="button"
            disabled={busy || selected.size === 0}
            onClick={() => decide('reject')}
            className="btn btn-outline btn-sm"
          >
            {ru.adminPhotoQueue.rejectSelected}
          </button>
          <button
            type="button"
            disabled={busy || selected.size === 0}
            onClick={() => decide('approve')}
            className="btn btn-primary btn-sm"
          >
            {ru.adminPhotoQueue.approveSelected}
          </button>
        </span>
      </div>

      {error ? <p role="alert" className="t-caption mt-2 text-warning">{error}</p> : null}

      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((i) => {
          const on = selected.has(i.photoId);
          return (
            <li key={i.photoId} className="overflow-hidden rounded-media border-2 transition-colors"
              style={{ borderColor: on ? 'var(--accent)' : 'var(--line)' }}>
              {/* Ссылка НЕ внутри label: клик по ней браузер переносит на
                  связанный чекбокс, и «открыть оригинал» переключало бы выбор
                  вместо открытия кадра */}
              <label className="block cursor-pointer">
                <span className="relative block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={i.thumbUrl} alt="" className="aspect-[4/3] w-full object-cover" />
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggle(i.photoId)}
                    className="absolute left-2 top-2 size-5 accent-[var(--accent)]"
                    aria-label={ru.adminPhotoQueue.pick(i.authorName)}
                  />
                </span>
                <span className="block px-3 pt-2">
                  <span className="t-caption block truncate">{i.authorName}</span>
                  <span className="t-caption block truncate muted">{i.meta}</span>
                </span>
              </label>
              <div className="px-3 pb-2">
                <a href={i.fullUrl} target="_blank" rel="noreferrer" className="t-caption underline muted">
                  {ru.adminPhotoQueue.openFull}
                </a>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
