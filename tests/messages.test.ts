import { describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('messages: диалоги и тред (БД)', () => {
  it('отправка → диалог с непрочитанным → тред читает', async () => {
    const { db } = await import('@/lib/db');
    const { sendMessage, dialogsFor, threadWith, MessageError } = await import('@/lib/messages');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const [a, b] = await Promise.all([
      db.user.create({ data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'А', lastName: 'Тест', email: `msg-a-${stamp}@test.local` } }),
      db.user.create({ data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Б', lastName: 'Тест', email: `msg-b-${stamp}@test.local` } }),
    ]);

    await expect(sendMessage(a.id, a.id, 'сам себе')).rejects.toThrow(MessageError);

    await sendMessage(a.id, b.id, 'Здравствуйте! Нужен репортаж.');
    const dialogsB = await dialogsFor(b.id);
    expect(dialogsB).toHaveLength(1);
    expect(dialogsB[0].unread).toBe(1);
    expect(dialogsB[0].peer.id).toBe(a.id);

    const thread = await threadWith(b.id, a.id); // читает и отмечает
    expect(thread).toHaveLength(1);
    expect((await dialogsFor(b.id))[0].unread).toBe(0);

    // Уведомление о сообщении доставляет api/messages роут (in-app+SSE), не lib
    // sendMessage (мёртвый enqueue убран, deep-think Eng P1) — здесь его нет.
    await db.notification.deleteMany({ where: { userId: { in: [a.id, b.id] } } });
    await db.message.deleteMany({ where: { senderId: { in: [a.id, b.id] } } });
    await db.user.deleteMany({ where: { id: { in: [a.id, b.id] } } });
  });
});
