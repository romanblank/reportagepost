import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { toggleFollow } from '@/lib/engagement';

export async function POST(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { userId } = await params;
  try {
    return NextResponse.json(await toggleFollow(session.userId, userId));
  } catch (e) {
    const code = e instanceof Error ? e.message : 'error';
    return NextResponse.json({ error: code }, { status: code === 'self_follow' ? 400 : 404 });
  }
}
