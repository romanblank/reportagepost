import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { videoStorageKeys } from '@/lib/videos';
import { photoStorageKeys } from '@/lib/photos';
import { storage } from '@/lib/storage';

/**
 * Всё, что висит на анкете фотографа.
 *
 * Единственный список: удаление аккаунта и удаление одной лишь анкеты обязаны
 * ходить одним и тем же путём. Вторая копия перечня разъезжается с первой —
 * на удалении аккаунта это случалось трижды, каждый раз одинаково: новая
 * таблица со ссылкой ON DELETE RESTRICT валила операцию с 500.
 */
async function purgeProfile(tx: Prisma.TransactionClient, profileId: string): Promise<void> {
  const photoIds = (await tx.photo.findMany({ where: { profileId }, select: { id: true } })).map((p) => p.id);
  const storyIds = (await tx.story.findMany({ where: { profileId }, select: { id: true } })).map((s) => s.id);
  await tx.like.deleteMany({ where: { OR: [{ photoId: { in: photoIds } }, { storyId: { in: storyIds } }] } });
  await tx.comment.deleteMany({ where: { OR: [{ photoId: { in: photoIds } }, { storyId: { in: storyIds } }] } });
  await tx.article.updateMany({ where: { coverPhotoId: { in: photoIds } }, data: { coverPhotoId: null } });
  await tx.review.deleteMany({ where: { profileId } });
  await tx.favoritePhotographer.deleteMany({ where: { profileId } });
  await tx.busyDate.deleteMany({ where: { profileId } });
  await tx.travelPlan.deleteMany({ where: { profileId } });
  await tx.pricePackage.deleteMany({ where: { profileId } });
  await tx.profileCategory.deleteMany({ where: { profileId } });
  await tx.profileCategoryScore.deleteMany({ where: { profileId } });
  await tx.shootConfirmation.deleteMany({ where: { profileId } });
  await tx.profileVideo.deleteMany({ where: { profileId } });
  await tx.photo.deleteMany({ where: { profileId } }); // до stories (photo.storyId FK)
  await tx.story.deleteMany({ where: { profileId } });
  await tx.photographerProfile.delete({ where: { id: profileId } });
}

/**
 * Удалить ТОЛЬКО анкету фотографа, оставив аккаунт.
 *
 * Нужно, чтобы пройти путь «подать анкету» заново, не теряя вход, почту и
 * пароль. Роль возвращать не нужно: анкета подаётся из того же кабинета.
 */
export async function deletePhotographerProfile(userId: string): Promise<void> {
  const profile = await db.photographerProfile.findUnique({
    where: { userId },
    select: {
      id: true, avatarKey: true,
      photos: { select: { storageKey: true } },
      videos: { select: { storageKey: true, hdKey: true, sdKey: true, posterKey: true } },
    },
  });
  if (!profile) return;

  const storageKeys: string[] = [];
  for (const ph of profile.photos) storageKeys.push(...photoStorageKeys(ph.storageKey));
  if (profile.avatarKey) storageKeys.push(profile.avatarKey);
  for (const v of profile.videos) storageKeys.push(...videoStorageKeys(v));

  await db.$transaction(async (tx) => {
    await purgeProfile(tx, profile.id);
  }, { timeout: 30_000 });

  await Promise.all(
    storageKeys.map((k) =>
      storage.delete(k).catch((e) => console.error('[account] storage cleanup failed:', k, e)),
    ),
  );
}

// Удаление аккаунта и данных (ПнД, S4.2). Явное упорядоченное удаление даёт
// КОНТРОЛИРУЕМЫЙ blast radius (безопаснее массовых onDelete-каскадов). Записи
// бизнес-характера анонимизируются (события/инвайты — теряют связь с юзером),
// PII-владения удаляется. Фото/аватар — из Object Storage.
export async function deleteAccount(userId: string): Promise<void> {
  // 1. Ключи хранилища собираем ДО удаления строк
  const profile = await db.photographerProfile.findUnique({
    where: { userId },
    select: { id: true, avatarKey: true, photos: { select: { storageKey: true } },
      videos: { select: { storageKey: true, hdKey: true, sdKey: true, posterKey: true } } },
  });
  const storageKeys: string[] = [];
  if (profile) {
    for (const ph of profile.photos) {
      // Ключ кадра указывает на вариант (web.jpg, у старых — original.jpg),
      // но формат гардим (ревью №8): при неожиданном ключе не плодим сирот.
      // Через общий список: своя копия знала только про JPEG, и фотографии
      // удалённого человека оставались в бакете в формате WebP
      storageKeys.push(...photoStorageKeys(ph.storageKey));
    }
    if (profile.avatarKey) storageKeys.push(profile.avatarKey);
    // Ролик — это не один файл: исходник, два web-варианта и постер
    for (const v of profile.videos) storageKeys.push(...videoStorageKeys(v));
  }

  await db.$transaction(async (tx) => {
    // 2. Анонимизация (сохраняем агрегаты/бизнес-записи без связи с юзером)
    await tx.activityEvent.updateMany({ where: { actorUserId: userId }, data: { actorUserId: null } });
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
    // Форум и журнал уходят вместе с аккаунтом. Обезличить не получится:
    // имя автора рядом с сообщением — те самые данные, ради удаления которых
    // человек и пришёл. Обсуждение потеряет реплики, и это цена права на
    // удаление, а не недосмотр.
    await tx.forumSubscription.deleteMany({ where: { userId } });
    await tx.forumPost.deleteMany({ where: { authorUserId: userId } });
    await tx.forumThread.deleteMany({ where: { authorUserId: userId } });
    await tx.article.deleteMany({ where: { authorUserId: userId } });
    await tx.contentViolation.deleteMany({ where: { userId } });
    await tx.review.deleteMany({ where: { authorUserId: userId } });
    await tx.inquiry.deleteMany({ where: { clientUserId: userId } });
    // Второй заход на те же грабли (аудит 2026-08-03, P0): обе связи —
    // ON DELETE RESTRICT, поэтому любой пользователь первые двое суток после
    // регистрации (пока жив токен подтверждения почты) и любой, кто хоть раз
    // кого-то заблокировал, удалить аккаунт НЕ МОГ — получал 500. Право на
    // отзыв согласия, обещанное в политике, просто не работало.
    await tx.emailVerification.deleteMany({ where: { userId } });
    await tx.userBlock.deleteMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } });
    // Жалобы субъекта обезличиваются ДО удаления: после SET NULL у reporterId
    // связь потеряется, а свободный текст и контакт заявителя останутся
    await tx.report.updateMany({
      where: { reporterId: userId },
      data: { comment: null, contactEmail: null },
    });

    // 4. Профиль фотографа + поддерево (+ чужие данные на нём)
    if (profile) await purgeProfile(tx, profile.id);

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
