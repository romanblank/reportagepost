import { describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

// Env-зависимость (правило c): нужен локальный PG (docker compose up -d)
describe.skipIf(!hasDb)('moderation: одобрение и отклонение (БД)', () => {
  async function makePendingProfile() {
    const { db } = await import('@/lib/db');
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const user = await db.user.create({
      data: {
        role: 'PHOTOGRAPHER',
        firstName: 'Мод',
        lastName: 'Тестов',
        email: `mod-${stamp}@test.local`,
      },
    });
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const category = await db.category.findFirstOrThrow({ where: { slug: 'sports' } });
    const profile = await db.photographerProfile.create({
      data: {
        userId: user.id,
        username: `mod-${stamp}`,
        cityId: city.id,
        categories: { create: [{ categoryId: category.id }] },
        photos: {
          create: [
            { categoryId: category.id, storageKey: `photos/test-${stamp}-1/original.jpg`, width: 2400, height: 1600 },
            { categoryId: category.id, storageKey: `photos/test-${stamp}-2/original.jpg`, width: 2400, height: 1600 },
          ],
        },
      },
    });
    return { db, user, profile };
  }

  async function cleanup(db: Awaited<ReturnType<typeof makePendingProfile>>['db'], userId: string, profileId: string) {
    await db.notification.deleteMany({ where: { userId } }); // защита от чужих уведомлений
    await db.activityEvent.deleteMany({ where: { actorUserId: userId } });
    await db.photo.deleteMany({ where: { profileId } });
    await db.profileCategory.deleteMany({ where: { profileId } });
    await db.profileCategoryScore.deleteMany({ where: { profileId } }); // recomputeOne на approve пишет жанровые скоры
    await db.photographerProfile.delete({ where: { id: profileId } });
    await db.user.delete({ where: { id: userId } });
  }

  it('approve: профиль APPROVED, юзер ACTIVE, фото опубликованы + события', async () => {
    const { approveProfile } = await import('@/lib/moderation');
    const { db, user, profile } = await makePendingProfile();

    const { published } = await approveProfile(profile.id);
    expect(published).toBe(2);

    const after = await db.photographerProfile.findUniqueOrThrow({ where: { id: profile.id } });
    expect(after.status).toBe('APPROVED');
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).status).toBe('ACTIVE');

    const photos = await db.photo.findMany({ where: { profileId: profile.id } });
    expect(photos.every((p) => p.status === 'APPROVED' && p.publishedAt)).toBe(true);

    const events = await db.activityEvent.findMany({
      where: { actorUserId: user.id, type: 'PHOTO_PUBLISH' },
    });
    expect(events).toHaveLength(2);

    await cleanup(db, user.id, profile.id);
  });

  it('reject: профиль и фото REJECTED с причиной', async () => {
    const { rejectProfile } = await import('@/lib/moderation');
    const { db, user, profile } = await makePendingProfile();

    await rejectProfile(profile.id, 'Недостаточный технический уровень');

    const after = await db.photographerProfile.findUniqueOrThrow({ where: { id: profile.id } });
    expect(after.status).toBe('REJECTED');
    expect(after.rejectReason).toContain('уровень');
    const photos = await db.photo.findMany({ where: { profileId: profile.id } });
    expect(photos.every((p) => p.status === 'REJECTED')).toBe(true);

    await cleanup(db, user.id, profile.id);
  });
});

/**
 * Сброс кэша при одобрении — регрессия аудита 2026-08-16: вызов dropCache
 * стоял ПОСЛЕ return и не выполнялся никогда. Одобренный автор появлялся на
 * главной и в счётчиках города только по истечении TTL, хотя комментарий в
 * коде обещал обратное. Мок ловит и удаление вызова, и его недостижимость.
 */
describe.skipIf(!hasDb)('moderation: одобрение сбрасывает кэш витрин (БД)', () => {
  it('approveProfile зовёт dropCache с тегами каталога и главной', async () => {
    const { vi } = await import('vitest');
    vi.resetModules();
    const dropCache = vi.fn();
    vi.doMock('@/lib/cache-invalidate', () => ({ dropCache }));
    const { approveProfile } = await import('@/lib/moderation');
    const { db } = await import('@/lib/db');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const u = await db.user.create({
      data: { role: 'PHOTOGRAPHER', status: 'PENDING', firstName: 'Кэш', lastName: 'Сброс', email: `cache-${stamp}@test.local` },
    });
    const p = await db.photographerProfile.create({
      data: { userId: u.id, username: `cache-${stamp}`, cityId: city.id, status: 'PENDING' },
    });

    try {
      await approveProfile(p.id);
      const tags = dropCache.mock.calls.flat();
      expect(tags).toContain('catalog');
      expect(tags).toContain('home');
    } finally {
      vi.doUnmock('@/lib/cache-invalidate');
      await db.profileCategoryScore.deleteMany({ where: { profileId: p.id } });
      await db.notification.deleteMany({ where: { userId: u.id } });
      await db.photographerProfile.delete({ where: { id: p.id } });
      await db.user.delete({ where: { id: u.id } });
    }
  });
});
