import { describe, expect, it } from 'vitest';
import { RU_CITIES, cityNameRu } from '@/lib/geo-data';

describe('geo-data', () => {
  it('слаги городов уникальны и в ЧПУ-формате', () => {
    const slugs = RU_CITIES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9-]+$/);
  });

  it('города посева — Москва и СПб', () => {
    const active = RU_CITIES.filter((c) => c.active).map((c) => c.slug);
    expect(active.sort()).toEqual(['moscow', 'saint-petersburg']);
  });

  it('имя города резолвится', () => {
    expect(cityNameRu('moscow')).toBe('Москва');
    expect(cityNameRu('unknown-slug')).toBe('unknown-slug'); // честный фолбэк
  });
});
