import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';
import { likeWeightFor } from '@/lib/rating';
import { notifyInApp } from '@/lib/notifications';

// Лайки и подписки: материализованное состояние + append-only событие с весом.
// Вес лайка (v2-механика MyWed): базовый 1000, у одобренного фотографа — 2000.
// Формула уточнится при рейтинге v2; вес пишется В МОМЕНТ события.

/**
 * Пересчёт рейтинга автора после лайка (аудит 2026-07-31, P1): раньше
 * recomputeOne вызывался только на approve/отзыв/правку профиля, а
 * recomputeRatings — вообще нигде, кроме сида. Из-за этого merit-порядок
 * каталога был ЗАМОРОЖЕН между деплоями: автор набирал лайки и не двигался
 * ни на позицию, хотя «выдача по качеству» — главный инвариант продукта.
 * Ошибку пересчёта глотаем: лайк пользователя не должен падать из-за неё.
 */
async function recomputeAfterLike(profileId: string): Promise<void> {
  try {
    const { recomputeOne } = await import('@/lib/rating');
    await recomputeOne(profileId);
  } catch {
    // порядок обновится плановым пересчётом (джоб) — лайк уже сохранён
  }
}

async function actorWeight(userId: string): Promise<number> {
  const profile = await db.photographerProfile.findUnique({ where: { userId }, select: { status: true } });
  return likeWeightFor(profile?.status);
}

export async function togglePhotoLike(userId: string, photoId: string): Promise<{ liked: boolean }> {
  const photo = await db.photo.findUnique({
    where: { id: photoId },
    include: { profile: { select: { userId: true } } },
  });
  if (!photo || photo.status !== 'APPROVED') throw new DomainError('photo_not_found', 404);
  // Самолайк запрещён (аудит 2026-07-31, P1 «накрутка merit»): лайки — ЕДИНСТВЕННЫЙ
  // публичный сигнал качества после отказа от среднего балла, и они двигают порядок
  // каталога. Автор, лайкающий собственное портфолио, поднимал себя над честными.
  // Ср. toggleFollow, где self_follow был закрыт с самого начала.
  if (photo.profile.userId === userId) throw new DomainError('self_like', 400);

  const existing = await db.like.findUnique({
    where: { userId_photoId: { userId, photoId } },
  });

  if (existing) {
    // Анлайк списывает ВЕС ИСХОДНОГО ЛАЙКА (denormalized на Like), не текущий
    // вес актора (P0-3 волны №1). deleteMany по ключу — идемпотентно при гонке
    // двойного анлайка (P2 волны №2: delete по id давал P2025→500).
    const removed = await db.like.deleteMany({ where: { userId, photoId } });
    if (removed.count > 0) {
      await db.activityEvent.create({
        data: { actorUserId: userId, type: 'PHOTO_UNLIKE', targetType: 'PHOTO', targetId: photoId, weightMilli: existing.weightMilli },
      });
      await recomputeAfterLike(photo.profileId);
    }
    return { liked: false };
  }

  const weightMilli = await actorWeight(userId);
  try {
    await db.$transaction([
      db.like.create({ data: { userId, photoId, weightMilli } }),
      db.activityEvent.create({
        data: { actorUserId: userId, type: 'PHOTO_LIKE', targetType: 'PHOTO', targetId: photoId, weightMilli },
      }),
    ]);
  } catch (e) {
    // Гонка двойного клика на unique(userId,photoId): лайк уже есть — идемпотентно
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { liked: true };
    }
    throw e;
  }
  await recomputeAfterLike(photo.profileId);
  return { liked: true };
}

export async function toggleFollow(followerId: string, followeeId: string): Promise<{ following: boolean }> {
  if (followerId === followeeId) throw new DomainError('self_follow', 400);
  // Подписка только на одобренного фотографа (аудит sec #6): нельзя фолловить
  // заказчиков/непромодерированных и накручивать события
  const profile = await db.photographerProfile.findUnique({
    where: { userId: followeeId },
    select: { status: true },
  });
  if (!profile || profile.status !== 'APPROVED') throw new DomainError('user_not_found', 404);

  const existing = await db.follow.findUnique({
    where: { followerId_followeeId: { followerId, followeeId } },
  });

  if (existing) {
    const removed = await db.follow.deleteMany({ where: { followerId, followeeId } });
    if (removed.count > 0) {
      await db.activityEvent.create({
        data: { actorUserId: followerId, type: 'UNFOLLOW', targetType: 'PROFILE', targetId: followeeId },
      });
    }
    return { following: false };
  }

  await db.$transaction([
    db.follow.create({ data: { followerId, followeeId } }),
    db.activityEvent.create({
      data: { actorUserId: followerId, type: 'FOLLOW', targetType: 'PROFILE', targetId: followeeId },
    }),
  ]);
  void notifyInApp(followeeId, 'notification.follow.new', {});
  return { following: true };
}
