import { db } from '@/lib/db';
import { RU_CITIES } from '@/lib/geo-data';

// Поиск фотографов по имени/username/городу (пробел MyWed). PG ILIKE — для
// беты достаточно; при росте — full-text/внешний индекс (бэклог S6).
export interface SearchResult {
  username: string;
  firstName: string;
  lastName: string;
  verified: boolean;
  avatarKey: string | null;
  citySlug: string;
  categories: string[];
  photoKeys: string[];
  ratingAvg: number;
  ratingCount: number;
}

export async function searchPhotographers(query: string, limit = 24): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  // Города, чьё русское имя содержит запрос (nameKey в БД — латинский slug)
  const citySlugs = RU_CITIES
    .filter((c) => c.nameRu.toLowerCase().includes(q.toLowerCase()))
    .map((c) => c.slug);

  const profiles = await db.photographerProfile.findMany({
    where: {
      status: 'APPROVED',
      photos: { some: { status: 'APPROVED' } }, // планка: в поиске только с готовой работой (как каталог)
      OR: [
        { username: { contains: q, mode: 'insensitive' } },
        { user: { firstName: { contains: q, mode: 'insensitive' } } },
        { user: { lastName: { contains: q, mode: 'insensitive' } } },
        ...(citySlugs.length > 0 ? [{ city: { slug: { in: citySlugs } } }] : []),
      ],
    },
    orderBy: { ratingScore: 'desc' },
    take: limit,
    include: {
      user: { select: { firstName: true, lastName: true } },
      city: true,
      categories: { include: { category: true } },
      photos: { where: { status: 'APPROVED' }, orderBy: { publishedAt: 'desc' }, take: 3 },
    },
  });

  const revAgg = profiles.length
    ? await db.review.groupBy({
        by: ['profileId'],
        where: { profileId: { in: profiles.map((p) => p.id) }, status: 'VISIBLE' },
        _avg: { rating: true },
        _count: true,
      })
    : [];
  const revMap = new Map(revAgg.map((r) => [r.profileId, { avg: r._avg.rating ?? 0, count: r._count }]));

  return profiles.map((p) => ({
    username: p.username,
    firstName: p.user.firstName,
    lastName: p.user.lastName,
    verified: p.verified,
    avatarKey: p.avatarKey,
    citySlug: p.city.slug,
    categories: p.categories.map((c) => c.category.slug),
    photoKeys: p.photos.map((ph) => ph.storageKey),
    ratingAvg: revMap.get(p.id)?.avg ?? 0,
    ratingCount: revMap.get(p.id)?.count ?? 0,
  }));
}
