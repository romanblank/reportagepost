import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { createShootInvite } from '@/lib/shoot-invite';
import { rateLimit } from '@/lib/rate-limit';
import { handleRoute, jsonError } from '@/lib/errors';
import { APP_DOMAIN } from '@/lib/constants';

// Ссылка-приглашение прошлому заказчику: подтвердить съёмку, состоявшуюся
// ДО платформы. Только одобренный автор и только для своей страницы.
export function POST() {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);

    const profile = await db.photographerProfile.findUnique({
      where: { userId: session.userId },
      select: { id: true, status: true },
    });
    if (!profile || profile.status !== 'APPROVED') return jsonError('forbidden', 403);

    await rateLimit(`shoot-invite-create:user:${session.userId}`, 20, 86_400);

    const token = await createShootInvite(profile.id);
    return NextResponse.json({ url: `https://${APP_DOMAIN}/ru/confirm/${token}` });
  });
}
