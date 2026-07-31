import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { blockUser, unblockUser } from '@/lib/reports';
import { handleRoute, jsonError } from '@/lib/errors';

// Блокировка собеседника (аудит 2026-07-31, P0): заблокированный не может
// писать в личку — проверка в sendMessage. POST — заблокировать, DELETE — снять.
export function POST(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);
    const { userId } = await params;
    return NextResponse.json(await blockUser(session.userId, userId));
  });
}

export function DELETE(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);
    const { userId } = await params;
    return NextResponse.json(await unblockUser(session.userId, userId));
  });
}
