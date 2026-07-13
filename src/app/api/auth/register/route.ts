import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { consumeInviteCode } from '@/lib/invites';
import {
  SESSION_COOKIE,
  createSessionToken,
  hashPassword,
  sessionCookieOptions,
} from '@/lib/auth';
import { PUBLIC_LAUNCH } from '@/lib/constants';

// Валидация на границе (правило: данным извне не верить)
const RegisterSchema = z.object({
  role: z.enum(['PHOTOGRAPHER', 'CLIENT']),
  firstName: z.string().trim().min(2).max(60),
  lastName: z.string().trim().min(2).max(60),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(10).max(200),
  inviteCode: z.string().trim().optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'validation', details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const data = parsed.data;

  // Инвайт-гейт: до публичного запуска регистрация только по коду
  let inviteCodeId: string | null = null;
  if (!PUBLIC_LAUNCH) {
    if (!data.inviteCode) {
      return NextResponse.json({ error: 'invite_required' }, { status: 403 });
    }
    inviteCodeId = await consumeInviteCode(data.inviteCode);
    if (!inviteCodeId) {
      return NextResponse.json({ error: 'invite_invalid' }, { status: 403 });
    }
  }

  const existing = await db.user.findUnique({ where: { email: data.email } });
  if (existing) {
    return NextResponse.json({ error: 'email_taken' }, { status: 409 });
  }

  const user = await db.user.create({
    data: {
      role: data.role,
      // Заказчику модерация не нужна — активен сразу; фотограф ждёт портфолио
      status: data.role === 'CLIENT' ? 'ACTIVE' : 'PENDING',
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      passwordHash: await hashPassword(data.password),
      inviteCodeId,
    },
  });

  const token = await createSessionToken({ userId: user.id, role: user.role, tokenVersion: user.tokenVersion });
  const res = NextResponse.json(
    { userId: user.id, role: user.role, status: user.status },
    { status: 201 },
  );
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}
