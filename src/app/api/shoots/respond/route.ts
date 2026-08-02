import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth';
import { respondToShoot } from '@/lib/shoots';
import { handleRoute, jsonError } from '@/lib/errors';

// Ответ фотографа на отметку заказчика (S4 trust-хардеринг, 2026-08-02).
// До ответа отметка не даёт ни публичных фактов, ни verified-отзыва.
const Schema = z.object({ shootId: z.string().trim().min(1), accept: z.boolean() });

export function POST(req: Request) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);
    if (session.role !== 'PHOTOGRAPHER') return jsonError('photographers_only', 403);

    const parsed = Schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError('validation', 400);

    await respondToShoot(session.userId, parsed.data.shootId, parsed.data.accept);
    return NextResponse.json({ ok: true });
  });
}
