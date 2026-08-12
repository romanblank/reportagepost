'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { MAX_LENGTH } from '@/lib/text-moderation-rules';
import { LEGAL_ENTITY } from '@/lib/legal-entity';
import { ru } from '@/i18n/ru';

/**
 * Отклонённый текст с возможностью исправить и отправить снова.
 *
 * Причина и цитата остаются рядом с полем ввода: править вслепую, вспоминая
 * формулировку отказа, — то же самое, что не объяснять вовсе.
 */
export function RejectedItem({
  kind,
  id,
  title = '',
  body,
  status,
  reasonCode,
  reasonQuote,
}: {
  kind: 'thread' | 'post';
  id: string;
  title?: string;
  body: string;
  status: string;
  reasonCode: string | null;
  reasonQuote: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [newTitle, setNewTitle] = useState(title);
  const [text, setText] = useState(body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reason = reasonCode ?? 'off_topic';

  async function resend() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch('/api/forum/resubmit', {
        body: kind === 'thread' ? { threadId: id, title: newTitle, body: text } : { postId: id, body: text },
      });
      if (!res.ok) {
        setError(ru.forum.resubmitErrors[res.error] ?? res.error);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (status === 'IN_REVIEW') {
    return <p className="t-fine mt-2 muted">{ru.forum.inReview}</p>;
  }

  return (
    <div className="mt-2">
      <p className="t-small">{ru.moderation.reasons[reason]}</p>
      {reasonQuote ? (
        <p className="t-caption mt-1 muted">
          {ru.moderation.quoteLabel}: <span className="text-ink">«{reasonQuote}»</span>
        </p>
      ) : null}
      <p className="t-caption mt-1 muted">{ru.moderation.fix[reason]}</p>

      {editing ? (
        <div className="mt-3 grid gap-2">
          {kind === 'thread' ? (
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} maxLength={140} className="input" />
          ) : null}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={kind === 'thread' ? MAX_LENGTH.thread : MAX_LENGTH.post}
            rows={5}
            className="input"
          />
          {error ? <p className="t-caption text-danger">{error}</p> : null}
          <button type="button" onClick={resend} disabled={busy} className="btn btn-primary btn-sm justify-self-start">
            {ru.forum.resubmit}
          </button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => setEditing(true)} className="btn btn-outline btn-sm">
            {ru.forum.fixAndResend}
          </button>
          <span className="t-caption muted">
            {ru.forum.supportHint}{' '}
            <a
              href={`mailto:${LEGAL_ENTITY.email}?subject=${encodeURIComponent(ru.forum.supportSubject)}`}
              className="underline"
            >
              {ru.forum.supportLink}
            </a>
          </span>
        </div>
      )}
    </div>
  );
}
