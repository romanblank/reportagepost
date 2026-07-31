import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { requestEmailVerification, confirmEmail } from '@/lib/email-verification';
import { handleRoute, jsonError } from '@/lib/errors';
import { rateLimit } from '@/lib/rate-limit';

// POST без токена — запросить письмо (нужна сессия).
// POST с токеном — подтвердить адрес (сессия не нужна: переход по ссылке
// из письма может открыться в другом браузере).
const Schema = z.object({ token: z.string().trim().min(10).max(200).optional() });

export function POST(req: Request) {
  return handleRoute(async () => {
    const parsed = Schema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return jsonError('validation', 400);

    if (parsed.data.token) {
      await confirmEmail(parsed.data.token);
      return NextResponse.json({ ok: true });
    }

    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);
    // Антиспам письмами: 5 запросов в час на аккаунт
    await rateLimit(`email-verify:user:${session.userId}`, 5, 3600);
    await requestEmailVerification(session.userId);
    return NextResponse.json({ ok: true });
  });
}
