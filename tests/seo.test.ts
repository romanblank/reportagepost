import { describe, expect, it } from 'vitest';
import { sitemapEntries, BASE_URL } from '@/lib/sitemap';
import { personLd, catalogItemListLd } from '@/lib/structured-data';

describe('sitemap: билдер (чистая функция)', () => {
  const now = new Date('2026-07-14T00:00:00Z');

  it('включает статические + непустые города + профили; пустой город пропускает', () => {
    const entries = sitemapEntries(
      [
        { slug: 'moscow', approvedCount: 3 },
        { slug: 'perm', approvedCount: 0 }, // пустой — не в карту
      ],
      [{ username: 'ivan-petrov', lastMod: now }],
      now,
    );
    const urls = entries.map((e) => e.url);
    expect(urls).toContain(`${BASE_URL}/`);
    expect(urls).toContain(`${BASE_URL}/ru/russia`);
    expect(urls).toContain(`${BASE_URL}/ru/russia/moscow`);
    expect(urls).toContain(`${BASE_URL}/ru/photographer/ivan-petrov`);
    expect(urls).not.toContain(`${BASE_URL}/ru/russia/perm`); // пустой город
  });

  it('lastModified профиля берётся из его lastMod', () => {
    const d = new Date('2026-01-02T03:04:05Z');
    const entries = sitemapEntries([], [{ username: 'a', lastMod: d }], now);
    const profileEntry = entries.find((e) => e.url.endsWith('/photographer/a'));
    expect(profileEntry?.lastModified).toBe(d);
  });
});

describe('structured-data: JSON-LD билдеры', () => {
  it('Person: базовые поля, город, БЕЗ aggregateRating (инвариант до S4)', () => {
    const ld = personLd({
      firstName: 'Иван', lastName: 'Петров', username: 'ivan-petrov',
      cityName: 'Москва', categories: ['Спорт'], imageUrls: ['https://x/1.jpg'], bio: 'о себе',
    });
    expect(ld['@type']).toBe('Person');
    expect(ld.name).toBe('Иван Петров');
    expect((ld.address as Record<string, unknown>).addressLocality).toBe('Москва');
    expect(ld.url).toBe(`${BASE_URL}/ru/photographer/ivan-petrov`);
    expect(ld).not.toHaveProperty('aggregateRating'); // не палим рейтинг до запуска
  });

  it('Person: image опускается при отсутствии фото; description при отсутствии bio', () => {
    const ld = personLd({
      firstName: 'А', lastName: 'Б', username: 'ab', cityName: 'Пермь',
      categories: [], imageUrls: [], bio: null,
    });
    expect(ld).not.toHaveProperty('image');
    expect(ld).not.toHaveProperty('description');
  });

  it('ItemList: позиции 1..N и корректные URL', () => {
    const ld = catalogItemListLd('Москва', [
      { username: 'a', name: 'А А' },
      { username: 'b', name: 'Б Б' },
    ]);
    expect(ld['@type']).toBe('ItemList');
    expect(ld.numberOfItems).toBe(2);
    const items = ld.itemListElement as Array<Record<string, unknown>>;
    expect(items[0].position).toBe(1);
    expect(items[1].url).toBe(`${BASE_URL}/ru/photographer/b`);
  });
});
