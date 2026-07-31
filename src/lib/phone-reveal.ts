import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';

// «Показать номер» (паритет MyWed). Телефон собран для верификации аккаунта,
// поэтому раскрывается ТОЛЬКО при явном опт-ине фотографа (profile.showPhone)
// и только кликом через API (не в SSR-разметке — спам-боты не соберут).
// Каждое раскрытие — событие PHONE_REVEAL (ценность для дашборда автора:
// «сколько раз смотрели номер»); повторы залогиненного зрителя дедупятся.

const DEDUP_HOURS = 6;

/** Дедуп-маркер гостевого события через таблицу RateLimit (окно DEDUP_HOURS,
 *  первый заход в окне = писать событие). guestKey — ХЭШ IP из роута (не PII). */
async function guestFirstInWindow(profileId: string, guestKey: string): Promise<boolean> {
  const windowMs = DEDUP_HOURS * 3_600_000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);
  const key = `phrev:${profileId}:${guestKey}`;
  const row = await db.rateLimit.upsert({
    where: { key_windowStart: { key, windowStart } },
    create: { key, windowStart, count: 1 },
    update: { count: { increment: 1 } },
  });
  return row.count === 1;
}

export async function revealPhone(
  profileId: string,
  actorUserId: string | null,
  guestKey: string | null = null,
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
    let shouldWrite: boolean;
    if (actorUserId) {
      // Залогиненный: дедуп по своим событиям в окне
      const dup = await db.activityEvent.findFirst({
        where: {
          type: 'PHONE_REVEAL',
          targetType: 'PROFILE',
          targetId: profileId,
          actorUserId,
          createdAt: { gte: new Date(Date.now() - DEDUP_HOURS * 3_600_000) },
        },
        select: { id: true },
      });
      shouldWrite = !dup;
    } else {
      // Гость: дедуп по IP-хэшу (ревью P3 — иначе цикл в консоли раздувал
      // метрику «Смотрели номер» до потолка rate-limit). Без ключа не пишем.
      shouldWrite = guestKey ? await guestFirstInWindow(profileId, guestKey) : false;
    }
    if (shouldWrite) {
      await db.activityEvent.create({
        data: { type: 'PHONE_REVEAL', targetType: 'PROFILE', targetId: profileId, actorUserId },
      });
    }
  }

  return { phone: profile.user.phone };
}
