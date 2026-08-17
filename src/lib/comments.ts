import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';
import { rateLimit } from '@/lib/rate-limit';

// Комментарии к работам (S2, спека 2.1). Плоский список (без вложенности v1).
// Guard текста — программный (антиспам + запрет обмена контактами в обход
// платформы): ссылки и телефоны отклоняются. Премодерация текста guard'ом; для
// абьюза — HIDDEN админом. Модель поддерживает фото и серии; UI v1 — на сериях.

export const COMMENT_MAX = 1000;

// Ссылки/домены (в т.ч. .рф) и последовательности цифр как телефон — запрещаем,
// чтобы не уводили контакт/спам мимо платформы (как контакты только после заявки).
const LINK_RE = /(https?:\/\/|www\.|t\.me\/|@[a-z0-9_]{4,}|[a-zа-яё0-9-]{2,}\.(ru|com|net|org|io|me|tg|рф|su|info|biz))/i;
const PHONE_RE = /(?:\+?\d[\s()\-–—.]*){7,}/;

/** Чистый guard тела комментария. Бросает DomainError с кодом причины. */
export function validateCommentBody(raw: string): string {
  const body = raw.trim();
  if (body.length === 0) throw new DomainError('comment_empty', 400);
  if (body.length > COMMENT_MAX) throw new DomainError('comment_too_long', 400);
  if (LINK_RE.test(body)) throw new DomainError('comment_no_links', 400);
  if (PHONE_RE.test(body)) throw new DomainError('comment_no_contacts', 400);
  return body;
}

export type CommentTarget = { photoId: string } | { storyId: string };

async function assertTargetApproved(target: CommentTarget): Promise<void> {
  if ('photoId' in target) {
    const photo = await db.photo.findUnique({ where: { id: target.photoId }, select: { status: true } });
    if (!photo || photo.status !== 'APPROVED') throw new DomainError('target_not_found', 404);
  } else {
    const story = await db.story.findUnique({ where: { id: target.storyId }, select: { status: true } });
    if (!story || story.status !== 'APPROVED') throw new DomainError('target_not_found', 404);
  }
}

export async function addComment(userId: string, target: CommentTarget, rawBody: string) {
  const body = validateCommentBody(rawBody);
  await assertTargetApproved(target);
  // Ограниченный за нарушения не публикует и КОММЕНТАРИИ (аудит 2026-08-16):
  // без этого гейта лестница эскалации не действовала на самой массовой
  // поверхности — спамер, запертый на форуме, продолжал писать под работами
  const { assertCanPublish } = await import('@/lib/publish-guard');
  await assertCanPublish(userId);
  await rateLimit(`comment:user:${userId}`, 10, 60); // 10/мин на пользователя

  // Программный guard выше ловит контакты и ссылки, но грубость без единой
  // ссылки он пропускает — а под работой человека это ранит сильнее спама.
  // Третий уровень (модель + guard) добирает именно такие случаи; без ключа
  // модели он молчит, и комментарий публикуется как раньше.
  const { moderateText } = await import('@/lib/text-moderation');
  const verdict = await moderateText({ text: body, kind: 'comment' });
  if (verdict.action === 'reject') {
    // Через ОБЩУЮ лестницу, а не прямую вставку ContentViolation: прямая
    // запись копила нарушения, но ограничение (5) и авто-блокировка (12)
    // не срабатывали никогда — «автомодерация обязана уметь закрывать
    // доступ» на комментариях не выполнялась (аудит 2026-08-16)
    const { recordViolation } = await import('@/lib/publish-guard');
    await recordViolation(userId, 'comment', verdict.reason);
    throw new DomainError(`comment_${verdict.reason}`, 400);
  }

  const created = await db.comment.create({
    data: {
      authorUserId: userId,
      photoId: 'photoId' in target ? target.photoId : null,
      storyId: 'storyId' in target ? target.storyId : null,
      body,
      // Спорное не показываем и не отклоняем: ошибочный отказ под чужой
      // работой дороже задержки
      status: verdict.action === 'review' ? 'IN_REVIEW' : 'VISIBLE',
    },
  });
  await db.activityEvent.create({
    data: {
      actorUserId: userId,
      type: 'COMMENT_CREATE',
      targetType: 'photoId' in target ? 'PHOTO' : 'STORY',
      targetId: 'photoId' in target ? target.photoId : target.storyId,
    },
  });

  // Петля признания (deep-think Content P1): уведомить автора работы о комментарии
  // (если это не свой же коммент). Вторично — не роняем создание коммента.
  const owner = 'photoId' in target
    ? await db.photo.findUnique({ where: { id: target.photoId }, select: { profile: { select: { userId: true } } } })
    : await db.story.findUnique({ where: { id: target.storyId }, select: { profile: { select: { userId: true } } } });
  const ownerUserId = owner?.profile.userId;
  if (ownerUserId && ownerUserId !== userId) {
    const { notifyInApp } = await import('@/lib/notifications');
    await notifyInApp(ownerUserId, 'notification.comment.new', {
      ...(('photoId' in target) ? { photoId: target.photoId } : { storyId: target.storyId }),
    }).catch(() => {});
  }
  return created;
}

/** Удаление: автор комментария или ADMIN. Идемпотентно (deleteMany по условию). */
export async function deleteComment(userId: string, commentId: string, isAdmin: boolean): Promise<void> {
  const comment = await db.comment.findUnique({ where: { id: commentId }, select: { authorUserId: true } });
  if (!comment) return; // уже нет — идемпотентно
  if (!isAdmin && comment.authorUserId !== userId) throw new DomainError('forbidden', 403);
  await db.comment.delete({ where: { id: commentId } });
  await db.activityEvent.create({
    data: { actorUserId: userId, type: 'COMMENT_DELETE', targetType: 'PROFILE', targetId: commentId },
  });
}

export interface CommentView {
  id: string;
  body: string;
  createdAt: Date;
  authorName: string;
  authorUserId: string;
}

export async function commentsForStory(storyId: string, limit = 100): Promise<CommentView[]> {
  const rows = await db.comment.findMany({
    where: { storyId, status: 'VISIBLE' },
    orderBy: { createdAt: 'asc' },
    take: limit,
    include: { author: { select: { id: true, firstName: true, lastName: true } } },
  });
  return rows.map((c) => ({
    id: c.id,
    body: c.body,
    createdAt: c.createdAt,
    authorName: `${c.author.firstName} ${c.author.lastName}`.trim(),
    authorUserId: c.author.id,
  }));
}
