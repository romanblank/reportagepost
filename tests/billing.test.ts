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

// Условия, обещанные «навсегда», обязаны переживать оплату (баг 2026-08-04):
// prepareCheckout брал полный прайс мимо priceMinorLocked, а зачисление писало
// grandfathered: false — первый же платёж стирал грант основателя и
// перезакреплял полную цену. Ударило бы по кругу амбассадора, то есть по самым
// лояльным людям, на которых держится запуск. Этот тест — главный в денежном
// контуре: регрессия здесь незаметна глазу (платёж проходит, подписка
// зачисляется) и обнаружилась бы только жалобой основателя на сумму.
describe.skipIf(!hasDb)('billing: цена основателя переживает оплату (БД)', () => {
  it('prepareCheckout берёт locked-цену; CONFIRMED не стирает grandfathered и priceMinorLocked', async () => {
    const { db } = await import('@/lib/db');
    const { prepareCheckout, applyPaymentStatus } = await import('@/lib/billing');
    const { foundingPrice, priceForCity } = await import('@/lib/pricing');
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const u = await db.user.create({
      data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'О', lastName: 'Ф', email: `found-${stamp}@test.local` },
    });
    try {
      // Грант основателя: Prime в Москве, −30% зафиксировано «навсегда»
      const full = priceForCity('moscow', 'PRIME');
      const founding = foundingPrice(full).monthlyMinor;
      await db.subscription.create({
        data: { userId: u.id, tier: 'PRIME', grandfathered: true, priceMinorLocked: founding, cityTier: 'A' },
      });

      // Оплата выставляется по зафиксированной цене, а не по полному прайсу
      const checkout = await prepareCheckout(u.id, 'PRIME', 'moscow');
      expect(checkout.amountMinor).toBe(founding);
      expect(checkout.amountMinor).toBeLessThan(full.monthlyMinor);

      // Locked-цена действует только на СВОЙ уровень: апгрейд на Elite — по прайсу
      const upgrade = await prepareCheckout(u.id, 'ELITE', 'moscow');
      expect(upgrade.amountMinor).toBe(priceForCity('moscow', 'ELITE').monthlyMinor);

      // Зачисление платежа не переопределяет условия гранта
      const r = await applyPaymentStatus(checkout.orderId, 'CONFIRMED', `tpf-${stamp}`);
      expect(r).toEqual({ found: true, credited: true });
      const sub = await db.subscription.findUniqueOrThrow({ where: { userId: u.id } });
      expect(sub.tier).toBe('PRIME');
      expect(sub.grandfathered).toBe(true); // грант пережил оплату
      expect(sub.priceMinorLocked).toBe(founding); // цена не перезакреплена
      expect(sub.currentPeriodEnd).toBeTruthy(); // и месяц при этом зачислен
    } finally {
      await db.payment.deleteMany({ where: { userId: u.id } });
      await db.subscription.deleteMany({ where: { userId: u.id } });
      await db.user.delete({ where: { id: u.id } });
    }
  });
});

// Возврат денег обязан отзывать оплаченный уровень: раньше REFUNDED только
// менял статус платежа — человек получал деньги обратно и продолжал
// пользоваться подпиской (и полкой «Рекомендуемые» через proRank) до конца
// периода. Тест фиксирует реальное поведение: откат ровно выданного месяца,
// падение до FREE при истёкшем периоде, сброс proRank.
describe.skipIf(!hasDb)('billing: REFUNDED отзывает подписку (БД)', () => {
  it('после CONFIRMED → REFUNDED: период откатан, tier=FREE, proRank=0', async () => {
    const { db } = await import('@/lib/db');
    const { applyPaymentStatus } = await import('@/lib/billing');
    const { isSubActive, tierOf } = await import('@/lib/subscription');
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const u = await db.user.create({
      data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Р', lastName: 'Ф', email: `ref-${stamp}@test.local` },
    });
    const profile = await db.photographerProfile.create({
      data: { userId: u.id, username: `ref-${stamp}`, cityId: city.id, status: 'APPROVED' },
    });
    try {
      const orderId = `ordf-${stamp}`;
      await db.payment.create({ data: { userId: u.id, orderId, amountMinor: 99_000, tier: 'PRIME', status: 'NEW' } });

      await applyPaymentStatus(orderId, 'CONFIRMED', `tpr-${stamp}`);
      const credited = await db.subscription.findUniqueOrThrow({ where: { userId: u.id } });
      expect(isSubActive(credited)).toBe(true);
      expect((await db.photographerProfile.findUniqueOrThrow({ where: { id: profile.id } })).proRank).toBeGreaterThan(0);

      const r = await applyPaymentStatus(orderId, 'REFUNDED', `tpr-${stamp}`);
      expect(r.credited).toBe(false);
      const after = await db.subscription.findUniqueOrThrow({ where: { userId: u.id } });
      // Отмотан ровно тот месяц, который выдал этот платёж → период в прошлом
      expect(after.currentPeriodEnd!.getTime()).toBeLessThanOrEqual(Date.now());
      expect(after.tier).toBe('FREE');
      expect(await tierOf(u.id)).toBe('FREE');
      // Полка «Рекомендуемые» и приоритет модерации отозваны вместе с деньгами
      expect((await db.photographerProfile.findUniqueOrThrow({ where: { id: profile.id } })).proRank).toBe(0);
      expect((await db.payment.findUniqueOrThrow({ where: { orderId } })).status).toBe('REFUNDED');
    } finally {
      await db.payment.deleteMany({ where: { userId: u.id } });
      await db.subscription.deleteMany({ where: { userId: u.id } });
      await db.profileCategoryScore.deleteMany({ where: { profileId: profile.id } });
      await db.photographerProfile.delete({ where: { id: profile.id } });
      await db.user.delete({ where: { id: u.id } });
    }
  });
});

