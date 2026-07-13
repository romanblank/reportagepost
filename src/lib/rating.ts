import { db } from '@/lib/db';
import { completenessScore } from '@/lib/catalog';

// Рейтинг v2 (модель MyWed): взвешенные лайки со «сгоранием» + полнота профиля.
// Лайк даёт weightMilli, вес экспоненциально затухает (полураспад HALF_LIFE_DAYS).
// UNLIKE вычитает свой вес с тем же затуханием — пара лайк/анлайк ~взаимоуничтожается.
// Пересчёт — батчем (recomputeRatings), результат в PhotographerProfile.ratingScore.

export const HALF_LIFE_DAYS = 60;

export function decayFactor(ageMs: number): number {
  const ageDays = ageMs / 86_400_000;
  return Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
}

/** Вклад событий фото-лайков профиля с затуханием, в милли-баллах. */
export async function engagementMilli(profileId: string, now = new Date()): Promise<number> {
  const photos = await db.photo.findMany({
    where: { profileId, status: 'APPROVED' },
    select: { id: true },
  });
  if (photos.length === 0) return 0;

  const events = await db.activityEvent.findMany({
    where: {
      targetType: 'PHOTO',
      targetId: { in: photos.map((p) => p.id) },
      type: { in: ['PHOTO_LIKE', 'PHOTO_UNLIKE'] },
    },
    select: { type: true, weightMilli: true, createdAt: true },
  });

  let sum = 0;
  for (const e of events) {
    const signed = e.type === 'PHOTO_LIKE' ? e.weightMilli : -e.weightMilli;
    sum += signed * decayFactor(now.getTime() - e.createdAt.getTime());
  }
  return Math.max(0, Math.round(sum));
}

/**
 * Полный пересчёт рейтингов одобренных профилей.
 * ratingScore = engagement (милли) + completeness×1000 (равный масштаб:
 * полный профиль ≈ 100 свежим лайкам клиентов).
 */
export async function recomputeRatings(now = new Date()): Promise<number> {
  const profiles = await db.photographerProfile.findMany({
    where: { status: 'APPROVED' },
    include: {
      user: true,
      packages: true,
      photos: {
        where: { status: 'APPROVED' },
        orderBy: { publishedAt: 'desc' },
        take: 20,
        select: { publishedAt: true },
      },
    },
  });

  for (const p of profiles) {
    const engagement = await engagementMilli(p.id, now);
    const completeness = completenessScore({
      bio: p.bio,
      siteUrl: p.siteUrl,
      whatsapp: p.whatsapp,
      telegram: p.telegram,
      packagesCount: p.packages.length,
      photosCount: p.photos.length,
      lastPublishedAt: p.photos[0]?.publishedAt ?? null,
      now,
    });
    await db.photographerProfile.update({
      where: { id: p.id },
      data: { ratingScore: engagement + completeness * 1000 },
    });
  }
  return profiles.length;
}
