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
    await db.profileCategoryScore.deleteMany({ where: { profileId: { in: ids } } }); // applyProfileEdit пересчитывает скоры
    await db.photographerProfile.deleteMany({ where: { id: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: [...userIds, admin.id] } } });
  });
});

/**
 * Командировки и загранпаспорт (партнёр 2026-08-18): паспорт осмыслен только
 * при travelScope=ABROAD. Уход с ABROAD обязан сбрасывать флаг — иначе на
 * анкете остаётся устаревший факт, которому заказчик поверит.
 */
describe.skipIf(!hasDb)('applyProfileEdit: загранпаспорт живёт только при ABROAD (БД)', () => {
  it('смена travelScope с ABROAD сбрасывает hasIntlPassport, попутный true игнорируется', async () => {
    const { db } = await import('@/lib/db');
    const { createPhotographerByAdmin } = await import('@/lib/admin-onboard');
    const { applyProfileEdit } = await import('@/lib/profile-edit');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const admin = await db.user.create({ data: { role: 'ADMIN', status: 'ACTIVE', firstName: 'А', lastName: 'П', email: `adm-tr-${stamp}@test.local` } });
    const cat = await db.category.findFirstOrThrow({ where: { active: true } });
    const a = await createPhotographerByAdmin(admin.id, {
      firstName: 'Тр', lastName: 'Авел', username: `travel-${stamp}`,
      citySlug: 'moscow', categorySlugs: [cat.slug], publish: false,
    });

    const passport = async () =>
      (await db.photographerProfile.findUniqueOrThrow({ where: { id: a.profileId }, select: { hasIntlPassport: true, travelScope: true } }));

    try {
      // Зарубежные командировки + паспорт — сохраняется
      await applyProfileEdit(a.profileId, a.username, { travelScope: 'ABROAD', hasIntlPassport: true });
      expect(await passport()).toMatchObject({ travelScope: 'ABROAD', hasIntlPassport: true });

      // Ушёл с ABROAD — паспорт сброшен, даже без явного null в правке
      await applyProfileEdit(a.profileId, a.username, { travelScope: 'COUNTRY' });
      expect(await passport()).toMatchObject({ travelScope: 'COUNTRY', hasIntlPassport: null });

      // Паспорт при не-ABROAD игнорируется, а не сохраняется «на будущее»
      await applyProfileEdit(a.profileId, a.username, { travelScope: 'NONE', hasIntlPassport: true });
      expect(await passport()).toMatchObject({ travelScope: 'NONE', hasIntlPassport: null });

      // Правка БЕЗ travelScope паспорт не трогает (поле «не менять»)
      await applyProfileEdit(a.profileId, a.username, { travelScope: 'ABROAD', hasIntlPassport: true });
      await applyProfileEdit(a.profileId, a.username, { bio: 'просто текст о съёмке' });
      expect(await passport()).toMatchObject({ travelScope: 'ABROAD', hasIntlPassport: true });
    } finally {
      const userId = (await db.photographerProfile.findUniqueOrThrow({ where: { id: a.profileId }, select: { userId: true } })).userId;
      await db.adminAudit.deleteMany({ where: { actorUserId: admin.id } });
      await db.profileCategory.deleteMany({ where: { profileId: a.profileId } });
      await db.profileCategoryScore.deleteMany({ where: { profileId: a.profileId } });
      await db.photographerProfile.delete({ where: { id: a.profileId } });
      await db.user.deleteMany({ where: { id: { in: [userId, admin.id] } } });
    }
  });
});
