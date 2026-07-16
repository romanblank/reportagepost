import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { logAudit } from '@/lib/audit';
import { handleRoute, jsonError, DomainError } from '@/lib/errors';
import { ProfileEditSchema, applyProfileEdit } from '@/lib/profile-edit';

// Правка анкеты заведённого фотографа админом (оператор курирует реальных людей).
// Та же логика применения, что и в self-роуте, но по profileId из URL + аудит.
export function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const admin = await requireAdmin();
    if (!admin) return jsonError('forbidden', 403);
    const { id } = await ctx.params;

    const parsed = ProfileEditSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'validation', details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const profile = await db.photographerProfile.findUnique({ where: { id }, select: { id: true, username: true } });
    if (!profile) return jsonError('not_found', 404);

    try {
      const { username } = await applyProfileEdit(profile.id, profile.username, parsed.data);
      await logAudit(db, admin.userId, 'profile.edit_by_admin', 'PROFILE', profile.id, {});
      return NextResponse.json({ ok: true, username });
    } catch (e) {
      if (e instanceof DomainError) return jsonError(e.code, e.status);
      throw e;
    }
  });
}
