// Инструмент оператора: сброс пароля (запуск на проде через Actions).
// Использование: npx tsx scripts/reset-password.ts user@example.com
// Пароль НЕ печатается в лог (урок аудита 2026-07-14): выводится только в файл
// с правами 0600 на VM; оператор читает его по ssh и удаляет.
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

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
  const newPassword = randomBytes(9).toString('base64url');
  await db.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await hashPassword(newPassword),
      passwordChangedAt: new Date(),
      tokenVersion: { increment: 1 }, // отзыв всех старых сессий
    },
  });

  const outPath = `/tmp/rp-reset-${user.id}.txt`;
  writeFileSync(outPath, `${email}\n${newPassword}\n`, { mode: 0o600 });
  console.log(`Пароль сброшен для ${email}. Значение записано в ${outPath} (0600) на VM.`);
  console.log(`Прочитать и удалить:  cat ${outPath} && rm ${outPath}`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
