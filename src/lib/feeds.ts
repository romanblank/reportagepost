import { db } from '@/lib/db';

// Ленты (модель MyWed): «лучшее недели/года» — алгоритмические (взвешенные
// лайки за окно, по журналу событий), «выбор редакции» — ручная отметка.

export interface FeedPhoto {
  photoId: string;
  storageKey: string;
  width: number;
  height: number;
  username: string;
  firstName: string;
  lastName: string;
  scoreMilli: number;
}

async function bestOfWindow(sinceDays: number, limit: number): Promise<FeedPhoto[]> {
  const since = new Date(Date.now() - sinceDays * 86_400_000);
  const grouped = await db.activityEvent.groupBy({
    by: ['targetId', 'type'],
    where: {
      targetType: 'PHOTO',
      type: { in: ['PHOTO_LIKE', 'PHOTO_UNLIKE'] },
      createdAt: { gte: since },
    },
    _sum: { weightMilli: true },
  });

  const scores = new Map<string, number>();
  for (const g of grouped) {
    const sign = g.type === 'PHOTO_LIKE' ? 1 : -1;
    scores.set(g.targetId, (scores.get(g.targetId) ?? 0) + sign * (g._sum.weightMilli ?? 0));
  }
  const top = [...scores.entries()]
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
  if (top.length === 0) return [];

  const photos = await db.photo.findMany({
    where: { id: { in: top.map(([id]) => id) }, status: 'APPROVED' },
    include: { profile: { include: { user: true } } },
  });
  const byId = new Map(photos.map((p) => [p.id, p]));

  return top
    .map(([photoId, scoreMilli]) => {
      const p = byId.get(photoId);
      if (!p) return null;
      return {
        photoId,
        storageKey: p.storageKey,
        width: p.width,
        height: p.height,
        username: p.profile.username,
        firstName: p.profile.user.firstName,
        lastName: p.profile.user.lastName,
        scoreMilli,
      } satisfies FeedPhoto;
    })
    .filter((x): x is FeedPhoto => x !== null);
}

export const bestOfWeek = (limit = 60) => bestOfWindow(7, limit);
export const bestOfYear = (limit = 100) => bestOfWindow(365, limit);

/** Свежее: фолбэк для пустых лент на малых данных (честно, без пустых страниц). */
export async function freshPhotos(limit = 60): Promise<FeedPhoto[]> {
  const photos = await db.photo.findMany({
    where: { status: 'APPROVED' },
    orderBy: { publishedAt: 'desc' },
    take: limit,
    include: { profile: { include: { user: true } } },
  });
  return photos.map((p) => ({
    photoId: p.id,
    storageKey: p.storageKey,
    width: p.width,
    height: p.height,
    username: p.profile.username,
    firstName: p.profile.user.firstName,
    lastName: p.profile.user.lastName,
    scoreMilli: 0,
  }));
}

export async function editorsChoice(limit = 100): Promise<FeedPhoto[]> {
  const photos = await db.photo.findMany({
    where: { status: 'APPROVED', editorsChoiceAt: { not: null } },
    orderBy: { editorsChoiceAt: 'desc' },
    take: limit,
    include: { profile: { include: { user: true } } },
  });
  return photos.map((p) => ({
    photoId: p.id,
    storageKey: p.storageKey,
    width: p.width,
    height: p.height,
    username: p.profile.username,
    firstName: p.profile.user.firstName,
    lastName: p.profile.user.lastName,
    scoreMilli: 0,
  }));
}

/**
 * Лента подписок: свежие публикации фотографов, на которых подписан пользователь
 * (по событиям PHOTO_PUBLISH поверх Follow).
 */
export async function followingFeed(userId: string, limit = 60): Promise<FeedPhoto[]> {
  const follows = await db.follow.findMany({ where: { followerId: userId }, select: { followeeId: true } });
  if (follows.length === 0) return [];

  const photos = await db.photo.findMany({
    where: {
      status: 'APPROVED',
      profile: { userId: { in: follows.map((f) => f.followeeId) } },
    },
    orderBy: { publishedAt: 'desc' },
    take: limit,
    include: { profile: { include: { user: true } } },
  });
  return photos.map((p) => ({
    photoId: p.id,
    storageKey: p.storageKey,
    width: p.width,
    height: p.height,
    username: p.profile.username,
    firstName: p.profile.user.firstName,
    lastName: p.profile.user.lastName,
    scoreMilli: 0,
  }));
}

/**
 * Рекомендательная лента: персонально по категориям, которые пользователь
 * лайкал, ранжирование взвешенными лайками за 30 дней. Фолбэк при малых
 * данных — «лучшее недели», затем «свежее» (честно, без пустых страниц).
 */
export async function recommendedFeed(userId: string, limit = 60): Promise<{ photos: FeedPhoto[]; personalized: boolean }> {
  // категории интереса — из фото, которые пользователь лайкал
  const liked = await db.like.findMany({
    where: { userId, photoId: { not: null } },
    select: { photo: { select: { categoryId: true } } },
    take: 200,
  });
  const catIds = [...new Set(liked.map((l) => l.photo?.categoryId).filter((x): x is string => Boolean(x)))];

  if (catIds.length > 0) {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const events = await db.activityEvent.groupBy({
      by: ['targetId', 'type'],
      where: {
        targetType: 'PHOTO',
        type: { in: ['PHOTO_LIKE', 'PHOTO_UNLIKE'] },
        createdAt: { gte: since },
      },
      _sum: { weightMilli: true },
    });
    const scores = new Map<string, number>();
    for (const e of events) {
      const sign = e.type === 'PHOTO_LIKE' ? 1 : -1;
      scores.set(e.targetId, (scores.get(e.targetId) ?? 0) + sign * (e._sum.weightMilli ?? 0));
    }
    const candidates = await db.photo.findMany({
      where: { status: 'APPROVED', categoryId: { in: catIds }, id: { in: [...scores.keys()] } },
      include: { profile: { include: { user: true } } },
    });
    if (candidates.length > 0) {
      const photos = candidates
        .map((p) => ({
          photoId: p.id, storageKey: p.storageKey, width: p.width, height: p.height,
          username: p.profile.username, firstName: p.profile.user.firstName, lastName: p.profile.user.lastName,
          scoreMilli: scores.get(p.id) ?? 0,
        }))
        .sort((a, b) => b.scoreMilli - a.scoreMilli)
        .slice(0, limit);
      return { photos, personalized: true };
    }
  }

  // фолбэк
  const best = await bestOfWeek(limit);
  if (best.length > 0) return { photos: best, personalized: false };
  return { photos: await freshPhotos(limit), personalized: false };
}

/** Ручная отметка редакции (инструмент оператора). */
export async function toggleEditorsChoice(photoId: string): Promise<{ chosen: boolean }> {
  const photo = await db.photo.findUnique({ where: { id: photoId } });
  if (!photo || photo.status !== 'APPROVED') throw new Error('photo_not_found');
  const chosen = !photo.editorsChoiceAt;
  await db.photo.update({
    where: { id: photoId },
    data: { editorsChoiceAt: chosen ? new Date() : null },
  });
  return { chosen };
}
