import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { publishToUser } from '@/lib/realtime';

// Единая модель уведомлений (deep-think Eng P1, 2026-07-17): notifyInApp — durable
// запись (IN_APP канал, read-state) + live SSE; email/TG — best-effort прямой сенд
// в местах вызова (fire-and-forget). Мультиканальная очередь QUEUED убрана: её
// никто не дренировал (мёртвая таблица + незаметная потеря). Одна модель, без дублей.

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

/**
 * Массовая in-app рассылка ОДНИМ запросом (аудит 2026-07-31, P1).
 * Раньше веер заявки шёл как Promise.all(N × notifyInApp) — по отдельному
 * INSERT на адресата ВНУТРИ HTTP-запроса. В Москве при тысяче фотографов это
 * сотни round-trip к БД, и публичная форма заявки (метрика №1) висела бы до
 * таймаута. createMany делает это за один запрос; live-пуш шлём после.
 */
export async function notifyManyInApp(
  userIds: string[],
  type: string,
  payload: Prisma.InputJsonValue,
): Promise<number> {
  if (userIds.length === 0) return 0;
  try {
    const { count } = await db.notification.createMany({
      data: userIds.map((userId) => ({ userId, channel: 'IN_APP' as const, type, payload, state: 'SENT' as const })),
    });
    for (const userId of userIds) publishToUser(userId, { type: 'notification' });
    return count;
  } catch (e) {
    console.error('[notify] bulk in-app failed:', e);
    return 0;
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
