// Повышение существующего пользователя до ADMIN (без работы с паролем — юзер
// уже зарегистрирован через сайт). Запуск на проде через Actions.
// Использование: npx tsx scripts/promote-admin.ts user@example.com
import 'dotenv/config';

async function main() {
  const email = process.argv[2]?.toLowerCase();
  if (!email) {
    console.error('Использование: promote-admin.ts <email>');
    process.exit(1);
  }
  const { db } = await import('../src/lib/db');
  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`Пользователь ${email} не найден — сначала зарегистрируйтесь на сайте`);
    process.exit(1);
  }
  await db.user.update({
    where: { id: user.id },
    data: { role: 'ADMIN', status: 'ACTIVE', tokenVersion: { increment: 1 } },
  });
  console.log(`${email} повышен до ADMIN. Перезайдите (старая сессия отозвана).`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
