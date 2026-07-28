import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/admin';
import { approveStory, rejectStory } from '@/lib/stories';
import { db } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { handleRoute, jsonError } from '@/lib/errors';

// Модерация серий редакцией. Approve → публикация + событие; reject → причина.
const Schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve'), storyId: z.string().min(1) }),
  z.object({ action: z.literal('reject'), storyId: z.string().min(1), reason: z.string().trim().min(5).max(1000) }),
]);

export function POST(req: Request) {
  return handleRoute(async () => {
    const admin = await requireAdmin();
    if (!admin) return jsonError('forbidden', 403);

    const parsed = Schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError('validation', 400);

    if (parsed.data.action === 'approve') {
      await approveStory(parsed.data.storyId);
    } else {
      await rejectStory(parsed.data.storyId, parsed.data.reason);
    }
    // Аудит-след редакционного решения по серии (аудит 2026-07-28).
    await logAudit(db, admin.userId, parsed.data.action === 'approve' ? 'story.approve' : 'story.reject', 'STORY', parsed.data.storyId, {});
    return NextResponse.json({ ok: true });
  });
}
