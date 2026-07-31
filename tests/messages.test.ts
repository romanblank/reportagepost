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

describe.skipIf(!process.env.DATABASE_URL)('messages: тред показывает ПОСЛЕДНИЕ сообщения (БД)', () => {
  it('при переписке длиннее лимита видны свежие сообщения, а не первые', async () => {
    const { db } = await import('@/lib/db');
    const { threadWith } = await import('@/lib/messages');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const mk = (tag: string) => db.user.create({
      data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'Т', lastName: tag, email: `th-${tag}-${stamp}@test.local` },
    });
    const a = await mk('a');
    const b = await mk('b');

    // 205 сообщений: лимит выборки 200, значит первые 5 должны отвалиться
    const base = Date.now() - 205 * 60_000;
    await db.message.createMany({
      data: Array.from({ length: 205 }, (_, i) => ({
        senderId: i % 2 === 0 ? a.id : b.id,
        recipientId: i % 2 === 0 ? b.id : a.id,
        body: `сообщение ${i + 1}`,
        createdAt: new Date(base + i * 60_000),
      })),
    });

    const thread = await threadWith(a.id, b.id);
    expect(thread.length).toBe(200);
    // Регрессия аудита 2026-07-31: раньше брались 200 САМЫХ СТАРЫХ (orderBy asc),
    // и активный диалог после 200-го сообщения выглядел зависшим.
    expect(thread[thread.length - 1].body).toBe('сообщение 205');
    expect(thread[0].body).toBe('сообщение 6');
    // Порядок для отображения — от старых к новым
    expect(thread[0].createdAt.getTime()).toBeLessThan(thread[thread.length - 1].createdAt.getTime());

    await db.message.deleteMany({ where: { OR: [{ senderId: { in: [a.id, b.id] } }, { recipientId: { in: [a.id, b.id] } }] } });
    await db.notification.deleteMany({ where: { userId: { in: [a.id, b.id] } } });
    await db.user.deleteMany({ where: { id: { in: [a.id, b.id] } } });
  });
});
