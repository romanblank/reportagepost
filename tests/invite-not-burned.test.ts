import { describe, expect, it } from 'vitest';
import 'dotenv/config';

// P0 аудита 2026-07-31: инвайт — валюта закрытой беты. Раньше код списывался
// ДО проверки занятости email, поэтому попытка регистрации на уже занятый адрес
// сжигала приглашение: человек оставался без входа, а оператор — без понимания.
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('инвайты: код не сгорает впустую (БД)', () => {
  it('releaseInviteCode возвращает использование; не уводит счётчик ниже нуля', async () => {
    const { db } = await import('@/lib/db');
    const { consumeInviteCode, releaseInviteCode } = await import('@/lib/invites');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const invite = await db.inviteCode.create({ data: { code: `inv-${stamp}`, maxUses: 1 } });

    // Потребление списывает
    const consumedId = await consumeInviteCode(invite.code);
    expect(consumedId).toBe(invite.id);
    expect((await db.inviteCode.findUniqueOrThrow({ where: { id: invite.id } })).usedCount).toBe(1);

    // Исчерпанный код повторно не потребляется
    expect(await consumeInviteCode(invite.code)).toBeNull();

    // Компенсация возвращает использование в оборот
    await releaseInviteCode(invite.id);
    expect((await db.inviteCode.findUniqueOrThrow({ where: { id: invite.id } })).usedCount).toBe(0);
    // ...и код снова работает
    expect(await consumeInviteCode(invite.code)).toBe(invite.id);

    // Повторная компенсация не уводит счётчик в минус
    await releaseInviteCode(invite.id);
    await releaseInviteCode(invite.id);
    expect((await db.inviteCode.findUniqueOrThrow({ where: { id: invite.id } })).usedCount).toBe(0);

    await db.inviteCode.delete({ where: { id: invite.id } });
  });
});
