import { describe, expect, it } from 'vitest';
import 'dotenv/config';
import { decayFactor, HALF_LIFE_DAYS } from '@/lib/rating';

describe('rating: сгорание', () => {
  it('полураспад: свежий=1, через HALF_LIFE=0.5, через 2×HALF_LIFE=0.25', () => {
    const day = 86_400_000;
    expect(decayFactor(0)).toBe(1);
    expect(decayFactor(HALF_LIFE_DAYS * day)).toBeCloseTo(0.5, 5);
    expect(decayFactor(2 * HALF_LIFE_DAYS * day)).toBeCloseTo(0.25, 5);
  });
});

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('rating: engagement по материализованным лайкам (БД)', () => {
  it('свежий лайк весит больше старого; окно отсекает древние; фантомные анлайк-события не съедают честный лайк', async () => {
    const { db } = await import('@/lib/db');
    const { engagementMilli, HALF_LIFE_DAYS } = await import('@/lib/rating');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const day = 86_400_000;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const cat = await db.category.findFirstOrThrow({ where: { slug: 'sports' } });
    const owner = await db.user.create({ data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Р', lastName: 'Ейтинг', email: `rat-${stamp}@test.local` } });
    const profile = await db.photographerProfile.create({
      data: { userId: owner.id, username: `rat-${stamp}`, cityId: city.id, status: 'APPROVED' },
    });
    const photo = await db.photo.create({
      data: { profileId: profile.id, categoryId: cat.id, storageKey: `photos/rat-${stamp}/original.jpg`, width: 2400, height: 1600, status: 'APPROVED', publishedAt: new Date() },
    });
    // Лайкающие (Like требует существующего userId по FK)
    const u = async (n: string) => (await db.user.create({ data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'Л', lastName: n, email: `rl-${n}-${stamp}@test.local` } })).id;
    const [uFresh, uOld, uAncient] = await Promise.all([u('f'), u('o'), u('a')]);

    const now = new Date();
    const old = new Date(now.getTime() - 2 * HALF_LIFE_DAYS * day); // 2 полураспада → ×0.25
    const ancient = new Date(now.getTime() - 6 * HALF_LIFE_DAYS * day); // вне окна 5×полураспад
    await db.like.createMany({
      data: [
        { userId: uFresh, photoId: photo.id, weightMilli: 1000, createdAt: now },
        { userId: uOld, photoId: photo.id, weightMilli: 1000, createdAt: old },
        { userId: uAncient, photoId: photo.id, weightMilli: 1000, createdAt: ancient },
      ],
    });
    // Фантомные события анлайка старого лайка: СТАРЫЙ код (переигрывание журнала)
    // вычел бы их с меньшим затуханием → отрицательный остаток, съедающий честные
    // лайки. Новый код считает по Like и обязан их ПРОИГНОРИРОВАТЬ.
    await db.activityEvent.createMany({
      data: [
        { type: 'PHOTO_LIKE', targetType: 'PHOTO', targetId: photo.id, weightMilli: 2000, createdAt: old },
        { type: 'PHOTO_UNLIKE', targetType: 'PHOTO', targetId: photo.id, weightMilli: 2000, createdAt: now },
      ],
    });

    const score = await engagementMilli(profile.id, now);
    // свежий 1000 + старый 1000×0.25 = 1250; древний вне окна = 0; события игнорятся
    expect(score).toBe(1250);

    await db.activityEvent.deleteMany({ where: { targetId: photo.id } });
    await db.like.deleteMany({ where: { photoId: photo.id } });
    await db.photo.delete({ where: { id: photo.id } });
    await db.photographerProfile.delete({ where: { id: profile.id } });
    await db.user.deleteMany({ where: { id: { in: [owner.id, uFresh, uOld, uAncient] } } });
  });
});

describe('rating: вклад отзывов не растёт от плохой оценки', () => {
  it('плохой отзыв ОПУСКАЕТ вклад, хорошие поднимают, сплошь низкие дают минус', async () => {
    const { reviewContribution } = await import('@/lib/rating');

    // Регрессия аудита 2026-07-31: прежняя формула avg×count×200 давала
    // 5×1×200=1000 → после отзыва на 1 балл 3×2×200=1200, т.е. недовольный
    // заказчик ПОДНИМАЛ автора в выдаче.
    const oneGreat = reviewContribution(5, 1);
    const plusTerrible = reviewContribution(3, 2); // добавился отзыв на 1 → avg 3
    expect(plusTerrible).toBeLessThan(oneGreat);

    // Больше хороших отзывов — больше вклад
    expect(reviewContribution(5, 10)).toBeGreaterThan(reviewContribution(5, 3));

    // Плохая репутация уводит вклад в минус
    expect(reviewContribution(2, 10)).toBeLessThan(0);

    // Нет отзывов — нет вклада (ни плюса, ни минуса)
    expect(reviewContribution(0, 0)).toBe(0);

    // Байесовское сглаживание: один отзыв на 5 не перевешивает десяток четвёрок
    expect(reviewContribution(5, 1)).toBeLessThan(reviewContribution(4, 10));
  });
});
