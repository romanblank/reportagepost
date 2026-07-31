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
  // Анти-форж (S4): подтвердить съёмку можно только при РЕАЛЬНОМ контакте на
  // платформе — двусторонней переписке (клиент писал автору И автор отвечал).
  // Блокирует нулевой-эффорт фейк-verified (создать клиента → сразу подтвердить
  // любому автору). Полная двусторонняя аккцептация автором — design-record для S4.
  const [clientToAuthor, authorToClient] = await Promise.all([
    db.message.count({ where: { senderId: clientUserId, recipientId: profile.userId } }),
    db.message.count({ where: { senderId: profile.userId, recipientId: clientUserId } }),
  ]);
  if (clientToAuthor === 0 || authorToClient === 0) throw new DomainError('shoot_no_contact', 403);
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

export interface ClientShoot {
  profileId: string;
  username: string;
  firstName: string;
  lastName: string;
  avatarKey: string | null;
  count: number;
  reviewed: boolean; // оставил ли заказчик отзыв этому автору
}

/** Съёмки заказчика (кабинет): по авторам + отметка «отзыв оставлен» — петля признания. */
export async function shootsByClient(clientUserId: string): Promise<ClientShoot[]> {
  const grouped = await db.shootConfirmation.groupBy({
    by: ['profileId'],
    where: { clientUserId },
    _count: true,
  });
  if (grouped.length === 0) return [];
  const profileIds = grouped.map((g) => g.profileId);
  const [profiles, reviews] = await Promise.all([
    db.photographerProfile.findMany({
      where: { id: { in: profileIds }, status: 'APPROVED' },
      select: { id: true, username: true, avatarKey: true, user: { select: { firstName: true, lastName: true } } },
    }),
    db.review.findMany({ where: { authorUserId: clientUserId, profileId: { in: profileIds } }, select: { profileId: true } }),
  ]);
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const reviewed = new Set(reviews.map((r) => r.profileId));
  return grouped
    .map((g) => {
      const p = byId.get(g.profileId);
      if (!p) return null;
      return {
        profileId: g.profileId,
        username: p.username,
        firstName: p.user.firstName,
        lastName: p.user.lastName,
        avatarKey: p.avatarKey,
        count: g._count,
        reviewed: reviewed.has(g.profileId),
      } satisfies ClientShoot;
    })
    .filter((x): x is ClientShoot => x !== null);
}
