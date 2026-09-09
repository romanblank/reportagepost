import { describe, expect, it } from 'vitest';
import { CATEGORIES, categoryNameRu } from '@/lib/category-data';

describe('category-data', () => {
  it('11 жанров (партнёр 2026-08-18), слаги уникальны и в ЧПУ-формате', () => {
    expect(CATEGORIES).toHaveLength(11);
    const slugs = CATEGORIES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(11);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9-]+$/);
    // Слаги исходной шестёрки сохранены: это URL каталога и ссылки
    for (const old of ['business-events', 'corporate', 'concerts-festivals', 'sports', 'private-events', 'street-city']) {
      expect(slugs).toContain(old);
    }
  });

  it('имя категории резолвится с честным фолбэком', () => {
    expect(categoryNameRu('sports')).toBe('Спортивный репортаж');
    expect(categoryNameRu('nope')).toBe('nope');
  });
});
