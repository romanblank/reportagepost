import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';

// «Показать номер» (паритет MyWed). Телефон собран для верификации аккаунта,
// поэтому раскрывается ТОЛЬКО при явном опт-ине фотографа (profile.showPhone)
// и только кликом через API (не в SSR-разметке — спам-боты не соберут).
// Каждое раскрытие — событие PHONE_REVEAL (ценность для дашборда автора:
// «сколько раз смотрели номер»); повторы залогиненного зрителя дедупятся.

const DEDUP_HOURS = 6;

export async function revealPhone(
  profileId: string,
  actorUserId: string | null,
): Promise<{ phone: string }> {
  const profile = await db.photographerProfile.findUnique({
    where: { id: profileId },
    select: { status: true, showPhone: true, userId: true, user: { select: { phone: true } } },
  });
  if (!profile || profile.status !== 'APPROVED' || !profile.showPhone || !profile.user.phone) {
    throw new DomainError('phone_unavailable', 404);
  }

  // Владелец смотрит свой номер — событие не пишем (не накручивает статистику).
  if (actorUserId !== profile.userId) {
    const dup = actorUserId
      ? await db.activityEvent.findFirst({
          where: {
            type: 'PHONE_REVEAL',
            targetType: 'PROFILE',
            targetId: profileId,
            actorUserId,
            createdAt: { gte: new Date(Date.now() - DEDUP_HOURS * 3_600_000) },
          },
          select: { id: true },
        })
      : null; // гость: дедуп на уровне rate-limit по IP в роуте
    if (!dup) {
      await db.activityEvent.create({
        data: { type: 'PHONE_REVEAL', targetType: 'PROFILE', targetId: profileId, actorUserId },
      });
    }
  }

  return { phone: profile.user.phone };
}
