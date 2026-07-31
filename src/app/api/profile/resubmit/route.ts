import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { resubmitProfile } from '@/lib/profile-lifecycle';
import { handleRoute, jsonError } from '@/lib/errors';
import { rateLimit } from '@/lib/rate-limit';

// Повторная подача анкеты на проверку после отклонения (аудит 2026-07-31, P0).
export function POST() {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);
    if (session.role !== 'PHOTOGRAPHER') return jsonError('photographers_only', 403);
    // Не даём закидывать очередь: правки требуют времени
    await rateLimit(`resubmit:user:${session.userId}`, 5, 86400);
    return NextResponse.json(await resubmitProfile(session.userId));
  });
}
