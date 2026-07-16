import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/admin';
import { createPhotographerByAdmin } from '@/lib/admin-onboard';
import { handleRoute, jsonError } from '@/lib/errors';

const Schema = z.object({
  firstName: z.string().trim().min(2).max(60),
  lastName: z.string().trim().min(2).max(60),
  email: z.string().trim().toLowerCase().email().optional().or(z.literal('')),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{2,29}$/),
  citySlug: z.string().trim(),
  categorySlugs: z.array(z.string().trim()).min(1).max(3),
  bio: z.string().trim().max(2000).optional(),
  experienceYears: z.number().int().min(0).max(70).optional(),
  equipment: z.string().trim().max(500).optional(),
  teamInfo: z.string().trim().max(300).optional(),
  whatsapp: z.string().trim().regex(/^\+[1-9]\d{7,14}$/).optional().or(z.literal('')),
  telegram: z.string().trim().regex(/^@?[A-Za-z0-9_]{5,32}$/).optional().or(z.literal('')),
  siteUrl: z.string().trim().url().max(200).refine((u) => /^https?:\/\//i.test(u), 'http(s)').optional().or(z.literal('')),
  publish: z.boolean().default(false),
});

export function POST(req: Request) {
  return handleRoute(async () => {
    const admin = await requireAdmin();
    if (!admin) return jsonError('forbidden', 403);

    const parsed = Schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: 'validation', details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const d = parsed.data;
    const result = await createPhotographerByAdmin(admin.userId, {
      firstName: d.firstName,
      lastName: d.lastName,
      email: d.email || undefined,
      username: d.username,
      citySlug: d.citySlug,
      categorySlugs: d.categorySlugs,
      bio: d.bio,
      experienceYears: d.experienceYears,
      equipment: d.equipment,
      teamInfo: d.teamInfo,
      whatsapp: d.whatsapp || undefined,
      telegram: d.telegram || undefined,
      siteUrl: d.siteUrl || undefined,
      publish: d.publish,
    });
    return NextResponse.json(result, { status: 201 });
  });
}
