import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { changePassword, changeEmail, changeName } from '@/lib/account-security';
import { handleRoute, jsonError } from '@/lib/errors';
import { rateLimit } from '@/lib/rate-limit';

// Настройки аккаунта: смена пароля / email / имени (одна ручка по action).
const Schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('password'), current: z.string().max(200), next: z.string().min(10).max(200) }),
  z.object({ action: z.literal('email'), email: z.string().trim().toLowerCase().email(), password: z.string().max(200) }),
  z.object({ action: z.literal('name'), firstName: z.string().trim().min(2).max(60), lastName: z.string().trim().min(2).max(60) }),
]);

export function PATCH(req: Request) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);

    const parsed = Schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError('validation', 400);
    const d = parsed.data;

    await rateLimit(`account:${session.userId}`, 20, 3600);

    if (d.action === 'password') await changePassword(session.userId, d.current, d.next);
    else if (d.action === 'email') await changeEmail(session.userId, d.email, d.password);
    else await changeName(session.userId, d.firstName, d.lastName);

    return NextResponse.json({ ok: true });
  });
}
