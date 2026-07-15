'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ru } from '@/i18n/ru';
import { describeApiError } from '@/lib/form-errors';
import { Rating } from '@/components/ui/Rating';

export interface ReviewItem {
  id: string;
  rating: number;
  body: string;
  verified: boolean;
  authorUserId: string;
  authorName: string;
  createdAt: string;
  reply: string | null;
}

interface Me {
  userId: string | null;
  authed: boolean;
  isClient: boolean;
  isOwner: boolean;
  isAdmin: boolean;
  alreadyReviewed: boolean;
}

function Stars({ n }: { n: number }) {
  return <Rating value={n} showCount={false} />;
}

export function ReviewSection({
  profileId,
  initial,
  aggregate,
  me,
}: {
  profileId: string;
  initial: ReviewItem[];
  aggregate: { avg: number; count: number };
  me: Me;
}) {
  const [items, setItems] = useState<ReviewItem[]>(initial);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const canReview = me.isClient && !me.isOwner && !me.alreadyReviewed;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (rating < 1) { setError(ru.reviews.errors.review_rating); return; }
    setPending(true);
    setError(null);
    const res = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId, rating, body: body.trim() }),
    }).catch(() => null);
    setPending(false);
    if (res?.status === 201) {
      setItems((prev) => [
        { id: `tmp-${Date.now()}`, rating, body: body.trim(), verified: false, authorUserId: me.userId ?? '', authorName: '', createdAt: new Date().toISOString(), reply: null },
        ...prev,
      ]);
      setBody(''); setRating(0); setShowForm(false);
      return;
    }
    setError(await describeApiError(res, { codeLabels: ru.reviews.errors, fallback: ru.inquiry.errorGeneric }));
  }

  async function reply(reviewId: string, text: string) {
    const res = await fetch('/api/reviews', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewId, reply: text.trim() }),
    }).catch(() => null);
    if (res?.ok) setItems((prev) => prev.map((r) => (r.id === reviewId ? { ...r, reply: text.trim() } : r)));
  }

  async function remove(reviewId: string) {
    const prev = items;
    setItems((cur) => cur.filter((r) => r.id !== reviewId));
    const res = await fetch('/api/reviews', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reviewId }),
    }).catch(() => null);
    if (!res || !res.ok) setItems(prev);
  }

  return (
    <section className="mt-10 border-t border-line pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-lg font-medium">{ru.reviews.title}</h2>
        {aggregate.count > 0 && (
          <span className="text-sm">
            <Stars n={Math.round(aggregate.avg)} />{' '}
            <span className="muted">{ru.reviews.summary(aggregate.avg.toFixed(1), aggregate.count)}</span>
          </span>
        )}
      </div>

      {canReview && !showForm && (
        <button type="button" onClick={() => setShowForm(true)} className="btn btn-outline mt-4 px-4 py-2 text-sm">
          {ru.reviews.writeCta}
        </button>
      )}
      {!me.authed && (
        <p className="mt-4 text-sm muted">
          <Link href="/ru/login" className="underline">{ru.reviews.loginToReview}</Link>
        </p>
      )}

      {canReview && showForm && (
        <form onSubmit={submit} className="mt-4 card p-4">
          <span className="field-label">{ru.reviews.ratingLabel}</span>
          <div className="mt-1 flex gap-1 text-2xl">
            {[1, 2, 3, 4, 5].map((s) => (
              <button key={s} type="button" onClick={() => setRating(s)} aria-label={`${s}`}
                className={`text-xl ${s <= rating ? 'text-ink' : 'text-muted-2'}`}>★</button>
            ))}
          </div>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4}
            placeholder={ru.reviews.placeholder} className="input mt-3" maxLength={2000} />
          {error && <p role="alert" className="mt-1 text-sm text-danger">{error}</p>}
          <button type="submit" disabled={pending || !body.trim() || rating < 1} className="btn btn-accent mt-2 px-4 py-2">
            {pending ? ru.reviews.sending : ru.reviews.submit}
          </button>
        </form>
      )}

      {items.length === 0 ? (
        <p className="mt-4 text-sm muted">{ru.reviews.none}</p>
      ) : (
        <ul className="mt-5 flex flex-col gap-5">
          {items.map((r) => (
            <li key={r.id} className="text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Stars n={r.rating} />
                <span className="font-medium">{r.authorName || '—'}</span>
                {r.verified && (
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs muted">{ru.reviews.verified}</span>
                )}
                {(me.isAdmin || (me.userId != null && r.authorUserId === me.userId)) && (
                  <button type="button" onClick={() => remove(r.id)} className="ml-auto text-xs text-muted hover:text-accent">
                    {me.isAdmin ? ru.reviews.hide : ru.reviews.delete}
                  </button>
                )}
              </div>
              <p className="mt-1 whitespace-pre-wrap">{r.body}</p>
              {r.reply ? (
                <div className="mt-2 rounded-lg bg-surface-2 p-3">
                  <span className="text-xs font-medium muted">{ru.reviews.photographerReply}</span>
                  <p className="mt-0.5 whitespace-pre-wrap">{r.reply}</p>
                </div>
              ) : me.isOwner ? (
                <ReplyBox onReply={(t) => reply(r.id, t)} />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ReplyBox({ onReply }: { onReply: (text: string) => void }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-2 text-xs text-muted underline hover:text-accent">
        {ru.reviews.reply}
      </button>
    );
  }
  return (
    <div className="mt-2 flex flex-col gap-2">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2}
        placeholder={ru.reviews.replyPlaceholder} className="input" maxLength={2000} />
      <button type="button" onClick={() => { if (text.trim()) { onReply(text); setOpen(false); } }}
        className="btn btn-outline w-fit px-3 py-1.5 text-sm">{ru.reviews.replySend}</button>
    </div>
  );
}
