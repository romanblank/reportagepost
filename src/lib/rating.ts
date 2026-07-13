import { Prisma } from '@prisma/client';
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

  // Окно 5×полураспад (~300 дней): вклад старше <1% (аудит P1-3) — не грузим
  // весь append-only журнал за всё время.
  const since = new Date(now.getTime() - 5 * HALF_LIFE_DAYS * 86_400_000);
  const events = await db.activityEvent.findMany({
    where: {
      targetType: 'PHOTO',
      targetId: { in: photos.map((p) => p.id) },
      type: { in: ['PHOTO_LIKE', 'PHOTO_UNLIKE'] },
      createdAt: { gte: since },
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

type ProfileForRating = Prisma.PhotographerProfileGetPayload<{
  include: { packages: true; photos: true };
}>;

async function scoreOne(p: ProfileForRating, now: Date): Promise<number> {
  const engagement = await engagementMilli(p.id, now);
  const approvedPhotos = p.photos.filter((ph) => ph.status === 'APPROVED');
  const lastPublishedAt = approvedPhotos
    .map((ph) => ph.publishedAt)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const completeness = completenessScore({
    bio: p.bio,
    siteUrl: p.siteUrl,
    whatsapp: p.whatsapp,
    telegram: p.telegram,
    packagesCount: p.packages.length,
    photosCount: approvedPhotos.length,
    lastPublishedAt,
    now,
  });
  return engagement + completeness * 1000;
}

/** Точечный пересчёт одного профиля (аудит P1-2: O(1) на approve вместо O(N)). */
export async function recomputeOne(profileId: string, now = new Date()): Promise<void> {
  const p = await db.photographerProfile.findUnique({
    where: { id: profileId },
    include: { packages: true, photos: true },
  });
  if (!p) return;
  await db.photographerProfile.update({
    where: { id: p.id },
    data: { ratingScore: await scoreOne(p, now) },
  });
}

/**
 * Полный пересчёт рейтингов (плановый джоб, НЕ в HTTP-запросе).
 * ratingScore = engagement (милли) + completeness×1000.
 */
export async function recomputeRatings(now = new Date()): Promise<number> {
  const profiles = await db.photographerProfile.findMany({
    where: { status: 'APPROVED' },
    include: { packages: true, photos: true },
  });
  for (const p of profiles) {
    await db.photographerProfile.update({
      where: { id: p.id },
      data: { ratingScore: await scoreOne(p, now) },
    });
  }
  return profiles.length;
}
