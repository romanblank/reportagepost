import { describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('invites: создание/расход/срок/статистика (БД)', () => {
  it('createInvite + consume (лимит/срок) + invitesList.registered', async () => {
    const { db } = await import('@/lib/db');
    const { createInvite, consumeInviteCode, invitesList } = await import('@/lib/invites');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const admin = await db.user.create({ data: { role: 'ADMIN', status: 'ACTIVE', firstName: 'А', lastName: 'Д', email: `iv-a-${stamp}@test.local` } });

    // персональный инвайт на 2 использования
    const inv = await createInvite({ issuedByUserId: admin.id, note: `тест ${stamp}`, maxUses: 2 });
    expect(inv.code).toBeTruthy();
    expect(inv.issuedByUserId).toBe(admin.id);

    // расход дважды — ок, третий — null (исчерпан)
    expect(await consumeInviteCode(inv.code)).toBe(inv.id);
    expect(await consumeInviteCode(inv.code)).toBe(inv.id);
    expect(await consumeInviteCode(inv.code)).toBeNull();

    // истёкший — null
    const expired = await createInvite({ issuedByUserId: admin.id, maxUses: 1, expiresAt: new Date(Date.now() - 1000) });
    expect(await consumeInviteCode(expired.code)).toBeNull();

    // registered отражает реально зарегистрированных по коду
    await db.user.create({ data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'Р', lastName: 'Г', email: `iv-u-${stamp}@test.local`, inviteCodeId: inv.id } });
    const list = await invitesList();
    const row = list.find((r) => r.id === inv.id);
    expect(row?.usedCount).toBe(2);
    expect(row?.registered).toBe(1);

    await db.user.deleteMany({ where: { email: { in: [`iv-a-${stamp}@test.local`, `iv-u-${stamp}@test.local`] } } });
    await db.inviteCode.deleteMany({ where: { id: { in: [inv.id, expired.id] } } });
  });
});
