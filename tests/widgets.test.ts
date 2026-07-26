import { describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('widgets.recentPhotographers — только с готовой работой (БД)', () => {
  it('профиль без одобренных фото НЕ попадает в «Новые имена»', async () => {
    const { db } = await import('@/lib/db');
    const { recentPhotographers } = await import('@/lib/widgets');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const cat = await db.category.findFirstOrThrow({ where: { slug: 'concerts-festivals' } });

    // Пустой профиль (0 фото) и профиль с 1 одобренным фото
    const emptyUser = await db.user.create({ data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Пусто', lastName: 'Й', email: `w-empty-${stamp}@test.local` } });
    const emptyProfile = await db.photographerProfile.create({ data: { userId: emptyUser.id, username: `w-empty-${stamp}`, cityId: city.id, status: 'APPROVED' } });

    const fullUser = await db.user.create({ data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'С', lastName: 'Работой', email: `w-full-${stamp}@test.local` } });
    const fullProfile = await db.photographerProfile.create({ data: { userId: fullUser.id, username: `w-full-${stamp}`, cityId: city.id, status: 'APPROVED' } });
    await db.photo.create({ data: { profileId: fullProfile.id, categoryId: cat.id, storageKey: `photos/w-${stamp}/original.jpg`, width: 2400, height: 1600, status: 'APPROVED', publishedAt: new Date() } });

    const recent = await recentPhotographers(50);
    const ids = recent.map((p) => p.id);
    expect(ids).toContain(fullProfile.id);
    expect(ids).not.toContain(emptyProfile.id);

    // cleanup
    await db.photo.deleteMany({ where: { profileId: fullProfile.id } });
    await db.photographerProfile.deleteMany({ where: { id: { in: [emptyProfile.id, fullProfile.id] } } });
    await db.user.deleteMany({ where: { id: { in: [emptyUser.id, fullUser.id] } } });
  });
});
