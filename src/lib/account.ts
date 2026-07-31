import { db } from '@/lib/db';
import { storage } from '@/lib/storage';

// Удаление аккаунта и данных (ПнД, S4.2). Явное упорядоченное удаление даёт
// КОНТРОЛИРУЕМЫЙ blast radius (безопаснее массовых onDelete-каскадов). Записи
// бизнес-характера анонимизируются (события/инвайты — теряют связь с юзером),
// PII-владения удаляется. Фото/аватар — из Object Storage.
export async function deleteAccount(userId: string): Promise<void> {
  // 1. Ключи хранилища собираем ДО удаления строк
  const profile = await db.photographerProfile.findUnique({
    where: { userId },
    select: { id: true, avatarKey: true, photos: { select: { storageKey: true } }, videos: { select: { storageKey: true } } },
  });
  const storageKeys: string[] = [];
  if (profile) {
    for (const ph of profile.photos) {
      // Ключ всегда photos/<id>/original.jpg — но гардим формат (ревью №8):
      // при неожиданном ключе не плодим неверные варианты-сироты.
      if (ph.storageKey.endsWith('/original.jpg')) {
        const base = ph.storageKey.slice(0, -'/original.jpg'.length);
        storageKeys.push(`${base}/original.jpg`, `${base}/web.jpg`, `${base}/thumb.jpg`);
      } else {
        storageKeys.push(ph.storageKey);
      }
    }
    if (profile.avatarKey) storageKeys.push(profile.avatarKey);
    for (const v of profile.videos) storageKeys.push(v.storageKey);
  }

  await db.$transaction(async (tx) => {
    // 2. Анонимизация (сохраняем агрегаты/бизнес-записи без связи с юзером)
    await tx.activityEvent.updateMany({ where: { actorUserId: userId }, data: { actorUserId: null } });
    await tx.inviteCode.updateMany({ where: { issuedByUserId: userId }, data: { issuedByUserId: null } });
    // Платежи и аудит-след администратора НЕ удаляются: первичные документы по
    // платежам хранятся по закону (НК РФ, 54-ФЗ), аудит действий администратора —
    // доказательность. Обезличиваем: факт остаётся, связь с субъектом уходит
    // (аудит 2026-07-31, P0: без этого FK не давал удалить аккаунт вообще).
    await tx.payment.updateMany({ where: { userId }, data: { userId: null } });
    await tx.adminAudit.updateMany({ where: { actorUserId: userId }, data: { actorUserId: null } });

    // 3. Данные, принадлежащие пользователю
    await tx.message.deleteMany({ where: { OR: [{ senderId: userId }, { recipientId: userId }] } });
    await tx.notification.deleteMany({ where: { userId } });
    await tx.phoneVerification.deleteMany({ where: { userId } });
    await tx.passwordReset.deleteMany({ where: { userId } });
    await tx.recoveryCode.deleteMany({ where: { userId } });
    await tx.subscription.deleteMany({ where: { userId } });
    // Подтверждения съёмок, где пользователь выступал заказчиком
    await tx.shootConfirmation.deleteMany({ where: { clientUserId: userId } });
    await tx.favoritePhotographer.deleteMany({ where: { userId } });
    await tx.follow.deleteMany({ where: { OR: [{ followerId: userId }, { followeeId: userId }] } });
    await tx.like.deleteMany({ where: { userId } });
    await tx.comment.deleteMany({ where: { authorUserId: userId } });
    await tx.review.deleteMany({ where: { authorUserId: userId } });
    await tx.inquiry.deleteMany({ where: { clientUserId: userId } });

    // 4. Профиль фотографа + поддерево (+ чужие данные на нём)
    if (profile) {
      const photoIds = (await tx.photo.findMany({ where: { profileId: profile.id }, select: { id: true } })).map((p) => p.id);
      const storyIds = (await tx.story.findMany({ where: { profileId: profile.id }, select: { id: true } })).map((s) => s.id);
      await tx.like.deleteMany({ where: { OR: [{ photoId: { in: photoIds } }, { storyId: { in: storyIds } }] } });
      await tx.comment.deleteMany({ where: { OR: [{ photoId: { in: photoIds } }, { storyId: { in: storyIds } }] } });
      await tx.review.deleteMany({ where: { profileId: profile.id } });
      await tx.favoritePhotographer.deleteMany({ where: { profileId: profile.id } });
      await tx.busyDate.deleteMany({ where: { profileId: profile.id } });
      await tx.travelPlan.deleteMany({ where: { profileId: profile.id } });
      await tx.pricePackage.deleteMany({ where: { profileId: profile.id } });
      await tx.profileCategory.deleteMany({ where: { profileId: profile.id } });
      await tx.profileCategoryScore.deleteMany({ where: { profileId: profile.id } });
      await tx.shootConfirmation.deleteMany({ where: { profileId: profile.id } });
      await tx.profileVideo.deleteMany({ where: { profileId: profile.id } });
      await tx.photo.deleteMany({ where: { profileId: profile.id } }); // до stories (photo.storyId FK)
      await tx.story.deleteMany({ where: { profileId: profile.id } });
      await tx.photographerProfile.delete({ where: { id: profile.id } });
    }

    // 5. Сам пользователь
    await tx.user.delete({ where: { id: userId } });
  }, { timeout: 30_000 }); // портфолио может быть большим (ревью №8: дефолт 5с мало)

  // 6. Чистка хранилища — best-effort, вне транзакции. Проваленные ключи ЛОГИРУЕМ
  // (ревью №8: тихий catch скрывал бы остаточную PII в Object Storage).
  await Promise.all(
    storageKeys.map((k) =>
      storage.delete(k).catch((e) => console.error('[account] storage cleanup failed:', k, e)),
    ),
  );
}
