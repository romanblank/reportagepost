// Инструмент оператора: создание инвайт-кода (закрытость до S4).
// Запуск: npx tsx scripts/create-invite.ts "для амбассадора" [maxUses]
import 'dotenv/config';
import { randomBytes } from 'node:crypto';

async function main() {
  const { db } = await import('../src/lib/db');
  const note = process.argv[2] ?? null;
  const maxUses = Number(process.argv[3] ?? 1);
  if (!Number.isInteger(maxUses) || maxUses < 1) {
    console.error('maxUses должен быть целым ≥ 1');
    process.exit(1);
  }

  const code = randomBytes(8).toString('base64url'); // ~11 символов, URL-safe
  const invite = await db.inviteCode.create({ data: { code, note, maxUses } });
  console.log(`Инвайт создан: ${invite.code} (использований: ${maxUses}${note ? `, для: ${note}` : ''})`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
