import { db } from '@/lib/db';

// Лайки и подписки: материализованное состояние + append-only событие с весом.
// Вес лайка (v2-механика MyWed): базовый 1000, у одобренного фотографа — 2000.
// Формула уточнится при рейтинге v2; вес пишется В МОМЕНТ события.

async function actorWeight(userId: string): Promise<number> {
  const profile = await db.photographerProfile.findUnique({ where: { userId } });
  return profile?.status === 'APPROVED' ? 2000 : 1000;
}

export async function togglePhotoLike(userId: string, photoId: string): Promise<{ liked: boolean }> {
  const photo = await db.photo.findUnique({ where: { id: photoId } });
  if (!photo || photo.status !== 'APPROVED') throw new Error('photo_not_found');

  const existing = await db.like.findUnique({
    where: { userId_photoId: { userId, photoId } },
  });

  if (existing) {
    // Анлайк списывает ВЕС ИСХОДНОГО ЛАЙКА (denormalized на Like), не текущий
    // вес актора — иначе смена статуса между лайком и анлайком оставляла бы
    // необратимый фантомный вклад в append-only журнале (P0-3 аудита 2026-07-14).
    await db.$transaction([
      db.like.delete({ where: { id: existing.id } }),
      db.activityEvent.create({
        data: { actorUserId: userId, type: 'PHOTO_UNLIKE', targetType: 'PHOTO', targetId: photoId, weightMilli: existing.weightMilli },
      }),
    ]);
    return { liked: false };
  }

  const weightMilli = await actorWeight(userId);
  await db.$transaction([
    db.like.create({ data: { userId, photoId, weightMilli } }),
    db.activityEvent.create({
      data: { actorUserId: userId, type: 'PHOTO_LIKE', targetType: 'PHOTO', targetId: photoId, weightMilli },
    }),
  ]);
  return { liked: true };
}

export async function toggleFollow(followerId: string, followeeId: string): Promise<{ following: boolean }> {
  if (followerId === followeeId) throw new Error('self_follow');
  const followee = await db.user.findUnique({ where: { id: followeeId } });
  if (!followee || followee.status !== 'ACTIVE') throw new Error('user_not_found');

  const existing = await db.follow.findUnique({
    where: { followerId_followeeId: { followerId, followeeId } },
  });

  if (existing) {
    await db.$transaction([
      db.follow.delete({ where: { followerId_followeeId: { followerId, followeeId } } }),
      db.activityEvent.create({
        data: { actorUserId: followerId, type: 'UNFOLLOW', targetType: 'PROFILE', targetId: followeeId },
      }),
    ]);
    return { following: false };
  }

  await db.$transaction([
    db.follow.create({ data: { followerId, followeeId } }),
    db.activityEvent.create({
      data: { actorUserId: followerId, type: 'FOLLOW', targetType: 'PROFILE', targetId: followeeId },
    }),
  ]);
  return { following: true };
}
