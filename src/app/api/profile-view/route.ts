import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { recordProfileView, viewedRecently } from '@/lib/analytics';
import { handleRoute, jsonError } from '@/lib/errors';

// Beacon просмотра профиля (POST { profileId }). Клиентский вызов → боты без JS
// не пишут. Владелец не считается; авторизованные — дедуп 6ч (антиспам refresh).
export function POST(req: Request) {
  return handleRoute(async () => {
    const body = await req.json().catch(() => ({}));
    const profileId = typeof body?.profileId === 'string' ? body.profileId : null;
    if (!profileId) return jsonError('bad_request', 400);

    const profile = await db.photographerProfile.findUnique({
      where: { id: profileId },
      select: { userId: true, status: true },
    });
    if (!profile || profile.status !== 'APPROVED') return NextResponse.json({ ok: true });

    const session = await getSession();
    const actorUserId = session?.userId ?? null;
    if (actorUserId && actorUserId === profile.userId) return NextResponse.json({ ok: true });
    if (actorUserId && (await viewedRecently(profileId, actorUserId))) return NextResponse.json({ ok: true });

    await recordProfileView(profileId, actorUserId);
    return NextResponse.json({ ok: true });
  });
}
