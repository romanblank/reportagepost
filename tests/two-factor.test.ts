import { describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('two-factor: включение/проверка/резервные коды/выключение (БД)', () => {
  it('полный цикл 2FA', async () => {
    const { db } = await import('@/lib/db');
    const { beginEnroll, confirmEnroll, verifySecondFactor, disable, twoFactorStatus } = await import('@/lib/two-factor');
    const { totpCode } = await import('@/lib/totp');
    const { DomainError } = await import('@/lib/errors');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const user = await db.user.create({
      data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'Д', lastName: 'Ф', email: `2fa-${stamp}@test.local` },
    });

    // begin → секрет
    const { secret } = await beginEnroll(user.id);
    expect(secret.length).toBeGreaterThan(10);

    // неверный код — отказ; ещё не включено
    await expect(confirmEnroll(user.id, '000000')).rejects.toThrow(DomainError);
    expect((await twoFactorStatus(user.id)).enabled).toBe(false);

    // верный код → включено + 10 резервных кодов
    const codes = await confirmEnroll(user.id, totpCode(secret));
    expect(codes.length).toBe(10);
    const st = await twoFactorStatus(user.id);
    expect(st.enabled).toBe(true);
    expect(st.recoveryLeft).toBe(10);

    // повторное включение — отказ
    await expect(beginEnroll(user.id)).rejects.toThrow(DomainError);

    // проверка TOTP-кодом
    expect(await verifySecondFactor(user.id, totpCode(secret))).toBe(true);
    // неверный — нет
    expect(await verifySecondFactor(user.id, '111111')).toBe(false);

    // резервный код — одноразовый
    expect(await verifySecondFactor(user.id, codes[0])).toBe(true);
    expect(await verifySecondFactor(user.id, codes[0])).toBe(false); // уже использован
    expect((await twoFactorStatus(user.id)).recoveryLeft).toBe(9);

    // выключение неверным кодом — отказ; верным — ок
    await expect(disable(user.id, '222222')).rejects.toThrow(DomainError);
    await disable(user.id, totpCode(secret));
    expect((await twoFactorStatus(user.id)).enabled).toBe(false);
    expect(await db.recoveryCode.count({ where: { userId: user.id } })).toBe(0);

    await db.recoveryCode.deleteMany({ where: { userId: user.id } });
    await db.user.delete({ where: { id: user.id } });
  });
});
