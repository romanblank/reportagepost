import { afterAll, describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

// Вес подписки не должен переживать саму подписку (S5-блокер, аудит 2026-07-26).
//
// proRank — денормализованный вес в каталоге и очереди модерации — ставился при
// зачислении и никогда не сбрасывался. С грантами (бессрочными) это не было
// заметно; с реальной оплатой истёкшая подписка навсегда оставляла бы автору
// полку «Рекомендуемые» и приоритет модерации. Заплатил один раз — получаешь
// вечно: несправедливо к тем, кто платит регулярно, и обессмысливает подписку.
describe.skipIf(!hasDb)('subscription: сверка proRank с реальным состоянием (БД)', () => {
  const userIds: string[] = [];
  afterAll(async () => {
    const { db } = await import('@/lib/db');
    await db.subscription.deleteMany({ where: { userId: { in: userIds } } });
    await db.profileCategoryScore.deleteMany({ where: { profile: { userId: { in: userIds } } } });
    await db.photographerProfile.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it('истёкшая подписка теряет вес, активная сохраняет', async () => {
    const { db } = await import('@/lib/db');
    const { reconcileSubRanks, rankForTier } = await import('@/lib/subscription');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });

    const mk = async (tag: string, periodEnd: Date | null) => {
      const u = await db.user.create({
        data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: tag, lastName: 'Ранг', email: `rank-${tag}-${stamp}@test.local` },
      });
      userIds.push(u.id);
      const p = await db.photographerProfile.create({
        // Ранг уже проставлен — как после зачисления оплаты
        data: { userId: u.id, username: `rank-${tag}-${stamp}`, cityId: city.id, status: 'APPROVED', proRank: rankForTier('ELITE') },
      });
      await db.subscription.create({
        data: { userId: u.id, tier: 'ELITE', currentPeriodEnd: periodEnd ?? undefined },
      });
      return p.id;
    };

    const day = 86_400_000;
    const expired = await mk('exp', new Date(Date.now() - 3 * day)); // период кончился
    const active = await mk('act', new Date(Date.now() + 20 * day)); // оплачен

    const fixed = await reconcileSubRanks();
    expect(fixed).toBeGreaterThanOrEqual(1);

    const [afterExpired, afterActive] = await Promise.all([
      db.photographerProfile.findUniqueOrThrow({ where: { id: expired } }),
      db.photographerProfile.findUniqueOrThrow({ where: { id: active } }),
    ]);
    expect(afterExpired.proRank).toBe(0); // полка и приоритет модерации ушли
    expect(afterActive.proRank).toBe(rankForTier('ELITE')); // у платящего всё на месте

    // Идемпотентность: повторный прогон уже ничего не правит у этих двоих
    await reconcileSubRanks();
    expect((await db.photographerProfile.findUniqueOrThrow({ where: { id: expired } })).proRank).toBe(0);
  });
});
