import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { handleRoute, jsonError, DomainError } from '@/lib/errors';
import { startTelegramLink, telegramConfigured } from '@/lib/telegram';
import { db } from '@/lib/db';

// Привязка Telegram: POST — получить deep-link (одноразовый код), DELETE — отвязать.
export function POST() {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);
    if (!telegramConfigured()) throw new DomainError('telegram_unavailable', 503);
    const link = await startTelegramLink(session.userId);
    if (!link) throw new DomainError('telegram_unavailable', 503);
    return NextResponse.json(link);
  });
}

export function DELETE() {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);
    await db.user.update({ where: { id: session.userId }, data: { tgUserId: null, tgLinkCode: null } });
    return NextResponse.json({ ok: true });
  });
}
