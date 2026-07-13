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

    const queued = await db.notification.findMany({
      where: { type: 'notification.inquiry.new', state: 'QUEUED' },
      orderBy: { createdAt: 'desc' },
      take: notified,
    });
    expect(queued.length).toBe(notified);

    // уборка тестовых данных
    await db.notification.deleteMany({ where: { type: 'notification.inquiry.new' } });
    await db.inquiry.delete({ where: { id: inquiryId } });
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
