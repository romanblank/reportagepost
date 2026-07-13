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

  it('P0-3: анлайк списывает вес исходного лайка даже при смене статуса актора', async () => {
    const { db } = await import('@/lib/db');
    const { togglePhotoLike } = await import('@/lib/engagement');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const cat = await db.category.findFirstOrThrow({ where: { slug: 'sports' } });
    const owner = await db.user.create({ data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'О', lastName: 'В', email: `drift-o-${stamp}@test.local` } });
    const profile = await db.photographerProfile.create({ data: { userId: owner.id, username: `drift-${stamp}`, cityId: city.id, status: 'APPROVED' } });
    const photo = await db.photo.create({ data: { profileId: profile.id, categoryId: cat.id, storageKey: `photos/drift-${stamp}/original.jpg`, width: 2400, height: 1600, status: 'APPROVED', publishedAt: new Date() } });
    // актор — одобренный фотограф (вес лайка 2000)
    const actor = await db.user.create({ data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'А', lastName: 'К', email: `drift-a-${stamp}@test.local` } });
    const actorProfile = await db.photographerProfile.create({ data: { userId: actor.id, username: `drift-a-${stamp}`, cityId: city.id, status: 'APPROVED' } });

    await togglePhotoLike(actor.id, photo.id); // лайк весом 2000
    // статус актора падает (профиль на модерацию → вес актора стал бы 1000)
    await db.photographerProfile.update({ where: { id: actorProfile.id }, data: { status: 'PENDING' } });
    await togglePhotoLike(actor.id, photo.id); // анлайк

    const events = await db.activityEvent.findMany({ where: { targetId: photo.id }, orderBy: { id: 'asc' } });
    expect(events[0].weightMilli).toBe(2000); // лайк
    expect(events[1].weightMilli).toBe(2000); // анлайк списывает ТОТ ЖЕ вес, не 1000
    const net = events.reduce((s, e) => s + (e.type === 'PHOTO_LIKE' ? e.weightMilli : -e.weightMilli), 0);
    expect(net).toBe(0); // никакого фантомного вклада

    await db.activityEvent.deleteMany({ where: { targetId: photo.id } });
    await db.like.deleteMany({ where: { photoId: photo.id } });
    await db.photo.delete({ where: { id: photo.id } });
    await db.photographerProfile.deleteMany({ where: { id: { in: [profile.id, actorProfile.id] } } });
    await db.user.deleteMany({ where: { id: { in: [owner.id, actor.id] } } });
  });
});
