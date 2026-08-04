import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createThread } from '@/lib/forum';
import { handleRoute, jsonError } from '@/lib/errors';

export function POST(req: Request) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);

    const body = await req.json().catch(() => null);
    const sectionSlug = typeof body?.sectionSlug === 'string' ? body.sectionSlug : '';
    const title = typeof body?.title === 'string' ? body.title : '';
    const text = typeof body?.body === 'string' ? body.body : '';
    if (!sectionSlug || !title || !text) return jsonError('validation', 400);

    const outcome = await createThread(session.userId, { sectionSlug, title, body: text });
    return NextResponse.json(outcome, { status: outcome.status === 'PUBLISHED' ? 201 : 200 });
  });
}
