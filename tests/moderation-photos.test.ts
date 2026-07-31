import { describe, expect, it } from 'vitest';
import 'dotenv/config';

// Продуктовые P0 аудита 2026-07-31:
// 1) кадры, добавленные ПОСЛЕ одобрения профиля, висели PENDING вечно —
//    инструмента их проверки не существовало;
// 2) отклонённый профиль был тупиком — вернуть его в очередь мог только админ.
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('пофотовая модерация (БД)', () => {
  it('очередь показывает PENDING-кадры одобренных авторов; approve публикует; reject доносит причину', async () => {
    const { db } = await import('@/lib/db');
    const { photoModerationQueue, approvePhoto, rejectPhoto } = await import('@/lib/moderation');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const cat = await db.category.findFirstOrThrow({ where: { slug: 'sports' } });

    const user = await db.user.create({
      data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'П', lastName: 'Модеров', email: `pm-${stamp}@test.local` },
    });
    const profile = await db.photographerProfile.create({
      data: { userId: user.id, username: `pm-${stamp}`, cityId: city.id, status: 'APPROVED' },
    });
    const mk = (key: string) =>
      db.photo.create({
        data: { profileId: profile.id, categoryId: cat.id, storageKey: `photos/pm-${stamp}-${key}/original.jpg`, width: 2400, height: 1600, status: 'PENDING' },
      });
    const good = await mk('good');
    const bad = await mk('bad');

    // Оба кадра — в очереди (раньше их не видел никакой инструмент)
    const queue = await photoModerationQueue();
    const mine = queue.filter((q) => q.profileId === profile.id).map((q) => q.photoId);
    expect(mine).toContain(good.id);
    expect(mine).toContain(bad.id);

    // Approve публикует
    await approvePhoto(good.id);
    const published = await db.photo.findUniqueOrThrow({ where: { id: good.id } });
    expect(published.status).toBe('APPROVED');
    expect(published.publishedAt).not.toBeNull();

    // Reject сохраняет причину и уведомляет автора
    await rejectPhoto(bad.id, 'Кадр не в жанре репортажа');
    const rejected = await db.photo.findUniqueOrThrow({ where: { id: bad.id } });
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.rejectReason).toBe('Кадр не в жанре репортажа');
    expect(await db.notification.count({ where: { userId: user.id, type: 'photo.rejected' } })).toBe(1);

    // Повторное решение по уже обработанному кадру — no-op, не ломается
    await approvePhoto(bad.id);
    expect((await db.photo.findUniqueOrThrow({ where: { id: bad.id } })).status).toBe('REJECTED');

    // Cleanup
    await db.notification.deleteMany({ where: { userId: user.id } });
    await db.activityEvent.deleteMany({ where: { targetId: { in: [good.id, bad.id] } } });
    await db.photo.deleteMany({ where: { profileId: profile.id } });
    await db.profileCategoryScore.deleteMany({ where: { profileId: profile.id } });
    await db.photographerProfile.delete({ where: { id: profile.id } });
    await db.user.delete({ where: { id: user.id } });
  });
});

describe.skipIf(!hasDb)('повторная подача анкеты (БД)', () => {
  it('REJECTED → PENDING вместе с отклонёнными кадрами; из APPROVED нельзя; без фото нельзя', async () => {
    const { db } = await import('@/lib/db');
    const { resubmitProfile } = await import('@/lib/profile-lifecycle');
    const { DomainError } = await import('@/lib/errors');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const cat = await db.category.findFirstOrThrow({ where: { slug: 'sports' } });

    const user = await db.user.create({
      data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'О', lastName: 'Тклонённый', email: `rs-${stamp}@test.local` },
    });
    const profile = await db.photographerProfile.create({
      data: { userId: user.id, username: `rs-${stamp}`, cityId: city.id, status: 'REJECTED', rejectReason: 'мало работ' },
    });

    // Без единого кадра повторная подача не имеет смысла
    await expect(resubmitProfile(user.id)).rejects.toThrowError(DomainError);

    const photo = await db.photo.create({
      data: { profileId: profile.id, categoryId: cat.id, storageKey: `photos/rs-${stamp}/original.jpg`, width: 2400, height: 1600, status: 'REJECTED', rejectReason: 'мало работ' },
    });

    expect((await resubmitProfile(user.id)).status).toBe('PENDING');
    const back = await db.photographerProfile.findUniqueOrThrow({ where: { id: profile.id } });
    expect(back.status).toBe('PENDING');
    expect(back.rejectReason).toBeNull();
    // Кадры тоже вернулись на пересмотр — иначе портфолио осталось бы пустым
    const backPhoto = await db.photo.findUniqueOrThrow({ where: { id: photo.id } });
    expect(backPhoto.status).toBe('PENDING');
    expect(backPhoto.rejectReason).toBeNull();

    // Из PENDING/APPROVED повторно подать нельзя
    await expect(resubmitProfile(user.id)).rejects.toThrowError(DomainError);

    // Cleanup
    await db.photo.deleteMany({ where: { profileId: profile.id } });
    await db.profileCategoryScore.deleteMany({ where: { profileId: profile.id } });
    await db.photographerProfile.delete({ where: { id: profile.id } });
    await db.user.delete({ where: { id: user.id } });
  });
});
