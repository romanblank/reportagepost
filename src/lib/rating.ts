import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { completenessScore } from '@/lib/catalog';

// Рейтинг v2 (модель MyWed): взвешенные лайки со «сгоранием» + полнота профиля.
// Лайк даёт weightMilli, вес экспоненциально затухает (полураспад HALF_LIFE_DAYS).
// UNLIKE вычитает свой вес с тем же затуханием — пара лайк/анлайк ~взаимоуничтожается.
// Пересчёт — батчем (recomputeRatings), результат в PhotographerProfile.ratingScore.

export const HALF_LIFE_DAYS = 60;

// Вес лайка в момент действия (единый источник — аудит P2: было продублировано
// в engagement.ts и stories.ts). Одобренный фотограф весит вдвое.
export function likeWeightFor(actorProfileStatus: string | null | undefined): number {
  return actorProfileStatus === 'APPROVED' ? 2000 : 1000;
}

export function decayFactor(ageMs: number): number {
  const ageDays = ageMs / 86_400_000;
  return Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
}

/** Вклад текущих фото-лайков профиля с затуханием, в милли-баллах. Если id
 *  одобренных фото уже загружены (scoreOne) — передать их, чтобы не запрашивать
 *  повторно (аудит перф 2026-07-30). */
export async function engagementMilli(profileId: string, now = new Date(), photoIds?: string[]): Promise<number> {
  const ids =
    photoIds ??
    (await db.photo.findMany({ where: { profileId, status: 'APPROVED' }, select: { id: true } })).map((p) => p.id);
  if (ids.length === 0) return 0;

  // Считаем по МАТЕРИАЛИЗОВАННЫМ лайкам (таблица Like), а НЕ переигрывая журнал
  // PHOTO_LIKE/PHOTO_UNLIKE (волна аудита №6, глубинный баг): анлайк удаляет
  // строку Like, поэтому анлайкнутые лайки исчезают сами. Переигрывание событий
  // затухало лайк и анлайк независимо от их времён — анлайк (позже) затухал
  // МЕНЬШЕ лайка, оставляя отрицательный остаток, который съедал чужие честные
  // лайки. По Like такое невозможно: только существующие лайки, каждый затухает
  // от своего createdAt. Окно 5×полураспад (~300 дней): вклад старше <1%.
  const since = new Date(now.getTime() - 5 * HALF_LIFE_DAYS * 86_400_000);
  const likes = await db.like.findMany({
    where: { photoId: { in: ids }, createdAt: { gte: since } },
    select: { weightMilli: true, createdAt: true },
  });

  let sum = 0;
  for (const l of likes) {
    sum += l.weightMilli * decayFactor(now.getTime() - l.createdAt.getTime());
  }
  return Math.round(sum);
}

type ProfileForRating = Prisma.PhotographerProfileGetPayload<{
  include: { packages: true; photos: true; categories: true };
}>;

/** Затухший вклад лайков по КАЖДОМУ фото (милли). Одним запросом на профиль —
 *  из него складываются и глобальный engagement, и жанровые (по categoryId фото). */
async function engagementByPhoto(photoIds: string[], now: Date): Promise<Map<string, number>> {
  const per = new Map<string, number>();
  if (photoIds.length === 0) return per;
  const since = new Date(now.getTime() - 5 * HALF_LIFE_DAYS * 86_400_000);
  const likes = await db.like.findMany({
    where: { photoId: { in: photoIds }, createdAt: { gte: since } },
    select: { photoId: true, weightMilli: true, createdAt: true },
  });
  for (const l of likes) {
    if (!l.photoId) continue; // Like.photoId nullable (лайки серий); where уже фильтрует, сужение для TS
    const add = l.weightMilli * decayFactor(now.getTime() - l.createdAt.getTime());
    per.set(l.photoId, (per.get(l.photoId) ?? 0) + add);
  }
  return per;
}

/** Глобальный скор + жанровые скоры одним проходом. Жанровый = engagement по
 *  лайкам фото ЭТОЙ категории + общая база (полнота+отзывы): специализация
 *  двигает внутри жанра, добротность профиля — общая для всех его жанров. */
