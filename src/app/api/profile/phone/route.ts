import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { confirmPhoneVerification, startPhoneVerification } from '@/lib/phone-verify';
import { handleRoute, jsonError } from '@/lib/errors';
import { rateLimit } from '@/lib/rate-limit';

const StartSchema = z.object({ phone: z.string().trim() });
const ConfirmSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/) });

// POST — отправить код; PUT — подтвердить
export function POST(req: Request) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);
    const parsed = StartSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError('validation', 400);
    // Антифрод/защита от дорогих SMS: 3 отправки/час на пользователя
    await rateLimit(`sms:user:${session.userId}`, 3, 3600);
    await startPhoneVerification(session.userId, parsed.data.phone);
    return NextResponse.json({ sent: true });
  });
}

export function PUT(req: Request) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);
    const parsed = ConfirmSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError('validation', 400);
    await confirmPhoneVerification(session.userId, parsed.data.code);
    return NextResponse.json({ verified: true });
  });
}
