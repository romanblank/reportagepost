import { describe, expect, it, vi } from 'vitest';
import { guardParsed, buildReason, parseBriefHeuristic, parseBriefText } from '@/lib/matching';
import { llmComplete } from '@/lib/ai-gpt';
import type { CatalogCard } from '@/lib/catalog';

vi.mock('@/lib/ai-gpt', () => ({ llmComplete: vi.fn() }));

describe('matching.parseBriefText — гибрид эвристика + LLM-фолбэк', () => {
  it('ясный бриф — LLM НЕ вызывается (эвристика нашла всё)', async () => {
    vi.mocked(llmComplete).mockClear();
    const p = await parseBriefText('концерт в москве');
    expect(p.citySlug).toBe('moscow');
    expect(p.categorySlug).toBe('concerts-festivals');
    expect(llmComplete).not.toHaveBeenCalled();
  });

  it('пробел жанра → LLM заполняет; город из эвристики приоритетен', async () => {
    vi.mocked(llmComplete).mockClear();
    // «файтинг» нет в словаре → жанр пуст → зовём LLM; LLM «ошибается» с городом
    vi.mocked(llmComplete).mockResolvedValue('{"city":"Казань","category":"спорт","budgetRub":null}');
    const p = await parseBriefText('в москве нужен на файтинг-ивент');
    expect(llmComplete).toHaveBeenCalledTimes(1);
    expect(p.citySlug).toBe('moscow'); // эвристика приоритетна
    expect(p.categorySlug).toBe('sports'); // из LLM, провалидировано guard'ом
  });

  it('LLM недоступен (null) → чистая эвристика, не падаем', async () => {
    vi.mocked(llmComplete).mockResolvedValue(null);
    const p = await parseBriefText('съёмка непонятночего');
    expect(p).toEqual({});
  });
});

// Эвристический разбор брифа — без внешнего ИИ (город/жанр/бюджет из словаря).
describe('matching.parseBriefHeuristic — разбор без ИИ', () => {
  it('техно-фестиваль в Петербурге, до 40к', () => {
    const p = parseBriefHeuristic('Нужен на техно-фестиваль в Петербурге, бюджет до 40к, ночь');
    expect(p.citySlug).toBe('saint-petersburg');
    expect(p.categorySlug).toBe('concerts-festivals');
    expect(p.maxBudgetMinor).toBe(4_000_000);
  });

  it('конференция в Москве до 30 000 ₽', () => {
    const p = parseBriefHeuristic('конференция в москве, бюджет 30 000 ₽');
    expect(p.citySlug).toBe('moscow');
    expect(p.categorySlug).toBe('business-events');
    expect(p.maxBudgetMinor).toBe(3_000_000);
  });

  it('короткие формы «мск» + жанр спорт', () => {
    const p = parseBriefHeuristic('мск, нужен на спортивный турнир');
    expect(p.citySlug).toBe('moscow');
    expect(p.categorySlug).toBe('sports');
  });

  it('только жанр, без города/бюджета', () => {
    const p = parseBriefHeuristic('фотограф на свадьбу');
    expect(p.categorySlug).toBe('private-events');
    expect(p.citySlug).toBeUndefined();
    expect(p.maxBudgetMinor).toBeUndefined();
  });

  it('пустой/короткий — {}', () => {
    expect(parseBriefHeuristic('  ')).toEqual({});
  });
});

// Guard разбора LLM (правило: вывод модели валидируется, не применяется напрямую).
describe('matching.guardParsed — валидация вывода LLM', () => {
  it('маппит город/категорию/бюджет из корректного JSON', () => {
    const p = guardParsed('{"city":"Санкт-Петербург","category":"концерты и фестивали","budgetRub":40000}');
    expect(p.citySlug).toBe('saint-petersburg');
    expect(p.categorySlug).toBe('concerts-festivals');
    expect(p.maxBudgetMinor).toBe(4_000_000);
  });

  it('нечёткий город («питер»/«мск») и мусор вокруг JSON', () => {
    const p = guardParsed('Вот результат: {"city":"Москва","category":null,"budgetRub":null} — готово');
    expect(p.citySlug).toBe('moscow');
    expect(p.categorySlug).toBeUndefined();
    expect(p.maxBudgetMinor).toBeUndefined();
  });

  it('невалидный/несуществующий — игнорируется, не падает', () => {
    expect(guardParsed('не json вообще')).toEqual({});
    expect(guardParsed('{"city":"Атлантида","category":"свадьба","budgetRub":-5}')).toEqual({});
    expect(guardParsed('{"budgetRub":"дорого"}')).toEqual({});
  });
});

describe('matching.buildReason — честное обоснование из фактов', () => {
  const card: CatalogCard = {
    username: 'ivan', firstName: 'Иван', lastName: 'Петров', avatarKey: null, coverKey: null,
    categories: ['concerts-festivals'], minPackage: { hours: 3, priceMinor: 1_500_000 },
    tier: 'FREE', verified: false, recommendCount: 3, saveCount: 0,
  } as CatalogCard;

  it('отражает жанр/город/рекомендации/дату/бюджет', () => {
    const r = buildReason({ citySlug: 'moscow', categorySlug: 'concerts-festivals', date: new Date('2026-08-01'), maxBudgetMinor: 2_000_000 }, card);
    expect(r.toLowerCase()).toContain('концерты');
    expect(r).toContain('Москв');
    expect(r).toContain('рекомендаци');
    expect(r).toContain('дату');
    expect(r).toContain('бюджет');
    expect(r[0]).toBe(r[0].toUpperCase());
  });
});
