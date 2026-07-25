import { describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('shoots: подтверждённая съёмка — факты доверия (БД)', () => {
  it('confirmShoot / shootStats (снимали вместе, возвращаются) / hasShotWith / guard', async () => {
    const { db } = await import('@/lib/db');
    const { confirmShoot, shootStats, hasShotWith, shootsByClient } = await import('@/lib/shoots');
    const { DomainError } = await import('@/lib/errors');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const owner = await db.user.create({ data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'А', lastName: 'Н', email: `sh-own-${stamp}@test.local` } });
    const profile = await db.photographerProfile.create({ data: { userId: owner.id, username: `sh-${stamp}`, cityId: city.id, status: 'APPROVED' } });
    const client = await db.user.create({ data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'К', lastName: 'Л', email: `sh-cl-${stamp}@test.local` } });

    expect(await hasShotWith(client.id, profile.id)).toBe(false);

    // первая съёмка
    await confirmShoot(client.id, profile.id);
    expect(await hasShotWith(client.id, profile.id)).toBe(true);
    let s = await shootStats(profile.id);
    expect(s).toEqual({ count: 1, clients: 1, returning: 0 });

    // повторная съёмка с тем же заказчиком → «возвращается»
    await confirmShoot(client.id, profile.id);
    s = await shootStats(profile.id);
    expect(s).toEqual({ count: 2, clients: 1, returning: 1 });

    // владелец не может подтвердить съёмку у себя; фотограф не «клиент»
    await expect(confirmShoot(owner.id, profile.id)).rejects.toThrow(DomainError);

    // кабинет заказчика: съёмка без отзыва → reviewed:false; после отзыва → true
    let mine = await shootsByClient(client.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ profileId: profile.id, count: 2, reviewed: false });
    await db.review.create({ data: { authorUserId: client.id, profileId: profile.id, rating: 5, body: 'супер' } });
    mine = await shootsByClient(client.id);
    expect(mine[0].reviewed).toBe(true);

    // cleanup (FK-порядок)
    await db.review.deleteMany({ where: { profileId: profile.id } });
    await db.shootConfirmation.deleteMany({ where: { profileId: profile.id } });
    await db.photographerProfile.delete({ where: { id: profile.id } });
    await db.user.deleteMany({ where: { id: { in: [owner.id, client.id] } } });
  });
});
