import type { MetadataRoute } from 'next';
import { db } from '@/lib/db';
import { sitemapEntries, type SitemapCity } from '@/lib/sitemap';

// force-dynamic: sitemap лезет в БД — иначе пререндер в Docker-билде без
// DATABASE_URL падает (урок 2026-07-14, как /ru/community).
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [grouped, profiles] = await Promise.all([
    db.photographerProfile.groupBy({
      by: ['cityId'],
      where: { status: 'APPROVED' },
      _count: true,
    }),
    db.photographerProfile.findMany({
      where: { status: 'APPROVED' },
      select: { username: true, createdAt: true },
    }),
  ]);

  const cityIds = grouped.map((g) => g.cityId);
  const cityRows = cityIds.length
    ? await db.city.findMany({ where: { id: { in: cityIds } }, select: { id: true, slug: true } })
    : [];
  const slugById = new Map(cityRows.map((c) => [c.id, c.slug]));

  const cities: SitemapCity[] = grouped
    .map((g) => ({ slug: slugById.get(g.cityId) ?? '', approvedCount: g._count }))
    .filter((c) => c.slug);

  return sitemapEntries(
    cities,
    profiles.map((p) => ({ username: p.username, lastMod: p.createdAt })),
    new Date(),
  );
}
