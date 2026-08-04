import { afterAll, describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

// Личная отметка по веерной заявке (аудит 2026-08-01, P2).
// Заявку видят ВСЕ одобренные фотографы города — значит отметка «беру в работу»
// обязана быть личной: общий статус закрыл бы лид всем сразу.
describe.skipIf(!hasDb)('заявки: отметка фотографа личная и не течёт между городами (БД)', () => {
  const userIds: string[] = [];
  const inquiryIds: string[] = [];
  afterAll(async () => {
    const { db } = await import('@/lib/db');
    await db.adminAudit.deleteMany({ where: { targetId: { in: inquiryIds } } });
    await db.inquiryHandling.deleteMany({ where: { inquiryId: { in: inquiryIds } } });
    await db.notification.deleteMany({ where: { userId: { in: userIds } } });
    await db.inquiry.deleteMany({ where: { id: { in: inquiryIds } } });
    await db.profileCategoryScore.deleteMany({ where: { profile: { userId: { in: userIds } } } });
    await db.photographerProfile.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it('отметка одного фотографа не видна другому; заявку чужого города отметить нельзя', async () => {
    const { db } = await import('@/lib/db');
    const { setInquiryHandling, inquiriesForPhotographer } = await import('@/lib/inquiries');
    // Смотрим лентой из будущего: тест про отметки и маскировку контактов, а
    // не про фору подписчика — без сдвига свежая заявка просто не видна FREE
    const later = new Date(Date.now() + 12 * 3_600_000);

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const moscow = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const spb = await db.city.findFirstOrThrow({ where: { slug: { not: 'moscow' } } });

    const mkPhotographer = async (tag: string, cityId: string) => {
      const u = await db.user.create({
        data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: tag, lastName: 'Зая', email: `inq-${tag}-${stamp}@test.local` },
      });
      userIds.push(u.id);
      await db.photographerProfile.create({
        data: { userId: u.id, username: `inq-${tag}-${stamp}`, cityId, status: 'APPROVED' },
      });
      return u.id;
    };

    const first = await mkPhotographer('a', moscow.id);
    const second = await mkPhotographer('b', moscow.id);
    const foreign = await mkPhotographer('c', spb.id);

    const inquiry = await db.inquiry.create({
      data: {
        contactName: 'Клиент', contactPhone: '+79990000000', cityId: moscow.id,
        description: 'Нужна съёмка конференции на два дня.', status: 'OPEN',
      },
    });
    inquiryIds.push(inquiry.id);

    await setInquiryHandling(first, inquiry.id, 'IN_PROGRESS');

    const forFirst = await inquiriesForPhotographer(first, later);
    const forSecond = await inquiriesForPhotographer(second, later);
    expect(forFirst?.find((i) => i.id === inquiry.id)?.handling).toBe('IN_PROGRESS');
    // Ключевое: у соседа заявка осталась новой — лид не закрыт за него
    expect(forSecond?.find((i) => i.id === inquiry.id)?.handling).toBeNull();

    // Фотограф другого города эту заявку даже не видит — и отметить не может
    const forForeign = await inquiriesForPhotographer(foreign, later);
    expect(forForeign?.some((i) => i.id === inquiry.id)).toBe(false);
    await expect(setInquiryHandling(foreign, inquiry.id, 'IN_PROGRESS'))
      .rejects.toMatchObject({ code: 'forbidden', status: 403 });

    // Снятие отметки возвращает заявку в новые
    await setInquiryHandling(first, inquiry.id, null);
    const afterUndo = await inquiriesForPhotographer(first, later);
    expect(afterUndo?.find((i) => i.id === inquiry.id)?.handling).toBeNull();
  });
  it('контакты заказчика скрыты до отклика, раскрытие оставляет след в аудите', async () => {
    const { db } = await import('@/lib/db');
    const { setInquiryHandling, inquiriesForPhotographer } = await import('@/lib/inquiries');
    // Смотрим лентой из будущего: тест про отметки и маскировку контактов, а
    // не про фору подписчика — без сдвига свежая заявка просто не видна FREE
    const later = new Date(Date.now() + 12 * 3_600_000);

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const moscow = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const u = await db.user.create({
      data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Кон', lastName: 'Такт', email: `inqc-${stamp}@test.local` },
    });
    userIds.push(u.id);
    await db.photographerProfile.create({
      data: { userId: u.id, username: `inqc-${stamp}`, cityId: moscow.id, status: 'APPROVED' },
    });

    const inquiry = await db.inquiry.create({
      data: {
        contactName: 'Гость', contactPhone: '+79161234567', contactEmail: 'zakazchik@example.com',
        cityId: moscow.id, description: 'Съёмка форума, один день.', status: 'OPEN',
      },
    });
    inquiryIds.push(inquiry.id);

    // До отклика — маска: отличить заявки можно, связаться в обход нельзя
    const before = (await inquiriesForPhotographer(u.id, later))?.find((i) => i.id === inquiry.id);
    expect(before?.contactsRevealed).toBe(false);
    expect(before?.contactPhone).not.toBe('+79161234567');
    expect(before?.contactPhone).toContain('•');
    expect(before?.contactEmail).not.toBe('zakazchik@example.com');
    expect(before?.contactEmail).toContain('@example.com'); // домен виден, имя — нет

    await setInquiryHandling(u.id, inquiry.id, 'IN_PROGRESS');

    const after = (await inquiriesForPhotographer(u.id, later))?.find((i) => i.id === inquiry.id);
    expect(after?.contactsRevealed).toBe(true);
    expect(after?.contactPhone).toBe('+79161234567');
    expect(after?.contactEmail).toBe('zakazchik@example.com');

    // Обращение с чужими ПДн обязано оставлять след
    const audit = await db.adminAudit.findMany({
      where: { action: 'inquiry.contacts.reveal', targetId: inquiry.id },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0].actorUserId).toBe(u.id);

    // Повторная отметка того же состояния след не дублирует
    await setInquiryHandling(u.id, inquiry.id, 'IN_PROGRESS');
    expect(await db.adminAudit.count({ where: { action: 'inquiry.contacts.reveal', targetId: inquiry.id } })).toBe(1);
  });
});
