import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';
import { rateLimit } from '@/lib/rate-limit';
import { slugifyWithId } from '@/lib/slugify';
import { isForumSection } from '@/lib/forum-sections';
import { moderateText, MAX_LENGTH, type TextVerdict, type TextKind } from '@/lib/text-moderation';
import { createId } from '@/lib/ids';
import { EDIT_WINDOW_MS } from '@/lib/forum-constants';
import { THREAD_QUOTA } from '@/lib/pricing';
import { tierOf } from '@/lib/subscription';

/**
 * Форум: темы и сообщения.
 *
 * Сообщество — то, ради чего фотограф возвращается на платформу между
 * съёмками. Но форум без модераторов обычно кончается одинаково, поэтому
 * решения здесь принимает автомат (`text-moderation`), а человек подключается
 * только к спорному и к переотправленному после правки.
 */

/**
 * Пороги накопления.
 *
 * Две ступени, а не одна: ограничение публикаций — это «остановитесь и
 * прочитайте правила», закрытие доступа — «мы вас не переубедим». Одной
 * ступенью первое неотличимо от второго, и человек, дважды оступившийся,
 * получал бы то же, что и тот, кто пришёл спамить.
 *
 * Окно скользящее: счётчик смотрит только недавнее, иначе система наказывает
 * за прошлое, а не защищает настоящее.
 */
const VIOLATION_WINDOW_DAYS = 30;
const RESTRICT_AFTER = 5;
const BLOCK_AFTER = 12;

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

/** Сколько тем автор завёл в этом календарном месяце (отклонённые не в счёт). */
export async function threadsThisMonth(userId: string, now: Date = new Date()): Promise<number> {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return db.forumThread.count({
    where: { authorUserId: userId, createdAt: { gte: from }, status: { not: 'REJECTED' } },
  });
}

/** Остаток тем на месяц — интерфейс показывает его ДО того, как человек напишет. */
export async function threadQuotaLeft(userId: string): Promise<{ left: number; quota: number }> {
  const quota = THREAD_QUOTA[await tierOf(userId)];
  const used = await threadsThisMonth(userId);
  return { left: Math.max(0, quota - used), quota };
}

export async function assertCanPublish(userId: string): Promise<void> {
  const count = await violationCount(userId);
  if (count >= RESTRICT_AFTER) throw new DomainError('publishing_restricted', 403);
}

