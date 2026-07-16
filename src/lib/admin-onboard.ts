import { db } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { DomainError } from '@/lib/errors';

// Создание фотографа админом (ручной онбординг реальных людей). Аккаунт без
// пароля (passwordHash=null) — фотограф позже «забирает» его по сбросу пароля.
// Профиль: publish → сразу APPROVED (в каталоге), иначе DRAFT (черновик).

export interface AdminCreatePhotographerInput {
  firstName: string;
  lastName: string;
  email?: string;
  username: string;
  citySlug: string;
  categorySlugs: string[];
  bio?: string;
  experienceYears?: number;
  equipment?: string;
  teamInfo?: string;
  whatsapp?: string;
  telegram?: string;
  siteUrl?: string;
  publish: boolean;
}

export async function createPhotographerByAdmin(
  actorUserId: string,
  input: AdminCreatePhotographerInput,
): Promise<{ profileId: string; username: string }> {
  if (input.email) {
    const taken = await db.user.findUnique({ where: { email: input.email } });
    if (taken) throw new DomainError('email_taken', 409);
  }
  const usernameTaken = await db.photographerProfile.findUnique({ where: { username: input.username } });
  if (usernameTaken) throw new DomainError('username_taken', 409);

  const city = await db.city.findFirst({ where: { slug: input.citySlug } });
  if (!city) throw new DomainError('city_not_found', 400);

  const categories = await db.category.findMany({ where: { slug: { in: input.categorySlugs }, active: true } });
  if (categories.length !== input.categorySlugs.length) throw new DomainError('category_not_found', 400);

  const profileStatus = input.publish ? 'APPROVED' : 'DRAFT';

  const result = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        role: 'PHOTOGRAPHER',
        status: 'ACTIVE', // аккаунт заведён оператором; в каталоге решает статус профиля
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email || null,
      },
    });
    const profile = await tx.photographerProfile.create({
      data: {
        userId: user.id,
        username: input.username,
        cityId: city.id,
        status: profileStatus,
        bio: input.bio || null,
        experienceYears: input.experienceYears ?? null,
        equipment: input.equipment || null,
        teamInfo: input.teamInfo || null,
        whatsapp: input.whatsapp || null,
        telegram: input.telegram?.replace(/^@/, '') || null,
        siteUrl: input.siteUrl || null,
        categories: { create: categories.map((c) => ({ categoryId: c.id })) },
      },
    });
    await logAudit(tx, actorUserId, 'photographer.create', 'PROFILE', profile.id, {
      username: input.username,
      publish: input.publish,
      userId: user.id,
    });
    return { profileId: profile.id, username: profile.username };
  });

  if (input.publish) {
    const { recomputeOne } = await import('@/lib/rating');
    await recomputeOne(result.profileId);
  }
  return result;
}
