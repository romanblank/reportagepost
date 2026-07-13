// Категории репортажной съёмки (утверждены оператором 2026-07-13: 6 базовых).
// slug — для ЧПУ и фильтров; nameRu — отображение (локаль ru).
export interface CategorySeed {
  slug: string;
  nameRu: string;
  sortOrder: number;
}

export const CATEGORIES: CategorySeed[] = [
  { slug: 'business-events', nameRu: 'Деловые события', sortOrder: 10 },
  { slug: 'corporate', nameRu: 'Корпоративы', sortOrder: 20 },
  { slug: 'concerts-festivals', nameRu: 'Концерты и фестивали', sortOrder: 30 },
  { slug: 'sports', nameRu: 'Спорт', sortOrder: 40 },
  { slug: 'private-events', nameRu: 'Частные события', sortOrder: 50 },
  { slug: 'street-city', nameRu: 'Город и уличный репортаж', sortOrder: 60 },
];

const bySlug = new Map(CATEGORIES.map((c) => [c.slug, c]));

export function categoryNameRu(slug: string): string {
  return bySlug.get(slug)?.nameRu ?? slug;
}
