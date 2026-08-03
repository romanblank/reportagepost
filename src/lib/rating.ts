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

// Параметры вклада отзывов. PRIOR_* — байесовский приор: пока отзывов мало,
// оценка тянется к нейтральной, и один восторженный (или один злой) отзыв не
// решает судьбу автора. CAP — после 20 отзывов количество перестаёт влиять.
const REVIEW_NEUTRAL = 3;
const REVIEW_PRIOR_MEAN = 3.5;
const REVIEW_PRIOR_WEIGHT = 5;
const REVIEW_CAP = 20;
const REVIEW_SCALE = 400;

/** Вклад отзывов в рейтинг (милли). Экспортирован ради тестов. */
export function reviewContribution(avgRating: number, count: number): number {
  if (count <= 0) return 0;
  const bayes =
    (REVIEW_PRIOR_WEIGHT * REVIEW_PRIOR_MEAN + avgRating * count) / (REVIEW_PRIOR_WEIGHT + count);
  return Math.round((bayes - REVIEW_NEUTRAL) * Math.min(count, REVIEW_CAP) * REVIEW_SCALE);
}

type ProfileForRating = Prisma.PhotographerProfileGetPayload<{
  include: { packages: true; photos: true; categories: true };
}>;

/** Затухший вклад лайков по КАЖДОМУ фото (милли). Одним запросом на профиль —
 *  из него складываются и глобальный engagement, и жанровые (по categoryId фото). */
/**
 * Вклад лайков по каждому фото с затуханием, в милли-баллах.
 *
 * Единственная реализация движка затухания (аудит 2026-08-01, P2): рядом жила
 * вторая — engagementMilli, экспортированная, но не вызываемая ни одним
 * потребителем. Дублированная формула рейтинга — гарантированный дрейф:
 * следующая правка веса или окна попала бы в одну копию (скорее в мёртвую, она
 * лежала выше по файлу) и не дала бы никакого эффекта.
 *
 * Считаем по МАТЕРИАЛИЗОВАННЫМ лайкам (таблица Like), а НЕ переигрывая журнал
 * PHOTO_LIKE/PHOTO_UNLIKE (волна аудита №6, глубинный баг): анлайк удаляет
 * строку Like, поэтому анлайкнутые лайки исчезают сами. Переигрывание событий
 * затухало лайк и анлайк независимо от их времён — анлайк (позже) затухал
 * МЕНЬШЕ лайка, оставляя отрицательный остаток, который съедал чужие честные
 * лайки. Окно 5×полураспад (~300 дней): вклад старше <1%.
 */
export async function engagementByPhoto(photoIds: string[], now: Date): Promise<Map<string, number>> {
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
  // Отзывы — только VISIBLE (скрытые админом в рейтинг не идут)
  const rev = await db.review.aggregate({
    where: { profileId: p.id, status: 'VISIBLE' },
    _avg: { rating: true },
    _count: true,
  });
  // Вклад отзывов (аудит 2026-07-31, P1 — БЫЛА ЛОГИЧЕСКАЯ ОШИБКА).
  // Прежняя формула avg × count × 200 РОСЛА от плохого отзыва: 5×1×200=1000,
  // а после отзыва на 1 балл → 3×2×200=1200. То есть недовольный заказчик
  // поднимал автора в выдаче.
  //
  // Теперь: байесовское сглаживание (защищает от «один отзыв на 5 → в топ»)
  // и отсчёт от НЕЙТРАЛИ — вклад положителен только выше неё и отрицателен
  // ниже. Согласуется с доброжелательным рейтингом: низкие оценки кормят
  // внутренний порядок, но публично не показываются.
  const reviewMilli = reviewContribution(rev._avg.rating ?? 0, rev._count);
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
  // Идём КУРСОРОМ по id, а не грузим весь каталог в память сразу.
  //
  // Прежняя версия читала все одобренные анкеты со всеми их фотографиями одним
  // запросом. На сотне авторов это незаметно, на нескольких тысячах — сотни
  // мегабайт в единственном контейнере и растущий риск не уложиться в отведённые
  // джобу пять минут. Причём молча: недосчитанный рейтинг ничем себя не выдаёт,
  // каталог просто начинает отражать вчерашний день (аудит 2026-08-03).
  const PAGE = 200;
  const CHUNK = 25;
  let cursor: string | undefined;
  let processed = 0;

  for (;;) {
    const page = await db.photographerProfile.findMany({
      where: { status: 'APPROVED' },
      include: { packages: true, photos: true, categories: true },
      orderBy: { id: 'asc' },
      take: PAGE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (page.length === 0) break;

    // Внутри страницы — батчами: кап конкуренции бережёт пул соединений
    for (let i = 0; i < page.length; i += CHUNK) {
      await Promise.all(
        page.slice(i, i + CHUNK).map(async (p) => persistScores(p.id, await scoreOne(p, now))),
      );
    }
    processed += page.length;
    cursor = page[page.length - 1].id;
    if (page.length < PAGE) break;
  }

  return processed;
}
