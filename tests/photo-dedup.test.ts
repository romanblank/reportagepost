import { describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('photo-dedup: свой/чужой дубликат по phash (БД)', () => {
  it('чужой почти-дубликат → foreign; свой → own; далёкий → null', async () => {
    const { db } = await import('@/lib/db');
    const { findNearDuplicate } = await import('@/lib/photo-dedup');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const cat = await db.category.findFirstOrThrow({ where: { slug: 'sports' } });
    const mkProfile = async (n: string) => {
      const u = await db.user.create({ data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Д', lastName: n, email: `dd-${n}-${stamp}@test.local` } });
      const p = await db.photographerProfile.create({ data: { userId: u.id, username: `dd-${n}-${stamp}`, cityId: city.id, status: 'APPROVED' } });
      return { userId: u.id, profileId: p.id };
    };
    const A = await mkProfile('a');
    const B = await mkProfile('b');

    // У автора A — фото с известным phash (APPROVED, попадает в кандидаты)
    const base = 'aaaaaaaaaaaaaaaa'; // 64 бита нулей по битам 'a'=1010
    await db.photo.create({
      data: { profileId: A.profileId, categoryId: cat.id, storageKey: `photos/dd-${stamp}/original.jpg`, width: 2400, height: 1600, status: 'APPROVED', phash: base },
    });

    // Тот же кадр у ДРУГОГО автора B (расстояние 0) → foreign (возможная кража)
    const foreign = await findNearDuplicate(base, B.profileId);
    expect(foreign?.kind).toBe('foreign');
    expect(foreign?.distance).toBe(0);

    // Тот же автор A грузит близкий кадр (1 бит разницы) → own
    const near = 'aaaaaaaaaaaaaaab'; // последний нибл b vs a → 1 бит
    const own = await findNearDuplicate(near, A.profileId);
    expect(own?.kind).toBe('own');
    expect(own?.distance).toBe(1);

    // Далёкий кадр (инверсия) → нет совпадения
    const far = '5555555555555555'; // 'a'(1010) ^ '5'(0101) → 64 бит разницы
    expect(await findNearDuplicate(far, B.profileId)).toBeNull();

    await db.photo.deleteMany({ where: { profileId: { in: [A.profileId, B.profileId] } } });
    await db.photographerProfile.deleteMany({ where: { id: { in: [A.profileId, B.profileId] } } });
    await db.user.deleteMany({ where: { id: { in: [A.userId, B.userId] } } });
  });
});
