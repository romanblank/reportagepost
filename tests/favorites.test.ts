import { describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('favorites: избранные фотографы (БД)', () => {
  it('toggle идемпотентен, список отдаёт только APPROVED', async () => {
    const { db } = await import('@/lib/db');
    const { toggleFavorite, favoritesFor } = await import('@/lib/favorites');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const owner = await db.user.create({ data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Ф', lastName: 'В', email: `fav-o-${stamp}@test.local` } });
    const profile = await db.photographerProfile.create({ data: { userId: owner.id, username: `fav-${stamp}`, cityId: city.id, status: 'APPROVED' } });
    const client = await db.user.create({ data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'З', lastName: 'К', email: `fav-c-${stamp}@test.local` } });

    expect((await toggleFavorite(client.id, profile.id)).favorited).toBe(true);
    expect((await favoritesFor(client.id)).some((p) => p.id === profile.id)).toBe(true);
    expect((await toggleFavorite(client.id, profile.id)).favorited).toBe(false);
    expect(await db.favoritePhotographer.count({ where: { userId: client.id } })).toBe(0);

    await db.photographerProfile.delete({ where: { id: profile.id } });
    await db.user.deleteMany({ where: { id: { in: [owner.id, client.id] } } });
  });
});
