import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/admin';
import { grantFoundingPro, isPro } from '@/lib/subscription';
import { logAudit } from '@/lib/audit';
import { handleRoute, jsonError } from '@/lib/errors';

// Выдать фотографу бесплатный бета-PRO основателя (grace 90 дней + founding-цена
// закреплена навсегда). Закрытая бета: ручная активация оператором вместо checkout
// (реальная оплата ждёт фискализацию 54-ФЗ).
export function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const admin = await requireAdmin();
    if (!admin) return jsonError('forbidden', 403);
    const { id } = await ctx.params;

    const profile = await db.photographerProfile.findUnique({
      where: { id },
      select: { userId: true, city: { select: { slug: true } } },
    });
    if (!profile) return jsonError('not_found', 404);

    if (await isPro(profile.userId)) return NextResponse.json({ ok: true, alreadyPro: true });

    await grantFoundingPro(profile.userId, profile.city.slug);
    await logAudit(db, admin.userId, 'subscription.grant_founding_pro', 'USER', profile.userId, { profileId: id });

    return NextResponse.json({ ok: true });
  });
}
