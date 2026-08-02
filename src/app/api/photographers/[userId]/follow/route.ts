import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { toggleFollow } from '@/lib/engagement';
import { handleRoute, jsonError } from '@/lib/errors';

export function POST(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);

  // Цикл подписка-отписка иначе даёт жертве неограниченный поток уведомлений
  // и рост таблиц (аудит 2026-08-03); у лайков такой лимит уже был
  await rateLimit(`follow:user:${session.userId}`, 200, 86400);
    const { userId } = await params;
    return NextResponse.json(await toggleFollow(session.userId, userId));
  });
}
