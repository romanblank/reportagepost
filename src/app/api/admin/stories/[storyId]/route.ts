import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/admin';
import { approveStory, rejectStory } from '@/lib/stories';
import { handleRoute, jsonError } from '@/lib/errors';

const DecisionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve') }),
  z.object({ action: z.literal('reject'), reason: z.string().trim().min(5).max(1000) }),
]);

export function POST(req: Request, { params }: { params: Promise<{ storyId: string }> }) {
  return handleRoute(async () => {
    if (!(await requireAdmin())) return jsonError('forbidden', 403);
    const { storyId } = await params;
    const parsed = DecisionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError('validation', 400);

    if (parsed.data.action === 'approve') await approveStory(storyId);
    else await rejectStory(storyId, parsed.data.reason);
    return NextResponse.json({ ok: true });
  });
}
