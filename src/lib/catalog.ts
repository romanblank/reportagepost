import { db } from '@/lib/db';

// Каталог: одобренные фотографы города с фильтрами.
// Ранжирование v1 (ADR-план): полнота профиля + свежесть публикаций.
// v2 (S2) заменит формулу на взвешенные лайки поверх ActivityEvent.

export interface CatalogFilters {
  citySlug: string;
  categorySlug?: string;
  maxPricePerHourMinor?: number;
}

export interface CatalogCard {
  username: string;
  firstName: string;
  lastName: string;
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

export async function catalogForCity(filters: CatalogFilters): Promise<CatalogCard[]> {
  const profiles = await db.photographerProfile.findMany({
    where: {
      status: 'APPROVED',
      city: { slug: filters.citySlug },
      ...(filters.categorySlug
        ? { categories: { some: { category: { slug: filters.categorySlug } } } }
        : {}),
    },
    include: {
      user: true,
      categories: { include: { category: true } },
      packages: { orderBy: { sortOrder: 'asc' } },
      photos: {
        where: { status: 'APPROVED' },
        orderBy: { publishedAt: 'desc' },
        take: 20,
      },
    },
  });

  const cards = profiles
    .map((p) => {
      const cheapestPerHour = p.packages.length
        ? Math.min(...p.packages.map((pkg) => pkg.priceMinor / pkg.hours))
        : null;
      if (
        filters.maxPricePerHourMinor != null &&
        cheapestPerHour != null &&
        cheapestPerHour > filters.maxPricePerHourMinor
      ) {
        return null;
      }
      return {
        username: p.username,
        firstName: p.user.firstName,
        lastName: p.user.lastName,
        bio: p.bio,
        categories: p.categories.map((c) => c.category.slug),
        minPackage: p.packages[0]
          ? {
              hours: p.packages[0].hours,
              priceMinor: p.packages[0].priceMinor,
              currency: p.packages[0].currency,
            }
          : null,
        photoKeys: p.photos.slice(0, 6).map((ph) => ph.storageKey),
        // v2: денормализованный рейтинг (взвешенные лайки со сгоранием + полнота),
        // пересчитывается recomputeRatings; live-фолбэк полноты для только что
        // одобренных — в самом ratingScore при approve
        score: p.ratingScore,
      } satisfies CatalogCard;
    })
    .filter((c): c is CatalogCard => c !== null);

  return cards.sort((a, b) => b.score - a.score);
}
