import { describe, expect, it } from 'vitest';
import { applyGuard, premoderate } from '@/lib/premoderation';

describe('premoderation guard: санитайз недоверенного вывода модели', () => {
  it('клампит оценки вне [0,1]', () => {
    const v = applyGuard({ nsfwScore: 5, offTopicScore: -3, labels: [] });
    expect(v.nsfw).toBe(1);
    expect(v.offTopic).toBe(0);
  });

  it('NaN/Infinity → 0 (не доверяем мусору)', () => {
    const v = applyGuard({ nsfwScore: Number.NaN, offTopicScore: Number.POSITIVE_INFINITY, labels: [] });
    expect(v.nsfw).toBe(0);
    expect(v.offTopic).toBe(0);
  });

  it('пороги: высокий NSFW → reject; средний → review; высокий офф-топик → review; чистое → ok', () => {
    expect(applyGuard({ nsfwScore: 0.9, offTopicScore: 0 }).recommend).toBe('reject');
    expect(applyGuard({ nsfwScore: 0.6, offTopicScore: 0 }).recommend).toBe('review');
    expect(applyGuard({ nsfwScore: 0.1, offTopicScore: 0.7 }).recommend).toBe('review');
    expect(applyGuard({ nsfwScore: 0.1, offTopicScore: 0.1 }).recommend).toBe('ok');
  });

  it('битый/непарсибельный вывод → fail-safe review, без исключения', () => {
    expect(applyGuard({ nsfwScore: 'высокий' }).recommend).toBe('review');
    expect(applyGuard(null).recommend).toBe('review');
    expect(applyGuard({}).recommend).toBe('review');
    expect(applyGuard('garbage').recommend).toBe('review');
  });

  it('санитайз меток: спецсимволы вычищаются, длина и число ограничены', () => {
    const v = applyGuard({
      nsfwScore: 0, offTopicScore: 0,
      labels: ['<script>alert(1)</script>', 'a'.repeat(100), ...Array.from({ length: 20 }, (_, i) => `метка${i}`)],
    });
    expect(v.labels.length).toBeLessThanOrEqual(10);
    expect(v.labels.every((l) => !/[<>]/.test(l))).toBe(true);
    expect(v.labels.every((l) => l.length <= 40)).toBe(true);
  });

  it('premoderate без ключа модели → null (тихий no-op, ручная модерация)', async () => {
    const prev = process.env.PREMODERATION_API_KEY;
    delete process.env.PREMODERATION_API_KEY;
    expect(await premoderate(Buffer.from('x'))).toBeNull();
    if (prev !== undefined) process.env.PREMODERATION_API_KEY = prev;
  });
});
