import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession, verifyPassword, SESSION_COOKIE } from '@/lib/auth';
import { db } from '@/lib/db';
import { deleteAccount } from '@/lib/account';

const schema = z.object({ password: z.string().min(1) });

// Удаление своего аккаунта (ПнД). Подтверждение паролем — действие необратимо.
export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'validation' }, { status: 400 });

  const user = await db.user.findUnique({ where: { id: session.userId }, select: { passwordHash: true } });
  if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, parsed.data.password))) {
    return NextResponse.json({ error: 'wrong_password' }, { status: 403 });
  }

  await deleteAccount(session.userId);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, '', { path: '/', maxAge: 0 }); // сессия мертва
  return res;
}
