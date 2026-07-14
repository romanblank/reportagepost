import { BASE_URL } from '@/lib/sitemap';

// JSON-LD микроразметка (SEO-каркас S1). Чистые билдеры — тестируемо.
// ИНВАРИАНТ: aggregateRating НЕ включаем до публичного запуска (S4) — не палим
// рейтинги/метрики закрытой платформы. Добавить в S4 вместе со снятием noindex.

export interface PersonLdInput {
  firstName: string;
  lastName: string;
  username: string;
  cityName: string;
  categories: string[];
  imageUrls: string[]; // абсолютные URL превью (до 5)
  bio?: string | null;
}

export function personLd(p: PersonLdInput): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: `${p.firstName} ${p.lastName}`.trim(),
    jobTitle: 'Репортажный фотограф',
    knowsAbout: p.categories,
    address: { '@type': 'PostalAddress', addressLocality: p.cityName, addressCountry: 'RU' },
    url: `${BASE_URL}/ru/photographer/${p.username}`,
    ...(p.bio ? { description: p.bio } : {}),
    ...(p.imageUrls.length ? { image: p.imageUrls.slice(0, 5) } : {}),
  };
}

export interface CatalogLdItem {
  username: string;
  name: string;
}

export function catalogItemListLd(cityName: string, items: CatalogLdItem[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Репортажные фотографы — ${cityName}`,
    numberOfItems: items.length,
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${BASE_URL}/ru/photographer/${it.username}`,
      name: it.name,
    })),
  };
}
