import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { beginEnroll, confirmEnroll, disable } from '@/lib/two-factor';
import { handleRoute, jsonError } from '@/lib/errors';
import { rateLimit } from '@/lib/rate-limit';

// Управление 2FA из кабинета (аутентифицированный пользователь).
// POST без body — начать подключение (вернёт секрет+URI).
// POST {action:'confirm', code} — подтвердить и получить резервные коды.
// POST {action:'disable', code} — отключить.
const Schema = z.object({ action: z.enum(['begin', 'confirm', 'disable']).default('begin'), code: z.string().trim().optional() });

export function POST(req: Request) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);

    const parsed = Schema.safeParse((await req.json().catch(() => null)) ?? {});
    if (!parsed.success) return jsonError('validation', 400);
    const { action, code } = parsed.data;

    if (action === 'begin') {
      return NextResponse.json(await beginEnroll(session.userId));
    }
    if (!code) return jsonError('code_required', 400);
    // Анти-брутфорс TOTP-кода при confirm/disable (как в 2fa/verify): при угоне
    // сессии нельзя перебирать 6 цифр без лимита, чтобы снять/переустановить 2FA.
    await rateLimit(`2fa-manage:${session.userId}`, 8, 300);
    if (action === 'confirm') {
      return NextResponse.json({ recoveryCodes: await confirmEnroll(session.userId, code) });
    }
    await disable(session.userId, code);
    return NextResponse.json({ ok: true });
  });
}
