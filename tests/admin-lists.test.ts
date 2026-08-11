import { describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

/**
 * Списки админки обязаны выдерживать рост.
 *
 * Раньше они отдавали первые N записей и молчали об остальном: сорок первый
 * человек и сто первая запись аудита переставали существовать — найти их было
 * нечем, даже зная, что они есть.
 */
describe.skipIf(!hasDb)('списки администрирования листаются (БД)', () => {
  it('поиск людей отдаёт страницу и общее число', async () => {
    const { db } = await import('@/lib/db');
    const { searchUsers, USERS_PER_PAGE } = await import('@/lib/admin-users');

    const stamp = `${Date.now()}`;
    const created = await Promise.all(
      Array.from({ length: USERS_PER_PAGE + 3 }, (_, i) =>
        db.user.create({
          data: {
            role: 'CLIENT', status: 'ACTIVE', firstName: 'Списочный', lastName: `Тест${i}`,
            email: `list-${stamp}-${i}@test.local`,
          },
        }),
      ),
    );

    const first = await searchUsers('Списочный', 1);
    const second = await searchUsers('Списочный', 2);

    expect(first.items).toHaveLength(USERS_PER_PAGE);
    expect(first.total).toBeGreaterThanOrEqual(USERS_PER_PAGE + 3);
    // Вторая страница существует и содержит других людей
    expect(second.items.length).toBeGreaterThan(0);
    expect(second.items[0].id).not.toBe(first.items[0].id);

    await db.user.deleteMany({ where: { id: { in: created.map((u) => u.id) } } });
  });

  it('заявки фильтруются по состоянию', async () => {
    const { db } = await import('@/lib/db');
    const { adminInquiries } = await import('@/lib/admin-inquiries');

    const stamp = `${Date.now()}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'chita' } });
    const untouched = await db.inquiry.create({
      data: { cityId: city.id, contactName: `Без откликов ${stamp}`, description: 'Тестовая заявка без откликов.' },
    });

    // «Без единого отклика» — рабочий режим: именно с этими заявками ещё можно
    // что-то сделать, и искать их глазами среди сотни остальных бессмысленно
    const page = await adminInquiries('untouched', 1);
    expect(page.items.some((i) => i.id === untouched.id)).toBe(true);

    const taken = await adminInquiries('taken', 1);
    expect(taken.items.some((i) => i.id === untouched.id)).toBe(false);

    await db.inquiry.delete({ where: { id: untouched.id } });
  });
});
