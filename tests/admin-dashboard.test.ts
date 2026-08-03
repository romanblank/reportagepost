import { describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

/**
 * Truth — первый столп админки: пока цифры включают демо-витрину и тестовые
 * аккаунты, все выводы по ним льстят. Здесь проверяется именно это: панель
 * считает рынок, а не собственный реквизит.
 */
describe.skipIf(!hasDb)('панель администратора: правда в цифрах (БД)', () => {
  it('демо-витрина и тестовые аккаунты не попадают в метрики', async () => {
    const { db } = await import('@/lib/db');
    const { adminDashboard } = await import('@/lib/admin-dashboard');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });

    const before = await adminDashboard(30);
    const newProfilesBefore = before.supply.find((k) => k.key === 'newPhotographers')!.value;

    // Демо-автор: витрина закрытого показа, не рынок
    const demoUser = await db.user.create({
      data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Д', lastName: 'В', email: `demo-${stamp}@demo.local` },
    });
    const demoProfile = await db.photographerProfile.create({
      data: { userId: demoUser.id, username: `futazh-test-${stamp}`, cityId: city.id, status: 'APPROVED' },
    });
    // Тестовый аккаунт: остаётся от прогонов тестов
    const testUser = await db.user.create({
      data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Т', lastName: 'Т', email: `t-${stamp}@test.local` },
    });
    const testProfile = await db.photographerProfile.create({
      data: { userId: testUser.id, username: `t-${stamp}`, cityId: city.id, status: 'PENDING' },
    });

    const after = await adminDashboard(30);
    expect(
      after.supply.find((k) => k.key === 'newPhotographers')!.value,
      'демо-витрина или тестовый аккаунт попали в метрику новых авторов',
    ).toBe(newProfilesBefore);

    // А вот очередь модерации — это работа, которая реально ждёт человека,
    // и тестовая анкета в ней видна честно
    expect(after.queues.profiles).toBeGreaterThanOrEqual(1);

    await db.photographerProfile.deleteMany({ where: { id: { in: [demoProfile.id, testProfile.id] } } });
    await db.user.deleteMany({ where: { id: { in: [demoUser.id, testUser.id] } } });
  });

  it('порог тревоги у каждой задачи свой — общий скрыл бы поломку транскода', async () => {
    const { adminDashboard } = await import('@/lib/admin-dashboard');
    const data = await adminDashboard(7);
    const byName = Object.fromEntries(data.jobs.map((j) => [j.name, j.staleAfterHours]));
    // Транскод ходит раз в две минуты: суточный порог означал бы сутки тишины
    expect(byName.video).toBeLessThan(byName.maintenance);
    expect(byName.backup).toBeGreaterThan(24);
  });

  // Лента читает ВСЮ базу, поэтому её содержимое зависит от параллельно
  // работающих тестов: соседний файл может удалить свои жалобы ровно между
  // нашей вставкой и чтением. Повтор здесь не маскирует дефект — он отражает
  // реальную природу проверки «в общей ленте видно оба типа событий».
  it('лента сводит разные события в один список и держит порядок по времени', { retry: 2 }, async () => {
    const { db } = await import('@/lib/db');
    const { adminActivity } = await import('@/lib/admin-dashboard');

    // Проверяем не «в базе разное лежит» (это зависит от данных), а что запрос
    // ДЕЙСТВИТЕЛЬНО объединяет источники: кладём два разнотипных события
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const guest = await db.user.create({
      data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'Ж', lastName: 'Л', email: `feed-${stamp}@test.local` },
    });
    const inquiry = await db.inquiry.create({
      data: { cityId: city.id, description: 'тестовая заявка ленты', contactName: 'Тест', contactEmail: `feed-${stamp}@test.local` },
    });
    const report = await db.report.create({
      data: { reporterId: guest.id, targetType: 'USER', targetId: guest.id, reason: 'SPAM' },
    });

    try {
      // Лимит с запасом и отсчёт от начала теста: при параллельном прогоне
      // другие тесты успевают насыпать событий, и наши выпадали за окно
      const startedAt = new Date(Date.now() - 60_000);
      const items = (await adminActivity(1000)).filter((i) => i.at >= startedAt);
      for (let i = 1; i < items.length; i++) {
        expect(items[i - 1].at.getTime()).toBeGreaterThanOrEqual(items[i].at.getTime());
      }
      const kinds = new Set(items.map((i) => i.kind));
      expect(kinds.has('inquiry'), 'заявки не попали в ленту').toBe(true);
      expect(kinds.has('report'), 'жалобы не попали в ленту').toBe(true);
    } finally {
      await db.report.delete({ where: { id: report.id } });
      await db.inquiry.delete({ where: { id: inquiry.id } });
      await db.user.delete({ where: { id: guest.id } });
    }
  });
});
