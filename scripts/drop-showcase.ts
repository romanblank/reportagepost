import 'dotenv/config';
import { db } from '@/lib/db';
import { storage } from '@/lib/storage';
import { videoStorageKeys } from '@/lib/videos';

/**
 * Удаляет демонстрационное наполнение целиком: профили `futazh-*`, их
 * пользователей и всё, что к ним привязано, включая файлы в хранилище.
 *
 * Нужен к публичному запуску (S4): демо-авторы не должны попасть на живую
 * платформу — заказчик, написавший несуществующему фотографу, не вернётся.
 * Долг оформлен скриптом, а не пунктом «не забыть»: забыть можно, не
 * запустить — нет.
 *
 * Реальные аккаунты не затрагиваются: выборка идёт строго по префиксу.
 */
const PREFIX = 'futazh-';

async function main() {
  const profiles = await db.photographerProfile.findMany({
    where: { username: { startsWith: PREFIX } },
    select: { id: true, userId: true },
  });
  if (profiles.length === 0) {
    console.log('Демо-профилей нет — чистить нечего.');
    return;
  }
  const profileIds = profiles.map((p) => p.id);
  const ownerIds = profiles.map((p) => p.userId);

  // Файлы: сначала собираем ключи, потом удаляем записи — иначе потеряем ссылки
  const photos = await db.photo.findMany({ where: { profileId: { in: profileIds } }, select: { storageKey: true } });
  const videos = await db.profileVideo.findMany({
    where: { profileId: { in: profileIds } },
    select: { storageKey: true, hdKey: true, sdKey: true, posterKey: true },
  });
  const avatars = await db.photographerProfile.findMany({
    where: { id: { in: profileIds }, avatarKey: { not: null } },
    select: { avatarKey: true },
  });

  // Заказчики, заведённые вместе с витриной (переписка, съёмки, отзывы)
  const clients = await db.user.findMany({
    where: { email: { endsWith: '@demo.local' } },
    select: { id: true },
  });
  const userIds = [...ownerIds, ...clients.map((c) => c.id)];

  await db.like.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { photo: { profileId: { in: profileIds } } }] } });
  await db.comment.deleteMany({ where: { OR: [{ authorUserId: { in: userIds } }, { photo: { profileId: { in: profileIds } } }] } });
  await db.review.deleteMany({ where: { OR: [{ authorUserId: { in: userIds } }, { profileId: { in: profileIds } }] } });
  await db.shootConfirmation.deleteMany({ where: { OR: [{ clientUserId: { in: userIds } }, { profileId: { in: profileIds } }] } });
  await db.message.deleteMany({ where: { OR: [{ senderId: { in: userIds } }, { recipientId: { in: userIds } }] } });
  await db.notification.deleteMany({ where: { userId: { in: userIds } } });
  await db.activityEvent.deleteMany({ where: { actorUserId: { in: userIds } } });
  await db.follow.deleteMany({ where: { OR: [{ followerId: { in: userIds } }, { followeeId: { in: userIds } }] } });
  await db.favoritePhotographer.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { profileId: { in: profileIds } }] } });
  await db.inquiry.deleteMany({ where: { clientUserId: { in: userIds } } });
  await db.subscription.deleteMany({ where: { userId: { in: userIds } } });
  await db.payment.deleteMany({ where: { userId: { in: userIds } } });

  await db.photographerProfile.updateMany({ where: { id: { in: profileIds } }, data: { coverPhotoId: null } });
  await db.photo.deleteMany({ where: { profileId: { in: profileIds } } });
  await db.story.deleteMany({ where: { profileId: { in: profileIds } } });
  await db.profileVideo.deleteMany({ where: { profileId: { in: profileIds } } });
  await db.profileCategoryScore.deleteMany({ where: { profileId: { in: profileIds } } });
  await db.profileCategory.deleteMany({ where: { profileId: { in: profileIds } } });
  await db.pricePackage.deleteMany({ where: { profileId: { in: profileIds } } });
  await db.busyDate.deleteMany({ where: { profileId: { in: profileIds } } });
  await db.travelPlan.deleteMany({ where: { profileId: { in: profileIds } } });
  await db.photographerProfile.deleteMany({ where: { id: { in: profileIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });

  // Хранилище чистим последним: осиротевший файл дешевле осиротевшей записи
  const keys = [
    ...photos.map((p) => p.storageKey),
    ...videos.flatMap((v) => videoStorageKeys(v)),
    ...avatars.map((a) => a.avatarKey).filter((k): k is string => Boolean(k)),
  ];
  let removed = 0;
  for (const key of keys) {
    try {
      await storage.delete(key);
      removed++;
    } catch {
      // Файла может уже не быть — это не повод прерывать чистку базы
    }
  }

  console.log(`Удалено демо-профилей: ${profileIds.length}, аккаунтов: ${userIds.length}, файлов: ${removed}/${keys.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
