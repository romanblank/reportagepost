import { db } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { dropCache } from '@/lib/cache-invalidate';

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
  // Кэш города: без сброса одобренный автор появится в счётчиках жанров и в
  // полке только через TTL — а человек ждёт результата сейчас
  // В Next 16 у revalidateTag два аргумента; 'max' даёт stale-while-revalidate
  dropCache('catalog', 'home');
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
/**
 * Одобрить кадр. Возвращает false, если решать было нечего.
 *
 * Раньше функция молча завершалась и при отсутствующем кадре: массовое
 * одобрение сорока кадров рапортовало бы об успехе, даже если половины уже
 * нет. Молчаливый успех хуже ошибки — он не даёт повода проверить.
 */
export async function approvePhoto(photoId: string, actorUserId?: string): Promise<boolean> {
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
  if (!profileId) return false;
  // Новый кадр меняет и общий, и жанровый скор автора
  const { recomputeOne } = await import('@/lib/rating');
  await recomputeOne(profileId);
  // Главная показывает свежие работы: без сброса кадр появится там только
  // через TTL, а автор считает, что публикация не сработала
  dropCache('home', 'catalog');
  return true;
}

/** Отклонение кадра с обязательной причиной + уведомление автору. */
export async function rejectPhoto(photoId: string, reason: string, actorUserId?: string): Promise<boolean> {
  const info = await db.$transaction(async (tx) => {
    const photo = await tx.photo.findUnique({
      where: { id: photoId },
      select: { status: true, storageKey: true, profileId: true, profile: { select: { userId: true, coverPhotoId: true } } },
    });
    // Снимать можно и уже опубликованный кадр: по жалобе правообладателя иначе
    // не было НИЧЕГО, кроме гашения всей анкеты автора (аудит 2026-08-03).
    if (!photo || (photo.status !== 'PENDING' && photo.status !== 'APPROVED')) return null;

    await tx.photo.update({
      where: { id: photoId },
      data: { status: 'REJECTED', rejectReason: reason, publishedAt: null, editorsChoiceAt: null },
    });
    // Снятый кадр не должен остаться обложкой профиля
    if (photo.profile.coverPhotoId === photoId) {
      await tx.photographerProfile.update({ where: { id: photo.profileId }, data: { coverPhotoId: null } });
    }
    if (actorUserId) await logAudit(tx, actorUserId, 'photo.reject', 'PHOTO', photoId, { reason });
    return { userId: photo.profile.userId, storageKey: photo.storageKey, profileId: photo.profileId };
  });
  if (!info) return false;

  // Файлы удаляем следом: раздатчик /files не смотрит в базу, и отклонённый
  // кадр продолжал бы раздаваться по прямой ссылке вечно, с годовым кэшем.
  // Так же поступает rejectVideo — асимметрия была недосмотром.
  const { photoStorageKeys } = await import('@/lib/photos');
  const { storage } = await import('@/lib/storage');
  for (const key of photoStorageKeys(info.storageKey)) await storage.delete(key).catch(() => {});

  // Кадр мог участвовать в рейтинге автора
  const { recomputeOne } = await import('@/lib/rating');
  await recomputeOne(info.profileId).catch(() => {});

  // Причина обязана дойти до автора — иначе он не поймёт, почему кадра нет
  const { notifyInApp } = await import('@/lib/notifications');
  await notifyInApp(info.userId, 'notification.photo.rejected', { reason }).catch(() => {});
  // Снятый кадр обязан исчезнуть с главной СРАЗУ: по жалобе правообладателя
  // «ещё две минуты повисит» — это две минуты нарушения, о котором нам уже
  // сообщили. Тег существовал с самого начала, но его никто не сбрасывал
  dropCache('home', 'catalog');
  return true;
}

/**
 * Очередь роликов на проверку.
 *
 * Ролики публикуются сразу — автор уже прошёл модерацию профиля. На проверку
 * попадают только те, чьи кадры насторожили премодерацию. Без этой очереди
 * такой ролик оказывался в тупике: невидим на странице и не показан никому из
 * редакции — автор ждал бы вечно (ровно та ошибка, которую уже разбирали с
 * фотографиями).
 */
export interface VideoQueueItem {
  id: string;
  title: string | null;
  durationSec: number | null;
  posterKey: string | null;
  sdKey: string | null;
  hdKey: string | null;
  createdAt: Date;
  profileId: string;
  username: string;
  authorName: string;
}

export async function videoModerationQueue(limit = 100): Promise<VideoQueueItem[]> {
  const rows = await db.profileVideo.findMany({
    // Только готовые: необработанный ролик показывать нечем
    where: { status: 'PENDING', processing: 'READY' },
    orderBy: { createdAt: 'asc' },
    take: limit,
    include: { profile: { include: { user: { select: { firstName: true, lastName: true } } } } },
  });
  return rows.map((v) => ({
    id: v.id,
    title: v.title,
    durationSec: v.durationSec,
    posterKey: v.posterKey,
    sdKey: v.sdKey,
    hdKey: v.hdKey,
    createdAt: v.createdAt,
    profileId: v.profileId,
    username: v.profile.username,
    authorName: `${v.profile.user.firstName} ${v.profile.user.lastName}`.trim(),
  }));
}

/** Публикация ролика после проверки. */
export async function approveVideo(videoId: string, actorUserId?: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const video = await tx.profileVideo.findUnique({ where: { id: videoId }, select: { status: true } });
    if (!video || video.status !== 'PENDING') return;
    await tx.profileVideo.update({ where: { id: videoId }, data: { status: 'APPROVED' } });
    if (actorUserId) await logAudit(tx, actorUserId, 'video.approve', 'VIDEO', videoId);
  });
}

/**
 * Отклонение ролика с причиной.
 *
 * Файлы удаляются сразу: отклонённое видео не будет опубликовано никогда, а
 * его варианты — самые тяжёлые объекты в хранилище.
 */
export async function rejectVideo(videoId: string, reason: string, actorUserId?: string): Promise<void> {
  const trimmed = reason.trim();
  if (trimmed.length < 3) {
    const { DomainError } = await import('@/lib/errors');
    throw new DomainError('validation', 400);
  }

  const video = await db.profileVideo.findUnique({ where: { id: videoId } });
  if (!video || video.status !== 'PENDING') return;

  const { videoStorageKeys } = await import('@/lib/videos');
  const { storage } = await import('@/lib/storage');
  const keys = videoStorageKeys(video);

  const rejected = await db.$transaction(async (tx) => {
    // Проверка статуса ВНУТРИ транзакции: между внешним чтением и этим
    // моментом другой администратор мог ролик одобрить, и мы бы сняли с
    // публикации уже показанное видео, а следом удалили его файлы.
    const { count } = await tx.profileVideo.updateMany({
      where: { id: videoId, status: 'PENDING' },
      data: { status: 'REJECTED', failureReason: trimmed.slice(0, 200) },
    });
    if (count === 0) return false;
    if (actorUserId) await logAudit(tx, actorUserId, 'video.reject', 'VIDEO', videoId);
    return true;
  });
  // Проиграли гонку — ролик уже одобрен кем-то другим, ничего не трогаем
  if (!rejected) return;

  // Автор должен узнать причину — тем же каналом, что и по отклонённому кадру
  const owner = await db.photographerProfile.findUnique({
    where: { id: video.profileId }, select: { userId: true },
  });
  if (owner) {
    const { notifyInApp } = await import('@/lib/notifications');
    await notifyInApp(owner.userId, 'notification.video.rejected', { reason: trimmed.slice(0, 200) }).catch(() => {});
  }

  for (const key of keys) await storage.delete(key).catch(() => {});
}
