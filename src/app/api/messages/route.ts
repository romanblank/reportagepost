import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { MessageError, dialogsFor, sendMessage } from '@/lib/messages';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  return NextResponse.json({ dialogs: await dialogsFor(session.userId) });
}

const SendSchema = z.object({
  recipientId: z.string(),
  body: z.string().trim().min(1).max(4000),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = SendSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'validation' }, { status: 400 });

  try {
    const message = await sendMessage(session.userId, parsed.data.recipientId, parsed.data.body);
    return NextResponse.json({ messageId: message.id }, { status: 201 });
  } catch (e) {
    if (e instanceof MessageError) return NextResponse.json({ error: e.code }, { status: 400 });
    throw e;
  }
}
