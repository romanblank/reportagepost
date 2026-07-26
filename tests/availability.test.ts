import { describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('availability: календарь занятости (БД)', () => {
  it('toggle занятости + скрытие в каталоге на занятую дату', async () => {
    const { db } = await import('@/lib/db');
    const { toggleBusyDate, listBusyDates } = await import('@/lib/availability');
    const { catalogForCity } = await import('@/lib/catalog');
    const { DomainError } = await import('@/lib/errors');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const spb = await db.city.findFirstOrThrow({ where: { slug: 'saint-petersburg' } });
    const cat = await db.category.findFirstOrThrow({ where: { slug: 'concerts-festivals' } });
    const owner = await db.user.create({ data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'А', lastName: 'В', email: `avail-${stamp}@test.local` } });
    const profile = await db.photographerProfile.create({ data: { userId: owner.id, username: `avail-${stamp}`, cityId: spb.id, status: 'APPROVED' } });
    // ≥1 фото — иначе каталог фильтрует пустой профиль (планка качества)
    await db.photo.create({ data: { profileId: profile.id, categoryId: cat.id, storageKey: `photos/avail-${stamp}/original.jpg`, width: 2400, height: 1600, status: 'APPROVED', publishedAt: new Date() } });

    const day = '2026-12-24';
    // toggle → занят
    expect(await toggleBusyDate(owner.id, day)).toBe(true);
    expect(await listBusyDates(owner.id, new Date('2026-01-01T00:00:00Z'))).toContain(day);

    // каталог на эту дату НЕ показывает фотографа
    const busyPage = await catalogForCity({ citySlug: 'saint-petersburg', availableOn: new Date(`${day}T00:00:00Z`) });
    expect(busyPage.cards.some((c) => c.username === `avail-${stamp}`)).toBe(false);

    // toggle обратно → свободен, снова в выдаче
    expect(await toggleBusyDate(owner.id, day)).toBe(false);
    const freePage = await catalogForCity({ citySlug: 'saint-petersburg', availableOn: new Date(`${day}T00:00:00Z`) });
    expect(freePage.cards.some((c) => c.username === `avail-${stamp}`)).toBe(true);

    // невалидная дата — отказ
    await expect(toggleBusyDate(owner.id, 'not-a-date')).rejects.toThrow(DomainError);

    await db.busyDate.deleteMany({ where: { profileId: profile.id } });
    await db.photo.deleteMany({ where: { profileId: profile.id } });
    await db.photographerProfile.delete({ where: { id: profile.id } });
    await db.user.delete({ where: { id: owner.id } });
  });
});
