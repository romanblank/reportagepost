import type { MetadataRoute } from 'next';
import { db } from '@/lib/db';
import { sitemapEntries, type SitemapCity, type SitemapCityCategory } from '@/lib/sitemap';
import { forumSectionSlugs } from '@/lib/forum-sections';

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

  // Комбо город × категория с ≥1 APPROVED — непустые SEO-страницы каталога.
  const catRows = await db.profileCategory.findMany({
    where: { profile: { status: 'APPROVED' } },
    select: { category: { select: { slug: true } }, profile: { select: { city: { select: { slug: true } } } } },
  });
  const comboSet = new Set<string>();
  const cityCategories: SitemapCityCategory[] = [];
  for (const r of catRows) {
    const key = `${r.profile.city.slug}/${r.category.slug}`;
    if (comboSet.has(key)) continue;
    comboSet.add(key);
    cityCategories.push({ citySlug: r.profile.city.slug, categorySlug: r.category.slug });
  }

  // Темы форума: каждая — отдельная страница с содержимым, которого нет
  // больше нигде. Ради этого форум и заводился
  const articles = await db.article.findMany({
    where: { status: 'PUBLISHED', publishedAt: { not: null } },
    select: { slug: true, publishedAt: true },
    orderBy: { publishedAt: 'desc' },
    take: 2000,
  });

  const threads = await db.forumThread.findMany({
    where: { status: 'PUBLISHED' },
    select: { sectionSlug: true, slug: true, lastPostAt: true },
    orderBy: { lastPostAt: 'desc' },
    take: 5000,
  });

  return sitemapEntries(
    cities,
    profiles.map((p) => ({ username: p.username, lastMod: p.createdAt })),
    new Date(),
    cityCategories,
    threads.map((t) => ({ section: t.sectionSlug, slug: t.slug, lastMod: t.lastPostAt })),
    forumSectionSlugs(),
    articles.map((a) => ({ slug: a.slug, lastMod: a.publishedAt as Date })),
  );
}
