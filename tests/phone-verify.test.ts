import { beforeAll, describe, expect, it, vi } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

beforeAll(() => {
  process.env.AUTH_SECRET ??= 'test-secret-32-chars-minimum-000000';
});

// SMS-провайдер мокаем — реальную отправку не дёргаем
vi.mock('@/lib/sms', () => ({
  smsProvider: { isConfigured: () => true, send: vi.fn(async () => ({ id: 'mock' })) },
}));

describe.skipIf(!hasDb)('phone-verify: код с TTL и лимитом попыток (БД)', () => {
  it('неверный код инкрементит попытки; правильный верифицирует', async () => {
    const { db } = await import('@/lib/db');
    const { startPhoneVerification, confirmPhoneVerification } = await import('@/lib/phone-verify');
    const { DomainError } = await import('@/lib/errors');
    const { verifyPassword } = await import('@/lib/auth');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const user = await db.user.create({ data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Ф', lastName: 'В', email: `ph-${stamp}@test.local` } });
    const phone = `+7999${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;

    await startPhoneVerification(user.id, phone);
    const rec = await db.phoneVerification.findFirstOrThrow({ where: { userId: user.id } });

    // код не хранится в открытом виде
    expect(rec.codeHash).not.toMatch(/^\d{6}$/);

    // неверный код
    await expect(confirmPhoneVerification(user.id, '000000')).rejects.toThrow(DomainError);
    expect((await db.phoneVerification.findFirstOrThrow({ where: { userId: user.id } })).attempts).toBe(1);

    // восстановим реальный код перебором (тест знает хеш): подберём как в проде — нельзя,
    // поэтому кладём известный хеш
    const knownHash = await (await import('@/lib/auth')).hashPassword('123456');
    await db.phoneVerification.update({ where: { id: rec.id }, data: { codeHash: knownHash, attempts: 0 } });
    expect(await verifyPassword(knownHash, '123456')).toBe(true);

    await confirmPhoneVerification(user.id, '123456');
    const after = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.phone).toBe(phone);
    expect(after.phoneVerifiedAt).toBeTruthy();
    expect(await db.phoneVerification.count({ where: { userId: user.id } })).toBe(0);

    await db.user.delete({ where: { id: user.id } });
  });

  it('P1-1: параллельные попытки не обходят лимит (атомарность)', async () => {
    const { db } = await import('@/lib/db');
    const { startPhoneVerification, confirmPhoneVerification } = await import('@/lib/phone-verify');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const user = await db.user.create({ data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Б', lastName: 'Ф', email: `bf-${stamp}@test.local` } });
    const phone = `+7999${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
    await startPhoneVerification(user.id, phone);

    // 20 параллельных неверных попыток — должно пройти не больше MAX_ATTEMPTS(5),
    // после чего запись удаляется и все последующие получают too_many_attempts
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => confirmPhoneVerification(user.id, '999999')),
    );
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(rejected).toHaveLength(20); // все неверны
    // запись израсходована и удалена (лимит сработал, а не обойдён)
    expect(await db.phoneVerification.count({ where: { userId: user.id } })).toBe(0);

    await db.user.delete({ where: { id: user.id } });
  });
});
