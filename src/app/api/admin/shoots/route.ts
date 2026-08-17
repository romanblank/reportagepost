import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { logAudit } from '@/lib/audit';
import { handleRoute, jsonError } from '@/lib/errors';

const schema = z.object({
  shootId: z.string().min(1),
  action: z.enum(['approve', 'reject']),
});

/**
 * Решение по подтверждению съёмки, застрявшему в needsReview.
 *
 * До этого спорные подтверждения существовали только как телеграм-алерт:
 * посмотреть их списком и решить было НЕГДЕ (аудит 2026-08-17) — то есть
 * «уйдёт к человеку» из trust-модели вело в никуда. approve снимает
 * needsReview (факт становится публичным), reject удаляет запись: съёмка,
 * которую не удалось подтвердить, не должна лежать в базе соблазном
 * «пересмотреть позже».
 */
export function POST(req: Request) {
  return handleRoute(async () => {
    const admin = await requireAdmin();
    if (!admin) return jsonError('forbidden', 403);

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError('validation', 400);
    const { shootId, action } = parsed.data;

    const shoot = await db.shootConfirmation.findUnique({
      where: { id: shootId },
      select: { id: true, needsReview: true },
    });
    if (!shoot || !shoot.needsReview) return jsonError('not_found', 404);

    if (action === 'approve') {
      await db.shootConfirmation.update({ where: { id: shootId }, data: { needsReview: false } });
    } else {
      await db.shootConfirmation.delete({ where: { id: shootId } });
    }
    await logAudit(db, admin.userId, `shoot.review.${action}`, 'SHOOT', shootId, {});

    return NextResponse.json({ ok: true });
  });
}
