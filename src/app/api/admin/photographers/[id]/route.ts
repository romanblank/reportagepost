import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/admin';
import { setProfilePublication } from '@/lib/admin-onboard';
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

    const { status } = await setProfilePublication(admin.userId, id, parsed.data.action === 'publish');
    return NextResponse.json({ ok: true, status });
  });
}
