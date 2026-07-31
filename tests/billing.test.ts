import { describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

// Зачисление подписки по платежу Т-Кассы — ИДЕМПОТЕНТНО (вебхук может прийти
// несколько раз): повторный CONFIRMED не должен продлевать подписку заново.
describe.skipIf(!hasDb)('billing: зачисление подписки по платежу (БД)', () => {
  it('CONFIRMED зачисляет подписку (+месяц); повторный CONFIRMED — no-op', async () => {
    const { db } = await import('@/lib/db');
    const { applyPaymentStatus } = await import('@/lib/billing');
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const u = await db.user.create({
      data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Б', lastName: 'Т', email: `bill-${stamp}@test.local` },
    });
    const orderId = `ord-${stamp}`;
    await db.payment.create({ data: { userId: u.id, orderId, amountMinor: 99_000, tier: 'PRIME', status: 'NEW' } });

    const r1 = await applyPaymentStatus(orderId, 'CONFIRMED', 'tpay-1');
    expect(r1).toEqual({ found: true, credited: true });
    const sub1 = await db.subscription.findUnique({ where: { userId: u.id } });
    expect(sub1?.tier).toBe('PRIME');
    expect(sub1?.grandfathered).toBe(false);
    expect(sub1?.priceMinorLocked).toBe(99_000);
    expect(sub1?.currentPeriodEnd).toBeTruthy();
    const end1 = sub1!.currentPeriodEnd!.getTime();

    const r2 = await applyPaymentStatus(orderId, 'CONFIRMED', 'tpay-1');
    expect(r2.credited).toBe(false); // идемпотентно
    const sub2 = await db.subscription.findUnique({ where: { userId: u.id } });
    expect(sub2!.currentPeriodEnd!.getTime()).toBe(end1); // период не изменился

    await db.payment.deleteMany({ where: { userId: u.id } });
    await db.subscription.deleteMany({ where: { userId: u.id } });
    await db.user.delete({ where: { id: u.id } });
  });

  it('REJECTED не зачисляет подписку; неизвестный orderId → found:false', async () => {
    const { db } = await import('@/lib/db');
    const { applyPaymentStatus } = await import('@/lib/billing');
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const u = await db.user.create({
      data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Б', lastName: 'Т', email: `bill2-${stamp}@test.local` },
    });
    const orderId = `ordr-${stamp}`;
    await db.payment.create({ data: { userId: u.id, orderId, amountMinor: 99_000, tier: 'PRIME', status: 'NEW' } });

    const r = await applyPaymentStatus(orderId, 'REJECTED', null);
    expect(r.credited).toBe(false);
    expect(await db.subscription.findUnique({ where: { userId: u.id } })).toBeNull();
    expect(await applyPaymentStatus('does-not-exist', 'CONFIRMED', null)).toEqual({ found: false, credited: false });

    await db.payment.deleteMany({ where: { userId: u.id } });
    await db.user.delete({ where: { id: u.id } });
  });
});
