import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/admin';
import { handleRoute, jsonError, DomainError } from '@/lib/errors';
import { createInvite } from '@/lib/invites';

const schema = z.object({
  note: z.string().trim().max(200).optional(),
  maxUses: z.number().int().min(1).max(1000).optional(),
  expiresDays: z.number().int().min(1).max(365).optional(),
});

export function POST(req: Request) {
  return handleRoute(async () => {
    const session = await requireAdmin();
    if (!session) return jsonError('forbidden', 403);
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new DomainError('validation', 400);
    const expiresAt = parsed.data.expiresDays
      ? new Date(Date.now() + parsed.data.expiresDays * 86_400_000)
      : null;
    const invite = await createInvite({
      issuedByUserId: session.userId,
      note: parsed.data.note,
      maxUses: parsed.data.maxUses,
      expiresAt,
    });
    return NextResponse.json({ code: invite.code }, { status: 201 });
  });
}
