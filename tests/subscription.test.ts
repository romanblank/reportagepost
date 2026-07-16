import { describe, expect, it } from 'vitest';
import 'dotenv/config';
import { isProActive } from '@/lib/subscription';
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

describe('isProActive — граница FREE/PRO (чистая логика)', () => {
  it('null / FREE → не PRO', () => {
    expect(isProActive(null, now)).toBe(false);
    expect(isProActive(sub({ tier: 'FREE' }), now)).toBe(false);
  });
  it('grandfathered PRO → активен всегда', () => {
    expect(isProActive(sub({ tier: 'PRO', grandfathered: true }), now)).toBe(true);
  });
  it('grace/trial/period в будущем → активен; в прошлом → нет', () => {
    expect(isProActive(sub({ tier: 'PRO', graceEndsAt: future }), now)).toBe(true);
    expect(isProActive(sub({ tier: 'PRO', trialEndsAt: future }), now)).toBe(true);
    expect(isProActive(sub({ tier: 'PRO', currentPeriodEnd: future }), now)).toBe(true);
    expect(isProActive(sub({ tier: 'PRO', graceEndsAt: past }), now)).toBe(false);
  });
  it('PRO без активных окон → не PRO (истёк)', () => {
    expect(isProActive(sub({ tier: 'PRO' }), now)).toBe(false);
  });
});

describe.skipIf(!hasDb)('subscription: grant/request/tier (БД)', () => {
  it('grantFoundingPro → PRO+founding+grace+lockedPrice; requestPro ставит флаг; tierOf', async () => {
    const { db } = await import('@/lib/db');
    const { grantFoundingPro, requestPro, tierOf, subscriptionStatus } = await import('@/lib/subscription');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const user = await db.user.create({ data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'С', lastName: 'П', email: `sub-${stamp}@test.local` } });

    // requestPro на FREE
    await requestPro(user.id);
    let st = await subscriptionStatus(user.id);
    expect(st.tier).toBe('FREE');
    expect(st.proRequested).toBe(true);
    expect(await tierOf(user.id)).toBe('FREE');

    // grant founding PRO (Москва = tier A, founding −30% от 990 → 693 → округл. до 1000-кратного)
    await grantFoundingPro(user.id, 'moscow');
    expect(await tierOf(user.id)).toBe('PRO');
    st = await subscriptionStatus(user.id);
    expect(st.tier).toBe('PRO');
    expect(st.isFounding).toBe(true);
    expect(st.proRequested).toBe(false); // уже PRO
    const s = await db.subscription.findUniqueOrThrow({ where: { userId: user.id } });
    expect(s.cityTier).toBe('A');
    expect(s.priceMinorLocked).toBeGreaterThan(0);
    expect(s.graceEndsAt).not.toBeNull();

    // cleanup
    await db.subscription.deleteMany({ where: { userId: user.id } });
    await db.user.delete({ where: { id: user.id } });
  });
});
