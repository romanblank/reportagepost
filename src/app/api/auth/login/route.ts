import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
  verifyPassword,
} from '@/lib/auth';

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation' }, { status: 400 });
  }

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  // Единый ответ для «нет пользователя» и «неверный пароль» — не раскрываем существование email
  if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, parsed.data.password))) {
    return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });
  }
  if (user.status === 'BANNED') {
    return NextResponse.json({ error: 'banned' }, { status: 403 });
  }

  await db.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });

  const token = await createSessionToken({ userId: user.id, role: user.role });
  const res = NextResponse.json({ userId: user.id, role: user.role, status: user.status });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}
