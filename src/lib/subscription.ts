import type { Subscription } from '@prisma/client';
import { db } from '@/lib/db';
import { priceForCity, foundingPrice, BETA_GRACE_DAYS } from '@/lib/pricing';

// Граница FREE/PRO. Единственный источник правды о тарифе пользователя.
// PRO активен, если tier=PRO И подписка не истекла по одному из окон:
// grandfathered (бессрочный бета-founding), grace (бета-грейс), trial (пробный),
// currentPeriodEnd (оплаченный период) — в будущем.

export type Tier = 'FREE' | 'PRO';

export function isProActive(sub: Subscription | null, now: Date = new Date()): boolean {
  if (!sub || sub.tier !== 'PRO') return false;
  if (sub.grandfathered) return true;
  const windows = [sub.graceEndsAt, sub.trialEndsAt, sub.currentPeriodEnd];
  return windows.some((d) => d != null && d.getTime() > now.getTime());
}

export async function subscriptionOf(userId: string): Promise<Subscription | null> {
  return db.subscription.findUnique({ where: { userId } });
}

export async function tierOf(userId: string, now: Date = new Date()): Promise<Tier> {
  const sub = await subscriptionOf(userId);
  return isProActive(sub, now) ? 'PRO' : 'FREE';
}

export async function isPro(userId: string): Promise<boolean> {
  return (await tierOf(userId)) === 'PRO';
}

// Статус подписки для UI кабинета (без утечки внутренних полей в клиент).
export interface SubscriptionStatus {
  tier: Tier;
  isFounding: boolean; // бета-основатель (grandfathered)
  graceEndsAt: Date | null;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  proRequested: boolean; // заявка на подключение PRO отправлена оператору
}

export async function subscriptionStatus(userId: string): Promise<SubscriptionStatus> {
  const sub = await subscriptionOf(userId);
  const tier: Tier = isProActive(sub) ? 'PRO' : 'FREE';
  return {
    tier,
    isFounding: Boolean(sub?.grandfathered),
    graceEndsAt: sub?.graceEndsAt ?? null,
    trialEndsAt: sub?.trialEndsAt ?? null,
    currentPeriodEnd: sub?.currentPeriodEnd ?? null,
    proRequested: tier === 'FREE' && Boolean(sub?.proRequestedAt),
  };
}

// Выдать бесплатный бета-PRO основателю (действие админа в закрытой бете).
// grandfathered=true + graceEndsAt = now+BETA_GRACE_DAYS; цена основателя (−30%)
// фиксируется как priceMinorLocked на будущий переход к оплате.
export async function grantFoundingPro(userId: string, citySlug: string, now: Date = new Date()): Promise<void> {
  const price = priceForCity(citySlug);
  const founding = foundingPrice(price);
  const graceEndsAt = new Date(now.getTime() + BETA_GRACE_DAYS * 24 * 60 * 60 * 1000);
  await db.subscription.upsert({
    where: { userId },
    create: {
      userId,
      tier: 'PRO',
      grandfathered: true,
      cityTier: price.cityTier,
      priceMinorLocked: founding.monthlyMinor,
      graceEndsAt,
    },
    update: {
      tier: 'PRO',
      grandfathered: true,
      cityTier: price.cityTier,
      priceMinorLocked: founding.monthlyMinor,
      graceEndsAt,
    },
  });
  // Денормализованный приоритет в каталоге (MyWed: PRO платит за позицию)
  await db.photographerProfile.updateMany({ where: { userId }, data: { proRank: PRO_RANK } });
}

// Базовый приоритет активного PRO в каталоге (место под будущие уровни PRO+).
export const PRO_RANK = 100;

// Зафиксировать заявку фотографа на подключение PRO (закрытая бета: оператор
// активирует вручную). Маркер REQUESTED в cityTier на FREE-записи — до появления
// реального checkout. Идемпотентно.
export async function requestPro(userId: string, now: Date = new Date()): Promise<void> {
  const sub = await subscriptionOf(userId);
  if (sub && isProActive(sub)) return; // уже PRO
  await db.subscription.upsert({
    where: { userId },
    create: { userId, tier: 'FREE', proRequestedAt: now },
    update: { proRequestedAt: now },
  });
}
