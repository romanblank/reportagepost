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

  it('порог считается в SQL так же, как считался в JS: 10 бит — дубль, 11 — нет', async () => {
    // Расстояние Хэмминга переехало из JS в SQL (аудит 2026-08-01, P2:
    // прежний перебор последних 5000 кадров означал, что при 100k фото защита
    // от кражи портфолио видит 5% базы и молча перестаёт работать).
    // Здесь проверяется именно математика на новом движке — по границе порога.
    const { db } = await import('@/lib/db');
    const { findNearDuplicate } = await import('@/lib/photo-dedup');
    const { hammingDistanceHex, NEAR_DUP_MAX } = await import('@/lib/phash');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const cat = await db.category.findFirstOrThrow({ where: { slug: 'sports' } });
    const u = await db.user.create({
      data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'П', lastName: 'Орог', email: `ddt-${stamp}@test.local` },
    });
    const p = await db.photographerProfile.create({
      data: { userId: u.id, username: `ddt-${stamp}`, cityId: city.id, status: 'APPROVED' },
    });

    const stored = '0000000000000000';
    await db.photo.create({
      data: { profileId: p.id, categoryId: cat.id, storageKey: `photos/ddt-${stamp}/original.jpg`, width: 2400, height: 1600, status: 'APPROVED', phash: stored },
    });

    // Ровно 10 единичных битов → расстояние 10 (= порог, дубликатом считается)
    const atThreshold = '00000000000003ff';
    // 11 битов → за порогом
    const overThreshold = '00000000000007ff';
    expect(hammingDistanceHex(stored, atThreshold)).toBe(NEAR_DUP_MAX);
    expect(hammingDistanceHex(stored, overThreshold)).toBe(NEAR_DUP_MAX + 1);

    const hit = await findNearDuplicate(atThreshold, 'кто-то-другой');
    expect(hit?.distance).toBe(NEAR_DUP_MAX); // SQL посчитал так же, как JS
    expect(hit?.kind).toBe('foreign');
    expect(await findNearDuplicate(overThreshold, 'кто-то-другой')).toBeNull();

    // Мусор вместо phash не доходит до базы и не роняет загрузку
    expect(await findNearDuplicate('не-хеш', p.id)).toBeNull();

    await db.photo.deleteMany({ where: { profileId: p.id } });
    await db.photographerProfile.delete({ where: { id: p.id } });
    await db.user.delete({ where: { id: u.id } });
  });
});
