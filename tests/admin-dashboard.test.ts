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
});

/**
 * Воронка обязана считаться по КОГОРТЕ: заявки периода и то, что случилось
 * именно с ними. Иначе сравниваются тёплое с мягким — заявки этого месяца
 * против съёмок, выросших из заявок прошлого, — и вывод получается ложным.
 */
describe.skipIf(!hasDb)('панель: воронка и удержание (БД)', () => {
  it('шаги идут по убыванию и считают долю от предыдущего', async () => {
    const { adminAnalysis } = await import('@/lib/admin-analysis');
    const a = await adminAnalysis(30);

    expect(a.funnel.map((f) => f.key)).toEqual(['inquiries', 'answered', 'taken', 'shoots']);
    // Первый шаг не с чем сравнивать — доля обязана быть пустой, а не 100%
    expect(a.funnel[0].ofPrev).toBeNull();
    for (let i = 1; i < a.funnel.length; i++) {
      if (a.funnel[i - 1].count > 0 && a.funnel[i].key !== 'shoots') {
        // Реакций не может быть больше, чем заявок; взятых — больше, чем реакций
        expect(a.funnel[i].count).toBeLessThanOrEqual(a.funnel[i - 1].count);
      }
    }
  });

  it('возвраты считаются как заказчики с более чем одной съёмкой', async () => {
    const { adminAnalysis } = await import('@/lib/admin-analysis');
    const a = await adminAnalysis(365);
    expect(a.repeatClients.returning).toBeLessThanOrEqual(a.repeatClients.withShoot);
  });

  it('активация не может превышать число одобренных анкет', async () => {
    const { adminAnalysis } = await import('@/lib/admin-analysis');
    const a = await adminAnalysis(30);
    expect(a.activation.published).toBeLessThanOrEqual(a.activation.approved);
  });
});
