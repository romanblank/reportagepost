'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';
import { ru } from '@/i18n/ru';

export interface CommentItem {
  id: string;
  body: string;
  createdAt: string; // ISO (сериализация через границу server→client)
  authorName: string;
  authorUserId: string;
}

interface Me {
  userId: string | null;
  isAdmin: boolean;
  authed: boolean;
}

export function CommentSection({ storyId, initial, me }: { storyId: string; initial: CommentItem[]; me: Me }) {
  const [items, setItems] = useState<CommentItem[]>(initial);
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setPending(true);
    setError(null);
    const res = await apiFetch<{ id: string }>('/api/comments', {
      method: 'POST',
      body: { storyId, body: text },
      codeLabels: ru.comments.errors,
      fallback: ru.inquiry.errorGeneric,
    });
    setPending(false);
    if (res.ok) {
      const { id } = res.data;
      setItems((prev) => [
        ...prev,
        { id, body: text, createdAt: new Date().toISOString(), authorName: '', authorUserId: me.userId ?? '' },
      ]);
      setBody('');
      return;
    }
    setError(res.error);
  }

  async function remove(id: string) {
    const prev = items;
    setItems((cur) => cur.filter((c) => c.id !== id)); // оптимистично
    const res = await apiFetch('/api/comments', { method: 'DELETE', body: { commentId: id } });
    if (!res || !res.ok) setItems(prev); // откат при ошибке
  }

  return (
    <section className="mt-10 border-t border-line pt-6">
      <h2 className="text-lg font-medium">{ru.comments.count(items.length)}</h2>

      {items.length === 0 ? (
        <p className="mt-3 text-sm muted">{ru.comments.empty}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-4">
          {items.map((c) => {
            const canDelete = me.isAdmin || (me.userId && c.authorUserId === me.userId);
            return (
              <li key={c.id} className="text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{c.authorName || '—'}</span>
                  {canDelete && (
                    <button type="button" onClick={() => remove(c.id)}
                      className="text-xs text-muted transition hover:text-accent">
                      {ru.comments.delete}
                    </button>
                  )}
                </div>
                <p className="mt-0.5 whitespace-pre-wrap">{c.body}</p>
              </li>
            );
          })}
        </ul>
      )}

      {me.authed ? (
        <form onSubmit={submit} className="mt-5">
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3}
            placeholder={ru.comments.placeholder} className="input" maxLength={1000} />
          {error && <p role="alert" className="mt-1 text-sm text-accent">{error}</p>}
          <button type="submit" disabled={pending || !body.trim()} className="btn btn-accent mt-2 px-4 py-2">
            {pending ? ru.comments.sending : ru.comments.submit}
          </button>
        </form>
      ) : (
        <p className="mt-5 text-sm muted">
          <Link href="/ru/login" className="underline">{ru.comments.loginToComment}</Link>
        </p>
      )}
    </section>
  );
}
