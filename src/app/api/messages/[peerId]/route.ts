import { NextResponse } from 'next/server';
import { handleRoute } from '@/lib/errors';
import { getSession } from '@/lib/auth';
import { threadWith } from '@/lib/messages';

export function GET(_req: Request, { params }: { params: Promise<{ peerId: string }> }) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    const { peerId } = await params;
    return NextResponse.json({ messages: await threadWith(session.userId, peerId) });
  });
}
