import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { editPost } from '@/lib/forum';
import { handleRoute, jsonError } from '@/lib/errors';

/** Правка своего сообщения в коротком окне после отправки. */
export function POST(req: Request) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);

    const body = await req.json().catch(() => null);
    const postId = typeof body?.postId === 'string' ? body.postId : '';
    const text = typeof body?.body === 'string' ? body.body : '';
    if (!postId || !text) return jsonError('validation', 400);

    return NextResponse.json(await editPost(session.userId, postId, text));
  });
}
