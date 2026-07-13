import { describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('feeds: подписки и рекомендации (БД)', () => {
  it('лента подписок отдаёт фото автора, на которого подписан; рек-лента фолбэчит', async () => {
    const { db } = await import('@/lib/db');
    const { followingFeed, recommendedFeed } = await import('@/lib/feeds');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const cat = await db.category.findFirstOrThrow({ where: { slug: 'sports' } });
    const author = await db.user.create({ data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'А', lastName: 'В', email: `feed-a-${stamp}@test.local` } });
    const profile = await db.photographerProfile.create({ data: { userId: author.id, username: `feed-${stamp}`, cityId: city.id, status: 'APPROVED' } });
    const photo = await db.photo.create({ data: { profileId: profile.id, categoryId: cat.id, storageKey: `photos/feed-${stamp}/original.jpg`, width: 2400, height: 1600, status: 'APPROVED', publishedAt: new Date() } });
    const follower = await db.user.create({ data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'П', lastName: 'К', email: `feed-f-${stamp}@test.local` } });

    // без подписки — пусто
    expect(await followingFeed(follower.id)).toHaveLength(0);
    await db.follow.create({ data: { followerId: follower.id, followeeId: author.id } });
    const feed = await followingFeed(follower.id);
    expect(feed.some((p) => p.photoId === photo.id)).toBe(true);

    // рек-лента без лайков истории — не персональная, но что-то отдаёт (фолбэк)
    const rec = await recommendedFeed(follower.id);
    expect(rec.personalized).toBe(false);

    await db.follow.deleteMany({ where: { followeeId: author.id } });
    await db.photo.delete({ where: { id: photo.id } });
    await db.photographerProfile.delete({ where: { id: profile.id } });
    await db.user.deleteMany({ where: { id: { in: [author.id, follower.id] } } });
  });
});
