// E2E-батарея №6 (аудит 2026-09-10): два сквозных пути, у которых было только
// юнит-покрытие слоёв по отдельности.
// 1) Деньги: prepareCheckout → вебхук CONFIRMED → подписка активна, ранг
//    проставлен, Elite виден механикам; REFUNDED отматывает.
// 2) Импорт репутации: инвайт-JWT → подтверждение приглашённым заказчиком →
//    needsReview в админ-очереди → одобрение → публичный факт съёмки.
// Запуск: npm run e2e (нужен локальный PG). Всё создаётся и убирается за собой.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

beforeAll(() => {
  process.env.AUTH_SECRET ??= 'test-secret-32-chars-minimum-000000';
});

describe.skipIf(!hasDb)('E2E: биллинг и инвайт-подтверждение', () => {
  const ids: { users: string[]; profiles: string[] } = { users: [], profiles: [] };

  afterAll(async () => {
    const { db } = await import('@/lib/db');
    for (const pid of ids.profiles) {
      await db.shootConfirmation.deleteMany({ where: { profileId: pid } });
      await db.profileCategoryScore.deleteMany({ where: { profileId: pid } });
      await db.profileCategory.deleteMany({ where: { profileId: pid } });
      await db.photographerProfile.delete({ where: { id: pid } }).catch(() => {});
    }
    for (const uid of ids.users) {
      await db.payment.deleteMany({ where: { userId: uid } });
      await db.subscription.deleteMany({ where: { userId: uid } });
      await db.notification.deleteMany({ where: { userId: uid } });
      await db.adminAudit.deleteMany({ where: { actorUserId: uid } });
      await db.shootConfirmation.deleteMany({ where: { clientUserId: uid } });
      await db.user.delete({ where: { id: uid } }).catch(() => {});
    }
  });

  it('оплата: checkout → вебхук CONFIRMED зачисляет Elite, REFUNDED отматывает', async () => {
    const { db } = await import('@/lib/db');
    const { prepareCheckout, applyPaymentStatus } = await import('@/lib/billing');
    const { tierOf } = await import('@/lib/subscription');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const ph = await db.user.create({
      data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Оплата', lastName: 'Е2Е', email: `e2e-bill-${stamp}@test.local`, emailVerifiedAt: new Date() },
    });
    ids.users.push(ph.id);
    const profile = await db.photographerProfile.create({
      data: { userId: ph.id, username: `e2e-bill-${stamp}`, cityId: city.id, status: 'APPROVED' },
    });
    ids.profiles.push(profile.id);

    // Checkout создаёт платёж с городской ценой
    const checkout = await prepareCheckout(ph.id, 'ELITE', 'moscow');
    expect(checkout.amountMinor).toBeGreaterThan(0);

    // Вебхук CONFIRMED — подписка активна, уровень Elite, ранг в каталоге
    const credited = await applyPaymentStatus(checkout.orderId, 'CONFIRMED', 'tnk-1');
    expect(credited).toEqual({ found: true, credited: true });
    expect(await tierOf(ph.id)).toBe('ELITE');
    const rank = await db.photographerProfile.findUniqueOrThrow({ where: { id: profile.id }, select: { proRank: true } });
    expect(rank.proRank).toBeGreaterThan(0);

    // Дубль вебхука (Т-Касса ретраит) — не зачисляет второй месяц
    const dup = await applyPaymentStatus(checkout.orderId, 'CONFIRMED', 'tnk-1');
    expect(dup.credited).toBe(false);

    // Возврат отматывает период; уровень падает до FREE, ранг снят
    const refunded = await applyPaymentStatus(checkout.orderId, 'REFUNDED', 'tnk-1');
    expect(refunded.found).toBe(true);
    expect(await tierOf(ph.id)).toBe('FREE');
    const after = await db.photographerProfile.findUniqueOrThrow({ where: { id: profile.id }, select: { proRank: true } });
    expect(after.proRank).toBe(0);
  });

  it('инвайт: JWT → подтверждение заказчиком → needsReview в очереди → одобрение → публичный факт', async () => {
    const { db } = await import('@/lib/db');
    const { createShootInvite, verifyShootInvite } = await import('@/lib/shoot-invite');
    const { confirmShootByInvite, shootStats } = await import('@/lib/shoots');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const ph = await db.user.create({
      data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Автор', lastName: 'Е2Е', email: `e2e-inv-ph-${stamp}@test.local`, emailVerifiedAt: new Date() },
    });
    ids.users.push(ph.id);
    const profile = await db.photographerProfile.create({
      data: { userId: ph.id, username: `e2e-inv-${stamp}`, cityId: city.id, status: 'APPROVED' },
    });
    ids.profiles.push(profile.id);

    // Автор создаёт ссылку-приглашение; она верифицируется как его профиль
    const token = await createShootInvite(profile.id);
    const invite = await verifyShootInvite(token);
    expect(invite?.profileId).toBe(profile.id);

    // Прошлый заказчик регистрируется по ссылке и подтверждает съёмку
    const client = await db.user.create({
      data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'Заказчик', lastName: 'Е2Е', email: `e2e-inv-cl-${stamp}@test.local`, emailVerifiedAt: new Date() },
    });
    ids.users.push(client.id);
    const res = await confirmShootByInvite(client.id, profile.id, new Date('2026-05-10'), null);
    // Инвайт-путь идёт к человеку ВСЕГДА (инвариант 2026-08-17)
    expect(res.needsReview).toBe(true);

    // Публичного факта до одобрения НЕТ
    const before = await shootStats(profile.id);
    expect(before.count).toBe(0);

    // Запись видна в админ-очереди needsReview
    const queued = await db.shootConfirmation.findFirst({
      where: { profileId: profile.id, clientUserId: client.id, needsReview: true, state: 'CONFIRMED' },
    });
    expect(queued).not.toBeNull();
    expect(queued!.viaInvite).toBe(true);

    // Человек одобряет — появляется публичный факт «снимали вместе»
    await db.shootConfirmation.update({ where: { id: queued!.id }, data: { needsReview: false } });
    const after = await shootStats(profile.id);
    expect(after.count).toBe(1);
  });
});
