import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { handleRoute, jsonError } from '@/lib/errors';
import { setUserBlocked } from '@/lib/admin-users';

/**
 * Действия администратора над человеком.
 *
 * Блокировка отзывает живые сессии и требует причины: она попадает в аудит-лог
 * и объясняет решение тому, кто будет разбираться позже — включая самого
 * администратора через полгода.
 */
export function POST(req: Request) {
  return handleRoute(async () => {
    const admin = await requireAdmin();
    if (!admin) return jsonError('forbidden', 403);

    const body = await req.json().catch(() => null);
    const userId = typeof body?.userId === 'string' ? body.userId : null;
    const action = body?.action === 'block' || body?.action === 'unblock' ? body.action : null;
    if (!userId || !action) return jsonError('validation', 400);

    const reason = typeof body?.reason === 'string' ? body.reason : '';
    await setUserBlocked(admin.userId, userId, action === 'block', reason);
    return NextResponse.json({ ok: true });
  });
}
