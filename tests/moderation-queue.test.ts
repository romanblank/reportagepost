import { describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

// Env-зависимость (правило c): нужен локальный PG
describe.skipIf(!hasDb)('очередь модерации к человеку (БД)', () => {
  async function makeUser(tag: string, role: 'PHOTOGRAPHER' | 'ADMIN' = 'PHOTOGRAPHER') {
    const { db } = await import('@/lib/db');
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    return db.user.create({
      data: { role, status: 'ACTIVE', firstName: 'Очередь', lastName: tag, email: `mq-${tag}-${stamp}@test.local` },
    });
  }

  // Комментарий обязан висеть на кадре или серии (XOR-CHECK в БД) — для
  // комментариев в очереди нужен настоящий кадр
  async function makePhotoFor(userId: string, tag: string) {
    const { db } = await import('@/lib/db');
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const cat = await db.category.findFirstOrThrow({ where: { slug: 'sports' } });
    const profile = await db.photographerProfile.create({
      data: { userId, username: `mq-${tag}-${stamp}`, cityId: city.id, status: 'APPROVED' },
    });
    return db.photo.create({
      data: { profileId: profile.id, categoryId: cat.id, storageKey: `photos/mq-${tag}-${stamp}/web.jpg`, width: 2400, height: 1600, status: 'APPROVED' },
    });
  }

  async function cleanupUsers(...userIds: string[]) {
    const { db } = await import('@/lib/db');
    await db.adminAudit.deleteMany({ where: { actorUserId: { in: userIds } } });
    await db.forumPost.deleteMany({ where: { authorUserId: { in: userIds } } });
    await db.forumThread.deleteMany({ where: { authorUserId: { in: userIds } } });
    await db.article.deleteMany({ where: { authorUserId: { in: userIds } } });
    await db.comment.deleteMany({ where: { authorUserId: { in: userIds } } });
    await db.photo.deleteMany({ where: { profile: { userId: { in: userIds } } } });
    await db.profileCategoryScore.deleteMany({ where: { profile: { userId: { in: userIds } } } });
    await db.photographerProfile.deleteMany({ where: { userId: { in: userIds } } });
    await db.notification.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  }

  // Соседние тестовые файлы идут параллельно и тоже пишут в базу, поэтому
  // утверждения фильтруют выдачу по СВОИМ id, а даты своих записей уводятся в
  // далёкое прошлое — так порядок «asc по createdAt» детерминирован
  const past = (minutes: number) => new Date(Date.UTC(2001, 0, 1, 0, minutes));

  it('очередь сводит все типы контента и ставит переотправленное вперёд', async () => {
    const { db } = await import('@/lib/db');
    const { moderationQueue } = await import('@/lib/moderation-queue');
    const author = await makeUser('mix');
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

    try {
      const thread = await db.forumThread.create({
        data: {
          sectionSlug: 'craft', authorUserId: author.id, title: 'Спорная тема про свет',
          slug: `mq-thread-${stamp}`, status: 'IN_REVIEW', reasonCode: 'contacts', reasonQuote: 'цитата',
          createdAt: past(1),
          posts: { create: { authorUserId: author.id, body: 'Первое сообщение спорной темы.', status: 'IN_REVIEW' } },
        },
      });
      const published = await db.forumThread.create({
        data: {
          sectionSlug: 'craft', authorUserId: author.id, title: 'Опубликованная тема-носитель',
          slug: `mq-host-${stamp}`, status: 'PUBLISHED', createdAt: past(0),
        },
      });
      const post = await db.forumPost.create({
        data: { threadId: published.id, authorUserId: author.id, body: 'Спорный ответ.', status: 'IN_REVIEW', createdAt: past(2) },
      });
      const article = await db.article.create({
        data: {
          authorUserId: author.id, title: 'Спорная статья', slug: `mq-article-${stamp}`,
          lead: 'Врезка статьи.', body: 'Тело статьи.', status: 'IN_REVIEW', createdAt: past(3),
        },
      });
      const photo = await makePhotoFor(author.id, 'mix');
      const comment = await db.comment.create({
        data: { authorUserId: author.id, photoId: photo.id, body: 'Спорный комментарий.', status: 'IN_REVIEW', createdAt: past(4) },
      });
      // Переотправленное СВЕЖЕЕ остальных — но обязано встать вперёд: человек
      // уже исправил текст и ждёт ответа
      const resubmitted = await db.forumThread.create({
        data: {
          sectionSlug: 'craft', authorUserId: author.id, title: 'Переотправленная тема после правки',
          slug: `mq-resub-${stamp}`, status: 'IN_REVIEW', resubmitted: true, createdAt: past(30),
          posts: { create: { authorUserId: author.id, body: 'Исправленный текст.', status: 'IN_REVIEW' } },
        },
      });

      const queue = await moderationQueue(500);
      const mineIds = new Set([thread.id, post.id, article.id, comment.id, resubmitted.id]);
      const mine = queue.filter((i) => mineIds.has(i.id));
      expect(mine.map((i) => i.kind).sort()).toEqual(['article', 'comment', 'post', 'thread', 'thread']);

      // Форма элементов: у темы тело — её первое сообщение, у ответа заголовок —
      // название темы, статья несёт врезку вместе с телом
      const tItem = mine.find((i) => i.id === thread.id)!;
      expect(tItem.body).toBe('Первое сообщение спорной темы.');
      expect(tItem.reasonCode).toBe('contacts');
      expect(tItem.reasonQuote).toBe('цитата');
      const pItem = mine.find((i) => i.id === post.id)!;
      expect(pItem.title).toBe('Опубликованная тема-носитель');
      const aItem = mine.find((i) => i.id === article.id)!;
      expect(aItem.body).toContain('Врезка статьи.');
      expect(aItem.body).toContain('Тело статьи.');
      const cItem = mine.find((i) => i.id === comment.id)!;
      expect(cItem.reasonCode).toBeNull();
      expect(cItem.authorName).toContain('Очередь');

      // Опубликованная тема-носитель в очереди не показывается
      expect(queue.some((i) => i.id === published.id && i.kind === 'thread')).toBe(false);
      // Переотправленное — раньше всех непереотправленных, несмотря на дату
      const resubIdx = mine.findIndex((i) => i.id === resubmitted.id);
      expect(resubIdx).toBe(0);
      // Остальные — по возрастанию даты
      const rest = mine.slice(1);
      for (let i = 1; i < rest.length; i += 1) {
        expect(rest[i - 1].createdAt.getTime()).toBeLessThanOrEqual(rest[i].createdAt.getTime());
      }
    } finally {
      await cleanupUsers(author.id);
    }
  });

  it('лимит очереди действует, и берётся старейшее', async () => {
    const { db } = await import('@/lib/db');
    const { moderationQueue } = await import('@/lib/moderation-queue');
    const author = await makeUser('limit');

    try {
      const photo = await makePhotoFor(author.id, 'limit');
      const c1 = await db.comment.create({ data: { authorUserId: author.id, photoId: photo.id, body: 'Старейший.', status: 'IN_REVIEW', createdAt: past(1) } });
      const c2 = await db.comment.create({ data: { authorUserId: author.id, photoId: photo.id, body: 'Второй.', status: 'IN_REVIEW', createdAt: past(2) } });
      const c3 = await db.comment.create({ data: { authorUserId: author.id, photoId: photo.id, body: 'Свежий.', status: 'IN_REVIEW', createdAt: past(3) } });

      const queue = await moderationQueue(2);
      // Лимит на каждый тип: суммарно не больше 4 типов × 2
      expect(queue.length).toBeLessThanOrEqual(8);
      const ids = new Set(queue.map((i) => i.id));
      // Даты 2001 года — старейшие в базе, поэтому первые два наших комментария
      // обязаны попасть в срез, а третий — уступить место
      expect(ids.has(c1.id)).toBe(true);
      expect(ids.has(c2.id)).toBe(true);
      expect(ids.has(c3.id)).toBe(false);
    } finally {
      await cleanupUsers(author.id);
    }
  });

  it('публикация темы из очереди: тема с первым сообщением, счётчик, чистая причина, аудит', async () => {
    const { db } = await import('@/lib/db');
    const { decideForumItem } = await import('@/lib/moderation-queue');
    const author = await makeUser('tpub');
    const admin = await makeUser('tpub-adm', 'ADMIN');
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

    try {
      const thread = await db.forumThread.create({
        data: {
          sectionSlug: 'craft', authorUserId: author.id, title: 'Тема на решении человека',
          slug: `mq-dec-${stamp}`, status: 'IN_REVIEW', reasonCode: 'contacts', reasonQuote: 'цитата',
          resubmitted: true, postCount: 0,
          posts: { create: { authorUserId: author.id, body: 'Текст первого сообщения.', status: 'IN_REVIEW', reasonCode: 'contacts' } },
        },
      });

      await decideForumItem(admin.id, 'thread', thread.id, true, '');

      const after = await db.forumThread.findUniqueOrThrow({ where: { id: thread.id }, include: { posts: true } });
      expect(after.status).toBe('PUBLISHED');
      // Опубликованная тема без текста выглядит как поломка: первое сообщение
      // обязано выйти вместе с ней, и счётчик обязан его знать
      expect(after.posts).toHaveLength(1);
      expect(after.posts[0].status).toBe('PUBLISHED');
      expect(after.postCount).toBe(1);
      // Причина отказа не должна пережить оправдание
      expect(after.reasonCode).toBeNull();
      expect(after.reasonQuote).toBeNull();
      expect(after.resubmitted).toBe(false);

      const audit = await db.adminAudit.findMany({ where: { actorUserId: admin.id, targetType: 'FORUM_THREAD', targetId: thread.id } });
      expect(audit).toHaveLength(1);
      expect(audit[0].action).toBe('forum.publish');
    } finally {
      await cleanupUsers(author.id, admin.id);
    }
  });

  it('отказ по теме: статус, причина, первое сообщение тоже снято, аудит', async () => {
    const { db } = await import('@/lib/db');
    const { decideForumItem } = await import('@/lib/moderation-queue');
    const author = await makeUser('trej');
    const admin = await makeUser('trej-adm', 'ADMIN');
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

    try {
      const thread = await db.forumThread.create({
        data: {
          sectionSlug: 'craft', authorUserId: author.id, title: 'Тема, которую человек отклонит',
          slug: `mq-rej-${stamp}`, status: 'IN_REVIEW', postCount: 0,
          posts: { create: { authorUserId: author.id, body: 'Текст, признанный негодным.', status: 'IN_REVIEW' } },
        },
      });

      await decideForumItem(admin.id, 'thread', thread.id, false, 'contacts');

      const after = await db.forumThread.findUniqueOrThrow({ where: { id: thread.id }, include: { posts: true } });
      expect(after.status).toBe('REJECTED');
      expect(after.reasonCode).toBe('contacts');
      expect(after.postCount).toBe(0);
      expect(after.posts[0].status).toBe('REJECTED');
      expect(after.posts[0].reasonCode).toBe('contacts');

      const audit = await db.adminAudit.findMany({ where: { actorUserId: admin.id, targetType: 'FORUM_THREAD', targetId: thread.id } });
      expect(audit).toHaveLength(1);
      expect(audit[0].action).toBe('forum.reject');
    } finally {
      await cleanupUsers(author.id, admin.id);
    }
  });

  it('публикация ответа поднимает тему: счётчик и lastPostAt; отказ — не поднимает', async () => {
    const { db } = await import('@/lib/db');
    const { decideForumItem } = await import('@/lib/moderation-queue');
    const author = await makeUser('ppub');
    const admin = await makeUser('ppub-adm', 'ADMIN');
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

    try {
      const oldDate = past(10);
      const thread = await db.forumThread.create({
        data: {
          sectionSlug: 'craft', authorUserId: author.id, title: 'Тема с ответами на модерации',
          slug: `mq-post-${stamp}`, status: 'PUBLISHED', postCount: 1, lastPostAt: oldDate,
          posts: { create: { authorUserId: author.id, body: 'Первое сообщение.', status: 'PUBLISHED' } },
        },
      });
      const good = await db.forumPost.create({
        data: { threadId: thread.id, authorUserId: author.id, body: 'Спорный, но годный ответ.', status: 'IN_REVIEW', reasonCode: 'contacts', reasonQuote: 'цитата', resubmitted: true },
      });
      const bad = await db.forumPost.create({
        data: { threadId: thread.id, authorUserId: author.id, body: 'Спорный и негодный ответ.', status: 'IN_REVIEW' },
      });

      await decideForumItem(admin.id, 'post', good.id, true, '');
      const afterPub = await db.forumThread.findUniqueOrThrow({ where: { id: thread.id } });
      const goodAfter = await db.forumPost.findUniqueOrThrow({ where: { id: good.id } });
      expect(goodAfter.status).toBe('PUBLISHED');
      expect(goodAfter.reasonCode).toBeNull();
      expect(goodAfter.reasonQuote).toBeNull();
      expect(goodAfter.resubmitted).toBe(false);
      // Тот же баг-класс, что у темы: выпущенный ответ обязан существовать для
      // счётчика и для сортировки раздела
      expect(afterPub.postCount).toBe(2);
      expect(afterPub.lastPostAt.getTime()).toBeGreaterThan(oldDate.getTime());

      await decideForumItem(admin.id, 'post', bad.id, false, 'spam');
      const afterRej = await db.forumThread.findUniqueOrThrow({ where: { id: thread.id } });
      const badAfter = await db.forumPost.findUniqueOrThrow({ where: { id: bad.id } });
      expect(badAfter.status).toBe('REJECTED');
      expect(badAfter.reasonCode).toBe('spam');
      // Отклонённое не двигает ни счётчик, ни тему
      expect(afterRej.postCount).toBe(2);
      expect(afterRej.lastPostAt.getTime()).toBe(afterPub.lastPostAt.getTime());

      const audit = await db.adminAudit.findMany({ where: { actorUserId: admin.id, targetType: 'FORUM_POST' }, orderBy: { createdAt: 'asc' } });
      expect(audit.map((a) => a.action)).toEqual(['forum.publish', 'forum.reject']);
    } finally {
      await cleanupUsers(author.id, admin.id);
    }
  });

  it('решение по несуществующему id — честный 404, а не молчаливый успех', async () => {
    const { decideForumItem, decideComment } = await import('@/lib/moderation-queue');
    const admin = await makeUser('gone-adm', 'ADMIN');
    try {
      await expect(decideForumItem(admin.id, 'thread', 'no-such-thread', true, '')).rejects.toMatchObject({ status: 404 });
      await expect(decideForumItem(admin.id, 'post', 'no-such-post', false, 'spam')).rejects.toMatchObject({ status: 404 });
      await expect(decideComment(admin.id, 'no-such-comment', true)).rejects.toMatchObject({ status: 404 });
    } finally {
      await cleanupUsers(admin.id);
    }
  });

  it('решение по комментарию: VISIBLE или HIDDEN, каждое — с аудит-записью', async () => {
    const { db } = await import('@/lib/db');
    const { decideComment } = await import('@/lib/moderation-queue');
    const author = await makeUser('cmnt');
    const admin = await makeUser('cmnt-adm', 'ADMIN');

    try {
      const photo = await makePhotoFor(author.id, 'cmnt');
      const ok = await db.comment.create({ data: { authorUserId: author.id, photoId: photo.id, body: 'Годный комментарий.', status: 'IN_REVIEW' } });
      const badOne = await db.comment.create({ data: { authorUserId: author.id, photoId: photo.id, body: 'Негодный комментарий.', status: 'IN_REVIEW' } });

      await decideComment(admin.id, ok.id, true);
      await decideComment(admin.id, badOne.id, false);

      expect((await db.comment.findUniqueOrThrow({ where: { id: ok.id } })).status).toBe('VISIBLE');
      expect((await db.comment.findUniqueOrThrow({ where: { id: badOne.id } })).status).toBe('HIDDEN');

      const audit = await db.adminAudit.findMany({ where: { actorUserId: admin.id, targetType: 'COMMENT' } });
      expect(audit.map((a) => [a.action, a.targetId]).sort()).toEqual(
        [['comment.hide', badOne.id], ['comment.publish', ok.id]].sort(),
      );
    } finally {
      await cleanupUsers(author.id, admin.id);
    }
  });
});
