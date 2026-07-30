import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';

// Схема и применение правки анкеты. Общее для self-роута (фотограф правит свою)
// и админ-роута (оператор правит анкету заведённого фотографа). Всё, что после
// zod-парсинга — здесь, чтобы логика не расходилась между двумя точками входа.
export const ProfileEditSchema = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{2,29}$/).optional(),
  citySlug: z.string().trim().optional(),
  categorySlugs: z.array(z.string().trim()).min(1).max(3).optional(),
  bio: z.string().trim().max(2000).optional(),
  // Только http/https — zod .url() пропускает javascript:/data: (stored XSS в href).
  siteUrl: z.string().trim().url().max(200).refine((u) => /^https?:\/\//i.test(u), 'только http(s)').optional().or(z.literal('')),
  whatsapp: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, 'E.164').optional().or(z.literal('')),
  telegram: z.string().trim().regex(/^@?[A-Za-z0-9_]{5,32}$/).optional().or(z.literal('')),
  experienceYears: z.number().int().min(0).max(70).nullable().optional(),
  equipment: z.string().trim().max(500).optional(),
  teamInfo: z.string().trim().max(300).optional(),
  doesVideo: z.boolean().optional(),
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

export type ProfileEditInput = z.infer<typeof ProfileEditSchema>;

export async function applyProfileEdit(
  profileId: string,
  currentUsername: string,
  d: ProfileEditInput,
): Promise<{ username: string }> {
  // siteUrl: только http(s) (guard от javascript:/data:)
  const site = d.siteUrl?.trim();
  if (site && !/^https?:\/\//i.test(site)) throw new DomainError('validation', 400);

  let newUsername: string | undefined;
  if (d.username && d.username !== currentUsername) {
    const taken = await db.photographerProfile.findUnique({ where: { username: d.username } });
    if (taken) throw new DomainError('username_taken', 409);
    newUsername = d.username;
  }
  let newCityId: string | undefined;
  if (d.citySlug) {
    const city = await db.city.findFirst({ where: { slug: d.citySlug } });
    if (!city) throw new DomainError('city_not_found', 400);
    newCityId = city.id;
  }
  let newCategoryIds: string[] | undefined;
  if (d.categorySlugs) {
    const cats = await db.category.findMany({ where: { slug: { in: d.categorySlugs }, active: true } });
    if (cats.length !== d.categorySlugs.length) throw new DomainError('category_not_found', 400);
    newCategoryIds = cats.map((c) => c.id);
  }

  await db.$transaction(async (tx) => {
    await tx.photographerProfile.update({
      where: { id: profileId },
      data: {
        ...(newUsername ? { username: newUsername } : {}),
        ...(newCityId ? { cityId: newCityId } : {}),
        bio: d.bio?.trim() || null,
        siteUrl: site || null,
        whatsapp: d.whatsapp?.trim() || null,
        telegram: d.telegram?.trim().replace(/^@/, '') || null,
        experienceYears: d.experienceYears ?? null,
        equipment: d.equipment?.trim() || null,
        teamInfo: d.teamInfo?.trim() || null,
        ...(d.doesVideo !== undefined ? { doesVideo: d.doesVideo } : {}),
        ...(d.languages && d.languages.length ? { languages: d.languages } : {}),
        ...(d.faq !== undefined
          ? { faq: d.faq.length ? (d.faq as unknown as Prisma.InputJsonValue) : Prisma.DbNull }
          : {}),
      },
    });
    if (newCategoryIds) {
      await tx.profileCategory.deleteMany({ where: { profileId } });
      await tx.profileCategory.createMany({ data: newCategoryIds.map((categoryId) => ({ profileId, categoryId })) });
    }
    if (d.packages) {
      await tx.pricePackage.deleteMany({ where: { profileId } });
      await tx.pricePackage.createMany({
        data: d.packages.map((p, i) => ({ profileId, hours: p.hours, priceMinor: p.priceMinor, currency: p.currency, sortOrder: i })),
      });
    }
  });

  return { username: newUsername ?? currentUsername };
}
