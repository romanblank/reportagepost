import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
  verifyPassword,
} from '@/lib/auth';
import { handleRoute, jsonError } from '@/lib/errors';
import { clientIp, rateLimit } from '@/lib/rate-limit';

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

export function POST(req: Request) {
  return handleRoute(async () => {
    const body = await req.json().catch(() => null);
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success) return jsonError('validation', 400);

    // Брутфорс/argon2-DoS: 5/мин на IP + 5/мин на email
    await rateLimit(`login:ip:${clientIp(req)}`, 5, 60);
    await rateLimit(`login:email:${parsed.data.email}`, 5, 60);

    const user = await db.user.findUnique({ where: { email: parsed.data.email } });
    if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, parsed.data.password))) {
      return jsonError('invalid_credentials', 401);
    }
    if (user.status === 'BANNED') return jsonError('banned', 403);

    await db.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });

    const token = await createSessionToken({ userId: user.id, role: user.role, tokenVersion: user.tokenVersion });
    const res = NextResponse.json({ userId: user.id, role: user.role, status: user.status });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return res;
  });
}
