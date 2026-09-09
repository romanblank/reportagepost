// Жанры репортажной съёмки. Список расширен 6 → 11 по решению партнёра
// (2026-08-18): репортажный фотограф как правило универсален, и узкая тройка
// жанров резала настоящую практику.
//
// Слаги у шести исходных жанров НЕ переименованы сознательно: слаг — это URL
// каталога, ссылки и тесты, а партнёр менял НАЗВАНИЯ. Отображаемое имя живёт
// здесь и правится свободно; слаг — технический идентификатор.
export interface CategorySeed {
  slug: string;
  nameRu: string;
  sortOrder: number;
}

export const CATEGORIES: CategorySeed[] = [
  { slug: 'news', nameRu: 'Новостной репортаж', sortOrder: 10 },
  { slug: 'business-events', nameRu: 'Событийный репортаж', sortOrder: 20 },
  { slug: 'documentary', nameRu: 'Документальная съёмка', sortOrder: 30 },
  { slug: 'corporate', nameRu: 'Корпоративный репортаж', sortOrder: 40 },
  { slug: 'sports', nameRu: 'Спортивный репортаж', sortOrder: 50 },
  { slug: 'theatre', nameRu: 'Театральная съёмка', sortOrder: 60 },
  { slug: 'concerts-festivals', nameRu: 'Концертная съёмка', sortOrder: 70 },
  { slug: 'street-city', nameRu: 'Уличная съёмка', sortOrder: 80 },
  { slug: 'business-portrait', nameRu: 'Деловой портрет', sortOrder: 90 },
  { slug: 'private-events', nameRu: 'Съёмка мероприятий', sortOrder: 100 },
  { slug: 'industrial', nameRu: 'Индустриальная съёмка', sortOrder: 110 },
];

const bySlug = new Map(CATEGORIES.map((c) => [c.slug, c]));

export function categoryNameRu(slug: string): string {
  return bySlug.get(slug)?.nameRu ?? slug;
}
