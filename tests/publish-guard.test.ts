import { describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

/**
 * Ветка BLOCK_AFTER лестницы эскалации: систематическое злоупотребление
 * закрывает доступ, и делает это СИСТЕМА, а не администратор. RESTRICT-ступень
 * уже покрыта в tests/forum.test.ts — здесь то, что происходит на двенадцатом
 * отказе и после него.
 */
// Env-зависимость (правило c): нужен локальный PG
describe.skipIf(!hasDb)('лестница эскалации: авто-блокировка (БД)', () => {
  async function makeUser(tag: string, role: 'PHOTOGRAPHER' | 'ADMIN' = 'PHOTOGRAPHER') {
    const { db } = await import('@/lib/db');
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    return db.user.create({
      data: { role, status: 'ACTIVE', firstName: 'Гард', lastName: tag, email: `pg-${tag}-${stamp}@test.local` },
    });
  }

  async function cleanup(userId: string) {
    const { db } = await import('@/lib/db');
    // Notification — ДО user (FK RESTRICT); нарушения уйдут каскадом, но
    // убираем явно, чтобы тест не зависел от схемы удаления
    await db.notification.deleteMany({ where: { userId } });
    await db.contentViolation.deleteMany({ where: { userId } });
    await db.user.delete({ where: { id: userId } });
  }

  it('двенадцатое нарушение банит: статус, отзыв сессий, уведомление с путём назад', async () => {
    const { db } = await import('@/lib/db');
    const { recordViolation, BLOCK_AFTER } = await import('@/lib/publish-guard');
    const user = await makeUser('ban');

    try {
      for (let i = 0; i < BLOCK_AFTER - 1; i += 1) {
        await db.contentViolation.create({ data: { userId: user.id, kind: 'post', reason: 'contacts' } });
      }
      const count = await recordViolation(user.id, 'post', 'contacts');
      expect(count).toBe(BLOCK_AFTER);

      const after = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(after.status).toBe('BANNED');
      // Отзыв ЖИВЫХ сессий: без инкремента блокировка начала бы действовать
      // только со следующего входа, а вкладка спамера уже открыта
      expect(after.tokenVersion).toBe(user.tokenVersion + 1);

      const notes = await db.notification.findMany({
        where: { userId: user.id, type: 'notification.moderation.blocked' },
      });
      expect(notes).toHaveLength(1);
    } finally {
      await cleanup(user.id);
    }
  });

  it('повторное нарушение по уже забаненному не спамит: один бан, один инкремент, одно уведомление', async () => {
    const { db } = await import('@/lib/db');
    const { recordViolation, BLOCK_AFTER } = await import('@/lib/publish-guard');
    const user = await makeUser('idem');

    try {
      for (let i = 0; i < BLOCK_AFTER - 1; i += 1) {
        await db.contentViolation.create({ data: { userId: user.id, kind: 'post', reason: 'contacts' } });
      }
      await recordViolation(user.id, 'post', 'contacts');
      const banned = await db.user.findUniqueOrThrow({ where: { id: user.id } });

      // Гарды выше по стеку (assertCanPublish, гейт сессии) не пускают
      // забаненного к публикации, но recordViolation обязан быть безопасен и
      // при прямом повторном вызове — retry, гонка, второй поверхностный путь
      const count = await recordViolation(user.id, 'post', 'contacts');
      expect(count).toBe(BLOCK_AFTER + 1);

      const after = await db.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(after.status).toBe('BANNED');
      expect(after.tokenVersion).toBe(banned.tokenVersion);
      expect(
        await db.notification.count({ where: { userId: user.id, type: 'notification.moderation.blocked' } }),
      ).toBe(1);
    } finally {
      await cleanup(user.id);
    }
  });

  it('администратора эта ветка не банит', async () => {
    const { db } = await import('@/lib/db');
    const { recordViolation, BLOCK_AFTER } = await import('@/lib/publish-guard');
    const admin = await makeUser('adm', 'ADMIN');

    try {
      for (let i = 0; i < BLOCK_AFTER - 1; i += 1) {
        await db.contentViolation.create({ data: { userId: admin.id, kind: 'post', reason: 'contacts' } });
      }
      const count = await recordViolation(admin.id, 'post', 'contacts');
      expect(count).toBe(BLOCK_AFTER);

      const after = await db.user.findUniqueOrThrow({ where: { id: admin.id } });
      expect(after.status).toBe('ACTIVE');
      expect(after.tokenVersion).toBe(admin.tokenVersion);
      expect(
        await db.notification.count({ where: { userId: admin.id, type: 'notification.moderation.blocked' } }),
      ).toBe(0);
    } finally {
      await cleanup(admin.id);
    }
  });
});
