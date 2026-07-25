import type { Subscription } from '@prisma/client';
import { db } from '@/lib/db';
import { priceForCity, foundingPrice, BETA_GRACE_DAYS, type PaidTier } from '@/lib/pricing';

// Уровень подписки — единственный источник правды. Активна, если tier != FREE И
// не истекла по одному из окон: grandfathered (бессрочный бета-founding), grace
// (бета-грейс), trial (пробный), currentPeriodEnd (оплаченный период).
// Разворот 2026-07-25: FREE/PRIME/ELITE вместо FREE/PRO (синергия, не классовость).

export type Tier = 'FREE' | 'PRIME' | 'ELITE';

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
  return isSubActive(sub, now) ? (sub!.tier as Tier) : 'FREE';
}

export async function tierOf(userId: string, now: Date = new Date()): Promise<Tier> {
  return activeTier(await subscriptionOf(userId), now);
}

export async function isSubscriber(userId: string): Promise<boolean> {
  return (await tierOf(userId)) !== 'FREE';
}

// Совместимость: старое isPro = «есть активная подписка».
export const isPro = isSubscriber;

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
  const graceEndsAt = new Date(now.getTime() + BETA_GRACE_DAYS * 24 * 60 * 60 * 1000);
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

// Совместимость со старым вызовом (грант Prime-founding).
export async function grantFoundingPro(userId: string, citySlug: string, now: Date = new Date()): Promise<void> {
  return grantFoundingSub(userId, citySlug, 'PRIME', now);
}

// Зафиксировать заявку фотографа на подключение подписки (закрытая бета: оператор
// активирует вручную). Идемпотентно.
export async function requestSubscription(userId: string, now: Date = new Date()): Promise<void> {
  const sub = await subscriptionOf(userId);
  if (sub && isSubActive(sub)) return; // уже активна
  await db.subscription.upsert({
    where: { userId },
    create: { userId, proRequestedAt: now },
    update: { proRequestedAt: now },
  });
}
export const requestPro = requestSubscription; // совместимость
