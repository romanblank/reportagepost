import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { activeTier, ELITE_RANK, type Tier } from '@/lib/subscription';

// Каталог: одобренные фотографы города с фильтрами.
// Ранжирование: MERIT-first (ratingScore) — подписка лишь мягкий tiebreaker, не
// pay-for-position (разворот 2026-07-25: синергия, не классовость). Буст-видимость
// подписки — отдельной полкой «Рекомендуемые» (recommendedForCity).

export interface CatalogFilters {
  citySlug: string;
  categorySlug?: string;
  /** Потолок цены пакета (total, minor units). Семантика — как в matching (бюджет
   *  на событие), едина по проекту. Раньше поле трактовалось как ₽/час с хардкод-×24
   *  → неверная фильтрация; выправлено на честный total (аудит 2026-07-26). */
  maxPackagePriceMinor?: number;
  /** «Свободен на дату» (UTC-полночь): исключает занятых в этот день. */
  availableOn?: Date;
  /** Пагинация (аудит P1-1): страница на PAGE_SIZE карточек. */
  page?: number;
  /** Только видеографы (формат «Видео»). Фото снимают все — отдельного флага не нужно. */
  videoOnly?: boolean;
}

export const CATALOG_PAGE_SIZE = 24;

export interface CatalogPage {
  cards: CatalogCard[];
  page: number;
  hasNext: boolean;
}

export interface CatalogCard {
  username: string;
  firstName: string;
  lastName: string;
  verified: boolean;
  avatarKey: string | null;
  bio: string | null;
  categories: string[];
  minPackage: { hours: number; priceMinor: number; currency: string } | null;
  coverKey: string | null; // обложка каталога (выбранная или лучший кадр)
  photoKeys: string[]; // до 6 превью (запас под hover-полосу)
  recommendCount: number; // отзывы rating≥4 & verified — публичный положительный сигнал (не звезда)
  saveCount: number; // в избранном у заказчиков
  score: number;
  tier: Tier; // FREE/PRIME/ELITE — бейдж подписки (FREE не показывается)
  doesVideo: boolean; // снимает видео — бейдж «Фото · Видео» в каталоге
}

export function completenessScore(input: {
  bio: string | null;
  siteUrl: string | null;
  whatsapp: string | null;
  telegram: string | null;
  packagesCount: number;
  photosCount: number;
  lastPublishedAt: Date | null;
  now?: Date;
}): number {
  let score = 0;
  if (input.bio && input.bio.length >= 80) score += 15;
  else if (input.bio) score += 7;
  if (input.siteUrl) score += 5;
  if (input.whatsapp || input.telegram) score += 10;
  score += Math.min(input.packagesCount, 3) * 5; // до 15
  score += Math.min(input.photosCount, 20) * 2; // до 40
  // Свежесть: до 15 баллов, линейно сгорают за 90 дней без публикаций
  if (input.lastPublishedAt) {
    const now = input.now ?? new Date();
    const days = (now.getTime() - input.lastPublishedAt.getTime()) / 86_400_000;
    // Кламп обоих концов: будущий publishedAt (clock skew) не должен превысить кап 15.
    score += Math.min(15, Math.max(0, Math.round(15 * (1 - days / 90))));
  }
  return score; // максимум 100
}

// Единый include + производный тип строки — одна форма данных для карточек.
const CATALOG_INCLUDE = {
  user: { include: { subscription: true } },
  categories: { include: { category: true } },
  packages: { orderBy: { sortOrder: 'asc' } },
  photos: { where: { status: 'APPROVED' }, orderBy: { publishedAt: 'desc' }, take: 6 },
  _count: { select: { favoritedBy: true } },
} satisfies Prisma.PhotographerProfileInclude;

type CatalogRow = Prisma.PhotographerProfileGetPayload<{ include: typeof CATALOG_INCLUDE }>;

// Строки профилей → карточки (+ агрегат отзывов одним запросом). Общая сборка
// для основного списка и полки «Рекомендуемые».
async function toCards(shown: CatalogRow[]): Promise<CatalogCard[]> {
  // Публичный положительный сигнал вместо среднего 1–5: число рекомендаций
  // (отзывы rating≥4 & verified & VISIBLE). Низкие оценки в публичный сигнал не идут.
  const recAgg = shown.length
    ? await db.review.groupBy({
        by: ['profileId'],
        where: { profileId: { in: shown.map((p) => p.id) }, status: 'VISIBLE', rating: { gte: 4 }, verified: true },
        _count: true,
      })
    : [];
  const recMap = new Map(recAgg.map((r) => [r.profileId, r._count]));

  return shown.map((p) => ({
    username: p.username,
    verified: p.verified,
    avatarKey: p.avatarKey,
    firstName: p.user.firstName,
    lastName: p.user.lastName,
    bio: p.bio,
    categories: p.categories.map((c) => c.category.slug),
    // Цена — перк Active (пакеты цен). На FREE в карточке не показываем (как на профиле).
    minPackage: activeTier(p.user.subscription) !== 'FREE' && p.packages[0]
      ? { hours: p.packages[0].hours, priceMinor: p.packages[0].priceMinor, currency: p.packages[0].currency }
      : null,
    coverKey:
      (p.coverPhotoId && p.photos.find((ph) => ph.id === p.coverPhotoId)?.storageKey) ||
      p.photos[0]?.storageKey ||
      null,
    photoKeys: p.photos.map((ph) => ph.storageKey),
    recommendCount: recMap.get(p.id) ?? 0,
    saveCount: p._count.favoritedBy,
    score: p.ratingScore,
    tier: activeTier(p.user.subscription),
    doesVideo: p.doesVideo,
  } satisfies CatalogCard));
}

