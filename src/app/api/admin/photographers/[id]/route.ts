import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { logAudit } from '@/lib/audit';
import { handleRoute, jsonError } from '@/lib/errors';

const Schema = z.object({ action: z.enum(['publish', 'unpublish']) });

// Публикация/снятие анкеты с публикации (админ). Публикация — в каталог (APPROVED),
// снятие — в черновик (DRAFT). Фото не трогаем.
export function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const admin = await requireAdmin();
    if (!admin) return jsonError('forbidden', 403);
    const { id } = await ctx.params;
    const parsed = Schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonError('validation', 400);

    const profile = await db.photographerProfile.findUnique({ where: { id }, select: { id: true, userId: true } });
    if (!profile) return jsonError('not_found', 404);

    const publish = parsed.data.action === 'publish';
    const status = publish ? 'APPROVED' : 'DRAFT';

    await db.$transaction(async (tx) => {
      await tx.photographerProfile.update({ where: { id }, data: { status } });
      if (publish) {
        // фото профиля публикуем вместе с анкетой
        await tx.photo.updateMany({ where: { profileId: id, status: 'PENDING' }, data: { status: 'APPROVED', publishedAt: new Date() } });
        await tx.user.update({ where: { id: profile.userId }, data: { status: 'ACTIVE' } });
      }
      await logAudit(tx, admin.userId, publish ? 'profile.publish' : 'profile.unpublish', 'PROFILE', id, {});
    });

    if (publish) {
      const { recomputeOne } = await import('@/lib/rating');
      await recomputeOne(id);
    }
    return NextResponse.json({ ok: true, status });
  });
}
