import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { handleRoute, jsonError, DomainError } from '@/lib/errors';
import { addReview, replyToReview, setReviewHidden, REVIEW_MAX } from '@/lib/reviews';
import { db } from '@/lib/db';

const createSchema = z.object({
  profileId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  body: z.string().min(1).max(REVIEW_MAX * 2),
});

export function POST(req: Request) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new DomainError('validation', 400);
    const review = await addReview(session.userId, parsed.data.profileId, parsed.data.rating, parsed.data.body);
    return NextResponse.json({ id: review.id }, { status: 201 });
  });
}

const replySchema = z.object({ reviewId: z.string().min(1), reply: z.string().min(1).max(REVIEW_MAX * 2) });

export function PATCH(req: Request) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);
    const parsed = replySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new DomainError('validation', 400);
    await replyToReview(session.userId, parsed.data.reviewId, parsed.data.reply);
    return NextResponse.json({ ok: true });
  });
}

const deleteSchema = z.object({ reviewId: z.string().min(1) });

// Автор удаляет свой отзыв; админ — скрывает (HIDDEN).
export function DELETE(req: Request) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);
    const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new DomainError('validation', 400);

    if (session.role === 'ADMIN') {
      await setReviewHidden(parsed.data.reviewId, true);
      return NextResponse.json({ ok: true });
    }
    const review = await db.review.findUnique({ where: { id: parsed.data.reviewId }, select: { authorUserId: true } });
    if (!review) return NextResponse.json({ ok: true });
    if (review.authorUserId !== session.userId) throw new DomainError('forbidden', 403);
    await db.review.delete({ where: { id: parsed.data.reviewId } });
    return NextResponse.json({ ok: true });
  });
}
