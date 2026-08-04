import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { handleRoute, jsonError } from '@/lib/errors';
import { tierOf } from '@/lib/subscription';
import { cityNameRu } from '@/lib/geo-data';
import { BASE_URL } from '@/lib/sitemap';
import { buildSalesDoc, DOC_MIN_TIER, type SalesDocKind } from '@/lib/sales-kit';

/**
 * Выдаёт документ для работы с юрлицом — готовым файлом, со своими данными.
 *
 * Главное здесь — что фотографу не нужно ни с кем связываться. Ни заявки, ни
 * согласования, ни ожидания: нажал и работает. Менеджеров у платформы нет, и
 * закладываться на них в продукте нельзя.
 */
const TIER_ORDER = { FREE: 0, PRIME: 1, ELITE: 2 } as const;

export function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return jsonError('unauthorized', 401);

    const { kind } = await params;
    if (!(kind in DOC_MIN_TIER)) return jsonError('not_found', 404);
    const docKind = kind as SalesDocKind;

    const profile = await db.photographerProfile.findUnique({
      where: { userId: session.userId },
      select: {
        username: true, legalName: true, inn: true, bankAccount: true, bankName: true, bic: true,
        city: { select: { slug: true } },
        packages: { select: { hours: true, priceMinor: true }, orderBy: { sortOrder: 'asc' } },
        user: { select: { firstName: true, lastName: true, phone: true, email: true } },
      },
    });
    if (!profile) return jsonError('no_profile', 409);

    const tier = await tierOf(session.userId);
    if (TIER_ORDER[tier] < TIER_ORDER[DOC_MIN_TIER[docKind]]) {
      return jsonError('subscription_required', 402);
    }

    const text = buildSalesDoc(docKind, {
      firstName: profile.user.firstName,
      lastName: profile.user.lastName,
      cityName: cityNameRu(profile.city.slug),
      phone: profile.user.phone,
      email: profile.user.email,
      profileUrl: `${BASE_URL}/ru/photographer/${profile.username}`,
      packages: profile.packages,
      legalName: profile.legalName,
      inn: profile.inn,
      account: profile.bankAccount,
      bankName: profile.bankName,
      bic: profile.bic,
    });

    // Обычный текстовый файл: он открывается везде, правится в чём угодно и
    // не требует от автора ни офисного пакета, ни конвертации
    return new NextResponse(text, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${docKind}-reportagepost.txt"`,
        'Cache-Control': 'no-store',
      },
    });
  });
}
