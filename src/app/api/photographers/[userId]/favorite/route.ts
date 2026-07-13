import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { toggleFavorite } from '@/lib/favorites';
import { handleRoute, jsonError } from '@/lib/errors';

// Избранное по userId фотографа (в UI известен userId профиля)
export function POST(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);
    const { userId } = await params;
    const profile = await db.photographerProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) return jsonError('profile_not_found', 404);
    return NextResponse.json(await toggleFavorite(session.userId, profile.id));
  });
}
