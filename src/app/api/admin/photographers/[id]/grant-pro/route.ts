import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { grantFoundingSub, tierOf } from '@/lib/subscription';
import { logAudit } from '@/lib/audit';
import { handleRoute, jsonError } from '@/lib/errors';

// Выдать фотографу founding-подписку (grace 90 дней + founding-цена закреплена).
// Уровень — из ?tier=PRIME|ELITE (по умолчанию PRIME). Закрытая бета: ручная
// активация оператором вместо checkout (реальная оплата ждёт 54-ФЗ). Позволяет
// апгрейд/даунгрейд между уровнями.
export function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const admin = await requireAdmin();
    if (!admin) return jsonError('forbidden', 403);
    const { id } = await ctx.params;
    const tier = new URL(req.url).searchParams.get('tier') === 'ELITE' ? 'ELITE' : 'PRIME';

    const profile = await db.photographerProfile.findUnique({
      where: { id },
      select: { userId: true, city: { select: { slug: true } } },
    });
    if (!profile) return jsonError('not_found', 404);

    if ((await tierOf(profile.userId)) === tier) return NextResponse.json({ ok: true, tier, alreadyAt: true });

    await grantFoundingSub(profile.userId, profile.city.slug, tier);
    await logAudit(db, admin.userId, 'subscription.grant_founding', 'USER', profile.userId, { profileId: id, tier });

    return NextResponse.json({ ok: true, tier });
  });
}
