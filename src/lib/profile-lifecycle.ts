import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';
import { notifyInApp } from '@/lib/notifications';
import { sendEmail } from '@/lib/email';
import { ru } from '@/i18n/ru';
import { APP_DOMAIN } from '@/lib/constants';

// Lifecycle-уведомления по вердикту модерации (deep-think P0: раньше approve/reject
// МОЛЧАЛИ — кульминация онбординга проходила в тишине). Уведомление вторично:
// доставка не должна ронять основное действие → notifyInApp глушит свои ошибки,
// email оборачиваем в void/catch.

const BASE = `https://${APP_DOMAIN}`;

export async function notifyProfileApproved(profileId: string): Promise<void> {
  const p = await db.photographerProfile.findUnique({ where: { id: profileId }, include: { user: true } });
  if (!p) return;
  await notifyInApp(p.userId, 'notification.profile.approved', { username: p.username });
  if (p.user.email) {
    void sendEmail(
      p.user.email,
      ru.lifecycle.approvedSubject,
      ru.lifecycle.approvedBody(`${BASE}/ru/photographer/${p.username}`, `${BASE}/ru/cabinet`),
    ).catch(() => {});
  }
}

export async function notifyProfileRevision(profileId: string, reason: string): Promise<void> {
  const p = await db.photographerProfile.findUnique({ where: { id: profileId }, include: { user: true } });
  if (!p) return;
  await notifyInApp(p.userId, 'notification.profile.revision', { reason });
  if (p.user.email) {
    void sendEmail(
      p.user.email,
      ru.lifecycle.revisionSubject,
      ru.lifecycle.revisionBody(reason, `${BASE}/ru/cabinet/profile/edit`),
    ).catch(() => {});
  }
}

/**
 * Повторная подача анкеты на проверку (аудит 2026-07-31, P0).
 * Отклонённый профиль был тупиком: фотограф видел причину, исправлял анкету —
 * и ничего не мог сделать, никакой кнопки «проверьте снова» не существовало,
 * а вернуть его в очередь мог только админ вручную.
 *
 * Возвращает профиль (и его отклонённые кадры) в PENDING — очередь модерации
 * увидит их снова. Гейт: только владелец, только из REJECTED/NEEDS_REVISION.
 */
export async function resubmitProfile(userId: string): Promise<{ status: 'PENDING' }> {
  const profile = await db.photographerProfile.findUnique({
    where: { userId },
    select: { id: true, status: true, _count: { select: { photos: true } } },
  });
  if (!profile) throw new DomainError('no_profile', 404);
  if (profile.status !== 'REJECTED' && profile.status !== 'NEEDS_REVISION') {
    throw new DomainError('not_resubmittable', 409);
  }
  if (profile._count.photos === 0) throw new DomainError('no_photos', 400);

  await db.$transaction(async (tx) => {
    await tx.photographerProfile.update({
      where: { id: profile.id },
      data: { status: 'PENDING', rejectReason: null, revisionNote: null },
    });
    // Кадры, отклонённые вместе с профилем, тоже идут на пересмотр — иначе
    // портфолио осталось бы пустым даже после одобрения.
    await tx.photo.updateMany({
      where: { profileId: profile.id, status: 'REJECTED' },
      data: { status: 'PENDING', rejectReason: null },
    });
  });
  return { status: 'PENDING' };
}
