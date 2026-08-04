import { describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

/**
 * Инварианты, которые нельзя оставлять только в коде.
 *
 * Guard в приложении защищает от ошибки в одном месте. CHECK защищает от
 * ошибки в ЛЮБОМ будущем коде, в скрипте и в ручном SQL — а правка базы руками
 * в этом проекте уже случалась. Оценка отзыва и сумма платежа выбраны не
 * случайно: неверное значение там не роняет ничего, а молча искажает публичный
 * рейтинг и бухгалтерию.
 */
describe.skipIf(!hasDb)('ограничения целостности на уровне базы (БД)', () => {
  it('оценку вне диапазона 1..5 база не принимает', async () => {
    const { db } = await import('@/lib/db');
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const author = await db.user.create({
      data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'О', lastName: 'Ц', email: `chk-${stamp}@test.local` },
    });
    const owner = await db.user.create({
      data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Ф', lastName: 'Т', email: `chk2-${stamp}@test.local` },
    });
    const profile = await db.photographerProfile.create({
      data: { userId: owner.id, username: `chk-${stamp}`, cityId: city.id, status: 'APPROVED' },
    });

    try {
      // Мимо прикладного guard — напрямую в базу, как это сделал бы скрипт
      await expect(
        db.review.create({ data: { authorUserId: author.id, profileId: profile.id, rating: 0, body: 'ноль' } }),
      ).rejects.toThrow();
      await expect(
        db.review.create({ data: { authorUserId: author.id, profileId: profile.id, rating: 9, body: 'девять' } }),
      ).rejects.toThrow();

      // Допустимая оценка проходит
      const ok = await db.review.create({
        data: { authorUserId: author.id, profileId: profile.id, rating: 5, body: 'нормальный отзыв' },
      });
      await db.review.delete({ where: { id: ok.id } });
    } finally {
      await db.review.deleteMany({ where: { profileId: profile.id } });
      await db.photographerProfile.delete({ where: { id: profile.id } });
      await db.user.deleteMany({ where: { id: { in: [author.id, owner.id] } } });
    }
  });

  it('платёж с нулевой или отрицательной суммой невозможен', async () => {
    const { db } = await import('@/lib/db');
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const user = await db.user.create({
      data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'П', lastName: 'Л', email: `pay-${stamp}@test.local` },
    });
    try {
      await expect(
        db.payment.create({
          data: { userId: user.id, orderId: `o-${stamp}`, amountMinor: 0, currency: 'RUB', tier: 'PRIME' },
        }),
      ).rejects.toThrow();
      await expect(
        db.payment.create({
          data: { userId: user.id, orderId: `o2-${stamp}`, amountMinor: -100, currency: 'RUB', tier: 'PRIME' },
        }),
      ).rejects.toThrow();
    } finally {
      await db.payment.deleteMany({ where: { userId: user.id } });
      await db.user.delete({ where: { id: user.id } });
    }
  });
});
