import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createArticle } from '@/lib/articles';
import { handleRoute, jsonError } from '@/lib/errors';

export function POST(req: Request) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);

    const b = await req.json().catch(() => null);
    const title = typeof b?.title === 'string' ? b.title : '';
    const lead = typeof b?.lead === 'string' ? b.lead : '';
    const body = typeof b?.body === 'string' ? b.body : '';
    const coverPhotoId = typeof b?.coverPhotoId === 'string' ? b.coverPhotoId : null;
    if (!title || !lead || !body) return jsonError('validation', 400);

    return NextResponse.json(await createArticle(session.userId, { title, lead, body, coverPhotoId }));
  });
}
