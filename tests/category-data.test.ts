import { describe, expect, it } from 'vitest';
import { CATEGORIES, categoryNameRu } from '@/lib/category-data';

describe('category-data', () => {
  it('6 базовых категорий, слаги уникальны и в ЧПУ-формате', () => {
    expect(CATEGORIES).toHaveLength(6);
    const slugs = CATEGORIES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(6);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9-]+$/);
  });

  it('имя категории резолвится с честным фолбэком', () => {
    expect(categoryNameRu('sports')).toBe('Спорт');
    expect(categoryNameRu('nope')).toBe('nope');
  });
});
