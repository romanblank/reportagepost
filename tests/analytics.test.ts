import { describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('analytics: статистика + трекинг просмотров + рекомендуемые (БД)', () => {
  it('recordProfileView/viewedRecently/photographerStats/recommendedForCity', async () => {
    const { db } = await import('@/lib/db');
    const { photographerStats, recordProfileView, viewedRecently } = await import('@/lib/analytics');
    const { recommendedForCity } = await import('@/lib/catalog');
    const { grantFoundingSub } = await import('@/lib/subscription');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const owner = await db.user.create({ data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'А', lastName: 'Н', email: `an-${stamp}@test.local` } });
    const viewer = await db.user.create({ data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'К', lastName: 'Л', email: `kl-${stamp}@test.local` } });
    const profile = await db.photographerProfile.create({ data: { userId: owner.id, username: `an-${stamp}`, cityId: city.id, status: 'APPROVED' } });

    // просмотры: аноним + авторизованный → views растёт; дедуп по актору
    await recordProfileView(profile.id, null);
    await recordProfileView(profile.id, viewer.id);
    expect(await viewedRecently(profile.id, viewer.id)).toBe(true);
    expect(await viewedRecently(profile.id, owner.id)).toBe(false);

    // вовлечённость
    await db.favoritePhotographer.create({ data: { userId: viewer.id, profileId: profile.id } });
    await db.follow.create({ data: { followerId: viewer.id, followeeId: owner.id } });
    await db.review.create({ data: { authorUserId: viewer.id, profileId: profile.id, rating: 5, body: 'Отлично снял событие', status: 'VISIBLE' } });

    const stats = await photographerStats(owner.id, profile.id);
    expect(stats.views).toBe(2);
    expect(stats.views30d).toBe(2);
    expect(stats.saves).toBe(1);
    expect(stats.saves30d).toBe(1);
    expect(stats.followers).toBe(1);
    expect(stats.reviews).toBe(1);
    expect(stats.likes).toBe(0);

    // Полка «Открыты для заказов» — перк ТОЛЬКО Active+ (ELITE).
    const recBefore = await recommendedForCity('moscow', 50);
    expect(recBefore.some((c) => c.username === `an-${stamp}`)).toBe(false);
    // PRIME (Active) — в полку НЕ попадает
    await grantFoundingSub(owner.id, 'moscow', 'PRIME');
    const recPrime = await recommendedForCity('moscow', 50);
    expect(recPrime.some((c) => c.username === `an-${stamp}`)).toBe(false);
    // ELITE (Active+) — в полке
    await grantFoundingSub(owner.id, 'moscow', 'ELITE');
    const recElite = await recommendedForCity('moscow', 50);
    expect(recElite.some((c) => c.username === `an-${stamp}`)).toBe(true);
    expect(recElite.find((c) => c.username === `an-${stamp}`)?.tier).toBe('ELITE');

    // cleanup (FK-порядок)
    await db.activityEvent.deleteMany({ where: { OR: [{ targetId: profile.id }, { actorUserId: { in: [owner.id, viewer.id] } }] } });
    await db.review.deleteMany({ where: { profileId: profile.id } });
    await db.follow.deleteMany({ where: { OR: [{ followeeId: owner.id }, { followerId: viewer.id }] } });
    await db.favoritePhotographer.deleteMany({ where: { profileId: profile.id } });
    await db.subscription.deleteMany({ where: { userId: owner.id } });
    await db.photographerProfile.delete({ where: { id: profile.id } });
    await db.user.deleteMany({ where: { id: { in: [owner.id, viewer.id] } } });
  });
});
