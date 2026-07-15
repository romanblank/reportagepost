import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/admin';
import { approveProfile, moderationQueue, rejectProfile } from '@/lib/moderation';
import { db } from '@/lib/db';

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  return NextResponse.json({ queue: await moderationQueue() });
}

const DecisionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve'), profileId: z.string() }),
  z.object({
    action: z.literal('reject'),
    profileId: z.string(),
    reason: z.string().trim().min(5).max(1000), // причина обязательна
  }),
]);

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = DecisionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const profile = await db.photographerProfile.findUnique({
    where: { id: parsed.data.profileId },
  });
  if (!profile) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (profile.status !== 'PENDING') {
    return NextResponse.json({ error: 'already_moderated', status: profile.status }, { status: 409 });
  }

  if (parsed.data.action === 'approve') {
    const { published } = await approveProfile(parsed.data.profileId, admin.userId);
    return NextResponse.json({ ok: true, action: 'approve', published });
  }
  await rejectProfile(parsed.data.profileId, parsed.data.reason, admin.userId);
  return NextResponse.json({ ok: true, action: 'reject' });
}
