import { describe, expect, it, vi } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

/**
 * Сквозной путь модерации контента: автор пишет тему → автомат не уверен →
 * тема ждёт человека в очереди → решение админа публикует её в раздел (или
 * отклоняет с причиной).
 *
 * Спорный вердикт («review») в живом коде рождает только модель, а в тестовой
 * среде ключа модели нет и moderateText всегда отвечает по программным
 * правилам. Поэтому подменяется РОВНО вердикт — весь остальной путь (создание,
 * статусы, очередь, решение, видимость в разделе) настоящий.
 */
const verdictRef = vi.hoisted(() => ({
  v: null as null | { action: 'review'; reason: 'hidden_ad'; quote: string | null },
}));

vi.mock('@/lib/text-moderation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/text-moderation')>();
  return {
    ...actual,
    moderateText: async (input: Parameters<typeof actual.moderateText>[0]) =>
      verdictRef.v ?? actual.moderateText(input),
  };
});

describe.skipIf(!hasDb)('E2E: спорная тема проходит через человека', () => {
  it('IN_REVIEW → очередь → публикация видна в разделе, отказ — нет', async () => {
    const { db } = await import('@/lib/db');
    const { createThread, threadsInSection, threadBySlug } = await import('@/lib/forum');
    const { moderationQueue, decideForumItem } = await import('@/lib/moderation-queue');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const author = await db.user.create({
      data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Спорный', lastName: 'Автор', email: `mode2e-${stamp}@test.local` },
    });
    const profile = await db.photographerProfile.create({
      data: { userId: author.id, username: `mode2e-${stamp}`, cityId: city.id, status: 'APPROVED' },
    });
    const admin = await db.user.create({
      data: { role: 'ADMIN', status: 'ACTIVE', firstName: 'Ад', lastName: 'Мин', email: `mode2e-adm-${stamp}@test.local` },
    });

    try {
      verdictRef.v = { action: 'review', reason: 'hidden_ad', quote: 'спорный фрагмент' };

      // --- Ветка публикации ---
      const out = await createThread(author.id, {
        sectionSlug: 'craft',
        title: 'Тема, в которой автомат не уверен',
        body: 'Достаточно длинный текст первого сообщения, к которому у модели есть сомнение, но не уверенность.',
      });
      expect(out.status).toBe('IN_REVIEW');

      // Спорное не публикуется и не отказывается: его нет ни в разделе, ни по
      // прямой ссылке — но и нарушение автору не записано
      expect((await threadsInSection('craft', 500)).some((t) => t.id === out.id)).toBe(false);
      expect(await threadBySlug(out.slug!)).toBeNull();
      expect(await db.contentViolation.count({ where: { userId: author.id } })).toBe(0);

      // Админ видит тему в очереди вместе с текстом первого сообщения
      const queue = await moderationQueue(500);
      const item = queue.find((i) => i.kind === 'thread' && i.id === out.id);
      expect(item).toBeTruthy();
      expect(item!.body).toContain('Достаточно длинный текст первого сообщения');
      expect(item!.reasonCode).toBe('hidden_ad');

      await decideForumItem(admin.id, 'thread', out.id, true, '');

      // Опубликованная тема существует для читателя: раздел, прямая ссылка,
      // первое сообщение при ней
      expect((await threadsInSection('craft', 500)).some((t) => t.id === out.id)).toBe(true);
      const view = await threadBySlug(out.slug!);
      expect(view?.posts).toHaveLength(1);
      expect(view?.posts[0].body).toContain('Достаточно длинный текст');
      const published = await db.forumThread.findUniqueOrThrow({ where: { id: out.id } });
      expect(published.postCount).toBe(1);
      expect(published.reasonCode).toBeNull();
      // И из очереди она ушла
      expect((await moderationQueue(500)).some((i) => i.id === out.id)).toBe(false);

      // --- Ветка отказа ---
      const bad = await createThread(author.id, {
        sectionSlug: 'craft',
        title: 'Вторая спорная тема, которую человек отклонит',
        body: 'Ещё один достаточно длинный текст, по которому автомат снова не уверен и зовёт человека.',
      });
      expect(bad.status).toBe('IN_REVIEW');

      await decideForumItem(admin.id, 'thread', bad.id, false, 'hidden_ad');

      expect((await threadsInSection('craft', 500)).some((t) => t.id === bad.id)).toBe(false);
      expect(await threadBySlug(bad.slug!)).toBeNull();
      const rejected = await db.forumThread.findUniqueOrThrow({ where: { id: bad.id } });
      expect(rejected.status).toBe('REJECTED');
      expect(rejected.reasonCode).toBe('hidden_ad');
      expect((await moderationQueue(500)).some((i) => i.id === bad.id)).toBe(false);

      // Оба решения оставили аудит-след
      const audit = await db.adminAudit.findMany({ where: { actorUserId: admin.id, targetType: 'FORUM_THREAD' } });
      expect(audit.map((a) => a.action).sort()).toEqual(['forum.publish', 'forum.reject']);
    } finally {
      verdictRef.v = null;
      await db.adminAudit.deleteMany({ where: { actorUserId: admin.id } });
      await db.forumSubscription.deleteMany({ where: { userId: author.id } });
      await db.forumPost.deleteMany({ where: { authorUserId: author.id } });
      await db.forumThread.deleteMany({ where: { authorUserId: author.id } });
      await db.notification.deleteMany({ where: { userId: { in: [author.id, admin.id] } } });
      await db.contentViolation.deleteMany({ where: { userId: author.id } });
      await db.profileCategoryScore.deleteMany({ where: { profileId: profile.id } });
      await db.photographerProfile.delete({ where: { id: profile.id } });
      await db.user.deleteMany({ where: { id: { in: [author.id, admin.id] } } });
    }
  });
});
