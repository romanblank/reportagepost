import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/admin';
import { db } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { handleRoute, jsonError, DomainError } from '@/lib/errors';

const schema = z.object({ profileId: z.string().min(1), verified: z.boolean() });

// Верификация фотографа (админ) — trust-бейдж. Ложится на ручной завод анкет.
export function POST(req: Request) {
  return handleRoute(async () => {
    const admin = await requireAdmin();
    if (!admin) return jsonError('forbidden', 403);
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new DomainError('validation', 400);
    await db.photographerProfile.update({
      where: { id: parsed.data.profileId },
      data: { verified: parsed.data.verified },
    });
    // Аудит-след: trust-бейдж — чувствительное действие (аудит 2026-07-28).
    await logAudit(db, admin.userId, parsed.data.verified ? 'profile.verify' : 'profile.unverify', 'PROFILE', parsed.data.profileId, {});
    return NextResponse.json({ ok: true });
  });
}
