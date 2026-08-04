import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';
import { rateLimit } from '@/lib/rate-limit';
import { slugifyWithId } from '@/lib/slugify';
import { isForumSection } from '@/lib/forum-sections';
import { moderateText, MAX_LENGTH, type TextVerdict, type TextKind } from '@/lib/text-moderation';
import { createId } from '@/lib/ids';
import { EDIT_WINDOW_MS } from '@/lib/forum-constants';

/**
 * Форум: темы и сообщения.
 *
 * Сообщество — то, ради чего фотограф возвращается на платформу между
 * съёмками. Но форум без модераторов обычно кончается одинаково, поэтому
 * решения здесь принимает автомат (`text-moderation`), а человек подключается
 * только к спорному и к переотправленному после правки.
 */

/** Сколько отказов за окно считается системой, а не случайностью. */
const VIOLATION_WINDOW_DAYS = 30;
const RESTRICT_AFTER = 5;

export type PublishOutcome = {
  status: 'PUBLISHED' | 'REJECTED' | 'IN_REVIEW';
  id: string;
  slug?: string;
  reason?: string;
  quote?: string | null;
  /** Сколько отказов накоплено за окно — интерфейс предупреждает заранее. */
  violations?: number;
};

/**
 * Ограничение публикаций за систематические нарушения.
 *
 * Считаем только недавнее окно: человек, оступившийся однажды, не должен
 * носить это вечно — иначе система наказывает за прошлое, а не защищает
 * настоящее.
 */
export async function violationCount(userId: string, now: Date = new Date()): Promise<number> {
  return db.contentViolation.count({
    where: { userId, createdAt: { gte: new Date(now.getTime() - VIOLATION_WINDOW_DAYS * 86_400_000) } },
  });
}

export async function assertCanPublish(userId: string): Promise<void> {
  const count = await violationCount(userId);
  if (count >= RESTRICT_AFTER) throw new DomainError('publishing_restricted', 403);
}

async function recordViolation(userId: string, kind: TextKind, reason: string): Promise<number> {
  await db.contentViolation.create({ data: { userId, kind, reason } });
  return violationCount(userId);
}

/** Недавние тексты автора — для правил повтора и флуда. */
async function recentTexts(userId: string, kind: TextKind): Promise<string[]> {
  const since = new Date(Date.now() - 3_600_000);
  if (kind === 'post' || kind === 'thread') {
    const rows = await db.forumPost.findMany({
      where: { authorUserId: userId, createdAt: { gte: since } },
      select: { body: true },
      take: 20,
    });
    return rows.map((r) => r.body);
  }
  return [];
}

/**
 * Создать тему.
 *
 * Тема — это заголовок и первое сообщение: пустая тема без вопроса не
 * начинает разговор, а занимает раздел.
 */
export async function createThread(
  userId: string,
  input: { sectionSlug: string; title: string; body: string },
): Promise<PublishOutcome> {
  if (!isForumSection(input.sectionSlug)) throw new DomainError('unknown_section', 400);

  const profile = await db.photographerProfile.findUnique({
    where: { userId },
    select: { status: true },
  });
  // Темы заводят авторы: заказчик приходит за съёмкой, а не за разговором о
  // ремесле — и раздел, открытый всем подряд, первым делом наполняется
  // предложениями работы
  if (profile?.status !== 'APPROVED') throw new DomainError('forbidden', 403);
  await assertCanPublish(userId);
  await rateLimit(`forum-thread:user:${userId}`, 5, 3600);

  const title = input.title.trim().replace(/\s+/g, ' ');
  if (title.length < 10 || title.length > 140) throw new DomainError('validation', 400);
  const body = input.body.trim();
  if (body.length > MAX_LENGTH.thread) throw new DomainError('too_long', 400);

  const verdict = await moderateText({ text: `${title}\n${body}`, kind: 'thread' });

  const id = createId();
  const slug = slugifyWithId(title, id);
  const status = verdictToStatus(verdict);

  await db.forumThread.create({
    data: {
      id,
      sectionSlug: input.sectionSlug,
      authorUserId: userId,
      title,
      slug,
      status,
      reasonCode: 'reason' in verdict ? verdict.reason : null,
      reasonQuote: 'quote' in verdict ? verdict.quote : null,
      posts: {
        create: {
          authorUserId: userId,
          body,
          status,
          reasonCode: 'reason' in verdict ? verdict.reason : null,
          reasonQuote: 'quote' in verdict ? verdict.quote : null,
        },
      },
      postCount: status === 'PUBLISHED' ? 1 : 0,
    },
  });

  const violations =
    verdict.action === 'reject' ? await recordViolation(userId, 'thread', verdict.reason) : undefined;

  return {
    status,
    id,
    slug,
    reason: 'reason' in verdict ? verdict.reason : undefined,
    quote: 'quote' in verdict ? verdict.quote : undefined,
    violations,
  };
}

