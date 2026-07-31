import { describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('stories: создание, модерация, лайк (БД)', () => {
  it('серия из своих фото → approve → лайк с событием', async () => {
    const { db } = await import('@/lib/db');
    const { createStory, approveStory, toggleStoryLike, STORY_MIN_PHOTOS } = await import('@/lib/stories');
    const { grantFoundingSub } = await import('@/lib/subscription');
    const { DomainError } = await import('@/lib/errors');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const cat = await db.category.findFirstOrThrow({ where: { slug: 'concerts-festivals' } });
    const owner = await db.user.create({ data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'С', lastName: 'Т', email: `story-o-${stamp}@test.local` } });
    const profile = await db.photographerProfile.create({ data: { userId: owner.id, username: `story-${stamp}`, cityId: city.id, status: 'APPROVED' } });
    const photos = await Promise.all(
      Array.from({ length: STORY_MIN_PHOTOS }, (_, i) =>
        db.photo.create({ data: { profileId: profile.id, categoryId: cat.id, storageKey: `photos/story-${stamp}-${i}/original.jpg`, width: 2400, height: 1600, status: 'APPROVED', publishedAt: new Date() } }),
      ),
    );

    // FREE — серии недоступны (перк Active)
    await expect(createStory(owner.id, { title: 'Ф', categorySlug: 'concerts-festivals', photoIds: photos.map((p) => p.id) })).rejects.toThrow('stories_require_active');

    // грант Active — серии открываются
    await grantFoundingSub(owner.id, 'moscow', 'PRIME');

    // мало фото — отказ (уже Active, проверяем валидацию кол-ва)
    await expect(createStory(owner.id, { title: 'Мало', categorySlug: 'concerts-festivals', photoIds: [photos[0].id] })).rejects.toThrow(DomainError);

    const { storyId } = await createStory(owner.id, {
      title: 'Фестиваль',
      categorySlug: 'concerts-festivals',
      photoIds: photos.map((p) => p.id),
    });
    expect((await db.story.findUniqueOrThrow({ where: { id: storyId } })).status).toBe('PENDING');

    // чужой лайк до аппрува — отказ
    const liker = await db.user.create({ data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'Л', lastName: 'К', email: `story-l-${stamp}@test.local` } });
    await expect(toggleStoryLike(liker.id, storyId)).rejects.toThrow(DomainError);

    await approveStory(storyId);
    const approved = await db.story.findUniqueOrThrow({ where: { id: storyId } });
    expect(approved.status).toBe('APPROVED');
    expect(approved.publishedAt).toBeTruthy();
    const pub = await db.activityEvent.findFirst({ where: { type: 'STORY_PUBLISH', targetId: storyId } });
    expect(pub).toBeTruthy();

    // идемпотентность: повторный approve не плодит событий/уведомлений (guard status)
    const { rejectStory } = await import('@/lib/stories');
    await approveStory(storyId);
    expect(await db.activityEvent.count({ where: { type: 'STORY_PUBLISH', targetId: storyId } })).toBe(1);
    // reject уже APPROVED-серии — no-op (не топит опубликованную)
    await rejectStory(storyId, 'поздний отказ не должен применяться');
    expect((await db.story.findUniqueOrThrow({ where: { id: storyId } })).status).toBe('APPROVED');
    // reject несуществующей — story_not_found
    await expect(rejectStory('no-such-story-id', 'причина отказа')).rejects.toThrow(DomainError);

    expect((await toggleStoryLike(liker.id, storyId)).liked).toBe(true);
    expect(await db.like.count({ where: { storyId } })).toBe(1);

    await db.activityEvent.deleteMany({ where: { OR: [{ targetId: storyId }, { actorUserId: owner.id }] } });
    await db.like.deleteMany({ where: { storyId } });
    await db.photo.deleteMany({ where: { profileId: profile.id } });
    await db.notification.deleteMany({ where: { userId: { in: [owner.id, liker.id] } } });
    await db.story.delete({ where: { id: storyId } });
    await db.subscription.deleteMany({ where: { userId: owner.id } });
    await db.profileCategoryScore.deleteMany({ where: { profileId: profile.id } }); // лайк пересчитывает рейтинг → скоры (FK)
    await db.photographerProfile.delete({ where: { id: profile.id } });
    await db.user.deleteMany({ where: { id: { in: [owner.id, liker.id] } } });
  });
});
