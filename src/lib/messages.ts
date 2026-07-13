import { db } from '@/lib/db';
import { enqueueNotification } from '@/lib/notifications';

export class MessageError extends Error {
  constructor(public code: 'recipient_not_found' | 'self_message') {
    super(code);
  }
}

export async function sendMessage(senderId: string, recipientId: string, body: string) {
  if (senderId === recipientId) throw new MessageError('self_message');
  const recipient = await db.user.findUnique({ where: { id: recipientId } });
  if (!recipient || recipient.status === 'BANNED') throw new MessageError('recipient_not_found');

  const message = await db.message.create({
    data: { senderId, recipientId, body },
  });
  await enqueueNotification({
    userId: recipientId,
    channel: 'EMAIL',
    type: 'notification.message.new',
    payload: { messageId: message.id, senderId },
  });
  return message;
}

/** Диалоги пользователя: последнее сообщение и число непрочитанных по собеседнику. */
export async function dialogsFor(userId: string) {
  const messages = await db.message.findMany({
    where: { OR: [{ senderId: userId }, { recipientId: userId }] },
    orderBy: { createdAt: 'desc' },
    take: 500,
    include: {
      sender: { select: { id: true, firstName: true, lastName: true } },
      recipient: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  const byPeer = new Map<
    string,
    { peer: { id: string; firstName: string; lastName: string }; last: (typeof messages)[number]; unread: number }
  >();
  for (const m of messages) {
    const peer = m.senderId === userId ? m.recipient : m.sender;
    const entry = byPeer.get(peer.id);
    const unreadInc = m.recipientId === userId && !m.readAt ? 1 : 0;
    if (!entry) byPeer.set(peer.id, { peer, last: m, unread: unreadInc });
    else entry.unread += unreadInc;
  }
  return [...byPeer.values()];
}

/** Тред с собеседником + отметка входящих прочитанными. */
export async function threadWith(userId: string, peerId: string) {
  await db.message.updateMany({
    where: { senderId: peerId, recipientId: userId, readAt: null },
    data: { readAt: new Date() },
  });
  return db.message.findMany({
    where: {
      OR: [
        { senderId: userId, recipientId: peerId },
        { senderId: peerId, recipientId: userId },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });
}
