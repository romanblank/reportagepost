import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

describe.skipIf(!hasDb)('password-reset: сброс пароля (БД)', () => {
  it('валидный токен меняет пароль + инвалидирует сессии; невалидный/использованный — отказ', async () => {
    const { db } = await import('@/lib/db');
    const { resetPassword } = await import('@/lib/password-reset');
    const { verifyPassword, hashPassword } = await import('@/lib/auth');
    const { DomainError } = await import('@/lib/errors');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const user = await db.user.create({
      data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'П', lastName: 'В',
        email: `pwr-${stamp}@test.local`, passwordHash: await hashPassword('oldpassword123'), tokenVersion: 0 },
    });
    const raw = `tok-${stamp}`;
    await db.passwordReset.create({
      data: { userId: user.id, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + 3_600_000) },
    });

    // невалидный токен — отказ
    await expect(resetPassword('nope', 'brandnewpass1')).rejects.toThrow(DomainError);
    // слишком короткий пароль — отказ
    await expect(resetPassword(raw, 'short')).rejects.toThrow(DomainError);

    // валидный
    await resetPassword(raw, 'brandnewpass1');
    const after = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await verifyPassword(after.passwordHash!, 'brandnewpass1')).toBe(true);
    expect(after.tokenVersion).toBe(1); // сессии инвалидированы
    expect(after.passwordChangedAt).not.toBeNull();

    // повторное использование того же токена — отказ (usedAt проставлен)
    await expect(resetPassword(raw, 'anotherpass12')).rejects.toThrow(DomainError);

    await db.passwordReset.deleteMany({ where: { userId: user.id } });
    await db.user.delete({ where: { id: user.id } });
  });
});
