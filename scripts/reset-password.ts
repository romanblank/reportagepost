// Инструмент оператора: сброс пароля пользователя (запуск на проде через Actions).
// Использование: npx tsx scripts/reset-password.ts user@example.com
import 'dotenv/config';
import { randomBytes } from 'node:crypto';

async function main() {
  const email = process.argv[2]?.toLowerCase();
  if (!email) {
    console.error('Использование: reset-password.ts <email>');
    process.exit(1);
  }
  const { db } = await import('../src/lib/db');
  const { hashPassword } = await import('../src/lib/auth');

  const user = await db.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`Пользователь ${email} не найден`);
    process.exit(1);
  }
  const newPassword = randomBytes(9).toString('base64url'); // 12 символов
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword) },
  });
  console.log(`Новый пароль для ${email}: ${newPassword}`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
