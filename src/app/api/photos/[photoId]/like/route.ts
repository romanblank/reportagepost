import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { togglePhotoLike } from '@/lib/engagement';
import { handleRoute, jsonError } from '@/lib/errors';

export function POST(_req: Request, { params }: { params: Promise<{ photoId: string }> }) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);
    const { photoId } = await params;
    return NextResponse.json(await togglePhotoLike(session.userId, photoId));
  });
}
