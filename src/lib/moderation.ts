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
    // Правки Active/Active+ — в первую очередь (перк подписки): proRank desc,
    // затем старые заявки первыми. Онбординг ещё FREE (proRank 0) → по дате.
    orderBy: [{ proRank: 'desc' }, { createdAt: 'asc' }],
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
    // Lifecycle: сообщить фотографу об одобрении (deep-think P0). Вторично — не роняем.
    const { notifyProfileApproved } = await import('@/lib/profile-lifecycle');
    await notifyProfileApproved(profileId).catch(() => {});
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
  // Lifecycle: доставить причину фотографу (deep-think P0: rejectReason сохранялся,
  // но не доставлялся). Вторично — не роняем основное действие.
  const { notifyProfileRevision } = await import('@/lib/profile-lifecycle');
  await notifyProfileRevision(profileId, reason).catch(() => {});
}

// ─── Пофотовая модерация (аудит 2026-07-31, P0) ─────────────────────────────
// Раньше модерация была только «профиль целиком»: кадры, добавленные ПОСЛЕ
// одобрения, оставались PENDING навсегда — их не видел ни один инструмент, и
// фотограф просто не понимал, почему новые работы не появляются в портфолио.

export interface PhotoQueueItem {
  photoId: string;
  profileId: string;
  username: string;
  authorName: string;
  storageKey: string;
  width: number;
  height: number;
  blurhash: string | null;
  categorySlug: string;
  aiVerdict: unknown;
  uploadedAt: Date;
}

/** Очередь кадров, ждущих проверки у УЖЕ одобренных авторов (свежие внизу). */
export async function photoModerationQueue(limit = 100): Promise<PhotoQueueItem[]> {
  const photos = await db.photo.findMany({
    where: { status: 'PENDING', profile: { status: 'APPROVED' } },
    // Правки подписчиков вперёд (перк «смотрим в первую очередь»), затем по дате
    orderBy: [{ profile: { proRank: 'desc' } }, { uploadedAt: 'asc' }],
    take: limit,
    include: {
      category: { select: { slug: true } },
      profile: { select: { id: true, username: true, user: { select: { firstName: true, lastName: true } } } },
    },
  });
  return photos.map((p) => ({
    photoId: p.id,
    profileId: p.profile.id,
    username: p.profile.username,
    authorName: `${p.profile.user.firstName} ${p.profile.user.lastName}`.trim(),
    storageKey: p.storageKey,
    width: p.width,
    height: p.height,
    blurhash: p.blurhash,
    categorySlug: p.category.slug,
    aiVerdict: p.aiVerdict,
    uploadedAt: p.uploadedAt,
  }));
}

/** Публикация одного кадра: APPROVED + событие + пересчёт рейтинга автора. */
export async function approvePhoto(photoId: string, actorUserId?: string): Promise<void> {
  const profileId = await db.$transaction(async (tx) => {
    const photo = await tx.photo.findUnique({ where: { id: photoId }, select: { profileId: true, status: true } });
    if (!photo || photo.status !== 'PENDING') return null;
    await tx.photo.update({
      where: { id: photoId },
      data: { status: 'APPROVED', publishedAt: new Date(), rejectReason: null },
    });
    await tx.activityEvent.create({
      data: { actorUserId: null, type: 'PHOTO_PUBLISH', targetType: 'PHOTO', targetId: photoId },
    });
    if (actorUserId) await logAudit(tx, actorUserId, 'photo.approve', 'PHOTO', photoId);
    return photo.profileId;
  });
  if (!profileId) return;
  // Новый кадр меняет и общий, и жанровый скор автора
  const { recomputeOne } = await import('@/lib/rating');
  await recomputeOne(profileId);
}

/** Отклонение кадра с обязательной причиной + уведомление автору. */
export async function rejectPhoto(photoId: string, reason: string, actorUserId?: string): Promise<void> {
  const info = await db.$transaction(async (tx) => {
    const photo = await tx.photo.findUnique({
      where: { id: photoId },
      select: { status: true, profile: { select: { userId: true } } },
    });
    if (!photo || photo.status !== 'PENDING') return null;
    await tx.photo.update({ where: { id: photoId }, data: { status: 'REJECTED', rejectReason: reason } });
    if (actorUserId) await logAudit(tx, actorUserId, 'photo.reject', 'PHOTO', photoId, { reason });
    return { userId: photo.profile.userId };
  });
  if (!info) return;
  // Причина обязана дойти до автора — иначе он не поймёт, почему кадра нет
  const { notifyInApp } = await import('@/lib/notifications');
  await notifyInApp(info.userId, 'photo.rejected', { reason }).catch(() => {});
}
