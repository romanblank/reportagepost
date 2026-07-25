import { db } from '@/lib/db';

// Статистика фотографа для кабинета (ценность подписки: «статистика сохранений и
// вовлечённости»). Считается из существующих данных — без отдельного трекинга.
// Просмотры профиля добавим отдельным beacon-механизмом (не SSR-запись).

export interface PhotographerStats {
  saves: number; // всего в избранном у заказчиков
  saves30d: number; // сохранений за 30 дней (тренд — для Elite)
  followers: number; // подписчиков
  reviews: number; // видимых отзывов
  likes: number; // лайков на кадрах портфолио
}

export async function photographerStats(userId: string, profileId: string): Promise<PhotographerStats> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [saves, saves30d, followers, reviews, likes] = await Promise.all([
    db.favoritePhotographer.count({ where: { profileId } }),
    db.favoritePhotographer.count({ where: { profileId, createdAt: { gte: since } } }),
    db.follow.count({ where: { followeeId: userId } }),
    db.review.count({ where: { profileId, status: 'VISIBLE' } }),
    db.like.count({ where: { photo: { profileId } } }),
  ]);
  return { saves, saves30d, followers, reviews, likes };
}
