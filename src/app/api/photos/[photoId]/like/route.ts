import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { togglePhotoLike } from '@/lib/engagement';
import { handleRoute, jsonError } from '@/lib/errors';
import { rateLimit } from '@/lib/rate-limit';

export function POST(_req: Request, { params }: { params: Promise<{ photoId: string }> }) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);
    // Лимит накрутки (аудит 2026-07-31): лайки двигают merit-порядок каталога.
    // 200/сутки — выше любого живого сценария просмотра, но обрубает скрипт.
    await rateLimit(`like:user:${session.userId}`, 200, 86400);
    const { photoId } = await params;
    return NextResponse.json(await togglePhotoLike(session.userId, photoId));
  });
}
