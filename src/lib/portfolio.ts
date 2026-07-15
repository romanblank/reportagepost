import { db } from '@/lib/db';
import { storage } from '@/lib/storage';
import { DomainError } from '@/lib/errors';

// Управление портфолио фотографа: удаление, пересортировка, выбор обложки.
// Инвариант владения: операция только над своими фото (по profile.userId).

async function ownProfile(userId: string) {
  const profile = await db.photographerProfile.findUnique({ where: { userId } });
  if (!profile) throw new DomainError('no_profile', 409);
  return profile;
}

/** Ключи всех вариантов фото (гард формата — как в account.ts, ревью №8). */
function variantKeys(storageKey: string): string[] {
  if (storageKey.endsWith('/original.jpg')) {
    const base = storageKey.slice(0, -'/original.jpg'.length);
    return [`${base}/original.jpg`, `${base}/web.jpg`, `${base}/thumb.jpg`];
  }
  return [storageKey];
}

export async function deletePhoto(userId: string, photoId: string): Promise<void> {
  const profile = await ownProfile(userId);
  const photo = await db.photo.findUnique({ where: { id: photoId } });
  if (!photo || photo.profileId !== profile.id) throw new DomainError('photo_not_found', 404);

  const keys = variantKeys(photo.storageKey);

  await db.$transaction(async (tx) => {
    // Снять обложку, если удаляем именно её
    if (profile.coverPhotoId === photoId) {
      await tx.photographerProfile.update({ where: { id: profile.id }, data: { coverPhotoId: null } });
    }
    // Зависимые записи (FK) до самого фото
    await tx.like.deleteMany({ where: { photoId } });
    await tx.comment.deleteMany({ where: { photoId } });
    await tx.photo.delete({ where: { id: photoId } });
  });

  // Чистка хранилища — best-effort, не глотаем ошибку молча (правило проекта)
  await Promise.all(
    keys.map((k) => storage.delete(k).catch((e) => console.error('[portfolio] storage cleanup failed:', k, e))),
  );
}

/** Задать порядок фото. ids — полный или частичный список своих фото в нужном порядке. */
export async function reorderPhotos(userId: string, ids: string[]): Promise<void> {
  const profile = await ownProfile(userId);
  if (ids.length === 0) return;
  if (new Set(ids).size !== ids.length) throw new DomainError('duplicate_ids', 400);

  const owned = await db.photo.findMany({
    where: { id: { in: ids }, profileId: profile.id },
    select: { id: true },
  });
  if (owned.length !== ids.length) throw new DomainError('photo_not_found', 404); // чужое/несуществующее

  await db.$transaction(
    ids.map((id, index) => db.photo.update({ where: { id }, data: { sortOrder: index } })),
  );
}

export async function setCover(userId: string, photoId: string): Promise<void> {
  const profile = await ownProfile(userId);
  const photo = await db.photo.findUnique({ where: { id: photoId }, select: { profileId: true, status: true } });
  if (!photo || photo.profileId !== profile.id) throw new DomainError('photo_not_found', 404);
  if (photo.status !== 'APPROVED') throw new DomainError('photo_not_approved', 400);
  await db.photographerProfile.update({ where: { id: profile.id }, data: { coverPhotoId: photoId } });
}