// Статусы платежа монотонны: подтверждённый платёж не может «расподтвердиться»
// из-за переупорядоченного или задержанного вебхука. Иначе бухгалтерский след
// разойдётся с реальностью — деньги получены, а в базе REJECTED, и сверка с
// выпиской банка превращается в ручной разбор каждого платежа.
describe.skipIf(!hasDb)('billing: монотонность статусов платежа (БД)', () => {
  it('REJECTED после CONFIRMED — no-op: платёж остаётся CONFIRMED, подписка не тронута', async () => {
    const { db } = await import('@/lib/db');
    const { applyPaymentStatus } = await import('@/lib/billing');
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const u = await db.user.create({
      data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'М', lastName: 'Н', email: `mono-${stamp}@test.local` },
    });
    try {
      const orderId = `ordm-${stamp}`;
      await db.payment.create({ data: { userId: u.id, orderId, amountMinor: 99_000, tier: 'PRIME', status: 'NEW' } });

      await applyPaymentStatus(orderId, 'CONFIRMED', `tpm-${stamp}`);
      const end1 = (await db.subscription.findUniqueOrThrow({ where: { userId: u.id } })).currentPeriodEnd!.getTime();

      const r = await applyPaymentStatus(orderId, 'REJECTED', null);
      expect(r).toEqual({ found: true, credited: false });
      expect((await db.payment.findUniqueOrThrow({ where: { orderId } })).status).toBe('CONFIRMED');
      const sub = await db.subscription.findUniqueOrThrow({ where: { userId: u.id } });
      expect(sub.tier).toBe('PRIME'); // подписка не отозвана
      expect(sub.currentPeriodEnd!.getTime()).toBe(end1); // и период не сдвинут
    } finally {
      await db.payment.deleteMany({ where: { userId: u.id } });
      await db.subscription.deleteMany({ where: { userId: u.id } });
      await db.user.delete({ where: { id: u.id } });
    }
  });
});


/**
 * Идемпотентность возврата (найдено агентом в аудите 2026-08-16, чинилось
 * сразу): Т-Касса ретраит вебхуки, и повторный REFUNDED отматывал период ещё
 * на месяц — один возврат съедал у автора два оплаченных. А REFUNDED по
 * платежу, который никогда не был CONFIRMED, откатывал период, выданный
 * ДРУГИМ платежом. Теперь откат идёт только при атомарном переходе
 * CONFIRMED→REFUNDED — проигравший гонку видит count=0.
 */
describe.skipIf(!hasDb)('billing: возврат идемпотентен и требует зачисления (БД)', () => {
  it('повторный REFUNDED не отматывает второй месяц, REFUNDED без CONFIRMED — no-op', async () => {
    const { db } = await import('@/lib/db');
    const { applyPaymentStatus } = await import('@/lib/billing');
    const { randomUUID } = await import('node:crypto');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const u = await db.user.create({
      data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Возврат', lastName: 'Дважды', email: `refund2-${stamp}@test.local` },
    });
    try {
      // Два оплаченных месяца
      const end = new Date(Date.now() + 60 * 86_400_000);
      await db.subscription.create({ data: { userId: u.id, tier: 'PRIME', currentPeriodEnd: end } });
      const order = `t-${randomUUID()}`;
      await db.payment.create({
        data: { orderId: order, userId: u.id, tier: 'PRIME', amountMinor: 99000, currency: 'RUB', status: 'CONFIRMED' },
      });

      // Первый возврат: минус месяц
      await applyPaymentStatus(order, 'REFUNDED', null);
      const after1 = await db.subscription.findUniqueOrThrow({ where: { userId: u.id } });
      expect(Math.round((end.getTime() - after1.currentPeriodEnd!.getTime()) / 86_400_000)).toBeGreaterThanOrEqual(29);

      // Ретрай того же вебхука: период НЕ трогается
      await applyPaymentStatus(order, 'REFUNDED', null);
      const after2 = await db.subscription.findUniqueOrThrow({ where: { userId: u.id } });
      expect(after2.currentPeriodEnd!.getTime()).toBe(after1.currentPeriodEnd!.getTime());

      // Возврат по платежу, который не зачислялся (REJECTED), — период цел
      const order2 = `t-${randomUUID()}`;
      await db.payment.create({
        data: { orderId: order2, userId: u.id, tier: 'PRIME', amountMinor: 99000, currency: 'RUB', status: 'REJECTED' },
      });
      await applyPaymentStatus(order2, 'REFUNDED', null);
      const after3 = await db.subscription.findUniqueOrThrow({ where: { userId: u.id } });
      expect(after3.currentPeriodEnd!.getTime()).toBe(after1.currentPeriodEnd!.getTime());
      // И статус отклонённого платежа не превратился в REFUNDED
      const p2 = await db.payment.findUniqueOrThrow({ where: { orderId: order2 } });
      expect(p2.status).toBe('REJECTED');
    } finally {
      await db.payment.deleteMany({ where: { userId: u.id } });
      await db.subscription.deleteMany({ where: { userId: u.id } });
      await db.user.delete({ where: { id: u.id } });
    }
  });
});
