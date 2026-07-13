import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { toggleStoryLike } from '@/lib/stories';
import { handleRoute, jsonError } from '@/lib/errors';

export function POST(_req: Request, { params }: { params: Promise<{ storyId: string }> }) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);
    const { storyId } = await params;
    return NextResponse.json(await toggleStoryLike(session.userId, storyId));
  });
}
