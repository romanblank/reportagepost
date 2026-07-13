import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { togglePhotoLike } from '@/lib/engagement';

export async function POST(_req: Request, { params }: { params: Promise<{ photoId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { photoId } = await params;
  try {
    return NextResponse.json(await togglePhotoLike(session.userId, photoId));
  } catch {
    return NextResponse.json({ error: 'photo_not_found' }, { status: 404 });
  }
}
