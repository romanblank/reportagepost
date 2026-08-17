import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { verifyShootInvite } from '@/lib/shoot-invite';
import { confirmShootByInvite } from '@/lib/shoots';
import { clientIp } from '@/lib/rate-limit';
import { createHash } from 'node:crypto';
import { handleRoute, jsonError } from '@/lib/errors';

const schema = z.object({
  token: z.string().min(10).max(2000),
  // Дата съёмки — по желанию: «в прошлом сентябре» человек помнит не всегда
  eventDate: z.coerce.date().max(new Date()).optional(),
});

export function POST(req: Request) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError('validation', 400);

    const invite = await verifyShootInvite(parsed.data.token);
    if (!invite) return jsonError('invite_invalid', 400);

    // Хеш, не сырой адрес: сам по себе IP — персональные данные, а для
    // поимки кластера хватает совпадения
    const ip = clientIp(req);
    const ipHash = ip ? createHash('sha256').update(`shoot:${ip}`).digest('hex') : null;
    const { needsReview } = await confirmShootByInvite(
      session.userId,
      invite.profileId,
      parsed.data.eventDate ?? null,
      ipHash,
    );
    return NextResponse.json({ ok: true, needsReview });
  });
}
