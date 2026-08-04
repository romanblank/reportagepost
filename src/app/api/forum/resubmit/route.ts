import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { resubmitPost, resubmitThread } from '@/lib/forum';
import { handleRoute, jsonError } from '@/lib/errors';

/** Повторная проверка после правки — единственный путь к человеку. */
export function POST(req: Request) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);

    const body = await req.json().catch(() => null);
    const postId = typeof body?.postId === 'string' ? body.postId : '';
    const threadId = typeof body?.threadId === 'string' ? body.threadId : '';
    const title = typeof body?.title === 'string' ? body.title : '';
    const text = typeof body?.body === 'string' ? body.body : '';
    if (!text) return jsonError('validation', 400);

    if (threadId) {
      return NextResponse.json(await resubmitThread(session.userId, threadId, { title, body: text }));
    }
    if (!postId) return jsonError('validation', 400);
    return NextResponse.json(await resubmitPost(session.userId, postId, text));
  });
}
