import { describe, expect, it, vi } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

const session = { current: null as unknown };
vi.mock('@/lib/auth', () => ({
  getSession: async () => session.current,
}));

/**
 * Автор публикует съёмку серией: тридцать-сорок кадров за раз. Поштучное
 * одобрение означает, что очередь копится, работы висят неопубликованными, а
 * виноватой выглядит платформа.
 */
describe.skipIf(!hasDb)('модерация кадров пачкой (БД)', () => {
  it('решение по пачке не срывается из-за одного пропавшего кадра', async () => {
    const { db } = await import('@/lib/db');
    const { POST } = await import('@/app/api/admin/moderation/photos/route');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const category = await db.category.findFirstOrThrow({ where: { slug: 'sports' } });

    const admin = await db.user.create({
      data: { role: 'ADMIN', status: 'ACTIVE', firstName: 'Ад', lastName: 'Мин', email: `bm-adm-${stamp}@test.local` },
    });
    const author = await db.user.create({
      data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Ав', lastName: 'Тор', email: `bm-a-${stamp}@test.local` },
    });
    const profile = await db.photographerProfile.create({
      data: { userId: author.id, username: `bm-${stamp}`, cityId: city.id, status: 'APPROVED' },
    });

    const photos = await Promise.all(
      [0, 1, 2].map((i) =>
        db.photo.create({
          data: {
            profileId: profile.id, categoryId: category.id, status: 'PENDING',
            storageKey: `test/bm-${stamp}-${i}/original.jpg`, width: 100, height: 100,
          },
        }),
      ),
    );

    session.current = { userId: admin.id, role: 'ADMIN', tokenVersion: 0 };
    const req = (body: unknown) =>
      new Request('http://localhost/api/admin/moderation/photos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

    // В пачку попадает несуществующий кадр — так бывает, когда автор удалил его
    // сам, пока очередь была открыта. Раньше это уронило бы весь запрос
    const res = await POST(req({
      action: 'approve',
      photoIds: [...photos.map((p) => p.id), 'photo-which-does-not-exist'],
    }));
    const body = (await res.json()) as { done: number; failed: string[] };

    expect(body.done).toBe(3);
    expect(body.failed).toHaveLength(1);
    for (const p of photos) {
      expect((await db.photo.findUniqueOrThrow({ where: { id: p.id } })).status).toBe('APPROVED');
    }

    // Отказ без причины не проходит: «нет» без объяснения неотличимо от произвола
    const noReason = await POST(req({ action: 'reject', photoIds: [photos[0].id] }));
    expect(noReason.status).toBe(400);

    session.current = null;
    await db.adminAudit.deleteMany({ where: { actorUserId: admin.id } });
    // Одобрение кадра создаёт события и пересчитывает жанровый рейтинг —
    // связи чистим до профиля (иначе FK не даст удалить)
    await db.activityEvent.deleteMany({ where: { targetType: 'PHOTO' } });
    await db.photo.deleteMany({ where: { profileId: profile.id } });
    await db.profileCategoryScore.deleteMany({ where: { profileId: profile.id } });
    await db.photographerProfile.delete({ where: { id: profile.id } });
    await db.user.deleteMany({ where: { id: { in: [admin.id, author.id] } } });
  });
});
