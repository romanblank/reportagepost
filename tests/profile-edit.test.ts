import { describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('applyProfileEdit: общая правка анкеты (self + админ) (БД)', () => {
  it('меняет bio/город/жанры/username; коллизия username → DomainError', async () => {
    const { db } = await import('@/lib/db');
    const { createPhotographerByAdmin } = await import('@/lib/admin-onboard');
    const { applyProfileEdit } = await import('@/lib/profile-edit');
    const { DomainError } = await import('@/lib/errors');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const admin = await db.user.create({ data: { role: 'ADMIN', status: 'ACTIVE', firstName: 'А', lastName: 'Д', email: `adm-edit-${stamp}@test.local` } });
    const cats = await db.category.findMany({ where: { active: true }, take: 2 });
    expect(cats.length).toBe(2);

    const a = await createPhotographerByAdmin(admin.id, {
      firstName: 'Анна', lastName: 'И', username: `anna-${stamp}`,
      citySlug: 'moscow', categorySlugs: [cats[0].slug], bio: 'старое', publish: false,
    });
    const b = await createPhotographerByAdmin(admin.id, {
      firstName: 'Борис', lastName: 'К', username: `boris-${stamp}`,
      citySlug: 'moscow', categorySlugs: [cats[0].slug], publish: false,
    });

    // правка bio + жанры + новый username
    const newName = `anna-new-${stamp}`;
    const res = await applyProfileEdit(a.profileId, a.username, {
      username: newName, bio: 'новое', categorySlugs: [cats[0].slug, cats[1].slug],
    });
    expect(res.username).toBe(newName);
    const edited = await db.photographerProfile.findUniqueOrThrow({ where: { id: a.profileId }, include: { categories: true } });
    expect(edited.bio).toBe('новое');
    expect(edited.username).toBe(newName);
    expect(edited.categories.length).toBe(2);

    // коллизия username (b пытается занять чужой)
    await expect(applyProfileEdit(b.profileId, b.username, { username: newName })).rejects.toThrow(DomainError);

    // несуществующий город
    await expect(applyProfileEdit(b.profileId, b.username, { citySlug: 'nowhere-city' })).rejects.toThrow(DomainError);

    // cleanup
    const ids = [a.profileId, b.profileId];
    const userIds = (await db.photographerProfile.findMany({ where: { id: { in: ids } }, select: { userId: true } })).map((p) => p.userId);
    await db.adminAudit.deleteMany({ where: { actorUserId: admin.id } });
    await db.profileCategory.deleteMany({ where: { profileId: { in: ids } } });
    await db.photographerProfile.deleteMany({ where: { id: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: [...userIds, admin.id] } } });
  });
});
