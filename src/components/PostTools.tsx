'use client';

import { useCallback, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { EDIT_WINDOW_MS } from '@/lib/forum-constants';
import { MAX_LENGTH } from '@/lib/text-moderation-rules';
import { ReportButton } from '@/components/ReportButton';
import { ru } from '@/i18n/ru';

/**
 * Действия у сообщения: пожаловаться на чужое, поправить своё.
 *
 * Окно правки короткое намеренно: опечатка через минуту — вежливость, а
 * переписанная реплика, на которую уже ответили, превращает обсуждение в спор
 * о том, что было сказано.
 */
export function PostTools({
  postId,
  body,
  createdAt,
  authorName,
  mine,
  authed,
  canReply,
}: {
  postId: string;
  body: string;
  createdAt: string;
  authorName: string;
  mine: boolean;
  authed: boolean;
  canReply: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // «Сейчас» читаем как внешний источник: на сервере оно другое, и подсказка
  // «можно исправить» разъезжалась бы с тем, что решит сервер. Подписка сама
  // гасит кнопку, когда окно истекает под открытой страницей
  const deadline = new Date(createdAt).getTime() + EDIT_WINDOW_MS;
  const subscribe = useCallback(
    (onChange: () => void) => {
      const left = deadline - Date.now();
      if (left <= 0) return () => {};
      const timer = setTimeout(onChange, left);
      return () => clearTimeout(timer);
    },
    [deadline],
  );
  const inWindow = useSyncExternalStore(
    subscribe,
    () => Date.now() < deadline,
    () => false, // на сервере кнопку не рисуем: там «сейчас» чужое
  );
  const canEdit = mine && inWindow;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ status: string; reason?: string }>('/api/forum/edit', {
        body: { postId, body: text },
      });
      if (!res.ok) {
        setError(ru.forum.editErrors[res.error] ?? res.error);
        return;
      }
      if (res.data.status !== 'PUBLISHED') {
        setError(ru.moderation.reasons[res.data.reason ?? 'off_topic']);
        return;
      }
      setEditing(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="mt-2 grid gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_LENGTH.post}
          rows={4}
          className="input"
        />
        {error ? <p className="t-caption text-danger">{error}</p> : null}
        <div className="flex gap-2">
          <button type="button" onClick={save} disabled={busy} className="btn btn-primary btn-sm">
            {ru.forum.saveEdit}
          </button>
          <button type="button" onClick={() => setEditing(false)} className="btn btn-outline btn-sm">
            {ru.forum.cancelEdit}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-3">
      {canReply ? (
        <button
          type="button"
          className="t-caption underline muted"
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent('forum:quote', { detail: { author: authorName, text: body } }),
            )
          }
        >
          {ru.forum.quote}
        </button>
      ) : null}
      {canEdit ? (
        <button type="button" onClick={() => setEditing(true)} className="t-caption underline muted">
          {ru.forum.edit}
        </button>
      ) : null}
      {!mine ? (
        <ReportButton targetType="FORUM_POST" targetId={postId} authed={authed} className="t-caption muted" />
      ) : null}
    </div>
  );
}
