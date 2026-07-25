import { describe, expect, it } from 'vitest';
import 'dotenv/config';
import { isSubActive } from '@/lib/subscription';
import type { Subscription } from '@prisma/client';

const hasDb = Boolean(process.env.DATABASE_URL);
const now = new Date('2026-07-16T00:00:00Z');
const future = new Date('2026-09-01T00:00:00Z');
const past = new Date('2026-06-01T00:00:00Z');

function sub(p: Partial<Subscription>): Subscription {
  return {
    id: 'x', userId: 'u', tier: 'FREE', currentPeriodEnd: null, grandfathered: false,
    cityTier: null, priceMinorLocked: null, trialEndsAt: null, graceEndsAt: null,
    proRequestedAt: null, createdAt: now, updatedAt: now, ...p,
  } as Subscription;
}

describe('isSubActive — граница FREE / подписка (чистая логика)', () => {
  it('null / FREE → не активна', () => {
    expect(isSubActive(null, now)).toBe(false);
    expect(isSubActive(sub({ tier: 'FREE' }), now)).toBe(false);
  });
  it('grandfathered Prime/Elite → активна всегда', () => {
    expect(isSubActive(sub({ tier: 'PRIME', grandfathered: true }), now)).toBe(true);
    expect(isSubActive(sub({ tier: 'ELITE', grandfathered: true }), now)).toBe(true);
  });
  it('grace/trial/period в будущем → активна; в прошлом → нет', () => {
    expect(isSubActive(sub({ tier: 'PRIME', graceEndsAt: future }), now)).toBe(true);
    expect(isSubActive(sub({ tier: 'ELITE', trialEndsAt: future }), now)).toBe(true);
    expect(isSubActive(sub({ tier: 'PRIME', currentPeriodEnd: future }), now)).toBe(true);
    expect(isSubActive(sub({ tier: 'PRIME', graceEndsAt: past }), now)).toBe(false);
  });
  it('подписка без активных окон → не активна (истекла)', () => {
    expect(isSubActive(sub({ tier: 'PRIME' }), now)).toBe(false);
    expect(isSubActive(sub({ tier: 'ELITE' }), now)).toBe(false);
  });
});

describe.skipIf(!hasDb)('subscription: grant/request/tier (БД)', () => {
  it('grantFoundingSub(Prime/Elite) + requestSubscription + tierOf + ранг каталога', async () => {
    const { db } = await import('@/lib/db');
    const { grantFoundingSub, requestSubscription, tierOf, subscriptionStatus, PRIME_RANK, ELITE_RANK } =
      await import('@/lib/subscription');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const user = await db.user.create({ data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'С', lastName: 'П', email: `sub-${stamp}@test.local` } });

    // requestSubscription на FREE
    await requestSubscription(user.id);
    let st = await subscriptionStatus(user.id);
    expect(st.tier).toBe('FREE');
    expect(st.proRequested).toBe(true);
    expect(await tierOf(user.id)).toBe('FREE');

    // grant founding Prime (Москва = tier A)
    await grantFoundingSub(user.id, 'moscow', 'PRIME');
    expect(await tierOf(user.id)).toBe('PRIME');
    st = await subscriptionStatus(user.id);
    expect(st.tier).toBe('PRIME');
    expect(st.isFounding).toBe(true);
    expect(st.proRequested).toBe(false);
    const s = await db.subscription.findUniqueOrThrow({ where: { userId: user.id } });
    expect(s.cityTier).toBe('A');
    expect(s.priceMinorLocked).toBeGreaterThan(0);
    expect(s.graceEndsAt).not.toBeNull();

    // апгрейд до Elite → tier и ранг каталога растут
    await grantFoundingSub(user.id, 'moscow', 'ELITE');
    expect(await tierOf(user.id)).toBe('ELITE');
    expect(ELITE_RANK).toBeGreaterThan(PRIME_RANK);

    // cleanup
    await db.subscription.deleteMany({ where: { userId: user.id } });
    await db.user.delete({ where: { id: user.id } });
  });
});
