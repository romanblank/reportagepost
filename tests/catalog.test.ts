import { describe, expect, it } from 'vitest';
import 'dotenv/config'; // @/lib/catalog → @/lib/db требует DATABASE_URL при импорте
import { completenessScore } from '@/lib/catalog';

const now = new Date('2026-07-13T12:00:00Z');

describe('catalog: ранжирование v1 (полнота + свежесть)', () => {
  it('пустой профиль — низкий балл, полный — высокий', () => {
    const empty = completenessScore({
      bio: null, siteUrl: null, whatsapp: null, telegram: null,
      packagesCount: 0, photosCount: 0, lastPublishedAt: null, now,
    });
    const full = completenessScore({
      bio: 'Развёрнутое описание опыта репортажной съёмки длиннее восьмидесяти символов, честно.',
      siteUrl: 'https://x.ru', whatsapp: '+79990000000', telegram: 'user',
      packagesCount: 3, photosCount: 20, lastPublishedAt: now, now,
    });
    expect(empty).toBe(0);
    expect(full).toBe(100);
    expect(full).toBeGreaterThan(empty);
  });

  it('свежесть сгорает: публикация 90+ дней назад не даёт баллов', () => {
    const base = {
      bio: null, siteUrl: null, whatsapp: null, telegram: null,
      packagesCount: 0, photosCount: 0, now,
    };
    const fresh = completenessScore({ ...base, lastPublishedAt: now });
    const stale = completenessScore({
      ...base,
      lastPublishedAt: new Date(now.getTime() - 100 * 86_400_000),
    });
    expect(fresh).toBe(15);
    expect(stale).toBe(0);
  });
});
