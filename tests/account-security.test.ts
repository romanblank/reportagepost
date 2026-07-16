import { describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('account-security: смена пароля/email/имени (БД)', () => {
  it('пароль/email/имя меняются с проверкой; коллизии и неверный пароль — отказ', async () => {
    const { db } = await import('@/lib/db');
    const { changePassword, changeEmail, changeName } = await import('@/lib/account-security');
    const { hashPassword, verifyPassword } = await import('@/lib/auth');
    const { DomainError } = await import('@/lib/errors');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const u = await db.user.create({ data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'И', lastName: 'В', email: `acc-${stamp}@test.local`, passwordHash: await hashPassword('oldpassword123'), tokenVersion: 0 } });
    const other = await db.user.create({ data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'Ч', lastName: 'Ж', email: `taken-${stamp}@test.local` } });

    // пароль: неверный текущий → отказ; верный → смена + tokenVersion++
    await expect(changePassword(u.id, 'wrong', 'newpassword123')).rejects.toThrow(DomainError);
    await changePassword(u.id, 'oldpassword123', 'newpassword123');
    const a1 = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(await verifyPassword(a1.passwordHash!, 'newpassword123')).toBe(true);
    expect(a1.tokenVersion).toBe(1);

    // email: занятый → отказ; свободный → смена (с верным паролем)
    await expect(changeEmail(u.id, `taken-${stamp}@test.local`, 'newpassword123')).rejects.toThrow(DomainError);
    await expect(changeEmail(u.id, `fresh-${stamp}@test.local`, 'wrong')).rejects.toThrow(DomainError);
    await changeEmail(u.id, `fresh-${stamp}@test.local`, 'newpassword123');
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).email).toBe(`fresh-${stamp}@test.local`);

    // имя: короткое → отказ; норм → смена
    await expect(changeName(u.id, 'X', 'Y')).rejects.toThrow(DomainError);
    await changeName(u.id, 'Пётр', 'Смирнов');
    const a2 = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(a2.firstName).toBe('Пётр');

    await db.user.deleteMany({ where: { id: { in: [u.id, other.id] } } });
  });
});
