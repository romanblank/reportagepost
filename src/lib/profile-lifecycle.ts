import { db } from '@/lib/db';
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
