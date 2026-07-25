import { afterAll, describe, expect, it } from 'vitest';
import 'dotenv/config'; // @/lib/catalog → @/lib/db требует DATABASE_URL при импорте
import { completenessScore } from '@/lib/catalog';

const hasDb = Boolean(process.env.DATABASE_URL);
const now = new Date('2026-07-13T12:00:00Z');

// Антиклассизм-инвариант: подписка НЕ двигает порядок ОСНОВНОЙ выдачи каталога.
describe.skipIf(!hasDb)('catalog: инвариант — подписка не двигает merit-порядок (БД)', () => {
  const ids: string[] = [];
  afterAll(async () => {
    const { db } = await import('@/lib/db');
    await db.subscription.deleteMany({ where: { userId: { in: ids } } });
    await db.profileCategory.deleteMany({ where: { profile: { userId: { in: ids } } } });
    await db.photographerProfile.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
  });

  it('грант подписки одному из двух равных по merit не меняет их порядок', async () => {
    const { db } = await import('@/lib/db');
    const { catalogForCity } = await import('@/lib/catalog');
    const { grantFoundingSub } = await import('@/lib/subscription');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    // Оба — равный ВЫСОКИЙ ratingScore (гарантированно на 1-й странице, вверху, tie)
    const mk = async (n: string) => {
      const u = await db.user.create({ data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: n, lastName: 'Инв', email: `inv-${n}-${stamp}@test.local` } });
      ids.push(u.id);
      const p = await db.photographerProfile.create({ data: { userId: u.id, username: `inv-${n}-${stamp}`, cityId: city.id, status: 'APPROVED', ratingScore: 9_000_000 } });
      return p.username;
    };
    const ua = await mk('a');
    const ub = await mk('b');

    const orderOf = (cards: { username: string }[]) => cards.map((c) => c.username).filter((x) => x === ua || x === ub);
    const before = orderOf((await catalogForCity({ citySlug: 'moscow' })).cards);
    expect(before).toHaveLength(2); // оба на первой странице

    // грант Active одному — proRank поднимается
    await grantFoundingSub(ids[1], 'moscow', 'PRIME');
    const after = orderOf((await catalogForCity({ citySlug: 'moscow' })).cards);

    expect(after).toEqual(before); // порядок НЕ изменился — подписка не двигает merit
  });
});

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
