import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createPost } from '@/lib/forum';
import { handleRoute, jsonError } from '@/lib/errors';

export function POST(req: Request) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);

    const body = await req.json().catch(() => null);
    const threadId = typeof body?.threadId === 'string' ? body.threadId : '';
    const text = typeof body?.body === 'string' ? body.body : '';
    if (!threadId || !text) return jsonError('validation', 400);

    const outcome = await createPost(session.userId, threadId, text);
    return NextResponse.json(outcome, { status: outcome.status === 'PUBLISHED' ? 201 : 200 });
  });
}
