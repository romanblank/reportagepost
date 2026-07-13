// Инструмент оператора: создание/повышение админа.
// Запуск: npx tsx scripts/create-admin.ts admin@example.com "пароль" Имя Фамилия
import 'dotenv/config';

async function main() {
  const [email, password, firstName = 'Admin', lastName = 'Admin'] = process.argv.slice(2);
  if (!email || !password || password.length < 10) {
    console.error('Использование: create-admin.ts <email> <пароль ≥10 симв.> [Имя] [Фамилия]');
    process.exit(1);
  }

  const { db } = await import('../src/lib/db');
  const { hashPassword } = await import('../src/lib/auth');

  const passwordHash = await hashPassword(password);
  const admin = await db.user.upsert({
    where: { email: email.toLowerCase() },
    update: { role: 'ADMIN', status: 'ACTIVE', passwordHash },
    create: {
      role: 'ADMIN',
      status: 'ACTIVE',
      email: email.toLowerCase(),
      firstName,
      lastName,
      passwordHash,
    },
  });
  console.log(`Админ готов: ${admin.email} (id ${admin.id})`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
