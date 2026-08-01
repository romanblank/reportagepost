import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { handleRoute } from '@/lib/errors';
import { ProfileEditSchema, applyProfileEdit } from '@/lib/profile-edit';

// Онбординг, шаг 1: анкета фотографа (город, категории, цены пакетами, контакты)
const ProfileSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{2,29}$/, 'a-z, 0-9, дефис; 3–30 символов'),
  citySlug: z.string().trim(),
  categorySlugs: z.array(z.string().trim()).min(1).max(3),
  bio: z.string().trim().max(2000).optional(),
  // Только http/https — zod .url() пропускает javascript:/data: (stored XSS в
  // href на профиле). Серверный guard: клиентский normalizeUrl обходится.
  siteUrl: z.string().trim().url().max(200).refine((u) => /^https?:\/\//i.test(u), 'только http(s)').optional(),
  whatsapp: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, 'E.164').optional(),
  telegram: z.string().trim().regex(/^@?[A-Za-z0-9_]{5,32}$/).optional(),
  // Богатство анкеты (паритет MyWed)
  experienceYears: z.number().int().min(0).max(70).optional(),
  equipment: z.string().trim().max(500).optional(),
  teamInfo: z.string().trim().max(300).optional(),
  languages: z.array(z.string().trim().regex(/^[a-z]{2}$/)).max(8).optional(),
  packages: z
    .array(
      z.object({
        hours: z.number().int().min(1).max(24),
        priceMinor: z.number().int().min(1), // копейки; float запрещён инвариантом
        currency: z.literal('RUB'), // мультивалютность — при экспансии
      }),
    )
    .min(1)
    .max(6),
});

export function POST(req: Request) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    if (session.role !== 'PHOTOGRAPHER') {
      return NextResponse.json({ error: 'photographers_only' }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    const parsed = ProfileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'validation', details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const data = parsed.data;

    const existing = await db.photographerProfile.findUnique({
      where: { userId: session.userId },
    });
    if (existing) return NextResponse.json({ error: 'profile_exists' }, { status: 409 });

    const usernameTaken = await db.photographerProfile.findUnique({
      where: { username: data.username },
    });
    if (usernameTaken) return NextResponse.json({ error: 'username_taken' }, { status: 409 });

    const city = await db.city.findFirst({ where: { slug: data.citySlug } });
    if (!city) return NextResponse.json({ error: 'city_not_found' }, { status: 400 });

    const categories = await db.category.findMany({
      where: { slug: { in: data.categorySlugs }, active: true },
    });
    if (categories.length !== data.categorySlugs.length) {
      return NextResponse.json({ error: 'category_not_found' }, { status: 400 });
    }

    const profile = await db.photographerProfile.create({
      data: {
        userId: session.userId,
        username: data.username,
        cityId: city.id,
        bio: data.bio,
        siteUrl: data.siteUrl,
        whatsapp: data.whatsapp,
        telegram: data.telegram?.replace(/^@/, ''),
        experienceYears: data.experienceYears,
        equipment: data.equipment,
        teamInfo: data.teamInfo,
        ...(data.languages && data.languages.length ? { languages: data.languages } : {}),
        categories: {
          create: categories.map((c) => ({ categoryId: c.id })),
        },
        packages: {
          create: data.packages.map((p, i) => ({ ...p, sortOrder: i })),
        },
      },
    });

    return NextResponse.json(
      { profileId: profile.id, username: profile.username, status: profile.status },
      { status: 201 },
    );
  });
}

// Редактирование своей анкеты (MyWed: править можно всегда). Логика применения —
// в @/lib/profile-edit (общая с админ-роутом онбординга).
export function PATCH(req: Request) {
  return handleRoute(async () => {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    if (session.role !== 'PHOTOGRAPHER') return NextResponse.json({ error: 'photographers_only' }, { status: 403 });

    const parsed = ProfileEditSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'validation', details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const profile = await db.photographerProfile.findUnique({ where: { userId: session.userId }, select: { id: true, username: true } });
    if (!profile) return NextResponse.json({ error: 'no_profile' }, { status: 404 });

    // 429 и доменные коды разбирает handleRoute. Прежний catch вокруг лимита
    // ловил и падение БД, отвечая «слишком много попыток» (аудит 2026-08-01, P2).
    await rateLimit(`profile-edit:user:${session.userId}`, 30, 3600);

    const { username } = await applyProfileEdit(profile.id, profile.username, parsed.data);
    return NextResponse.json({ ok: true, username });
  });
}
