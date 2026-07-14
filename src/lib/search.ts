import { db } from '@/lib/db';
import { RU_CITIES } from '@/lib/geo-data';

// Поиск фотографов по имени/username/городу (пробел MyWed). PG ILIKE — для
// беты достаточно; при росте — full-text/внешний индекс (бэклог S6).
export interface SearchResult {
  username: string;
  firstName: string;
  lastName: string;
  citySlug: string;
  categories: string[];
  photoKeys: string[];
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

  return profiles.map((p) => ({
    username: p.username,
    firstName: p.user.firstName,
    lastName: p.user.lastName,
    citySlug: p.city.slug,
    categories: p.categories.map((c) => c.category.slug),
    photoKeys: p.photos.map((ph) => ph.storageKey),
  }));
}
