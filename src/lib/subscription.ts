import type { Subscription, SubscriptionTier } from '@prisma/client';
import { db } from '@/lib/db';
import { ru } from '@/i18n/ru';
import { priceForCity, foundingPrice, BETA_GRACE_DAYS, type PaidTier } from '@/lib/pricing';

// Уровень подписки — единственный источник правды. Активна, если tier != FREE И
// не истекла по одному из окон: grandfathered (бессрочный бета-founding), grace
// (бета-грейс), trial (пробный), currentPeriodEnd (оплаченный период).
// Разворот 2026-07-25: FREE/PRIME/ELITE вместо FREE/PRO (синергия, не классовость).

// Единственный источник правды об уровнях — enum Prisma (аудит 2026-08-01, P2).
// Раньше тот же союз объявлялся трижды (Tier, PlanTier, SubscriptionTier), а
// связь держалась на кастах `sub!.tier as Tier` — компилятор не проверял ничего.
// Это ровно сценарий, который уже стоил проекту сборки (урок enum-расширения
// 2026-07-15): добавили значение в enum — каст промолчал бы, а на Tier завязаны
// бейджи, лимиты портфолио и цены. Теперь расширение enum падает на компиляции.
export type Tier = SubscriptionTier;

// Вес подписки в каталоге. МЯГКИЙ tiebreaker (merit-first), НЕ pay-for-position.
export const PRIME_RANK = 100;
export const ELITE_RANK = 200;
export function rankForTier(tier: Tier): number {
  return tier === 'ELITE' ? ELITE_RANK : tier === 'PRIME' ? PRIME_RANK : 0;
}

export function isSubActive(sub: Subscription | null, now: Date = new Date()): boolean {
  if (!sub || sub.tier === 'FREE') return false;
  if (sub.grandfathered) return true;
  const windows = [sub.graceEndsAt, sub.trialEndsAt, sub.currentPeriodEnd];
  return windows.some((d) => d != null && d.getTime() > now.getTime());
}

export async function subscriptionOf(userId: string): Promise<Subscription | null> {
  return db.subscription.findUnique({ where: { userId } });
}

// Активный уровень из записи (FREE, если не активна).
export function activeTier(sub: Subscription | null, now: Date = new Date()): Tier {
  return isSubActive(sub, now) ? sub!.tier : 'FREE';
}

export async function tierOf(userId: string, now: Date = new Date()): Promise<Tier> {
  return activeTier(await subscriptionOf(userId), now);
}

export async function isSubscriber(userId: string): Promise<boolean> {
  return (await tierOf(userId)) !== 'FREE';
}


// Статус подписки для UI кабинета (без утечки внутренних полей в клиент).
export interface SubscriptionStatus {
  tier: Tier;
  isFounding: boolean; // бета-основатель (grandfathered)
  graceEndsAt: Date | null;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  proRequested: boolean; // заявка на подключение отправлена оператору
}

export async function subscriptionStatus(userId: string): Promise<SubscriptionStatus> {
  const sub = await subscriptionOf(userId);
  const tier = activeTier(sub);
  return {
    tier,
    isFounding: Boolean(sub?.grandfathered),
    graceEndsAt: sub?.graceEndsAt ?? null,
    trialEndsAt: sub?.trialEndsAt ?? null,
    currentPeriodEnd: sub?.currentPeriodEnd ?? null,
    proRequested: tier === 'FREE' && Boolean(sub?.proRequestedAt),
  };
}

// Выдать founding-подписку (действие админа в закрытой бете): grandfathered=true +
// grace 90д + founding-цена (−30%) зафиксирована как priceMinorLocked. Уровень по
// умолчанию Prime; оператор может выдать Elite.
export async function grantFoundingSub(
  userId: string,
  citySlug: string,
  tier: PaidTier = 'PRIME',
  now: Date = new Date(),
): Promise<void> {
  const price = priceForCity(citySlug, tier);
  const founding = foundingPrice(price);
  const existing = await db.subscription.findUnique({ where: { userId }, select: { graceEndsAt: true } });
  // При смене уровня НЕ продлеваем бесплатное окно — сохраняем исходный grace
  // (цену перезакрепляем по новому уровню: Elit-founding дороже Prime-founding).
  const graceEndsAt = existing?.graceEndsAt ?? new Date(now.getTime() + BETA_GRACE_DAYS * 24 * 60 * 60 * 1000);
  const data = {
    tier,
    grandfathered: true,
    cityTier: price.cityTier,
    priceMinorLocked: founding.monthlyMinor,
    graceEndsAt,
  };
  await db.subscription.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  // Денормализованный вес подписки в каталоге (мягкий tiebreaker).
  await db.photographerProfile.updateMany({ where: { userId }, data: { proRank: rankForTier(tier) } });
}

// Зафиксировать заявку фотографа на подключение подписки (закрытая бета: оператор
// активирует вручную). Идемпотентно.
export async function requestSubscription(
  userId: string,
  tier: 'PRIME' | 'ELITE' = 'PRIME',
  now: Date = new Date(),
): Promise<void> {
  const sub = await subscriptionOf(userId);
  if (sub && isSubActive(sub)) return; // уже активна
  // Уровень фиксируется в заявке: без него оператор получал «фотограф
  // запросил подписку» и не знал, Prime или Elite активировать (аудит 2026-08-16)
  await db.subscription.upsert({
    where: { userId },
    create: { userId, proRequestedAt: now, proRequestedTier: tier },
    update: { proRequestedAt: now, proRequestedTier: tier },
  });

  // Запрос подписки — ближайшая к деньгам точка на закрытой платформе:
  // активация пока ручная, и час ожидания здесь стоит дороже всего
  const { alertOperator } = await import('@/lib/telegram');
  void alertOperator(ru.operatorAlerts.subscriptionRequested(tier));
}

/**
 * Сверка денормализованного proRank с реальным состоянием подписок.
 *
 * proRank — вес подписки в каталоге и в очереди модерации — проставляется в
 * момент зачисления и раньше НИКОГДА не сбрасывался. Пока подписки выдавались
 * грантами (бессрочными), это было незаметно. С реальной оплатой (S5) истёкшая
 * подписка навсегда оставляла бы автору полку «Рекомендуемые» и приоритет
 * модерации: заплатил один раз — получаешь вечно. Это несправедливо к тем, кто
 * платит regularly, и прямо противоречит смыслу подписки.
 *
 * Считаем в рантайме (isSubActive), а поле остаётся денормализацией для
 * быстрых выборок. Джоба обслуживания гоняет сверку раз в сутки — этого
 * достаточно: ошибка живёт максимум сутки и только в сторону «ещё показываем».
 *
 * Возвращает число исправленных профилей — попадает в ответ джобы, чтобы
 * расхождение было видно, а не молчало.
 */
export async function reconcileSubRanks(now: Date = new Date()): Promise<number> {
  // Берём только тех, у кого есть чем разойтись: подписка или ненулевой ранг
  const profiles = await db.photographerProfile.findMany({
    where: { OR: [{ proRank: { not: 0 } }, { user: { subscription: { isNot: null } } }] },
    select: { id: true, proRank: true, user: { select: { subscription: true } } },
  });

  let fixed = 0;
  for (const p of profiles) {
    const expected = rankForTier(activeTier(p.user.subscription ?? null, now));
    if (expected === p.proRank) continue;
    await db.photographerProfile.update({ where: { id: p.id }, data: { proRank: expected } });
    fixed += 1;
  }
  return fixed;
}
