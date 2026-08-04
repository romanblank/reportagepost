import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { priceForCity, cityTierOf, type PaidTier } from '@/lib/pricing';
import { rankForTier } from '@/lib/subscription';
import { DEFAULT_CURRENCY } from '@/lib/money';

// Биллинг подписок через Т-Кассу: подготовка платежа + идемпотентное зачисление
// по вебхуку. Провайдер за абстракцией (tinkoff.ts) — без терминала флоу не
// инициируется, но логика зачисления полностью готова и покрыта тестами.

// Свой PaidTier здесь объявлялся независимо и мог молча разойтись с pricing —
// теперь один импорт (аудит 2026-08-01, P2)
export type { PaidTier } from '@/lib/pricing';
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

export interface Checkout {
  orderId: string;
  amountMinor: number;
}

/** Готовит платёж: цена по городу/тарифу → строка Payment(NEW). orderId уникален
 *  (идемпотентность вебхука). Возвращает данные для вызова Init. */
export async function prepareCheckout(userId: string, tier: PaidTier, citySlug: string): Promise<Checkout> {
  const price = priceForCity(citySlug, tier);
  const orderId = `sub_${userId.slice(0, 8)}_${randomUUID().slice(0, 8)}`;
  await db.payment.create({
    data: { userId, orderId, amountMinor: price.monthlyMinor, currency: DEFAULT_CURRENCY, tier, status: 'NEW' },
  });
  return { orderId, amountMinor: price.monthlyMinor };
}

/** Идемпотентно применяет статус платежа из вебхука. На CONFIRMED — зачисляет/
 *  продлевает подписку на месяц (от max(now, текущий конец периода)). Повторный
 *  CONFIRMED — no-op (защита от дублей вебхука). Всё в одной транзакции. */
export async function applyPaymentStatus(
  orderId: string,
  status: 'CONFIRMED' | 'REJECTED' | 'REFUNDED',
  tinkoffPaymentId: string | null,
  now: Date = new Date(),
): Promise<{ found: boolean; credited: boolean }> {
  return db.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { orderId } });
    if (!payment) return { found: false, credited: false };

    if (status !== 'CONFIRMED') {
      // Возврат денег обязан отзывать и оплаченный уровень. Раньше REFUNDED
      // только менял статус платежа: человек получал деньги обратно и
      // продолжал пользоваться подпиской до конца оплаченного периода.
      if (status === 'REFUNDED' && payment.userId) {
        const sub = await tx.subscription.findUnique({
          where: { userId: payment.userId },
          select: { currentPeriodEnd: true },
        });
        if (sub?.currentPeriodEnd) {
          // Отматываем ровно тот месяц, который был выдан этим платежом.
          // Если после отката период уже в прошлом — уровень падает до FREE.
          const rolled = new Date(sub.currentPeriodEnd.getTime() - MONTH_MS);
          const expired = rolled <= now;
          await tx.subscription.update({
            where: { userId: payment.userId },
            data: {
              currentPeriodEnd: rolled,
              ...(expired ? { tier: 'FREE' as const } : {}),
            },
          });
          if (expired) {
            await tx.photographerProfile.updateMany({
              where: { userId: payment.userId },
              data: { proRank: 0 },
            });
          }
        }
      }

      // Статусы монотонны: подтверждённый платёж не может «расподтвердиться»
      // из-за переупорядоченного вебхука. Иначе бухгалтерский след разойдётся
      // с реальностью — деньги получены, а в базе REJECTED.
      const allowed: Prisma.PaymentWhereInput =
        status === 'REFUNDED' ? { id: payment.id } : { id: payment.id, status: 'NEW' };
      await tx.payment.updateMany({
        where: allowed,
        data: { status, tinkoffPaymentId: tinkoffPaymentId ?? payment.tinkoffPaymentId },
      });
      return { found: true, credited: false };
    }

    // АТОМАРНЫЙ переход в CONFIRMED: updateMany с guard `status != CONFIRMED`.
    // Postgres берёт row-lock на UPDATE → при гонке двух вебхуков второй увидит
    // count=0 и не зачислит повторно (защита от двойного продления периода).
    const claimed = await tx.payment.updateMany({
      where: { id: payment.id, status: { not: 'CONFIRMED' } },
      data: { status: 'CONFIRMED', tinkoffPaymentId: tinkoffPaymentId ?? payment.tinkoffPaymentId },
    });
    if (claimed.count === 0) return { found: true, credited: false }; // уже зачислено

    const tier = payment.tier as PaidTier;
    // userId=null — платёж обезличен при удалении аккаунта (запись хранится для
    // бухгалтерии). Зачислять некому: подтверждаем факт, подписку не трогаем.
    if (!payment.userId) return { found: true, credited: false };
    const sub = await tx.subscription.findUnique({
      where: { userId: payment.userId },
      select: { currentPeriodEnd: true },
    });
    const base = sub?.currentPeriodEnd && sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;
    const currentPeriodEnd = new Date(base.getTime() + MONTH_MS);

    // cityTier — из города профиля (для отображения/фиксации), если профиль есть.
    const profile = await tx.photographerProfile.findUnique({
      where: { userId: payment.userId },
      select: { city: { select: { slug: true } } },
    });
    const cityTier = profile ? cityTierOf(profile.city.slug) : null;

    const data = {
      tier,
      grandfathered: false, // оплаченная (не founding)
      priceMinorLocked: payment.amountMinor,
      cityTier,
      currentPeriodEnd,
      proRequestedAt: null, // заявка удовлетворена оплатой
    };
    await tx.subscription.upsert({
      where: { userId: payment.userId },
      create: { userId: payment.userId, ...data },
      update: data,
    });
    // Денормализованный вес подписки в каталоге (мягкий tiebreaker).
    await tx.photographerProfile.updateMany({
      where: { userId: payment.userId },
      data: { proRank: rankForTier(tier) },
    });

    return { found: true, credited: true };
  });
}
