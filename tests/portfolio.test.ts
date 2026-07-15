import { describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('portfolio: удаление/пересортировка/обложка (БД)', () => {
  it('reorder меняет sortOrder; setCover только APPROVED; delete чистит и снимает обложку; чужое запрещено', async () => {
    const { db } = await import('@/lib/db');
    const { deletePhoto, reorderPhotos, setCover } = await import('@/lib/portfolio');
    const { DomainError } = await import('@/lib/errors');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const spb = await db.city.findFirstOrThrow({ where: { slug: 'saint-petersburg' } });
    const cat = await db.category.findFirstOrThrow({});
    const owner = await db.user.create({ data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'П', lastName: 'Ф', email: `pf-${stamp}@test.local` } });
    const profile = await db.photographerProfile.create({ data: { userId: owner.id, username: `pf-${stamp}`, cityId: spb.id, status: 'APPROVED' } });
    const other = await db.user.create({ data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Ч', lastName: 'Ж', email: `pf2-${stamp}@test.local` } });

    const mk = (n: number, status: 'APPROVED' | 'PENDING' = 'APPROVED') =>
      db.photo.create({ data: { profileId: profile.id, categoryId: cat.id, storageKey: `photos/${stamp}-${n}/original.jpg`, width: 3000, height: 2000, status, sortOrder: n } });
    const p1 = await mk(1);
    const p2 = await mk(2);
    const p3 = await mk(3, 'PENDING');

    // reorder: p2,p1,p3 → sortOrder 0,1,2
    await reorderPhotos(owner.id, [p2.id, p1.id, p3.id]);
    const after = await db.photo.findMany({ where: { profileId: profile.id }, orderBy: { sortOrder: 'asc' }, select: { id: true } });
    expect(after.map((x) => x.id)).toEqual([p2.id, p1.id, p3.id]);

    // reorder чужого фото — отказ
    await expect(reorderPhotos(other.id, [p1.id])).rejects.toThrow(DomainError);

    // setCover PENDING — отказ; APPROVED — ок
    await expect(setCover(owner.id, p3.id)).rejects.toThrow(DomainError);
    await setCover(owner.id, p1.id);
    expect((await db.photographerProfile.findUniqueOrThrow({ where: { id: profile.id } })).coverPhotoId).toBe(p1.id);

    // delete обложки → снимает coverPhotoId и удаляет фото
    await deletePhoto(owner.id, p1.id);
    const prof = await db.photographerProfile.findUniqueOrThrow({ where: { id: profile.id } });
    expect(prof.coverPhotoId).toBeNull();
    expect(await db.photo.findUnique({ where: { id: p1.id } })).toBeNull();

    // delete чужого — отказ
    await expect(deletePhoto(other.id, p2.id)).rejects.toThrow(DomainError);

    // cleanup
    await db.photo.deleteMany({ where: { profileId: profile.id } });
    await db.photographerProfile.delete({ where: { id: profile.id } });
    await db.user.deleteMany({ where: { id: { in: [owner.id, other.id] } } });
  });
});
