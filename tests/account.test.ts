import { describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('deleteAccount: удаление/анонимизация/сохранение чужого (БД)', () => {
  it('удаляет фотографа со всем поддеревом; чужой юзер жив; события анонимятся', async () => {
    const { db } = await import('@/lib/db');
    const { deleteAccount } = await import('@/lib/account');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const cat = await db.category.findFirstOrThrow({ where: { slug: 'sports' } });

    // Фотограф (удаляемый) с полным профилем
    const photog = await db.user.create({ data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'У', lastName: 'Д', email: `da-p-${stamp}@test.local`, passwordHash: 'x' } });
    const profile = await db.photographerProfile.create({ data: { userId: photog.id, username: `da-${stamp}`, cityId: city.id, status: 'APPROVED' } });
    await db.pricePackage.create({ data: { profileId: profile.id, hours: 2, priceMinor: 10000, currency: 'RUB', sortOrder: 0 } });
    await db.profileCategory.create({ data: { profileId: profile.id, categoryId: cat.id } });
    const story = await db.story.create({ data: { profileId: profile.id, categoryId: cat.id, title: 'S', status: 'APPROVED' } });
    const photo = await db.photo.create({ data: { profileId: profile.id, categoryId: cat.id, storyId: story.id, storageKey: `photos/da-${stamp}/original.jpg`, width: 2400, height: 1600, status: 'APPROVED' } });

    // Клиент (сохраняется) — взаимодействует с фотографом
    const client = await db.user.create({ data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'К', lastName: 'Л', email: `da-c-${stamp}@test.local`, passwordHash: 'y' } });
    await db.like.create({ data: { userId: client.id, photoId: photo.id, weightMilli: 1000 } });
    await db.comment.create({ data: { authorUserId: client.id, photoId: photo.id, body: 'коммент' } });
    await db.review.create({ data: { authorUserId: client.id, profileId: profile.id, rating: 5, body: 'отзыв' } });
    await db.favoritePhotographer.create({ data: { userId: client.id, profileId: profile.id } });
    await db.follow.create({ data: { followerId: client.id, followeeId: photog.id } });
    await db.message.create({ data: { senderId: client.id, recipientId: photog.id, body: 'привет' } });
    const event = await db.activityEvent.create({ data: { actorUserId: photog.id, type: 'PROFILE_VIEW', targetType: 'PROFILE', targetId: profile.id } });

    await deleteAccount(photog.id);

    // Фотограф и всё его поддерево — нет
    expect(await db.user.findUnique({ where: { id: photog.id } })).toBeNull();
    expect(await db.photographerProfile.findUnique({ where: { id: profile.id } })).toBeNull();
    expect(await db.photo.count({ where: { id: photo.id } })).toBe(0);
    expect(await db.story.count({ where: { id: story.id } })).toBe(0);
    expect(await db.pricePackage.count({ where: { profileId: profile.id } })).toBe(0);
    // Чужие лайки/комменты/отзывы/избранное на его контенте — тоже нет
    expect(await db.like.count({ where: { photoId: photo.id } })).toBe(0);
    expect(await db.comment.count({ where: { authorUserId: client.id } })).toBe(0);
    expect(await db.review.count({ where: { profileId: profile.id } })).toBe(0);
    expect(await db.favoritePhotographer.count({ where: { profileId: profile.id } })).toBe(0);
    expect(await db.follow.count({ where: { followeeId: photog.id } })).toBe(0);
    expect(await db.message.count({ where: { recipientId: photog.id } })).toBe(0);
    // Событие анонимизировано (не удалено)
    const ev = await db.activityEvent.findUnique({ where: { id: event.id } });
    expect(ev).not.toBeNull();
    expect(ev?.actorUserId).toBeNull();

    // Клиент жив
    expect(await db.user.findUnique({ where: { id: client.id } })).not.toBeNull();

    // Уборка
    await db.activityEvent.deleteMany({ where: { id: event.id } });
    await db.user.deleteMany({ where: { id: client.id } });
  });
});
