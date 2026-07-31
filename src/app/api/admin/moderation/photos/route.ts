import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/admin';
import { approvePhoto, photoModerationQueue, rejectPhoto } from '@/lib/moderation';

// Пофотовая модерация (аудит 2026-07-31, P0): кадры, добавленные ПОСЛЕ одобрения
// профиля, оставались PENDING навсегда — инструмента, который бы их показывал,
// не существовало вовсе.

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  return NextResponse.json({ queue: await photoModerationQueue() });
}

const DecisionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve'), photoId: z.string() }),
  z.object({
    action: z.literal('reject'),
    photoId: z.string(),
    reason: z.string().trim().min(5).max(1000), // причина обязательна — доходит до автора
  }),
]);

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const parsed = DecisionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  if (parsed.data.action === 'approve') {
    await approvePhoto(parsed.data.photoId, admin.userId);
    return NextResponse.json({ ok: true, action: 'approve' });
  }
  await rejectPhoto(parsed.data.photoId, parsed.data.reason, admin.userId);
  return NextResponse.json({ ok: true, action: 'reject' });
}
