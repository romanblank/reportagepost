import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { threadWith } from '@/lib/messages';

export async function GET(_req: Request, { params }: { params: Promise<{ peerId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const { peerId } = await params;
  return NextResponse.json({ messages: await threadWith(session.userId, peerId) });
}
