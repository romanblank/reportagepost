import type { MetadataRoute } from 'next';
import { APP_DOMAIN } from '@/lib/constants';

// Билдер sitemap (SEO-каркас S1). Чистая функция от данных — тестируемо без БД.
// ИНВАРИАНТ закрытости: сам sitemap генерируется, но до S4 robots.txt запрещает
// обход (PUBLIC_LAUNCH=false), и в вебмастер он не подаётся. В карту попадают
// ТОЛЬКО публично-валидные сущности (активные города, APPROVED-профили).

export interface SitemapCity {
  slug: string;
  approvedCount: number; // сколько APPROVED-фотографов — пустые города не индексируем
}

export interface SitemapProfile {
  username: string;
  lastMod: Date;
}

export const BASE_URL = `https://${APP_DOMAIN}`;

export function sitemapEntries(
  cities: SitemapCity[],
  profiles: SitemapProfile[],
  now: Date,
): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${BASE_URL}/ru/photo`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE_URL}/ru/russia`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
  ];

  for (const c of cities) {
    if (c.approvedCount <= 0) continue; // пустой город — не в карту
    entries.push({
      url: `${BASE_URL}/ru/russia/${c.slug}`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.7,
    });
  }

  for (const p of profiles) {
    entries.push({
      url: `${BASE_URL}/ru/photographer/${p.username}`,
      lastModified: p.lastMod,
      changeFrequency: 'weekly',
      priority: 0.6,
    });
  }

  return entries;
}
