import { describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('engagement: лайки и подписки (БД)', () => {
  it('toggle-лайк пишет события с весом, повторный — снимает', async () => {
    const { db } = await import('@/lib/db');
    const { togglePhotoLike } = await import('@/lib/engagement');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const cat = await db.category.findFirstOrThrow({ where: { slug: 'sports' } });
    const owner = await db.user.create({ data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'В', lastName: 'Ладелец', email: `eng-o-${stamp}@test.local` } });
    const profile = await db.photographerProfile.create({
      data: { userId: owner.id, username: `eng-${stamp}`, cityId: city.id, status: 'APPROVED' },
    });
    const photo = await db.photo.create({
      data: { profileId: profile.id, categoryId: cat.id, storageKey: `photos/eng-${stamp}/original.jpg`, width: 2400, height: 1600, status: 'APPROVED', publishedAt: new Date() },
    });
    const liker = await db.user.create({ data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'Л', lastName: 'Айкер', email: `eng-l-${stamp}@test.local` } });

    expect((await togglePhotoLike(liker.id, photo.id)).liked).toBe(true);
    expect((await togglePhotoLike(liker.id, photo.id)).liked).toBe(false);
    expect((await togglePhotoLike(liker.id, photo.id)).liked).toBe(true);

    const events = await db.activityEvent.findMany({
      where: { targetType: 'PHOTO', targetId: photo.id },
      orderBy: { id: 'asc' },
    });
    expect(events.map((e) => e.type)).toEqual(['PHOTO_LIKE', 'PHOTO_UNLIKE', 'PHOTO_LIKE']);
    expect(events[0].weightMilli).toBe(1000); // клиент — базовый вес

    const likes = await db.like.count({ where: { photoId: photo.id } });
    expect(likes).toBe(1);

    await db.activityEvent.deleteMany({ where: { targetId: photo.id } });
    await db.like.deleteMany({ where: { photoId: photo.id } });
    await db.photo.delete({ where: { id: photo.id } });
    await db.photographerProfile.delete({ where: { id: profile.id } });
    await db.user.deleteMany({ where: { id: { in: [owner.id, liker.id] } } });
  });
});
