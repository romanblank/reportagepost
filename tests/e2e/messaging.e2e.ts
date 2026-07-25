// E2E-батарея №3: прямой контакт заказчик↔автор (core-ценность «без комиссии»).
// Отправка → диалоги с непрочитанными → тред (asc, отметка прочитанным). + авто-аудитор.
// Запуск: npm run e2e (нужен локальный PG). Всё создаётся и убирается за собой.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

beforeAll(() => {
  process.env.AUTH_SECRET ??= 'test-secret-32-chars-minimum-000000';
});

function auditText(label: string, value: string) {
  const bad = [/undefined/i, /\bnull\b/i, /\bNaN\b/, /\[object Object\]/];
  for (const re of bad) {
    expect(re.test(value), `${label}: подозрительная выдача «${value}»`).toBe(false);
  }
}

describe.skipIf(!hasDb)('E2E: прямой контакт заказчик↔автор (сообщения)', () => {
  const ids: string[] = [];

  afterAll(async () => {
    const { db } = await import('@/lib/db');
    await db.message.deleteMany({ where: { OR: [{ senderId: { in: ids } }, { recipientId: { in: ids } }] } });
    for (const uid of ids) await db.user.delete({ where: { id: uid } }).catch(() => {});
  });

  it('отправка → диалоги с непрочитанными → тред по порядку с отметкой прочитанным', async () => {
    const { db } = await import('@/lib/db');
    const { sendMessage, dialogsFor, threadWith, MessageError } = await import('@/lib/messages');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const client = await db.user.create({ data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'Дарья', lastName: 'Заказова', email: `e2e-msg-cl-${stamp}@test.local` } });
    const ph = await db.user.create({ data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Игорь', lastName: 'Кадров', email: `e2e-msg-ph-${stamp}@test.local` } });
    ids.push(client.id, ph.id);

    // нельзя писать себе
    await expect(sendMessage(client.id, client.id, 'сам себе')).rejects.toBeInstanceOf(MessageError);

    // заказчик пишет автору, автор отвечает
    await sendMessage(client.id, ph.id, 'Здравствуйте! Нужен фотограф на конференцию 20-го.');
    await sendMessage(ph.id, client.id, 'Добрый день, свободен. Пришлю программу.');
    await sendMessage(client.id, ph.id, 'Отлично, жду.');

    // у автора — диалог с заказчиком, 2 непрочитанных, последнее сообщение читаемо
    const dialogs = await dialogsFor(ph.id);
    const d = dialogs.find((x) => x.peer.id === client.id);
    expect(d).toBeTruthy();
    expect(d!.unread).toBe(2);
    auditText('последнее сообщение', d!.last.body);
    auditText('собеседник', `${d!.peer.firstName} ${d!.peer.lastName}`);

    // открытие треда — порядок asc + пометка входящих прочитанными
    const thread = await threadWith(ph.id, client.id);
    expect(thread).toHaveLength(3);
    expect(thread[0].body).toContain('конференцию');
    expect(thread[2].body).toContain('жду');
    for (const m of thread) auditText('сообщение треда', m.body);

    const after = await dialogsFor(ph.id);
    expect(after.find((x) => x.peer.id === client.id)!.unread).toBe(0);
  });
});
