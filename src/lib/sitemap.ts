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

// Комбо «город × категория» с ≥1 APPROVED-фотографом (пустые не индексируем).
export interface SitemapCityCategory {
  citySlug: string;
  categorySlug: string;
}

export const BASE_URL = `https://${APP_DOMAIN}`;

/** Тема форума: адрес и время последнего сообщения. */
export type SitemapThread = { section: string; slug: string; lastMod: Date };
export type SitemapArticle = { slug: string; lastMod: Date };

export function sitemapEntries(
  cities: SitemapCity[],
  profiles: SitemapProfile[],
  now: Date,
  cityCategories: SitemapCityCategory[] = [],
  threads: SitemapThread[] = [],
  forumSections: string[] = [],
  articles: SitemapArticle[] = [],
): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [
    { url: `${BASE_URL}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${BASE_URL}/ru/photo`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE_URL}/ru/russia`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    // Журнал — отдельный редакционный раздел со своим содержимым; в карте его
    // не было вовсе, хотя он задуман как самостоятельная точка входа
    { url: `${BASE_URL}/ru/journal`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
  ];

  // Форум — то, ради чего у платформы вообще появляется содержимое, которое
  // растёт без нашего участия: разделы и каждая тема отдельной страницей
  entries.push({ url: `${BASE_URL}/ru/forum`, lastModified: now, changeFrequency: 'daily', priority: 0.7 });
  for (const section of forumSections) {
    entries.push({
      url: `${BASE_URL}/ru/forum/${section}`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.6,
    });
  }
  for (const t of threads) {
    entries.push({
      url: `${BASE_URL}/ru/forum/${t.section}/${t.slug}`,
      lastModified: t.lastMod,
      changeFrequency: 'weekly',
      priority: 0.5,
    });
  }

  for (const a of articles) {
    entries.push({
      url: `${BASE_URL}/ru/journal/${a.slug}`,
      lastModified: a.lastMod,
      changeFrequency: 'monthly',
      priority: 0.6,
    });
  }

  for (const c of cities) {
    if (c.approvedCount <= 0) continue; // пустой город — не в карту
    entries.push({
      url: `${BASE_URL}/ru/russia/${c.slug}`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.7,
    });
  }

  for (const cc of cityCategories) {
    entries.push({
      url: `${BASE_URL}/ru/russia/${cc.citySlug}/${cc.categorySlug}`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.65,
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
