import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/admin';
import { approveStory, rejectStory } from '@/lib/stories';

// Модерация серий редакцией. Approve → публикация + событие; reject → причина.
const Schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve'), storyId: z.string().min(1) }),
  z.object({ action: z.literal('reject'), storyId: z.string().min(1), reason: z.string().trim().min(5).max(1000) }),
]);

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'validation' }, { status: 400 });

  if (parsed.data.action === 'approve') {
    await approveStory(parsed.data.storyId);
  } else {
    await rejectStory(parsed.data.storyId, parsed.data.reason);
  }
  return NextResponse.json({ ok: true });
}
