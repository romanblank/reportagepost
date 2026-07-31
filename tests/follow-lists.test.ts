import { describe, expect, it } from 'vitest';
import 'dotenv/config';

// Follow-списки (паритет MyWed): подписчик-фотограф — со ссылкой (username),
// заказчик — без; PENDING-профиль подписчика НЕ светится ссылкой; порядок —
// свежие сверху. Правило c: без DATABASE_URL — skip.
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('follow-lists: подписчики/подписки (БД)', () => {
  it('followersOf/followingOf: фотограф со ссылкой, заказчик и PENDING-профиль — без; свежие сверху', async () => {
    const { db } = await import('@/lib/db');
    const { followersOf, followingOf } = await import('@/lib/follow-lists');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });

    const mkUser = (tag: string, role: 'PHOTOGRAPHER' | 'CLIENT') =>
      db.user.create({ data: { role, status: 'ACTIVE', firstName: 'Ф', lastName: tag, email: `fl-${tag}-${stamp}@test.local` } });

    // Целевой фотограф + подписчики: одобренный фотограф, PENDING-фотограф, заказчик
    const target = await mkUser('target', 'PHOTOGRAPHER');
    await db.photographerProfile.create({ data: { userId: target.id, username: `fl-target-${stamp}`, cityId: city.id, status: 'APPROVED' } });
    const approved = await mkUser('approved', 'PHOTOGRAPHER');
    await db.photographerProfile.create({ data: { userId: approved.id, username: `fl-appr-${stamp}`, cityId: city.id, status: 'APPROVED' } });
    const pending = await mkUser('pending', 'PHOTOGRAPHER');
    await db.photographerProfile.create({ data: { userId: pending.id, username: `fl-pend-${stamp}`, cityId: city.id, status: 'PENDING' } });
    const client = await mkUser('client', 'CLIENT');

    const t0 = new Date(Date.now() - 3000);
    await db.follow.create({ data: { followerId: approved.id, followeeId: target.id, createdAt: t0 } });
    await db.follow.create({ data: { followerId: pending.id, followeeId: target.id, createdAt: new Date(t0.getTime() + 1000) } });
    await db.follow.create({ data: { followerId: client.id, followeeId: target.id, createdAt: new Date(t0.getTime() + 2000) } });
    // target подписан на approved
    await db.follow.create({ data: { followerId: target.id, followeeId: approved.id } });

    const followers = await followersOf(target.id);
    const ours = followers.filter((f) => f.lastName.match(/^(approved|pending|client)$/));
    // Свежие сверху: client, pending, approved
    expect(ours.map((f) => f.lastName)).toEqual(['client', 'pending', 'approved']);
    // Ссылка только у APPROVED-фотографа; заказчик и PENDING — без username/города
    expect(ours[2].username).toBe(`fl-appr-${stamp}`);
    expect(ours[2].city).toBe('moscow');
    expect(ours[1].username).toBeNull();
    expect(ours[0].username).toBeNull();

    const following = await followingOf(target.id);
    expect(following.some((f) => f.username === `fl-appr-${stamp}`)).toBe(true);

    // Cleanup (follow → профили → пользователи)
    const ids = [target.id, approved.id, pending.id, client.id];
    await db.follow.deleteMany({ where: { OR: [{ followerId: { in: ids } }, { followeeId: { in: ids } }] } });
    await db.photographerProfile.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
  });
});
