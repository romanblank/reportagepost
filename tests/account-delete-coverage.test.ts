import { describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

/**
 * Удаление аккаунта ломалось трижды, и каждый раз одинаково: появлялась новая
 * таблица со ссылкой на User и связью ON DELETE RESTRICT, а `deleteAccount`
 * про неё не знал. Обычные тесты этого не ловят — они создают ровно те записи,
 * о которых автор теста помнил.
 *
 * Здесь проверка идёт от СХЕМЫ, а не от воображения: перебираем все связи
 * User по метаданным Prisma и требуем, чтобы каждая была либо разорвана
 * (SetNull/Cascade на уровне БД), либо явно обработана в `deleteAccount`.
 * Новая таблица со ссылкой на пользователя провалит этот тест сразу.
 */
describe.skipIf(!hasDb)('удаление аккаунта: покрыты все связи пользователя (БД)', () => {
  it('каждая ссылка на User либо разрывается схемой, либо обрабатывается кодом', async () => {
    const { db } = await import('@/lib/db');
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');

    // Кто ссылается на User и с каким поведением при удалении — спрашиваем у самой базы
    const rows = await db.$queryRaw<{ table_name: string; column_name: string; delete_rule: string }[]>`
      SELECT tc.table_name::text, kcu.column_name::text, rc.delete_rule::text
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
      JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'User'
    `;
    expect(rows.length).toBeGreaterThan(5); // связи точно есть — запрос не пустой по ошибке

    const source = readFileSync(path.join(process.cwd(), 'src/lib/account.ts'), 'utf8');
    const missing: string[] = [];

    for (const row of rows) {
      // База сама разрывает связь — код может о ней не знать
      if (row.delete_rule === 'CASCADE' || row.delete_rule === 'SET NULL') continue;

      // Иначе таблица обязана упоминаться в deleteAccount: либо удалением
      // строк, либо обезличиванием (updateMany с обнулением ссылки)
      const model = row.table_name.charAt(0).toLowerCase() + row.table_name.slice(1);
      const mentioned = source.includes(`tx.${model}.`) || source.includes(`db.${model}.`);
      if (!mentioned) missing.push(`${row.table_name}.${row.column_name} (${row.delete_rule})`);
    }

    expect(
      missing,
      `эти связи заблокируют удаление аккаунта — обработайте их в src/lib/account.ts:\n${missing.join('\n')}`,
    ).toEqual([]);
  });

  it('пользователь с токеном подтверждения почты и блокировкой удаляется', async () => {
    const { db } = await import('@/lib/db');
    const { deleteAccount } = await import('@/lib/account');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const me = await db.user.create({
      data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'У', lastName: 'Д', email: `acc-${stamp}@test.local` },
    });
    const other = await db.user.create({
      data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'Д', lastName: 'Р', email: `acc2-${stamp}@test.local` },
    });

    // Ровно те записи, из-за которых удаление падало: токен живёт двое суток
    // после регистрации, блокировка — навсегда
    await db.emailVerification.create({
      data: { userId: me.id, email: me.email!, tokenHash: 'a'.repeat(64), expiresAt: new Date(Date.now() + 3_600_000) },
    });
    await db.userBlock.create({ data: { blockerId: me.id, blockedId: other.id } });
    // И жалоба со свободным текстом — её содержимое не должно пережить владельца
    await db.report.create({
      data: { reporterId: me.id, targetType: 'USER', targetId: other.id, reason: 'SPAM', comment: 'мой телефон +79990001122', contactEmail: `acc-${stamp}@test.local` },
    });

    await expect(deleteAccount(me.id)).resolves.toBeUndefined();
    expect(await db.user.findUnique({ where: { id: me.id } })).toBeNull();

    const report = await db.report.findFirst({ where: { targetId: other.id } });
    expect(report?.comment, 'свободный текст жалобы пережил удаление автора').toBeNull();
    expect(report?.contactEmail).toBeNull();

    await db.report.deleteMany({ where: { targetId: other.id } });
    await db.user.delete({ where: { id: other.id } });
  });
});
