import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { subscribeToThread, unsubscribeFromThread } from '@/lib/forum';
import { handleRoute, jsonError } from '@/lib/errors';

/** Подписка на тему и отписка — один эндпоинт, чтобы кнопка была одна. */
export function POST(req: Request) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);

    const body = await req.json().catch(() => null);
    const threadId = typeof body?.threadId === 'string' ? body.threadId : '';
    const subscribe = body?.subscribe === true;
    if (!threadId) return jsonError('validation', 400);

    if (subscribe) await subscribeToThread(session.userId, threadId);
    else await unsubscribeFromThread(session.userId, threadId);

    return NextResponse.json({ subscribed: subscribe });
  });
}
