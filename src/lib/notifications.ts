import type { NotificationChannel, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { publishToUser } from '@/lib/realtime';

// Очередь уведомлений (мультиканальная, ADR mobile-strategy).
// Постановка — здесь; доставка — диспетчером (email при получении SMTP-ключа,
// Telegram в S2). Недоставленное честно лежит в QUEUED, не теряется.

export async function enqueueNotification(input: {
  userId: string;
  channel: NotificationChannel;
  type: string; // i18n-ключ шаблона, напр. notification.inquiry.new
  payload: Prisma.InputJsonValue;
}): Promise<void> {
  await db.notification.create({ data: input });
}

export async function enqueueForMany(
  userIds: string[],
  channel: NotificationChannel,
  type: string,
  payload: Prisma.InputJsonValue,
): Promise<number> {
  if (userIds.length === 0) return 0;
  const result = await db.notification.createMany({
    data: userIds.map((userId) => ({ userId, channel, type, payload })),
  });
  return result.count;
}

// ─── In-app центр уведомлений (канал IN_APP, read-state) ────────────────────

export interface InAppNotification {
  id: string;
  type: string; // i18n-ключ шаблона
  payload: Record<string, unknown>;
  readAt: Date | null;
  createdAt: Date;
}

/** Создаёт in-app уведомление и толкает live-событие (SSE обновит счётчик).
 *  Уведомление ВТОРИЧНО: собственные ошибки глушим, чтобы не ронять основное
 *  действие (заявку/отзыв/сообщение), даже если вызвано в await. */
export async function notifyInApp(userId: string, type: string, payload: Prisma.InputJsonValue): Promise<void> {
  try {
    await db.notification.create({ data: { userId, channel: 'IN_APP', type, payload, state: 'SENT' } });
    publishToUser(userId, { type: 'notification' });
  } catch (e) {
    console.error('[notify] in-app failed:', e);
  }
}

export async function inAppNotifications(userId: string, limit = 50): Promise<InAppNotification[]> {
  const rows = await db.notification.findMany({
    where: { userId, channel: 'IN_APP' },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return rows.map((n) => ({
    id: n.id,
    type: n.type,
    payload: (n.payload ?? {}) as Record<string, unknown>,
    readAt: n.readAt,
    createdAt: n.createdAt,
  }));
}

export async function unreadNotificationCount(userId: string): Promise<number> {
  return db.notification.count({ where: { userId, channel: 'IN_APP', readAt: null } });
}

export async function markNotificationsRead(userId: string): Promise<void> {
  await db.notification.updateMany({
    where: { userId, channel: 'IN_APP', readAt: null },
    data: { readAt: new Date() },
  });
}
