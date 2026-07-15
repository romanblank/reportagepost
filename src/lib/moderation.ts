import { db } from '@/lib/db';
import { logAudit } from '@/lib/audit';

// Модерация онбординга: профиль целиком (модель MyWed — портфолио оценивается
// как единое целое). Пофотовая модерация после онбординга — отдельным шагом.

export interface QueueItem {
  profileId: string;
  username: string;
  firstName: string;
  lastName: string;
  citySlug: string;
  categories: string[];
  photoCount: number;
  createdAt: Date;
}

export async function moderationQueue(): Promise<QueueItem[]> {
  const profiles = await db.photographerProfile.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' }, // старые заявки первыми
    include: {
      user: true,
      city: true,
      categories: { include: { category: true } },
      _count: { select: { photos: true } },
    },
  });
  return profiles.map((p) => ({
    profileId: p.id,
    username: p.username,
    firstName: p.user.firstName,
    lastName: p.user.lastName,
    citySlug: p.city.slug,
    categories: p.categories.map((c) => c.category.slug),
    photoCount: p._count.photos,
    createdAt: p.createdAt,
  }));
}

/** Одобрение: профиль APPROVED, пользователь ACTIVE, фото публикуются + события. */
export async function approveProfile(profileId: string, actorUserId?: string): Promise<{ published: number }> {
  return db.$transaction(async (tx) => {
    const profile = await tx.photographerProfile.findUniqueOrThrow({
      where: { id: profileId },
      include: { photos: { where: { status: 'PENDING' } } },
    });

    await tx.photographerProfile.update({
      where: { id: profileId },
      data: { status: 'APPROVED', rejectReason: null },
    });
    await tx.user.update({
      where: { id: profile.userId },
      data: { status: 'ACTIVE' },
    });

    const now = new Date();
    await tx.photo.updateMany({
      where: { profileId, status: 'PENDING' },
      data: { status: 'APPROVED', publishedAt: now },
    });
    if (profile.photos.length > 0) {
      await tx.activityEvent.createMany({
        data: profile.photos.map((photo) => ({
          actorUserId: profile.userId,
          type: 'PHOTO_PUBLISH' as const,
          targetType: 'PHOTO' as const,
          targetId: photo.id,
        })),
      });
    }
    if (actorUserId) {
      await logAudit(tx, actorUserId, 'profile.approve', 'PROFILE', profileId, {
        published: profile.photos.map((p) => p.id),
      });
    }
    return { published: profile.photos.length };
  }).then(async (result) => {
    // Стартовый рейтинг ТОЛЬКО одобряемого профиля (аудит P1-2: точечно, не
    // полный пересчёт всех в HTTP-запросе модератора)
    const { recomputeOne } = await import('@/lib/rating');
    await recomputeOne(profileId);
    return result;
  });
}

/** Отклонение: профиль REJECTED с обязательной причиной (честность к фотографу). */
export async function rejectProfile(profileId: string, reason: string, actorUserId?: string): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.photographerProfile.update({
      where: { id: profileId },
      data: { status: 'REJECTED', rejectReason: reason },
    });
    await tx.photo.updateMany({
      where: { profileId, status: 'PENDING' },
      data: { status: 'REJECTED', rejectReason: reason },
    });
    if (actorUserId) {
      await logAudit(tx, actorUserId, 'profile.reject', 'PROFILE', profileId, { reason });
    }
  });
}
