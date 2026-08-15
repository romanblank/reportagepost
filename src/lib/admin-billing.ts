import { db } from '@/lib/db';
import { REAL_USER } from '@/lib/admin-dashboard';
import { activeTier } from '@/lib/subscription';

/**
 * Деньги платформы в одном месте.
 *
 * До этого раздела оплату нельзя было ни проверить, ни разобрать: платежи
 * лежали только в базе, а подписки — в карточках отдельных авторов. Для
 * запуска приёма оплаты это первое, что нужно: увидеть, что платёж дошёл,
 * каким статусом закончился и на кого зачислился.
 *
 * Отдельно показываем запросы на подключение: пока оплата не работает,
 * подписку выдаёт человек, и очередь этих запросов — обязанность, о которой
 * нельзя забыть.
 */
export type AdminPayment = {
  id: string;
  orderId: string;
  createdAt: Date;
  amountMinor: number;
  currency: string;
  tier: string;
  status: string;
  who: string | null;
};

export type AdminSubscription = {
  userId: string;
  name: string;
  username: string | null;
  tier: string;
  activeTier: string;
  until: Date | null;
  grandfathered: boolean;
  requestedAt: Date | null;
  requestedTier: string | null;
};

export async function adminPayments(limit = 100): Promise<AdminPayment[]> {
  const rows = await db.payment.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true, orderId: true, createdAt: true, amountMinor: true, currency: true,
      tier: true, status: true,
      user: { select: { firstName: true, lastName: true, email: true } },
    },
  });
  return rows.map((p) => ({
    id: p.id,
    orderId: p.orderId,
    createdAt: p.createdAt,
    amountMinor: p.amountMinor,
    currency: p.currency,
    tier: p.tier,
    status: p.status,
    // Обезличенный платёж (аккаунт удалён) остаётся в списке: документ по
    // закону хранится, и пропасть из отчётности он не может
    who: p.user ? `${p.user.firstName} ${p.user.lastName}` : null,
  }));
}

export async function adminSubscriptions(): Promise<AdminSubscription[]> {
  const rows = await db.subscription.findMany({
    where: { OR: [{ tier: { not: 'FREE' } }, { proRequestedAt: { not: null } }] },
    orderBy: [{ proRequestedAt: 'desc' }, { currentPeriodEnd: 'desc' }],
    select: {
      userId: true, tier: true, currentPeriodEnd: true, grandfathered: true, proRequestedAt: true,
      proRequestedTier: true,
      user: {
        select: { firstName: true, lastName: true, profile: { select: { username: true } } },
      },
    },
  });

  return rows.map((s) => ({
    userId: s.userId,
    name: `${s.user.firstName} ${s.user.lastName}`,
    username: s.user.profile?.username ?? null,
    tier: s.tier,
    // Уровень «на бумаге» и уровень ДЕЙСТВУЮЩИЙ — разные вещи: период мог
    // закончиться, и в списке это должно быть видно сразу
    activeTier: activeTier({
      tier: s.tier,
      currentPeriodEnd: s.currentPeriodEnd,
    } as Parameters<typeof activeTier>[0]),
    until: s.currentPeriodEnd,
    grandfathered: s.grandfathered,
    requestedAt: s.proRequestedAt,
    // Что именно просил: без этого оператор выдавал тариф наугад
    requestedTier: s.proRequestedTier,
  }));
}

/** Сводка: сколько денег пришло и сколько людей ждут подключения. */
export async function billingOverview(periodDays = 30): Promise<{
  paidCount: number;
  paidMinor: number;
  pendingRequests: number;
  activeSubs: number;
}> {
  const since = new Date(Date.now() - periodDays * 86_400_000);
  const [confirmed, pendingRequests, activeSubs] = await Promise.all([
    db.payment.findMany({
      where: { status: 'CONFIRMED', createdAt: { gte: since }, user: REAL_USER },
      select: { amountMinor: true },
    }),
    db.subscription.count({ where: { proRequestedAt: { not: null }, tier: 'FREE' } }),
    db.subscription.count({
      where: { tier: { not: 'FREE' }, OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: new Date() } }] },
    }),
  ]);

  return {
    paidCount: confirmed.length,
    paidMinor: confirmed.reduce((sum, p) => sum + p.amountMinor, 0),
    pendingRequests,
    activeSubs,
  };
}
