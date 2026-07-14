import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';

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

export async function POST(req: Request) {
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
}

// Редактирование своей анкеты (MyWed: править можно всегда). Меняем контент-поля;
// username/город — идентичность/локация, отдельно (пока не редактируются).
const EditSchema = z.object({
  bio: z.string().trim().max(2000).optional(),
  // Паритет с POST (ревью №7): те же правила формата, '' допускается для очистки.
  siteUrl: z.string().trim().url().max(200).refine((u) => /^https?:\/\//i.test(u), 'только http(s)').optional().or(z.literal('')),
  whatsapp: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, 'E.164').optional().or(z.literal('')),
  telegram: z.string().trim().regex(/^@?[A-Za-z0-9_]{5,32}$/).optional().or(z.literal('')),
  experienceYears: z.number().int().min(0).max(70).nullable().optional(),
  equipment: z.string().trim().max(500).optional(),
  teamInfo: z.string().trim().max(300).optional(),
  languages: z.array(z.string().trim().regex(/^[a-z]{2}$/)).max(8).optional(),
  faq: z
    .array(z.object({ q: z.string().trim().min(1).max(200), a: z.string().trim().min(1).max(1000) }))
    .max(10)
    .optional(),
  packages: z
    .array(z.object({ hours: z.number().int().min(1).max(24), priceMinor: z.number().int().min(1), currency: z.literal('RUB') }))
    .min(1)
    .max(6)
    .optional(),
});

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (session.role !== 'PHOTOGRAPHER') return NextResponse.json({ error: 'photographers_only' }, { status: 403 });

  const parsed = EditSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'validation', details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const d = parsed.data;

  const profile = await db.photographerProfile.findUnique({ where: { userId: session.userId }, select: { id: true } });
  if (!profile) return NextResponse.json({ error: 'no_profile' }, { status: 404 });

  try {
    await rateLimit(`profile-edit:user:${session.userId}`, 30, 3600);
  } catch {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  // siteUrl: только http(s) (guard от javascript:/data: — как в POST)
  const site = d.siteUrl?.trim();
  if (site && !/^https?:\/\//i.test(site)) {
    return NextResponse.json({ error: 'validation', details: { siteUrl: ['только http(s)'] } }, { status: 400 });
  }

  await db.$transaction(async (tx) => {
    await tx.photographerProfile.update({
      where: { id: profile.id },
      data: {
        bio: d.bio?.trim() || null,
        siteUrl: site || null,
        whatsapp: d.whatsapp?.trim() || null,
        telegram: d.telegram?.trim().replace(/^@/, '') || null,
        experienceYears: d.experienceYears ?? null,
        equipment: d.equipment?.trim() || null,
        teamInfo: d.teamInfo?.trim() || null,
        ...(d.languages && d.languages.length ? { languages: d.languages } : {}),
        ...(d.faq !== undefined
          ? { faq: d.faq.length ? (d.faq as unknown as Prisma.InputJsonValue) : Prisma.DbNull }
          : {}),
      },
    });
    if (d.packages) {
      await tx.pricePackage.deleteMany({ where: { profileId: profile.id } });
      await tx.pricePackage.createMany({
        data: d.packages.map((p, i) => ({ profileId: profile.id, hours: p.hours, priceMinor: p.priceMinor, currency: p.currency, sortOrder: i })),
      });
    }
  });

  return NextResponse.json({ ok: true });
}
