// Удаление тестовых аккаунтов (qa-*, diag*, *@test.local) и их каскада.
// Запуск на проде через Actions. НЕ трогает реальных пользователей.
import 'dotenv/config';

async function main() {
  const { db } = await import('../src/lib/db');

  const testUsers = await db.user.findMany({
    where: {
      OR: [
        { email: { endsWith: '@test.local' } },
        { email: { startsWith: 'qa-' } },
      ],
    },
    include: { profile: true },
  });
  const userIds = testUsers.map((u) => u.id);
  const profileIds = testUsers.map((u) => u.profile?.id).filter((x): x is string => Boolean(x));

  if (userIds.length === 0) {
    console.log('Тестовых аккаунтов не найдено.');
    await db.$disconnect();
    return;
  }

  // Каскад в порядке зависимостей
  await db.activityEvent.deleteMany({ where: { actorUserId: { in: userIds } } });
  await db.like.deleteMany({ where: { userId: { in: userIds } } });
  await db.follow.deleteMany({ where: { OR: [{ followerId: { in: userIds } }, { followeeId: { in: userIds } }] } });
  await db.favoritePhotographer.deleteMany({ where: { userId: { in: userIds } } });
  await db.notification.deleteMany({ where: { userId: { in: userIds } } });
  await db.message.deleteMany({ where: { OR: [{ senderId: { in: userIds } }, { recipientId: { in: userIds } }] } });
  await db.inquiry.deleteMany({ where: { clientUserId: { in: userIds } } });
  await db.phoneVerification.deleteMany({ where: { userId: { in: userIds } } });
  for (const pid of profileIds) {
    await db.like.deleteMany({ where: { photo: { profileId: pid } } });
    await db.story.deleteMany({ where: { profileId: pid } });
    await db.photo.deleteMany({ where: { profileId: pid } });
    await db.profileCategory.deleteMany({ where: { profileId: pid } });
    await db.busyDate.deleteMany({ where: { profileId: pid } });
    await db.travelPlan.deleteMany({ where: { profileId: pid } });
    await db.pricePackage.deleteMany({ where: { profileId: pid } });
    await db.favoritePhotographer.deleteMany({ where: { profileId: pid } });
  }
  await db.photographerProfile.deleteMany({ where: { id: { in: profileIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });

  console.log(`Удалено тестовых аккаунтов: ${userIds.length}, профилей: ${profileIds.length}`);
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
