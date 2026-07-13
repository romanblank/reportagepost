import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { MessageError, dialogsFor, sendMessage } from '@/lib/messages';
import { handleRoute, jsonError } from '@/lib/errors';
import { rateLimit } from '@/lib/rate-limit';

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
      return NextResponse.json({ messageId: message.id }, { status: 201 });
    } catch (e) {
      if (e instanceof MessageError) return jsonError(e.code, 400);
      throw e;
    }
  });
}