async function scoreOne(
  p: ProfileForRating,
  now: Date,
): Promise<{ total: number; byCategory: Map<string, number> }> {
  const approvedPhotos = p.photos.filter((ph) => ph.status === 'APPROVED');
  const perPhoto = await engagementByPhoto(approvedPhotos.map((ph) => ph.id), now);
  let engagement = 0;
  const engagementByCat = new Map<string, number>();
  for (const ph of approvedPhotos) {
    const e = perPhoto.get(ph.id) ?? 0;
    engagement += e;
    engagementByCat.set(ph.categoryId, (engagementByCat.get(ph.categoryId) ?? 0) + e);
  }
  engagement = Math.round(engagement);
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
  // Вклад отзывов (паритет MyWed): средняя оценка × число (до 20) — доверие
  // весомее лайков. VISIBLE только.
  const rev = await db.review.aggregate({
    where: { profileId: p.id, status: 'VISIBLE' },
    _avg: { rating: true },
    _count: true,
  });
  const reviewMilli = Math.round((rev._avg.rating ?? 0) * Math.min(rev._count, 20) * 200);
  const base = completeness * 1000 + reviewMilli;

  // Жанровые скоры — для всех категорий профиля (даже без лайков: база различает
  // добротность), плюс категории, где есть залайканные фото вне анкетных категорий.
  const byCategory = new Map<string, number>();
  for (const pc of p.categories) {
    byCategory.set(pc.categoryId, Math.round(engagementByCat.get(pc.categoryId) ?? 0) + base);
  }
  for (const [catId, e] of engagementByCat) {
    if (!byCategory.has(catId)) byCategory.set(catId, Math.round(e) + base);
  }
  return { total: engagement + base, byCategory };
}

/** Записать глобальный и жанровые скоры; строки категорий, покинувших профиль, удалить. */
async function persistScores(
  profileId: string,
  scores: { total: number; byCategory: Map<string, number> },
): Promise<void> {
  await db.$transaction([
    db.photographerProfile.update({ where: { id: profileId }, data: { ratingScore: scores.total } }),
    db.profileCategoryScore.deleteMany({
      where: { profileId, categoryId: { notIn: [...scores.byCategory.keys()] } },
    }),
    ...[...scores.byCategory].map(([categoryId, scoreMilli]) =>
      db.profileCategoryScore.upsert({
        where: { profileId_categoryId: { profileId, categoryId } },
        create: { profileId, categoryId, scoreMilli },
        update: { scoreMilli },
      }),
    ),
  ]);
}

/** Точечный пересчёт одного профиля (аудит P1-2: O(1) на approve вместо O(N)). */
export async function recomputeOne(profileId: string, now = new Date()): Promise<void> {
  const p = await db.photographerProfile.findUnique({
    where: { id: profileId },
    include: { packages: true, photos: true, categories: true },
  });
  if (!p) return;
  await persistScores(p.id, await scoreOne(p, now));
}

/**
 * Полный пересчёт рейтингов (плановый джоб, НЕ в HTTP-запросе).
 * ratingScore = engagement (милли) + completeness×1000.
 */
export async function recomputeRatings(now = new Date()): Promise<number> {
  const profiles = await db.photographerProfile.findMany({
    where: { status: 'APPROVED' },
    include: { packages: true, photos: true, categories: true },
  });
  // Батчами (не строго последовательно) — джоб не растягивается линейно с ростом
  // каталога (аудит перф 2026-07-30). Кап конкуренции бережёт пул соединений.
  const CHUNK = 25;
  for (let i = 0; i < profiles.length; i += CHUNK) {
    await Promise.all(
      profiles.slice(i, i + CHUNK).map(async (p) => persistScores(p.id, await scoreOne(p, now))),
    );
  }
  return profiles.length;
}

/** Идемпотентный бэкфилл жанровых скоров (вызывается из сида на старте контейнера):
 *  профили, одобренные ДО появления ProfileCategoryScore, не имеют строк — без них
 *  выдача категории пуста. Пересчитываем только их; при полном покрытии — no-op. */
export async function backfillCategoryScores(now = new Date()): Promise<number> {
  const missing = await db.photographerProfile.findMany({
    where: { status: 'APPROVED', categoryScores: { none: {} } },
    select: { id: true },
  });
  for (const { id } of missing) await recomputeOne(id, now);
  return missing.length;
}
