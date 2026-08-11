import { describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

/**
 * Первый столп админки — правда: демо и тесты не должны попадать в метрики,
 * иначе цифры льстят, а решения принимаются по выдумке.
 *
 * Признак демо переехал в данные (`isDemo`), и отсечка обязана смотреть на
 * него: демо, заведённое под обычным именем, раньше считалось бы настоящим
 * автором.
 */
describe.skipIf(!hasDb)('демо не попадает в метрики (БД)', () => {
  it('анкета с признаком демо исключена, даже если имя обычное', async () => {
    const { db } = await import('@/lib/db');
    const { REAL_PROFILE } = await import('@/lib/admin-dashboard');

    const stamp = `${Date.now()}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });

    const make = async (tag: string, isDemo: boolean) => {
      const u = await db.user.create({
        data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Метр', lastName: tag, email: `m-${tag}-${stamp}@example.com` },
      });
      const p = await db.photographerProfile.create({
        // Имя намеренно обычное: раньше отсечка держалась только на префиксе
        data: { userId: u.id, username: `metric-${tag}-${stamp}`, cityId: city.id, status: 'APPROVED', isDemo },
      });
      return { u, p };
    };

    const demo = await make('demo', true);
    const real = await make('real', false);

    const counted = await db.photographerProfile.findMany({
      where: { ...REAL_PROFILE, username: { startsWith: `metric-` } },
      select: { username: true },
    });

    expect(counted.some((c) => c.username === real.p.username)).toBe(true);
    expect(counted.some((c) => c.username === demo.p.username)).toBe(false);

    for (const { u, p } of [demo, real]) {
      await db.photographerProfile.delete({ where: { id: p.id } });
      await db.user.delete({ where: { id: u.id } });
    }
  });
});
