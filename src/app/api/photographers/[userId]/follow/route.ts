import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { toggleFollow } from '@/lib/engagement';
import { handleRoute, jsonError } from '@/lib/errors';

export function POST(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);
    const { userId } = await params;
    return NextResponse.json(await toggleFollow(session.userId, userId));
  });
}
