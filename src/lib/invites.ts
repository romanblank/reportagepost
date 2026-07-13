import { db } from '@/lib/db';

/**
 * Инвайт-гейт (инвариант закрытости до S4): проверяет и «расходует» код.
 * Возвращает id кода или null (невалиден/исчерпан/истёк).
 * Атомарно: updateMany с условием защищает от гонки на последнем использовании.
 */
export async function consumeInviteCode(code: string): Promise<string | null> {
  const invite = await db.inviteCode.findUnique({ where: { code } });
  if (!invite) return null;
  if (invite.expiresAt && invite.expiresAt < new Date()) return null;

  const updated = await db.inviteCode.updateMany({
    where: { id: invite.id, usedCount: { lt: invite.maxUses } },
    data: { usedCount: { increment: 1 } },
  });
  return updated.count === 1 ? invite.id : null;
}
