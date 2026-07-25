import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';
import { rateLimit } from '@/lib/rate-limit';

// Подтверждённая съёмка — честный якорь доверия (доброжелательная система).
// Заказчик отмечает, что съёмка с автором состоялась. Даёт факты «снимали
// вместе»/«клиенты возвращаются» и делает отзыв verified по РЕАЛЬНОЙ съёмке.

/** Заказчик подтверждает, что съёмка с автором состоялась. */
export async function confirmShoot(clientUserId: string, profileId: string, eventDate?: Date | null): Promise<void> {
  const profile = await db.photographerProfile.findUnique({
    where: { id: profileId },
    select: { status: true, userId: true },
  });
  if (!profile || profile.status !== 'APPROVED') throw new DomainError('target_not_found', 404);
  if (profile.userId === clientUserId) throw new DomainError('shoot_self', 400);
  const actor = await db.user.findUnique({ where: { id: clientUserId }, select: { role: true } });
  if (actor?.role !== 'CLIENT') throw new DomainError('shoot_clients_only', 403);
  await rateLimit(`shoot:user:${clientUserId}`, 10, 3600); // антиспам подтверждений
  await db.shootConfirmation.create({ data: { clientUserId, profileId, eventDate: eventDate ?? undefined } });
}

export interface ShootStats {
  count: number; // всего подтверждённых съёмок
  clients: number; // разных заказчиков
  returning: number; // заказчиков с ≥2 съёмками (возвращаются)
}

/** Факты «снимали вместе» для профиля из подтверждённых съёмок. */
export async function shootStats(profileId: string): Promise<ShootStats> {
  const grouped = await db.shootConfirmation.groupBy({
    by: ['clientUserId'],
    where: { profileId },
    _count: true,
  });
  return {
    count: grouped.reduce((s, g) => s + g._count, 0),
    clients: grouped.length,
    returning: grouped.filter((g) => g._count >= 2).length,
  };
}

/** Была ли реальная съёмка между заказчиком и автором (для verified-отзыва). */
export async function hasShotWith(clientUserId: string, profileId: string): Promise<boolean> {
  return (await db.shootConfirmation.count({ where: { clientUserId, profileId } })) > 0;
}
