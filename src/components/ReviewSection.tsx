'use client';

import { useState } from 'react';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { apiFetch } from '@/lib/api';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ru } from '@/i18n/ru';

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

export function ReviewSection({
  profileId,
  initial,
  aggregate,
  me,
}: {
  profileId: string;
  initial: ReviewItem[];
  aggregate: { count: number };
  me: Me;
}) {
  const router = useRouter();
  const [items, setItems] = useState<ReviewItem[]>(initial);
  // Синхронизация со свежими серверными данными после router.refresh() (свой
  // отзыв подтягивает имя автора + verified вместо оптимистичного «—»).
  const [prevInitial, setPrevInitial] = useState(initial);
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setItems(initial);
  }
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
    const res = await apiFetch('/api/reviews', { method: 'POST', body: { profileId, rating, body: body.trim() } });
    setPending(false);
    if (res.ok) {
      setItems((prev) => [
        { id: `tmp-${Date.now()}`, rating, body: body.trim(), verified: false, authorUserId: me.userId ?? '', authorName: '', createdAt: new Date().toISOString(), reply: null },
        ...prev,
      ]);
      setBody(''); setRating(0); setShowForm(false);
      router.refresh(); // подтянуть реальные имя/verified с сервера
      return;
    }
    setError(res.error);
  }

  async function reply(reviewId: string, text: string) {
    const res = await apiFetch('/api/reviews', { method: 'PATCH', body: { reviewId, reply: text.trim() } });
    if (res?.ok) setItems((prev) => prev.map((r) => (r.id === reviewId ? { ...r, reply: text.trim() } : r)));
  }

  async function remove(reviewId: string) {
    const prev = items;
    setItems((cur) => cur.filter((r) => r.id !== reviewId));
    const res = await apiFetch('/api/reviews', { method: 'DELETE', body: { reviewId } });
    if (!res || !res.ok) setItems(prev);
  }

  return (
    <section id="reviews" className="mt-10 scroll-mt-[7.5rem] border-t border-line pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <SectionHeading kicker={ru.reviews.kicker} title={ru.reviews.title} divider={false} />
        {aggregate.count > 0 && (
          <span className="t-small muted">{ru.reviews.summary(aggregate.count)}</span>
        )}
      </div>

      {canReview && !showForm && (
        <button type="button" onClick={() => setShowForm(true)} className="btn btn-outline mt-4 px-4 py-2 t-small">
          {ru.reviews.writeCta}
        </button>
      )}
      {!me.authed && (
        <p className="mt-4 t-small muted">
          <Link href="/ru/login" className="underline">{ru.reviews.loginToReview}</Link>
        </p>
      )}

      {canReview && showForm && (
        <form onSubmit={submit} className="mt-4 card p-4">
          <span className="field-label">{ru.reviews.ratingLabel}</span>
          {/* Оценка кодировалась ТОЛЬКО цветом звезды, а имена кнопок были
              «1», «2», … без единицы измерения: узнать текущую оценку без
              зрения было невозможно. */}
          <div role="radiogroup" aria-label={ru.reviews.ratingLabel} className="mt-1 flex gap-1 rating-stars">
            {[1, 2, 3, 4, 5].map((s) => (
              <button key={s} type="button" role="radio" aria-checked={s === rating}
                onClick={() => setRating(s)} aria-label={ru.reviews.ratingOption(s)}
                className={`rating-star ${s <= rating ? 'text-ink' : 'text-muted-2'}`}>★</button>
            ))}
          </div>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4}
            placeholder={ru.reviews.placeholder} className="input mt-3" maxLength={2000} />
          {error && <p role="alert" className="mt-1 t-small text-danger">{error}</p>}
          <button type="submit" disabled={pending || !body.trim() || rating < 1} className="btn btn-accent mt-2 px-4 py-2">
            {pending ? ru.reviews.sending : ru.reviews.submit}
          </button>
        </form>
      )}

      {items.length === 0 ? (
        <p className="mt-4 t-small muted">{ru.reviews.none}</p>
      ) : (
        <ul className="mt-5 flex flex-col gap-5">
          {items.map((r) => (
            <li key={r.id} className="t-small">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{r.authorName || '—'}</span>
                {r.verified && (
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 t-fine muted">{ru.reviews.verified}</span>
                )}
                {(me.isAdmin || (me.userId != null && r.authorUserId === me.userId)) && (
                  <button type="button" onClick={() => remove(r.id)} className="ml-auto t-fine text-muted hover:text-accent">
                    {me.isAdmin ? ru.reviews.hide : ru.reviews.delete}
                  </button>
                )}
              </div>
              <p className="mt-1 whitespace-pre-wrap">{r.body}</p>
              {r.reply ? (
                <div className="mt-2 rounded-media bg-surface-2 p-3">
                  <span className="t-fine font-medium muted">{ru.reviews.photographerReply}</span>
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
      <button type="button" onClick={() => setOpen(true)} className="mt-2 t-fine text-muted underline hover:text-accent">
        {ru.reviews.reply}
      </button>
    );
  }
  return (
    <div className="mt-2 flex flex-col gap-2">
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2}
        placeholder={ru.reviews.replyPlaceholder} className="input" maxLength={2000} />
      <button type="button" onClick={() => { if (text.trim()) { onReply(text); setOpen(false); } }}
        className="btn btn-outline w-fit px-3 py-1.5 t-small">{ru.reviews.replySend}</button>
    </div>
  );
}
