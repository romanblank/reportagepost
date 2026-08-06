import 'dotenv/config';

// Общая уборка после прогона (аудит 2026-08-01, P1).
//
// Проблема: чистка написана инлайном в конце каждого it(). Первое же падение —
// и данные остаются навсегда: в dev-базе накопилось 149 зомби-пользователей из
// 175 (85% мусора), они замедляют прогоны, искажают ручные проверки и делают
// «в моей базе уже есть фотограф» источником зелёных локально / красных в CI.
//
// Решение — не переписывать три десятка файлов, а подмести за всеми разом.
// Маркер: тестовые аккаунты создаются с адресом на @test.local, реальных таких
// не бывает. Удаляем ТОЛЬКО их и связанное с ними; продовые и сид-данные не
// затрагиваются. Идемпотентно и безопасно повторять.
//
// Порядок удаления — от листьев к корню, иначе FK-ограничения не дадут удалить.

const TEST_EMAIL = '%@test.local';

export async function teardown(): Promise<void> {
  // Файлы, записанные фото/аватар-пайплайном, тоже за собой убираем: раньше
  // они копились в .uploads бесконечно (аудит 2026-08-01, P2).
  const { rm } = await import('node:fs/promises');
  await rm('.uploads-test', { recursive: true, force: true }).catch(() => {});

  if (!process.env.DATABASE_URL) return; // без БД тесты и так пропускались

  const { db } = await import('@/lib/db');

  const users = await db.user.findMany({
    where: { email: { endsWith: '@test.local' } },
    select: { id: true },
  });
  if (users.length === 0) return;
  const ids = users.map((u) => u.id);

  const profiles = await db.photographerProfile.findMany({
    where: { userId: { in: ids } },
    select: { id: true },
  });
  const profileIds = profiles.map((p) => p.id);

  // Листья: всё, что ссылается на пользователей и их профили
  await db.like.deleteMany({ where: { OR: [{ userId: { in: ids } }, { photo: { profileId: { in: profileIds } } }] } });
  await db.comment.deleteMany({ where: { OR: [{ authorUserId: { in: ids } }, { photo: { profileId: { in: profileIds } } }] } });
  await db.review.deleteMany({ where: { OR: [{ authorUserId: { in: ids } }, { profileId: { in: profileIds } }] } });
  await db.shootConfirmation.deleteMany({ where: { OR: [{ clientUserId: { in: ids } }, { profileId: { in: profileIds } }] } });
  await db.report.deleteMany({ where: { reporterId: { in: ids } } });
  await db.userBlock.deleteMany({ where: { OR: [{ blockerId: { in: ids } }, { blockedId: { in: ids } }] } });
  await db.message.deleteMany({ where: { OR: [{ senderId: { in: ids } }, { recipientId: { in: ids } }] } });
  await db.notification.deleteMany({ where: { userId: { in: ids } } });
  await db.activityEvent.deleteMany({ where: { actorUserId: { in: ids } } });
  await db.follow.deleteMany({ where: { OR: [{ followerId: { in: ids } }, { followeeId: { in: ids } }] } });
  await db.favoritePhotographer.deleteMany({ where: { OR: [{ userId: { in: ids } }, { profileId: { in: profileIds } }] } });
  await db.inquiry.deleteMany({ where: { clientUserId: { in: ids } } });
  await db.adminAudit.deleteMany({ where: { actorUserId: { in: ids } } });
  await db.passwordReset.deleteMany({ where: { userId: { in: ids } } });
  await db.emailVerification.deleteMany({ where: { userId: { in: ids } } });
  await db.phoneVerification.deleteMany({ where: { userId: { in: ids } } });
  await db.recoveryCode.deleteMany({ where: { userId: { in: ids } } });
  await db.payment.deleteMany({ where: { userId: { in: ids } } });
  await db.subscription.deleteMany({ where: { userId: { in: ids } } });

  // Форум и журнал: связи на User — RESTRICT, поэтому забытая тема не даёт
  // удалить тестовый аккаунт и роняет уборку целиком (тот же класс, что трижды
  // ломал удаление аккаунта). Сообщения снимаем и свои, и чужие в своих темах
  const ownThreads = (await db.forumThread.findMany({
    where: { authorUserId: { in: ids } },
    select: { id: true },
  })).map((t) => t.id);
  await db.forumSubscription.deleteMany({
    where: { OR: [{ userId: { in: ids } }, { threadId: { in: ownThreads } }] },
  });
  await db.forumPost.deleteMany({
    where: { OR: [{ authorUserId: { in: ids } }, { threadId: { in: ownThreads } }] },
  });
  await db.forumThread.deleteMany({ where: { id: { in: ownThreads } } });
  await db.article.deleteMany({ where: { authorUserId: { in: ids } } });
  await db.contentViolation.deleteMany({ where: { userId: { in: ids } } });

  // Содержимое профилей
  if (profileIds.length > 0) {
    await db.photo.deleteMany({ where: { profileId: { in: profileIds } } });
    await db.story.deleteMany({ where: { profileId: { in: profileIds } } });
    await db.profileVideo.deleteMany({ where: { profileId: { in: profileIds } } });
    await db.profileCategoryScore.deleteMany({ where: { profileId: { in: profileIds } } });
    await db.profileCategory.deleteMany({ where: { profileId: { in: profileIds } } });
    await db.pricePackage.deleteMany({ where: { profileId: { in: profileIds } } });
    await db.busyDate.deleteMany({ where: { profileId: { in: profileIds } } });
    await db.travelPlan.deleteMany({ where: { profileId: { in: profileIds } } });
    await db.photographerProfile.deleteMany({ where: { id: { in: profileIds } } });
  }

  const { count } = await db.user.deleteMany({ where: { email: { endsWith: '@test.local' } } });

  // Служебные строки, оставленные тестами лимитов и алертов
  await db.rateLimit.deleteMany({ where: { OR: [{ key: { startsWith: 'test-rl' } }, { key: { startsWith: 'err:' } }, { key: { startsWith: 'phrev:' } }] } });

  if (count > 0) console.log(`[teardown] убрано тестовых аккаунтов: ${count}, профилей: ${profileIds.length}`);
}

// Vitest ждёт ИМЕНОВАННЫЕ setup/teardown в globalSetup-файле (дефолтный
// экспорт он вызывает как setup, а teardown при этом не находит — уборка
// молча не выполнялась).
export function setup(): void {
  void TEST_EMAIL;
}
