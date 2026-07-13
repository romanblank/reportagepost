import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';

// Избранные фотографы (кабинет заказчика): сохранить, чтобы вернуться.
export async function toggleFavorite(userId: string, profileId: string): Promise<{ favorited: boolean }> {
  const profile = await db.photographerProfile.findUnique({ where: { id: profileId }, select: { status: true } });
  if (!profile || profile.status !== 'APPROVED') throw new DomainError('profile_not_found', 404);

  const existing = await db.favoritePhotographer.findUnique({
    where: { userId_profileId: { userId, profileId } },
  });
  if (existing) {
    // deleteMany идемпотентно при гонке двойного клика (P2 волны №2)
    await db.favoritePhotographer.deleteMany({ where: { userId, profileId } });
    return { favorited: false };
  }
  try {
    await db.favoritePhotographer.create({ data: { userId, profileId } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return { favorited: true };
    throw e;
  }
  return { favorited: true };
}

export async function favoritesFor(userId: string) {
  const rows = await db.favoritePhotographer.findMany({
    where: { userId, profile: { status: 'APPROVED' } },
    orderBy: { createdAt: 'desc' },
    include: {
      profile: {
        include: {
          user: { select: { firstName: true, lastName: true } },
          city: true,
          photos: { where: { status: 'APPROVED' }, orderBy: { publishedAt: 'desc' }, take: 3 },
        },
      },
    },
  });
  return rows.map((r) => r.profile);
}

/** Заявки, созданные заказчиком (его история). */
export async function inquiriesByClient(userId: string) {
  return db.inquiry.findMany({
    where: { clientUserId: userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { city: true, category: true },
  });
}
