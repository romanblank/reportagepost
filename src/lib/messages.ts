import { db } from '@/lib/db';

export class MessageError extends Error {
  constructor(public code: 'recipient_not_found' | 'self_message' | 'blocked') {
    super(code);
  }
}

// Доставка уведомления получателю (in-app + SSE) — в api/messages роуте. Здесь
// только создание сообщения (мёртвый enqueue в QUEUED убран, deep-think Eng P1).
export async function sendMessage(senderId: string, recipientId: string, body: string) {
  if (senderId === recipientId) throw new MessageError('self_message');
  const recipient = await db.user.findUnique({ where: { id: recipientId } });
  if (!recipient || recipient.status === 'BANNED') throw new MessageError('recipient_not_found');
  // Блокировка (аудит 2026-07-31, P0 «нет инструментов модерации людей»):
  // заблокированный не может писать. Проверяем в ОБЕ стороны — заблокировавший
  // тоже не пишет заблокированному, иначе диалог остаётся односторонним.
  const { isBlockedBetween } = await import('@/lib/reports');
  if (await isBlockedBetween(senderId, recipientId)) throw new MessageError('blocked');

  return db.message.create({ data: { senderId, recipientId, body } });
}

export interface Dialog {
  peer: { id: string; firstName: string; lastName: string };
  last: { body: string; createdAt: Date };
  unread: number;
}

/**
 * Диалоги пользователя без лимита 500 (аудит P1-4): последнее сообщение на
 * собеседника через DISTINCT ON + отдельный подсчёт непрочитанных.
 */
export async function dialogsFor(userId: string): Promise<Dialog[]> {
  const lasts = await db.$queryRaw<
    { peer_id: string; first_name: string; last_name: string; body: string; created_at: Date }[]
  >`
    SELECT DISTINCT ON (peer_id) peer_id, u."firstName" AS first_name, u."lastName" AS last_name,
           m.body, m."createdAt" AS created_at
    FROM (
      SELECT CASE WHEN "senderId" = ${userId} THEN "recipientId" ELSE "senderId" END AS peer_id,
             body, "createdAt"
      FROM "Message"
      WHERE "senderId" = ${userId} OR "recipientId" = ${userId}
    ) m
    JOIN "User" u ON u.id = m.peer_id
    ORDER BY peer_id, m."createdAt" DESC
  `;

  const unreadRows = await db.message.groupBy({
    by: ['senderId'],
    where: { recipientId: userId, readAt: null },
    _count: true,
  });
  const unreadByPeer = new Map(unreadRows.map((r) => [r.senderId, r._count]));

  return lasts
    .map((r) => ({
      peer: { id: r.peer_id, firstName: r.first_name, lastName: r.last_name },
      last: { body: r.body, createdAt: r.created_at },
      unread: unreadByPeer.get(r.peer_id) ?? 0,
    }))
    .sort((a, b) => b.last.createdAt.getTime() - a.last.createdAt.getTime());
}

/** Тред с собеседником + отметка входящих прочитанными. */
export async function threadWith(userId: string, peerId: string) {
  await db.message.updateMany({
    where: { senderId: peerId, recipientId: userId, readAt: null },
    data: { readAt: new Date() },
  });
  // ПОСЛЕДНИЕ 200 сообщений (аудит 2026-07-31, P1): раньше стояло
  // orderBy asc + take 200, то есть брались 200 САМЫХ СТАРЫХ — после
  // двухсотого сообщения активный диалог переставал показывать новые
  // и выглядел зависшим. Берём хвост и разворачиваем для отображения.
  const recent = await db.message.findMany({
    where: {
      OR: [
        { senderId: userId, recipientId: peerId },
        { senderId: peerId, recipientId: userId },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return recent.reverse();
}
