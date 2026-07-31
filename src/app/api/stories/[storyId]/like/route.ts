import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { toggleStoryLike } from '@/lib/stories';
import { handleRoute, jsonError } from '@/lib/errors';
import { rateLimit } from '@/lib/rate-limit';

export function POST(_req: Request, { params }: { params: Promise<{ storyId: string }> }) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);
    // Общий с фото-лайками бюджет накрутки (аудит 2026-07-31)
    await rateLimit(`like:user:${session.userId}`, 200, 86400);
    const { storyId } = await params;
    return NextResponse.json(await toggleStoryLike(session.userId, storyId));
  });
}