function verdictToStatus(v: TextVerdict): 'PUBLISHED' | 'REJECTED' | 'IN_REVIEW' {
  if (v.action === 'publish') return 'PUBLISHED';
  if (v.action === 'reject') return 'REJECTED';
  return 'IN_REVIEW';
}

/** Ответить в тему. */
export async function createPost(userId: string, threadId: string, rawBody: string): Promise<PublishOutcome> {
  const thread = await db.forumThread.findUnique({
    where: { id: threadId },
    select: { id: true, closed: true, status: true },
  });
  if (!thread || thread.status !== 'PUBLISHED') throw new DomainError('no_thread', 404);
  if (thread.closed) throw new DomainError('thread_closed', 409);

  await assertCanPublish(userId);
  await rateLimit(`forum-post:user:${userId}`, 30, 3600);

  const body = rawBody.trim();
  if (body.length > MAX_LENGTH.post) throw new DomainError('too_long', 400);

  const verdict = await moderateText({ text: body, kind: 'post', recent: await recentTexts(userId, 'post') });
  const status = verdictToStatus(verdict);

  const post = await db.forumPost.create({
    data: {
      threadId,
      authorUserId: userId,
      body,
      status,
      reasonCode: 'reason' in verdict ? verdict.reason : null,
      reasonQuote: 'quote' in verdict ? verdict.quote : null,
    },
  });

  // Счётчик и «последнее сообщение» двигает только опубликованное: иначе
  // отклонённый текст поднимал бы тему наверх, ничего в неё не добавив
  if (status === 'PUBLISHED') {
    await db.forumThread.update({
      where: { id: threadId },
      data: { postCount: { increment: 1 }, lastPostAt: new Date() },
    });
    // Автор темы должен узнать об ответе: вопрос, на который ответили через
    // три дня, останется незамеченным, и разговор оборвётся на первом же круге
    const owner = await db.forumThread.findUnique({
      where: { id: threadId },
      select: { authorUserId: true, slug: true, sectionSlug: true, title: true },
    });
    if (owner && owner.authorUserId !== userId) {
      const { notifyInApp } = await import('@/lib/notifications');
      await notifyInApp(owner.authorUserId, 'notification.forum.reply', {
        threadSlug: owner.slug,
        sectionSlug: owner.sectionSlug,
        title: owner.title,
      }).catch(() => {});
    }
  }

  const violations =
    verdict.action === 'reject' ? await recordViolation(userId, 'post', verdict.reason) : undefined;

  return {
    status,
    id: post.id,
    reason: 'reason' in verdict ? verdict.reason : undefined,
    quote: 'quote' in verdict ? verdict.quote : undefined,
    violations,
  };
}

/**
 * Отправить отклонённое на повторную проверку после правки.
 *
 * Единственный путь к человеку — и он открыт только тому, кто текст изменил.
 * Повторная отправка того же самого просто перезапускала бы автомат, а очередь
 * оператора наполняли бы люди, ничего не исправившие.
 */
export async function resubmitPost(userId: string, postId: string, rawBody: string): Promise<PublishOutcome> {
  const post = await db.forumPost.findUnique({
    where: { id: postId },
    select: { id: true, authorUserId: true, status: true, body: true, threadId: true },
  });
  if (!post || post.authorUserId !== userId) throw new DomainError('forbidden', 403);
  if (post.status !== 'REJECTED') throw new DomainError('not_rejected', 409);

  const body = rawBody.trim();
  if (body.length === 0 || body.length > MAX_LENGTH.post) throw new DomainError('validation', 400);
  if (body === post.body) throw new DomainError('unchanged', 400);

  await rateLimit(`forum-resubmit:user:${userId}`, 10, 86_400);

  // Правленый текст сначала снова проходит автомат: если человек убрал
  // телефон, ответ должен прийти мгновенно, а не через сутки ожидания
  const verdict = await moderateText({ text: body, kind: 'post' });
  if (verdict.action === 'publish') {
    await db.$transaction([
      db.forumPost.update({
        where: { id: postId },
        data: { body, status: 'PUBLISHED', reasonCode: null, reasonQuote: null, resubmitted: false },
      }),
      db.forumThread.update({
        where: { id: post.threadId },
        data: { postCount: { increment: 1 }, lastPostAt: new Date() },
      }),
    ]);
    return { status: 'PUBLISHED', id: postId };
  }

  // Автомат снова против — отправляем человеку вместе с правкой
  await db.forumPost.update({
    where: { id: postId },
    data: {
      body,
      status: 'IN_REVIEW',
      resubmitted: true,
      reasonCode: 'reason' in verdict ? verdict.reason : null,
      reasonQuote: 'quote' in verdict ? verdict.quote : null,
    },
  });
  return {
    status: 'IN_REVIEW',
    id: postId,
    reason: 'reason' in verdict ? verdict.reason : undefined,
    quote: 'quote' in verdict ? verdict.quote : undefined,
  };
}

