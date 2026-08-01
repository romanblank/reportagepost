import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { MessageError, dialogsFor, sendMessage } from '@/lib/messages';
import { handleRoute, jsonError } from '@/lib/errors';
import { rateLimit } from '@/lib/rate-limit';
import { publishToUser } from '@/lib/realtime';
import { notifyInApp } from '@/lib/notifications';
import { notifyTelegram } from '@/lib/telegram';
import { APP_DOMAIN } from '@/lib/constants';

export function GET() {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);
    return NextResponse.json({ dialogs: await dialogsFor(session.userId) });
  });
}

const SendSchema = z.object({
  recipientId: z.string(),
  body: z.string().trim().min(1).max(4000),
});

export function POST(req: Request) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);

    const parsed = SendSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError('validation', 400);

    // Антиспам: 20 сообщений/мин на пользователя (аудит P1 #3)
    await rateLimit(`msg:user:${session.userId}`, 20, 60);

    try {
      const message = await sendMessage(session.userId, parsed.data.recipientId, parsed.data.body);
      // Живая доставка получателю (SSE): событие → браузер обновит тред/счётчик
      publishToUser(parsed.data.recipientId, { type: 'message', from: session.userId });
      // Собеседник в payload — уведомление открывает нужный тред, а не список
      void notifyInApp(parsed.data.recipientId, 'notification.message.new', { peerId: session.userId });
      // Telegram-уведомление (если привязан). Не блокируем ответ — fire-and-forget.
      void notifyTelegram(
        parsed.data.recipientId,
        `Новое сообщение на Репортаж Пост. Открыть: https://${APP_DOMAIN}/ru/messages`,
      );
      return NextResponse.json({ messageId: message.id }, { status: 201 });
    } catch (e) {
      if (e instanceof MessageError) return jsonError(e.code, 400);
      throw e;
    }
  });
}