export async function recordViolation(userId: string, kind: TextKind, reason: string): Promise<number> {
  await db.contentViolation.create({ data: { userId, kind, reason } });
  const count = await violationCount(userId);

  // Систематическое злоупотребление закрывает доступ. Делает это система, а не
  // администратор: ждать, пока человек дойдёт до очереди, значит оставить
  // спамера работать сутки. Путь назад — через поддержку, и он назван прямо в
  // самом уведомлении, иначе блокировка выглядит как исчезновение платформы.
  if (count >= BLOCK_AFTER) {
    const user = await db.user.findUnique({ where: { id: userId }, select: { status: true, role: true } });
    if (user && user.status === 'ACTIVE' && user.role !== 'ADMIN') {
      await db.user.update({
        where: { id: userId },
        // tokenVersion — отзыв живых сессий: иначе блокировка начинает
        // действовать только со следующего входа, а вкладка уже открыта
        data: { status: 'BANNED', tokenVersion: { increment: 1 } },
      });
      const { notifyInApp } = await import('@/lib/notifications');
      await notifyInApp(userId, 'notification.moderation.blocked', { violations: count }).catch(() => {});
      const { alertOperator } = await import('@/lib/telegram');
      await alertOperator(`Auto-block by moderation: user ${userId}, violations ${count}`).catch(() => {});
    }
  }

  return count;
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
  const { left } = await threadQuotaLeft(userId);
  if (left <= 0) throw new DomainError('thread_quota', 429);
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
      // Автор подписан на собственную тему сразу: спрашивать «хотите ли знать
      // ответ на свой вопрос» бессмысленно
      subscriptions: status === 'PUBLISHED' ? { create: { userId } } : undefined,
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
    // Человек, вложившийся в разговор, по умолчанию хочет знать, чем он
    // кончился: отвечающий подписывается на тему сам собой
    await subscribeToThread(userId, threadId).catch(() => {});
    await notifyThreadSubscribers(threadId, userId).catch(() => {});
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

/** Подписка на тему — идемпотентная. */
export async function subscribeToThread(userId: string, threadId: string): Promise<void> {
  await db.forumSubscription.upsert({
    where: { userId_threadId: { userId, threadId } },
    create: { userId, threadId },
    update: {},
  });
}

export async function unsubscribeFromThread(userId: string, threadId: string): Promise<void> {
  await db.forumSubscription.deleteMany({ where: { userId, threadId } });
}

export async function isSubscribed(userId: string, threadId: string): Promise<boolean> {
  return (await db.forumSubscription.count({ where: { userId, threadId } })) > 0;
}

/**
 * Сообщить подписчикам темы о новом сообщении.
 *
 * Внутри платформы — всем, письмом — только тем, кто письма не отключил.
 * Уведомление внутри и письмо это разные вещи: первое человек увидит, когда
 * зайдёт, второе возвращает его, когда он не собирался, и потому должно
 * выключаться отдельно от рассылки заявок.
 */
export async function notifyThreadSubscribers(threadId: string, exceptUserId: string): Promise<void> {
  const thread = await db.forumThread.findUnique({
    where: { id: threadId },
    select: {
      slug: true, sectionSlug: true, title: true, authorUserId: true,
      subscriptions: {
        select: { user: { select: { id: true, email: true, notifyForumEmail: true, status: true } } },
      },
    },
  });
  if (!thread) return;

  const recipients = thread.subscriptions
    .map((s) => s.user)
    .filter((u) => u.id !== exceptUserId && u.status === 'ACTIVE');
  if (recipients.length === 0) return;

  const { notifyManyInApp } = await import('@/lib/notifications');
  await notifyManyInApp(
    recipients.map((u) => u.id),
    'notification.forum.reply',
    { threadSlug: thread.slug, sectionSlug: thread.sectionSlug, title: thread.title },
  ).catch(() => {});

  const { sendEmail } = await import('@/lib/email');
  const { APP_DOMAIN } = await import('@/lib/constants');
  const url = `https://${APP_DOMAIN}/ru/forum/${thread.sectionSlug}/${thread.slug}`;
  for (const u of recipients) {
    if (!u.email || !u.notifyForumEmail) continue;
    await sendEmail(
      u.email,
      `Ответ в теме «${thread.title}»`,
      `В теме, на которую вы подписаны, появился ответ.\n\n${thread.title}\n${url}\n\nОтписаться от темы можно кнопкой на её странице.`,
    ).catch(() => {});
  }
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

export const THREADS_PER_PAGE = 30;
export const POSTS_PER_PAGE = 50;

/**
 * Темы раздела страницами.
 *
 * Раньше отдавались первые пятьдесят и всё: пятьдесят первая тема переставала
 * существовать — её нельзя было ни открыть из раздела, ни найти глазами.
 */
export async function threadsInSection(
  sectionSlug: string,
  limit = THREADS_PER_PAGE,
  page = 1,
): Promise<ThreadListItem[]> {
  const rows = await db.forumThread.findMany({
    where: { sectionSlug, status: 'PUBLISHED' },
    orderBy: [{ pinned: 'desc' }, { lastPostAt: 'desc' }],
    skip: (Math.max(1, page) - 1) * limit,
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
  /** Всего опубликованных сообщений — для постраничной навигации. */
  totalPosts: number;
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

export async function threadBySlug(slug: string, page = 1): Promise<ThreadView | null> {
  const t = await db.forumThread.findUnique({
    where: { slug },
    select: {
      id: true, slug: true, title: true, sectionSlug: true, closed: true, pinned: true, createdAt: true, status: true,
      posts: {
        where: { status: 'PUBLISHED' },
        orderBy: { createdAt: 'asc' },
        // Длинная тема читается по порядку, поэтому страницы идут от начала, а
        // не от конца, как в личке: там ценно последнее, здесь — ход разговора
        skip: (Math.max(1, page) - 1) * POSTS_PER_PAGE,
        take: POSTS_PER_PAGE,
        select: {
          id: true, body: true, createdAt: true, authorUserId: true,
          author: { select: { firstName: true, lastName: true, profile: { select: { username: true, status: true } } } },
        },
      },
    },
  });
  if (!t || t.status !== 'PUBLISHED') return null;
  const totalPosts = await db.forumPost.count({ where: { threadId: t.id, status: 'PUBLISHED' } });
  return {
    id: t.id,
    totalPosts,
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
export async function threadCountInSection(sectionSlug: string): Promise<number> {
  return db.forumThread.count({ where: { sectionSlug, status: 'PUBLISHED' } });
}

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

/**
 * Поиск по темам.
 *
 * Форум без поиска отвечает на один и тот же вопрос по десять раз, а автор,
 * пришедший с вопросом, не находит ответ, который уже написан, — и оба раза
 * проигрывает сообщество. Ищем по заголовку и по тексту сообщений: половина
 * ответов на вопрос лежит не в названии темы, а внутри неё.
 */
export async function searchThreads(query: string, limit = 30): Promise<ThreadListItem[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const rows = await db.forumThread.findMany({
    where: {
      status: 'PUBLISHED',
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { posts: { some: { status: 'PUBLISHED', body: { contains: q, mode: 'insensitive' } } } },
      ],
    },
    orderBy: [{ lastPostAt: 'desc' }],
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
    authorUsername: t.author.profile?.status === 'APPROVED' ? t.author.profile.username : null,
  }));
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
