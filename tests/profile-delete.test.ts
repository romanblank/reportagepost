import { describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

// Env-зависимость (правило c): нужен локальный PG
describe.skipIf(!hasDb)('удаление только анкеты (БД)', () => {
  it('анкета со всем поддеревом уходит, аккаунт и вход остаются', async () => {
    const { db } = await import('@/lib/db');
    const { deletePhotographerProfile } = await import('@/lib/account');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const category = await db.category.findFirstOrThrow({ where: { slug: 'concerts-festivals' } });

    const user = await db.user.create({
      data: {
        role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Пере', lastName: 'Заход',
        email: `redo-${stamp}@test.local`, passwordHash: 'hash-that-must-survive',
      },
    });
    const profile = await db.photographerProfile.create({
      data: {
        userId: user.id, username: `redo-${stamp}`, cityId: city.id, status: 'APPROVED',
        categories: { create: [{ categoryId: category.id }] },
        packages: { create: [{ hours: 4, priceMinor: 2_000_000, currency: 'RUB' }] },
      },
    });
    await db.photo.create({
      data: {
        profileId: profile.id, categoryId: category.id, status: 'APPROVED',
        storageKey: `test/redo-${stamp}/original.jpg`, width: 100, height: 100,
      },
    });

    await deletePhotographerProfile(user.id);

    // Анкета и всё, что на ней висело, — нет
    expect(await db.photographerProfile.findUnique({ where: { id: profile.id } })).toBeNull();
    expect(await db.photo.count({ where: { profileId: profile.id } })).toBe(0);
    expect(await db.pricePackage.count({ where: { profileId: profile.id } })).toBe(0);
    expect(await db.profileCategory.count({ where: { profileId: profile.id } })).toBe(0);

    // Аккаунт, почта и пароль — на месте: человек проходит подачу анкеты
    // заново, не теряя вход
    const kept = await db.user.findUnique({ where: { id: user.id } });
    expect(kept?.email).toBe(`redo-${stamp}@test.local`);
    expect(kept?.passwordHash).toBe('hash-that-must-survive');

    // И анкету действительно можно подать снова тем же аккаунтом
    const again = await db.photographerProfile.create({
      data: { userId: user.id, username: `redo2-${stamp}`, cityId: city.id, status: 'PENDING' },
    });
    expect(again.id).toBeTruthy();

    await db.photographerProfile.delete({ where: { id: again.id } });
    await db.user.delete({ where: { id: user.id } });
  });
});
