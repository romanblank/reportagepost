import { db } from '@/lib/db';

// Статистика фотографа для кабинета (ценность подписки: «статистика сохранений и
// вовлечённости»). Считается из существующих данных — без отдельного трекинга.
// Просмотры профиля добавим отдельным beacon-механизмом (не SSR-запись).

export interface PhotographerStats {
  views: number; // просмотров профиля (PROFILE_VIEW в ActivityEvent)
  views30d: number; // просмотров за 30 дней
  saves: number; // всего в избранном у заказчиков
  saves30d: number; // сохранений за 30 дней (тренд — для Elite)
  followers: number; // подписчиков
  reviews: number; // видимых отзывов
  likes: number; // лайков на кадрах портфолио
}

export async function photographerStats(userId: string, profileId: string): Promise<PhotographerStats> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const viewWhere = { type: 'PROFILE_VIEW' as const, targetType: 'PROFILE' as const, targetId: profileId };
  const [views, views30d, saves, saves30d, followers, reviews, likes] = await Promise.all([
    db.activityEvent.count({ where: viewWhere }),
    db.activityEvent.count({ where: { ...viewWhere, createdAt: { gte: since } } }),
    db.favoritePhotographer.count({ where: { profileId } }),
    db.favoritePhotographer.count({ where: { profileId, createdAt: { gte: since } } }),
    db.follow.count({ where: { followeeId: userId } }),
    db.review.count({ where: { profileId, status: 'VISIBLE' } }),
    db.like.count({ where: { photo: { profileId } } }),
  ]);
  return { views, views30d, saves, saves30d, followers, reviews, likes };
}

// Записать просмотр профиля (beacon с клиента — боты без JS не пишут). Владелец
// исключается на уровне роута. Лёгкий дедуп для авторизованных — там же.
export async function recordProfileView(profileId: string, actorUserId: string | null): Promise<void> {
  await db.activityEvent.create({
    data: {
      type: 'PROFILE_VIEW',
      targetType: 'PROFILE',
      targetId: profileId,
      actorUserId: actorUserId ?? undefined,
    },
  });
}

// Был ли недавний просмотр этим актором (дедуп refresh-спама, авторизованные).
export async function viewedRecently(profileId: string, actorUserId: string, withinHours = 6): Promise<boolean> {
  const since = new Date(Date.now() - withinHours * 60 * 60 * 1000);
  const n = await db.activityEvent.count({
    where: { type: 'PROFILE_VIEW', targetType: 'PROFILE', targetId: profileId, actorUserId, createdAt: { gte: since } },
  });
  return n > 0;
}
