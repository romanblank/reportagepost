import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';
import { rateLimit } from '@/lib/rate-limit';
import { recomputeOne } from '@/lib/rating';
import { notifyInApp } from '@/lib/notifications';
import { hasShotWith } from '@/lib/shoots';

// Отзывы клиентов о фотографах (паритет MyWed). Оценка 1–5 + текст, один отзыв на
// пару клиент↔фотограф, guard текста (антиспам/контакты — общение через платформу),
// verified при реальном взаимодействии (сообщение). Модерация: VISIBLE по умолчанию,
// админ может HIDDEN.

export const REVIEW_MAX = 2000;

const LINK_RE = /(https?:\/\/|www\.|t\.me\/|@[a-z0-9_]{4,}|[a-zа-яё0-9-]{2,}\.(ru|com|net|org|io|me|tg|рф|su|info|biz))/i;
const PHONE_RE = /(?:\+?\d[\s()\-–—.]*){7,}/;

/** Чистый guard отзыва. Бросает DomainError с кодом. */
export function validateReview(rating: number, rawBody: string): { rating: number; body: string } {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new DomainError('review_rating', 400);
  const body = rawBody.trim();
  if (body.length === 0) throw new DomainError('review_empty', 400);
  if (body.length > REVIEW_MAX) throw new DomainError('review_too_long', 400);
  if (LINK_RE.test(body)) throw new DomainError('review_no_links', 400);
  if (PHONE_RE.test(body)) throw new DomainError('review_no_contacts', 400);
  return { rating, body };
}

export async function addReview(authorUserId: string, profileId: string, rating: number, rawBody: string) {
  const { body } = validateReview(rating, rawBody);

  const profile = await db.photographerProfile.findUnique({
    where: { id: profileId },
    select: { status: true, userId: true },
  });
  if (!profile || profile.status !== 'APPROVED') throw new DomainError('target_not_found', 404);
  if (profile.userId === authorUserId) throw new DomainError('review_self', 400);

  const author = await db.user.findUnique({ where: { id: authorUserId }, select: { role: true } });
  if (author?.role !== 'CLIENT') throw new DomainError('review_clients_only', 403);

  await rateLimit(`review:user:${authorUserId}`, 5, 3600); // 5/час на пользователя

  // verified — по РЕАЛЬНОЙ съёмке (подтверждённой заказчиком), а не по сообщению.
  // Честный якорь доброжелательной системы: отзыв «проверен» = съёмка была.
  const verified = await hasShotWith(authorUserId, profileId);

  let created;
  try {
    created = await db.review.create({
      data: { authorUserId, profileId, rating, body, verified },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new DomainError('review_exists', 409); // один отзыв на пару
    }
    throw e;
  }
  await recomputeOne(profileId); // отзыв влияет на рейтинг → пересчёт
  void notifyInApp(profile.userId, 'notification.review.new', {}); // фотографу
  return created;
}

/** Ответ фотографа на отзыв (владелец профиля). */
export async function replyToReview(ownerUserId: string, reviewId: string, rawReply: string): Promise<void> {
  const reply = rawReply.trim();
  if (reply.length === 0) throw new DomainError('review_empty', 400);
  if (reply.length > REVIEW_MAX) throw new DomainError('review_too_long', 400);
  if (LINK_RE.test(reply)) throw new DomainError('review_no_links', 400);
  if (PHONE_RE.test(reply)) throw new DomainError('review_no_contacts', 400);

  const review = await db.review.findUnique({
    where: { id: reviewId },
    select: { profile: { select: { userId: true } } },
  });
  if (!review) throw new DomainError('target_not_found', 404);
  if (review.profile.userId !== ownerUserId) throw new DomainError('forbidden', 403);

  await db.review.update({ where: { id: reviewId }, data: { reply, repliedAt: new Date() } });
}

/** Скрыть/показать отзыв (админ). Пересчитываем рейтинг — отзыв влияет на него. */
export async function setReviewHidden(reviewId: string, hidden: boolean): Promise<void> {
  const r = await db.review.update({
    where: { id: reviewId },
    data: { status: hidden ? 'HIDDEN' : 'VISIBLE' },
    select: { profileId: true },
  });
  await recomputeOne(r.profileId);
}

export interface ReviewView {
  id: string;
  rating: number;
  body: string;
  verified: boolean;
  authorUserId: string; // для проверки «мой отзыв» на клиенте (как в комментариях)
  authorName: string;
  createdAt: Date;
  reply: string | null;
  repliedAt: Date | null;
}

export interface ReviewAggregate {
  avg: number; // средняя оценка (0 если нет)
  count: number;
}

export async function reviewsForProfile(
  profileId: string,
  limit = 50,
): Promise<{ items: ReviewView[]; aggregate: ReviewAggregate }> {
  // Публично — только положительные отзывы (rating≥4): «Признательность заказчиков».
  // Низкие оценки (≤3) собираются и кормят внутренний порядок/дашборд автора, но
  // публично не топят (доброжелательная система, 2026-07-25). Среднее не выводим.
  const pub = { profileId, status: 'VISIBLE' as const, rating: { gte: 4 } };
  const [rows, agg] = await Promise.all([
    db.review.findMany({
      where: pub,
      orderBy: [{ verified: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      include: { author: { select: { firstName: true, lastName: true } } },
    }),
    db.review.aggregate({ where: pub, _avg: { rating: true }, _count: true }),
  ]);
  return {
    items: rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      body: r.body,
      verified: r.verified,
      authorUserId: r.authorUserId,
      authorName: `${r.author.firstName} ${r.author.lastName}`.trim(),
      createdAt: r.createdAt,
      reply: r.reply,
      repliedAt: r.repliedAt,
    })),
    aggregate: { avg: agg._avg.rating ?? 0, count: agg._count },
  };
}
