import { describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

// Env-зависимость (правило c): нужен локальный PG
describe.skipIf(!hasDb)('inquiries: создание и доставка (БД)', () => {
  it('заявка без контактов гостя отклоняется', async () => {
    const { createInquiry, InquiryError } = await import('@/lib/inquiries');
    await expect(
      createInquiry({
        contactName: 'Гость',
        citySlug: 'moscow',
        description: 'Нужен фотограф на конференцию в сентябре, полный день.',
      }),
    ).rejects.toThrow(InquiryError);
  });

  it('заявка создаётся и ставит уведомления фотографам города/категории', async () => {
    const { db } = await import('@/lib/db');
    const { createInquiry } = await import('@/lib/inquiries');

    // Самодостаточность (урок CI 2026-07-13): создаём своего APPROVED-фотографа,
    // не полагаясь на состояние БД
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const category = await db.category.findFirstOrThrow({ where: { slug: 'concerts-festivals' } });
    const photographer = await db.user.create({
      data: {
        role: 'PHOTOGRAPHER', status: 'ACTIVE',
        firstName: 'Инк', lastName: 'Тестов', email: `inq-${stamp}@test.local`,
      },
    });
    const profile = await db.photographerProfile.create({
      data: {
        userId: photographer.id, username: `inq-${stamp}`, cityId: city.id,
        status: 'APPROVED', categories: { create: [{ categoryId: category.id }] },
      },
    });

    const { inquiryId, notified } = await createInquiry({
      contactName: 'Тест Заказчиков',
      contactEmail: 'client@test.local',
      citySlug: 'moscow',
      categorySlug: 'concerts-festivals',
      eventDate: new Date('2026-09-01T00:00:00Z'),
      budgetMinor: 3_000_000,
      description: 'Concert coverage needed, full evening, two stages, test inquiry.',
    });

    expect(inquiryId).toBeTruthy();
    // В БД есть минимум один APPROVED фотограф Москвы этой категории (из live-прогонов)
    expect(notified).toBeGreaterThanOrEqual(1);

    // Новая модель: durable-доставка через notifyInApp (канал IN_APP), не QUEUED
    const inApp = await db.notification.findMany({
      where: { type: 'notification.inquiry.new', channel: 'IN_APP' },
    });
    expect(inApp.length).toBeGreaterThanOrEqual(notified);

    // уборка тестовых данных
    await db.notification.deleteMany({ where: { type: 'notification.inquiry.new' } });
    await db.inquiry.delete({ where: { id: inquiryId } });
    await db.profileCategory.deleteMany({ where: { profileId: profile.id } });
    await db.photographerProfile.delete({ where: { id: profile.id } });
    await db.user.delete({ where: { id: photographer.id } });
  });

  it('чужая категория — уведомлений нет, заявка есть', async () => {
    const { db } = await import('@/lib/db');
    const { createInquiry } = await import('@/lib/inquiries');

    const { inquiryId, notified } = await createInquiry({
      contactName: 'Спорт Заказчик',
      contactEmail: 'sport@test.local',
      citySlug: 'chita', // тихий город: другие тесты не создают там фотографов
      categorySlug: 'sports',
      description: 'Sports match photo coverage needed, test inquiry record.',
    });
    expect(notified).toBe(0);
    await db.inquiry.delete({ where: { id: inquiryId } });
  });
});

/**
 * Фора подписчиков на заявку.
 *
 * Единственный перк, ценность которого не зависит от нашей посещаемости: она
 * растёт от числа заявок. Проверяем главное — что заявка в итоге доходит ДО
 * ВСЕХ, а подписка влияет только на очерёдность. Продавать эксклюзив навсегда
 * означало бы оставить заказчика с меньшим выбором.
 */
describe.skipIf(!hasDb)('заявки: фора подписчиков, но не эксклюзив (БД)', () => {
  it('первыми узнают Active+, остальные — следующей волной', async () => {
    const { db } = await import('@/lib/db');
    const { createInquiry, releaseInquiries } = await import('@/lib/inquiries');
    const { ELITE_RANK, PRIME_RANK } = await import('@/lib/subscription');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });

    const mk = async (tag: string, rank: number) => {
      const u = await db.user.create({
        data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: tag, lastName: 'В', email: `wave-${tag}-${stamp}@test.local` },
      });
      await db.photographerProfile.create({
        data: { userId: u.id, username: `wave-${tag}-${stamp}`, cityId: city.id, status: 'APPROVED', proRank: rank },
      });
      return u.id;
    };
    const elite = await mk('e', ELITE_RANK);
    const prime = await mk('p', PRIME_RANK);
    const free = await mk('f', 0);

    try {
      const { inquiryId } = await createInquiry({
        citySlug: 'moscow', description: 'Нужен фотограф на конференцию, полный день',
        contactName: 'Тест', contactEmail: `cl-${stamp}@test.local`,
      });

      const got = async (userId: string) =>
        db.notification.count({ where: { userId, type: 'notification.inquiry.new' } });

      // Сразу после создания уведомление есть только у верхнего уровня
      expect(await got(elite)).toBe(1);
      expect(await got(prime)).toBe(0);
      expect(await got(free)).toBe(0);

      // Отматываем создание на семь часов назад — прошли обе волны
      await db.inquiry.update({
        where: { id: inquiryId },
        data: { createdAt: new Date(Date.now() - 7 * 3_600_000) },
      });
      await releaseInquiries();

      // Заявка дошла до ВСЕХ — подписка влияет только на очерёдность
      expect(await got(prime)).toBe(1);
      expect(await got(free)).toBe(1);
      // И никому не продублировалась
      expect(await got(elite)).toBe(1);

      await db.inquiry.delete({ where: { id: inquiryId } });
    } finally {
      await db.notification.deleteMany({ where: { userId: { in: [elite, prime, free] } } });
      await db.photographerProfile.deleteMany({ where: { userId: { in: [elite, prime, free] } } });
      await db.user.deleteMany({ where: { id: { in: [elite, prime, free] } } });
    }
  });
});
