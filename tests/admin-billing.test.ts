import { describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

/**
 * Раздел «Деньги» — то, чем будет проверяться приём оплаты. Ошибка здесь
 * означает не кривой экран, а неверные цифры о выручке и пропущенный запрос на
 * подключение, за который человек уже заплатил.
 */
describe.skipIf(!hasDb)('деньги в админке (БД)', () => {
  it('платёж удалённого аккаунта остаётся в списке, но без имени', async () => {
    const { db } = await import('@/lib/db');
    const { adminPayments } = await import('@/lib/admin-billing');

    const stamp = `${Date.now()}`;
    // Первичные документы по платежам хранятся по закону, но связь с субъектом
    // ПДн разрывается — платёж обязан остаться видимым и без владельца
    const orphan = await db.payment.create({
      data: {
        orderId: `test-orphan-${stamp}`, amountMinor: 99000, tier: 'PRIME',
        status: 'CONFIRMED', userId: null,
      },
    });

    const rows = await adminPayments(500);
    const found = rows.find((p) => p.orderId === orphan.orderId);
    expect(found, 'обезличенный платёж пропал из списка').toBeTruthy();
    expect(found!.who).toBeNull();

    await db.payment.delete({ where: { id: orphan.id } });
  });

  it('сводка считает только подтверждённые платежи и настоящих людей', async () => {
    const { db } = await import('@/lib/db');
    const { billingOverview } = await import('@/lib/admin-billing');

    const stamp = `${Date.now()}`;
    const user = await db.user.create({
      data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Пла', lastName: 'Тельщик', email: `pay-${stamp}@test.local` },
    });

    const before = await billingOverview();

    // Тестовый аккаунт исключён из метрик (@test.local): цифры не должны
    // льстить сами себе
    await db.payment.create({
      data: { orderId: `t-conf-${stamp}`, amountMinor: 100000, tier: 'PRIME', status: 'CONFIRMED', userId: user.id },
    });
    // Неоплаченный платёж не считается ни при каких условиях
    await db.payment.create({
      data: { orderId: `t-new-${stamp}`, amountMinor: 500000, tier: 'ELITE', status: 'NEW', userId: null },
    });

    const after = await billingOverview();
    expect(after.paidMinor).toBe(before.paidMinor);
    expect(after.paidCount).toBe(before.paidCount);

    await db.payment.deleteMany({ where: { orderId: { in: [`t-conf-${stamp}`, `t-new-${stamp}`] } } });
    await db.user.delete({ where: { id: user.id } });
  });

  it('счётчики очередей считают то, что действительно ждёт решения', async () => {
    const { db } = await import('@/lib/db');
    const { adminCounters } = await import('@/lib/admin-counters');

    const before = await adminCounters();

    const stamp = `${Date.now()}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'chita' } });
    const inquiry = await db.inquiry.create({
      data: { cityId: city.id, contactName: `Счётчик ${stamp}`, description: 'Заявка без единого отклика для счётчика.' },
    });

    const after = await adminCounters();
    // Заявка без откликов — единственная очередь, где ждёт не наш контент, а
    // живой заказчик
    expect(after.inquiries).toBe(before.inquiries + 1);

    await db.inquiry.delete({ where: { id: inquiry.id } });
  });
});
