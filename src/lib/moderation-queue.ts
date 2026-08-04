import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';
import { logAudit } from '@/lib/audit';

/**
 * Очередь к человеку.
 *
 * Сюда попадает ровно две категории: то, в чём автомат не уверен, и то, что
 * автор переотправил после правки. Первичный поток разбирается автоматически
 * целиком — иначе очередь съест оператора, а сообщество будет ждать сутки
 * ради очевидного «нормальный вопрос про объектив».
 *
 * Каждое решение пишется в аудит: человек, чей текст скрыли или вернули,
 * вправе узнать, кто это сделал, а мы — вспомнить, почему.
 */

export type QueueItem = {
  kind: 'thread' | 'post' | 'article' | 'comment';
  id: string;
  title: string | null;
  body: string;
  authorName: string;
  reasonCode: string | null;
  reasonQuote: string | null;
  resubmitted: boolean;
  createdAt: Date;
};

export async function moderationQueue(limit = 100): Promise<QueueItem[]> {
  const [threads, posts, articles, comments] = await Promise.all([
    db.forumThread.findMany({
      where: { status: 'IN_REVIEW' },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: {
        id: true, title: true, reasonCode: true, reasonQuote: true, resubmitted: true, createdAt: true,
        posts: { take: 1, orderBy: { createdAt: 'asc' }, select: { body: true } },
        author: { select: { firstName: true, lastName: true } },
      },
    }),
    db.forumPost.findMany({
      where: { status: 'IN_REVIEW' },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: {
        id: true, body: true, reasonCode: true, reasonQuote: true, resubmitted: true, createdAt: true,
        thread: { select: { title: true } },
        author: { select: { firstName: true, lastName: true } },
      },
    }),
    db.article.findMany({
      where: { status: 'IN_REVIEW' },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: {
        id: true, title: true, lead: true, body: true, reasonCode: true, reasonQuote: true,
        resubmitted: true, createdAt: true,
        author: { select: { firstName: true, lastName: true } },
      },
    }),
    db.comment.findMany({
      where: { status: 'IN_REVIEW' },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: {
        id: true, body: true, createdAt: true,
        author: { select: { firstName: true, lastName: true } },
      },
    }),
  ]);

  const items: QueueItem[] = [
    ...threads.map((t) => ({
      kind: 'thread' as const,
      id: t.id,
      title: t.title,
      body: t.posts[0]?.body ?? '',
      authorName: `${t.author.firstName} ${t.author.lastName}`,
      reasonCode: t.reasonCode,
      reasonQuote: t.reasonQuote,
      resubmitted: t.resubmitted,
      createdAt: t.createdAt,
    })),
    ...posts.map((p) => ({
      kind: 'post' as const,
      id: p.id,
      title: p.thread.title,
      body: p.body,
      authorName: `${p.author.firstName} ${p.author.lastName}`,
      reasonCode: p.reasonCode,
      reasonQuote: p.reasonQuote,
      resubmitted: p.resubmitted,
      createdAt: p.createdAt,
    })),
    ...articles.map((a) => ({
      kind: 'article' as const,
      id: a.id,
      title: a.title,
      body: `${a.lead}\n\n${a.body}`,
      authorName: `${a.author.firstName} ${a.author.lastName}`,
      reasonCode: a.reasonCode,
      reasonQuote: a.reasonQuote,
      resubmitted: a.resubmitted,
      createdAt: a.createdAt,
    })),
    ...comments.map((c) => ({
      kind: 'comment' as const,
      id: c.id,
      title: null,
      body: c.body,
      authorName: `${c.author.firstName} ${c.author.lastName}`,
      reasonCode: null,
      reasonQuote: null,
      resubmitted: false,
      createdAt: c.createdAt,
    })),
  ];

  // Переотправленное — вперёд: человек уже исправил текст и ждёт ответа
  return items.sort(
    (a, b) => Number(b.resubmitted) - Number(a.resubmitted) || a.createdAt.getTime() - b.createdAt.getTime(),
  );
}

export async function decideForumItem(
  adminUserId: string,
  kind: 'thread' | 'post',
  id: string,
  publish: boolean,
  reason: string,
): Promise<void> {
  if (kind === 'thread') {
    const thread = await db.forumThread.findUnique({ where: { id }, select: { id: true } });
    if (!thread) throw new DomainError('not_found', 404);
    await db.$transaction(async (tx) => {
      await tx.forumThread.update({
        where: { id },
        data: publish
          ? { status: 'PUBLISHED', reasonCode: null, reasonQuote: null, resubmitted: false }
          : { status: 'REJECTED', reasonCode: reason },
      });
      // Первое сообщение живёт вместе с темой: опубликованная тема без текста
      // выглядит как поломка
      await tx.forumPost.updateMany({
        where: { threadId: id, status: 'IN_REVIEW' },
        data: publish ? { status: 'PUBLISHED' } : { status: 'REJECTED', reasonCode: reason },
      });
      if (publish) await tx.forumThread.update({ where: { id }, data: { postCount: 1 } });
      await logAudit(tx, adminUserId, publish ? 'forum.publish' : 'forum.reject', 'FORUM_THREAD', id, { reason });
    });
    return;
  }

  const post = await db.forumPost.findUnique({ where: { id }, select: { threadId: true } });
  if (!post) throw new DomainError('not_found', 404);
  await db.$transaction(async (tx) => {
    await tx.forumPost.update({
      where: { id },
      data: publish
        ? { status: 'PUBLISHED', reasonCode: null, reasonQuote: null, resubmitted: false }
        : { status: 'REJECTED', reasonCode: reason },
    });
    if (publish) {
      await tx.forumThread.update({
        where: { id: post.threadId },
        data: { postCount: { increment: 1 }, lastPostAt: new Date() },
      });
    }
    await logAudit(tx, adminUserId, publish ? 'forum.publish' : 'forum.reject', 'FORUM_POST', id, { reason });
  });
}

export async function decideComment(adminUserId: string, id: string, publish: boolean): Promise<void> {
  const comment = await db.comment.findUnique({ where: { id }, select: { id: true } });
  if (!comment) throw new DomainError('not_found', 404);
  await db.$transaction(async (tx) => {
    await tx.comment.update({ where: { id }, data: { status: publish ? 'VISIBLE' : 'HIDDEN' } });
    await logAudit(tx, adminUserId, publish ? 'comment.publish' : 'comment.hide', 'COMMENT', id, {});
  });
}