export async function catalogForCity(filters: CatalogFilters): Promise<CatalogPage> {
  const page = Math.max(1, filters.page ?? 1);

  const where = {
    status: 'APPROVED' as const,
    city: { slug: filters.citySlug },
    // Планка качества: в выдачу — только авторы с готовой работой (пустая карточка
    // без портфолио бьёт по первому впечатлению). Ниже — та же гарантия для полки.
    photos: { some: { status: 'APPROVED' as const } },
    ...(filters.categorySlug
      ? { categories: { some: { category: { slug: filters.categorySlug } } } }
      : {}),
    ...(filters.availableOn ? { busyDates: { none: { date: filters.availableOn } } } : {}),
    ...(filters.maxPackagePriceMinor != null
      ? { packages: { some: { priceMinor: { lte: filters.maxPackagePriceMinor } } } }
      : {}),
    ...(filters.videoOnly ? { doesVideo: true } : {}),
  };

  // MERIT-ONLY: порядок основной выдачи НЕ зависит от подписки (антиклассизм-
  // инвариант). proRank убран — он давал платным верх при равном ratingScore
  // (а на молодом каталоге он у всех ≈ равен). Буст подписки живёт ТОЛЬКО в
  // отдельной полке recommendedForCity. Tiebreaker — детерминированный id
  // (стабильная пагинация; не деньги). Ротацию равного merit — отдельным пунктом.
  //
  // Страница КАТЕГОРИИ (рейтинг v2, категория×город): сортировка по ЖАНРОВОМУ
  // скору (ProfileCategoryScore — engagement лайков фото этого жанра + общая
  // база) — специалист жанра выше генералиста с равным глобальным ratingScore.
  // Запрос идёт от таблицы скоров (профиль без строки скора = не пересчитан,
  // бэкфилл в сиде гарантирует покрытие). Город без категории — по ratingScore.
  if (filters.categorySlug) {
    const scoreRows = await db.profileCategoryScore.findMany({
      where: { category: { slug: filters.categorySlug }, profile: where },
      orderBy: [{ scoreMilli: 'desc' }, { profileId: 'asc' }],
      skip: (page - 1) * CATALOG_PAGE_SIZE,
      take: CATALOG_PAGE_SIZE + 1, // +1 для hasNext
      include: { profile: { include: CATALOG_INCLUDE } },
    });
    const hasNext = scoreRows.length > CATALOG_PAGE_SIZE;
    const cards = await toCards(scoreRows.slice(0, CATALOG_PAGE_SIZE).map((r) => r.profile));
    return { cards, page, hasNext };
  }

  const rows = await db.photographerProfile.findMany({
    where,
    orderBy: [{ ratingScore: 'desc' }, { id: 'asc' }],
    skip: (page - 1) * CATALOG_PAGE_SIZE,
    take: CATALOG_PAGE_SIZE + 1, // +1 для hasNext
    include: CATALOG_INCLUDE,
  });

  const hasNext = rows.length > CATALOG_PAGE_SIZE;
  const cards = await toCards(rows.slice(0, CATALOG_PAGE_SIZE));
  return { cards, page, hasNext };
}

// «Открыты для новых заказов»: полка — перк ТОЛЬКО Active+ (ELITE). Буст-видимость
// БЕЗ сдвига основного merit-списка (soft-hybrid). proRank>=ELITE_RANK — префильтр,
// точный статус — по activeTier (денорм может отставать от экспирации).
export async function recommendedForCity(citySlug: string, limit = 6): Promise<CatalogCard[]> {
  const rows = await db.photographerProfile.findMany({
    where: { status: 'APPROVED', city: { slug: citySlug }, proRank: { gte: ELITE_RANK }, photos: { some: { status: 'APPROVED' } } },
    orderBy: [{ ratingScore: 'desc' }, { id: 'asc' }],
    take: limit * 2, // запас под фильтр активных
    include: CATALOG_INCLUDE,
  });
  const active = rows.filter((p) => activeTier(p.user.subscription) === 'ELITE').slice(0, limit);
  return toCards(active);
}
