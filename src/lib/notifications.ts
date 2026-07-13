import type { NotificationChannel, Prisma } from '@prisma/client';
import { db } from '@/lib/db';

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