/**
 * Переотправить отклонённую ТЕМУ после правки.
 *
 * Отдельно от сообщения: у темы правится и заголовок, и первое сообщение, а
 * без этой возможности отказ по теме был бы окончательным — что противоречит
 * самому смыслу объяснять причину.
 */
export async function resubmitThread(
  userId: string,
  threadId: string,
  input: { title: string; body: string },
): Promise<PublishOutcome> {
  const thread = await db.forumThread.findUnique({
    where: { id: threadId },
    select: { id: true, authorUserId: true, status: true, title: true, slug: true },
  });
  if (!thread || thread.authorUserId !== userId) throw new DomainError('forbidden', 403);
  if (thread.status !== 'REJECTED') throw new DomainError('not_rejected', 409);

  const title = input.title.trim().replace(/\s+/g, ' ');
  const body = input.body.trim();
  if (title.length < 10 || title.length > 140) throw new DomainError('validation', 400);
  if (body.length < 40 || body.length > MAX_LENGTH.thread) throw new DomainError('validation', 400);

  await rateLimit(`forum-resubmit:user:${userId}`, 10, 86_400);

  const verdict = await moderateText({ text: `${title}\n${body}`, kind: 'thread' });
  const status = verdict.action === 'publish' ? 'PUBLISHED' : 'IN_REVIEW';

  await db.$transaction(async (tx) => {
    await tx.forumThread.update({
      where: { id: threadId },
      data: {
        title,
        status,
        resubmitted: status === 'IN_REVIEW',
        reasonCode: 'reason' in verdict ? verdict.reason : null,
        reasonQuote: 'quote' in verdict ? verdict.quote : null,
        postCount: status === 'PUBLISHED' ? 1 : 0,
        lastPostAt: new Date(),
      },
    });
    const first = await tx.forumPost.findFirst({
      where: { threadId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (first) {
      await tx.forumPost.update({
        where: { id: first.id },
        data: { body, status, resubmitted: status === 'IN_REVIEW' },
      });
    }
  });

  return {
    status,
    id: threadId,
    slug: thread.slug,
    reason: 'reason' in verdict ? verdict.reason : undefined,
    quote: 'quote' in verdict ? verdict.quote : undefined,
  };
}



/**
 * Правка своего сообщения.
 *
 * Окно короткое и намеренно: правка опечатки через минуту — нормальная
 * вежливость, а переписывание реплики, на которую уже ответили, превращает
 * обсуждение в спор о том, что было сказано.
 *
 * Отредактированный текст проходит модерацию заново — иначе правка стала бы
 * дырой, через которую в опубликованное сообщение вносится что угодно.
 */
export async function editPost(userId: string, postId: string, rawBody: string): Promise<PublishOutcome> {
  const post = await db.forumPost.findUnique({
    where: { id: postId },
    select: { id: true, authorUserId: true, status: true, createdAt: true, threadId: true },
  });
  if (!post || post.authorUserId !== userId) throw new DomainError('forbidden', 403);
  if (post.status !== 'PUBLISHED') throw new DomainError('not_published', 409);
  if (Date.now() - post.createdAt.getTime() > EDIT_WINDOW_MS) throw new DomainError('edit_window_over', 409);

  const body = rawBody.trim();
  if (body.length === 0 || body.length > MAX_LENGTH.post) throw new DomainError('validation', 400);

  const verdict = await moderateText({ text: body, kind: 'post' });
  const status = verdictToStatus(verdict);

  await db.forumPost.update({
    where: { id: postId },
    data: {
      body,
      status,
      reasonCode: 'reason' in verdict ? verdict.reason : null,
      reasonQuote: 'quote' in verdict ? verdict.quote : null,
    },
  });

  // Правка, не прошедшая проверку, снимает сообщение с публикации — и счётчик
  // темы обязан это отразить, иначе он начнёт врать
  if (status !== 'PUBLISHED') {
    await db.forumThread.update({
      where: { id: post.threadId },
      data: { postCount: { decrement: 1 } },
    });
  }

  return {
    status,
    id: postId,
    reason: 'reason' in verdict ? verdict.reason : undefined,
    quote: 'quote' in verdict ? verdict.quote : undefined,
  };
}

/**
 * Закрыть, открыть или закрепить тему — действие администратора.
 *
 * Закрытие не удаляет разговор: он остаётся читаемым, просто дописать в него
 * нельзя. Удалять обсуждение из-за того, что оно закончилось спором, значит
 * стирать и полезную часть.
 */
export async function setThreadFlags(
  adminUserId: string,
  threadId: string,
  flags: { closed?: boolean; pinned?: boolean },
): Promise<void> {
  const thread = await db.forumThread.findUnique({ where: { id: threadId }, select: { id: true } });
  if (!thread) throw new DomainError('not_found', 404);

  const { logAudit } = await import('@/lib/audit');
  await db.$transaction(async (tx) => {
    await tx.forumThread.update({ where: { id: threadId }, data: flags });
    await logAudit(tx, adminUserId, 'forum.thread.flags', 'FORUM_THREAD', threadId, flags);
  });
}

export type ThreadListItem = {
  id: string;
  slug: string;
  title: string;
  sectionSlug: string;
  postCount: number;
  lastPostAt: Date;
  pinned: boolean;
  authorName: string;
  authorUsername: string | null;
};

export async function threadsInSection(sectionSlug: string, limit = 50): Promise<ThreadListItem[]> {
  const rows = await db.forumThread.findMany({
    where: { sectionSlug, status: 'PUBLISHED' },
    orderBy: [{ pinned: 'desc' }, { lastPostAt: 'desc' }],
    take: limit,
    select: {
      id: true, slug: true, title: true, sectionSlug: true, postCount: true, lastPostAt: true, pinned: true,
      author: { select: { firstName: true, lastName: true, profile: { select: { username: true, status: true } } } },
    },
  });
  return rows.map((t) => ({
    id: t.id,
    slug: t.slug,
    title: t.title,
    sectionSlug: t.sectionSlug,
    postCount: t.postCount,
    lastPostAt: t.lastPostAt,
    pinned: t.pinned,
    authorName: `${t.author.firstName} ${t.author.lastName}`,
    // Ссылку даём только на одобренную страницу: ссылка на пустую анкету
    // выглядит как поломка
    authorUsername: t.author.profile?.status === 'APPROVED' ? t.author.profile.username : null,
  }));
}

export type ThreadView = {
  id: string;
  slug: string;
  title: string;
  sectionSlug: string;
  closed: boolean;
  pinned: boolean;
  createdAt: Date;
  posts: {
    id: string;
    body: string;
    createdAt: Date;
    authorName: string;
    authorUsername: string | null;
    authorUserId: string;
  }[];
};

export async function threadBySlug(slug: string): Promise<ThreadView | null> {
  const t = await db.forumThread.findUnique({
    where: { slug },
    select: {
      id: true, slug: true, title: true, sectionSlug: true, closed: true, pinned: true, createdAt: true, status: true,
      posts: {
        where: { status: 'PUBLISHED' },
        orderBy: { createdAt: 'asc' },
        take: 200,
        select: {
          id: true, body: true, createdAt: true, authorUserId: true,
          author: { select: { firstName: true, lastName: true, profile: { select: { username: true, status: true } } } },
        },
      },
    },
  });
  if (!t || t.status !== 'PUBLISHED') return null;
  return {
    id: t.id,
    slug: t.slug,
    title: t.title,
    sectionSlug: t.sectionSlug,
    closed: t.closed,
    pinned: t.pinned,
    createdAt: t.createdAt,
    posts: t.posts.map((p) => ({
      id: p.id,
      body: p.body,
      createdAt: p.createdAt,
      authorUserId: p.authorUserId,
      authorName: `${p.author.firstName} ${p.author.lastName}`,
      authorUsername: p.author.profile?.status === 'APPROVED' ? p.author.profile.username : null,
    })),
  };
}

/** Сводка по разделам для главной форума. */
export async function forumOverview(): Promise<Record<string, { threads: number; lastPostAt: Date | null }>> {
  const grouped = await db.forumThread.groupBy({
    by: ['sectionSlug'],
    where: { status: 'PUBLISHED' },
    _count: { _all: true },
    _max: { lastPostAt: true },
  });
  const out: Record<string, { threads: number; lastPostAt: Date | null }> = {};
  for (const g of grouped) out[g.sectionSlug] = { threads: g._count._all, lastPostAt: g._max.lastPostAt };
  return out;
}

/** Мои отклонённые тексты — чтобы отказ не терялся и его можно было исправить. */
export async function myRejected(userId: string) {
  const [posts, threads] = await Promise.all([
    db.forumPost.findMany({
      where: { authorUserId: userId, status: { in: ['REJECTED', 'IN_REVIEW'] } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true, body: true, status: true, reasonCode: true, reasonQuote: true, createdAt: true,
        thread: { select: { title: true, slug: true } },
      },
    }),
    db.forumThread.findMany({
      where: { authorUserId: userId, status: { in: ['REJECTED', 'IN_REVIEW'] } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, title: true, status: true, reasonCode: true, reasonQuote: true, createdAt: true },
    }),
  ]);
  return { posts, threads };
}
