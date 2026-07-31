import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { handleRoute, jsonError } from '@/lib/errors';

// Настройки внешних уведомлений (аудит 2026-07-31, P1: отключить поток писем
// было нечем — единственным выходом оставалось удалить аккаунт).
const Schema = z.object({
  notifyInquiriesEmail: z.boolean().optional(),
  notifyInquiriesTg: z.boolean().optional(),
});

export function PATCH(req: Request) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);

    const parsed = Schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError('validation', 400);

    // Токен отписки выдаём при первом сохранении — он нужен для ссылки в письме
    const current = await db.user.findUnique({
      where: { id: session.userId },
      select: { unsubToken: true },
    });

    await db.user.update({
      where: { id: session.userId },
      data: {
        ...(parsed.data.notifyInquiriesEmail !== undefined
          ? { notifyInquiriesEmail: parsed.data.notifyInquiriesEmail }
          : {}),
        ...(parsed.data.notifyInquiriesTg !== undefined
          ? { notifyInquiriesTg: parsed.data.notifyInquiriesTg }
          : {}),
        ...(current?.unsubToken ? {} : { unsubToken: randomBytes(24).toString('base64url') }),
      },
    });
    return NextResponse.json({ ok: true });
  });
}
