import { NextResponse } from 'next/server';
import { z } from 'zod';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import {
  SESSION_COOKIE,
  PENDING_2FA_COOKIE,
  createSessionToken,
  sessionCookieOptions,
  verifyPending2faToken,
} from '@/lib/auth';
import { verifySecondFactor } from '@/lib/two-factor';
import { handleRoute, jsonError } from '@/lib/errors';
import { rateLimit } from '@/lib/rate-limit';

const Schema = z.object({ code: z.string().trim().min(6).max(20) });

// Второй фактор при входе: обмениваем промежуточный стейт на полную сессию.
export function POST(req: Request) {
  return handleRoute(async () => {
    const jar = await cookies();
    const pending = jar.get(PENDING_2FA_COOKIE)?.value;
    const userId = pending ? await verifyPending2faToken(pending) : null;
    if (!userId) return jsonError('session_expired', 401);

    const parsed = Schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError('validation', 400);

    await rateLimit(`2fa-verify:${userId}`, 8, 300);

    if (!(await verifySecondFactor(userId, parsed.data.code))) {
      return jsonError('bad_code', 401);
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { role: true, tokenVersion: true, status: true },
    });
    if (!user) return jsonError('no_user', 404);
    if (user.status === 'BANNED') return jsonError('banned', 403);

    await db.user.update({ where: { id: userId }, data: { lastSeenAt: new Date() } });
    const token = await createSessionToken({ userId, role: user.role, tokenVersion: user.tokenVersion });
    const res = NextResponse.json({ ok: true, role: user.role });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    res.cookies.set(PENDING_2FA_COOKIE, '', { path: '/', maxAge: 0 });
    return res;
  });
}
