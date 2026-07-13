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

describe.skipIf(!hasDb)('rating: engagement по событиям (БД)', () => {
  it('лайк+анлайк взаимоуничтожаются; свежий лайк весит больше старого', async () => {
    const { db } = await import('@/lib/db');
    const { engagementMilli } = await import('@/lib/rating');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const cat = await db.category.findFirstOrThrow({ where: { slug: 'sports' } });
    const owner = await db.user.create({ data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Р', lastName: 'Ейтинг', email: `rat-${stamp}@test.local` } });
    const profile = await db.photographerProfile.create({
      data: { userId: owner.id, username: `rat-${stamp}`, cityId: city.id, status: 'APPROVED' },
    });
    const photo = await db.photo.create({
      data: { profileId: profile.id, categoryId: cat.id, storageKey: `photos/rat-${stamp}/original.jpg`, width: 2400, height: 1600, status: 'APPROVED', publishedAt: new Date() },
    });

    const now = new Date();
    const old = new Date(now.getTime() - 120 * 86_400_000); // 2 полураспада
    await db.activityEvent.createMany({
      data: [
        { type: 'PHOTO_LIKE', targetType: 'PHOTO', targetId: photo.id, weightMilli: 1000, createdAt: now },
        { type: 'PHOTO_LIKE', targetType: 'PHOTO', targetId: photo.id, weightMilli: 1000, createdAt: old },
        // пара лайк+анлайк одинакового веса и времени — в ноль
        { type: 'PHOTO_LIKE', targetType: 'PHOTO', targetId: photo.id, weightMilli: 2000, createdAt: old },
        { type: 'PHOTO_UNLIKE', targetType: 'PHOTO', targetId: photo.id, weightMilli: 2000, createdAt: old },
      ],
    });

    const score = await engagementMilli(profile.id, now);
    expect(score).toBe(1000 + 250); // свежий 1000 + старый 1000×0.25

    await db.activityEvent.deleteMany({ where: { targetId: photo.id } });
    await db.photo.delete({ where: { id: photo.id } });
    await db.photographerProfile.delete({ where: { id: profile.id } });
    await db.user.delete({ where: { id: owner.id } });
  });
});
