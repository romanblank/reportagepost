import { describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('admin-onboard: создание фотографа админом (БД)', () => {
  it('создаёт User+Profile+категории+аудит; publish→APPROVED, черновик→DRAFT; коллизии', async () => {
    const { db } = await import('@/lib/db');
    const { createPhotographerByAdmin } = await import('@/lib/admin-onboard');
    const { DomainError } = await import('@/lib/errors');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const admin = await db.user.create({ data: { role: 'ADMIN', status: 'ACTIVE', firstName: 'А', lastName: 'Д', email: `adm-onb-${stamp}@test.local` } });
    const cat = await db.category.findFirstOrThrow({ where: { active: true } });

    // черновик
    const draft = await createPhotographerByAdmin(admin.id, {
      firstName: 'Иван', lastName: 'Петров', username: `ivan-${stamp}`,
      citySlug: 'moscow', categorySlugs: [cat.slug], bio: 'Репортаж', publish: false,
    });
    const dp = await db.photographerProfile.findUniqueOrThrow({ where: { id: draft.profileId }, include: { categories: true, user: true } });
    expect(dp.status).toBe('DRAFT');
    expect(dp.categories.length).toBe(1);
    expect(dp.user.role).toBe('PHOTOGRAPHER');
    expect(dp.user.passwordHash).toBeNull(); // без пароля — заберёт позже
    // аудит записан
    expect(await db.adminAudit.count({ where: { actorUserId: admin.id, action: 'photographer.create' } })).toBeGreaterThanOrEqual(1);

    // публикация
    const pub = await createPhotographerByAdmin(admin.id, {
      firstName: 'Мария', lastName: 'Ким', username: `maria-${stamp}`,
      citySlug: 'moscow', categorySlugs: [cat.slug], publish: true,
    });
    expect((await db.photographerProfile.findUniqueOrThrow({ where: { id: pub.profileId } })).status).toBe('APPROVED');

    // коллизия username
    await expect(createPhotographerByAdmin(admin.id, {
      firstName: 'Дубль', lastName: 'Дубль', username: `ivan-${stamp}`,
      citySlug: 'moscow', categorySlugs: [cat.slug], publish: false,
    })).rejects.toThrow(DomainError);

    // несуществующий город
    await expect(createPhotographerByAdmin(admin.id, {
      firstName: 'Т', lastName: 'Т', username: `t-${stamp}`,
      citySlug: 'nowhere-city', categorySlugs: [cat.slug], publish: false,
    })).rejects.toThrow(DomainError);

    // cleanup
    const ids = [draft.profileId, pub.profileId];
    const userIds = (await db.photographerProfile.findMany({ where: { id: { in: ids } }, select: { userId: true } })).map((p) => p.userId);
    await db.adminAudit.deleteMany({ where: { actorUserId: admin.id } });
    await db.profileCategory.deleteMany({ where: { profileId: { in: ids } } });
    await db.photographerProfile.deleteMany({ where: { id: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: [...userIds, admin.id] } } });
  });
});

describe.skipIf(!hasDb)('admin-onboard: публикация/снятие анкеты (БД)', () => {
  it('publish → APPROVED + PENDING-фото публикуются + user ACTIVE + аудит; unpublish → DRAFT', async () => {
    const { db } = await import('@/lib/db');
    const { createPhotographerByAdmin, setProfilePublication } = await import('@/lib/admin-onboard');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const admin = await db.user.create({ data: { role: 'ADMIN', status: 'ACTIVE', firstName: 'А', lastName: 'Д', email: `adm-pub-${stamp}@test.local` } });
    const cat = await db.category.findFirstOrThrow({ where: { active: true } });

    // черновик + PENDING-кадр
    const draft = await createPhotographerByAdmin(admin.id, {
      firstName: 'Пётр', lastName: 'Сидоров', username: `petr-${stamp}`,
      citySlug: 'moscow', categorySlugs: [cat.slug], publish: false,
    });
    const photo = await db.photo.create({
      data: { profileId: draft.profileId, categoryId: cat.id, storageKey: `k-${stamp}`, width: 800, height: 600, phash: `p-${stamp}`, status: 'PENDING' },
    });

    // публикация
    const pub = await setProfilePublication(admin.id, draft.profileId, true);
    expect(pub.status).toBe('APPROVED');
    expect((await db.photographerProfile.findUniqueOrThrow({ where: { id: draft.profileId } })).status).toBe('APPROVED');
    expect((await db.photo.findUniqueOrThrow({ where: { id: photo.id } })).status).toBe('APPROVED');
    const draftUser = (await db.photographerProfile.findUniqueOrThrow({ where: { id: draft.profileId }, select: { userId: true } })).userId;
    expect((await db.user.findUniqueOrThrow({ where: { id: draftUser } })).status).toBe('ACTIVE');
    expect(await db.adminAudit.count({ where: { actorUserId: admin.id, action: 'profile.publish' } })).toBeGreaterThanOrEqual(1);

    // снятие
    const unp = await setProfilePublication(admin.id, draft.profileId, false);
    expect(unp.status).toBe('DRAFT');
    expect((await db.photographerProfile.findUniqueOrThrow({ where: { id: draft.profileId } })).status).toBe('DRAFT');

    // cleanup
    await db.photo.deleteMany({ where: { profileId: draft.profileId } });
    await db.adminAudit.deleteMany({ where: { actorUserId: admin.id } });
    await db.profileCategory.deleteMany({ where: { profileId: draft.profileId } });
    await db.photographerProfile.deleteMany({ where: { id: draft.profileId } });
    await db.user.deleteMany({ where: { id: { in: [draftUser, admin.id] } } });
  });
});
