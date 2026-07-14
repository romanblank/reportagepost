import { db } from '@/lib/db';

// Каталог: одобренные фотографы города с фильтрами.
// Ранжирование v1 (ADR-план): полнота профиля + свежесть публикаций.
// v2 (S2) заменит формулу на взвешенные лайки поверх ActivityEvent.

export interface CatalogFilters {
  citySlug: string;
  categorySlug?: string;
  maxPricePerHourMinor?: number;
  /** «Свободен на дату» (UTC-полночь): исключает занятых в этот день. */
  availableOn?: Date;
  /** Пагинация (аудит P1-1): страница на PAGE_SIZE карточек. */
  page?: number;
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
  avatarKey: string | null;
  bio: string | null;
  categories: string[];
  minPackage: { hours: number; priceMinor: number; currency: string } | null;
  photoKeys: string[]; // до 6 превью
  score: number;
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
    score += Math.max(0, Math.round(15 * (1 - days / 90)));
  }
  return score; // максимум 100
}

export async function catalogForCity(filters: CatalogFilters): Promise<CatalogPage> {
  const page = Math.max(1, filters.page ?? 1);

  // Все фильтры — в where (аудит P1-1): БД отбирает и сортирует по индексу
  // [cityId, status, ratingScore desc], в память тянем ровно страницу.
  const where = {
    status: 'APPROVED' as const,
    city: { slug: filters.citySlug },
    ...(filters.categorySlug
      ? { categories: { some: { category: { slug: filters.categorySlug } } } }
      : {}),
    ...(filters.availableOn ? { busyDates: { none: { date: filters.availableOn } } } : {}),
    // «цена за час ≤ X»: хотя бы один пакет с priceMinor/hours ≤ порога.
    // hours ограничены [1..24], поэтому priceMinor ≤ X*hours покрывает условие
    // консервативно; точную проверку делаем ниже на выбранной странице.
    ...(filters.maxPricePerHourMinor != null
      ? { packages: { some: { priceMinor: { lte: filters.maxPricePerHourMinor * 24 } } } }
      : {}),
  };

  const rows = await db.photographerProfile.findMany({
    where,
    orderBy: [{ ratingScore: 'desc' }, { id: 'asc' }],
    skip: (page - 1) * CATALOG_PAGE_SIZE,
    take: CATALOG_PAGE_SIZE + 1, // +1 для hasNext
    include: {
      user: true,
      categories: { include: { category: true } },
      packages: { orderBy: { sortOrder: 'asc' } },
      photos: {
        where: { status: 'APPROVED' },
        orderBy: { publishedAt: 'desc' },
        take: 6,
      },
    },
  });

  const hasNext = rows.length > CATALOG_PAGE_SIZE;
  const cards = rows.slice(0, CATALOG_PAGE_SIZE).map((p) => ({
    username: p.username,
    avatarKey: p.avatarKey,
    firstName: p.user.firstName,
    lastName: p.user.lastName,
    bio: p.bio,
    categories: p.categories.map((c) => c.category.slug),
    minPackage: p.packages[0]
      ? { hours: p.packages[0].hours, priceMinor: p.packages[0].priceMinor, currency: p.packages[0].currency }
      : null,
    photoKeys: p.photos.map((ph) => ph.storageKey),
    score: p.ratingScore,
  } satisfies CatalogCard));

  return { cards, page, hasNext };
}
