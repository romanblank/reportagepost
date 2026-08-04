import type { ReportReason, ReportTargetType } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';

// Жалобы и блокировки — модерация ЛЮДЕЙ (аудит 2026-07-31, P0: инструментов
// реакции на человека не было вообще). Минимум для беты с живыми людьми и для
// позиции информационного посредника: пожаловаться на контент/пользователя,
// заблокировать собеседника в личке, разобрать очередь жалоб в админке.

export interface CreateReportInput {
  reporterId: string | null; // null — гость (форма правообладателя)
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  comment?: string;
  contactEmail?: string; // для гостевых жалоб — обратная связь
}

/** Проверка существования объекта жалобы (не даём засорять очередь мусором). */
async function targetExists(type: ReportTargetType, id: string): Promise<boolean> {
  switch (type) {
    case 'USER': return Boolean(await db.user.findUnique({ where: { id }, select: { id: true } }));
    case 'PHOTO': return Boolean(await db.photo.findUnique({ where: { id }, select: { id: true } }));
    case 'STORY': return Boolean(await db.story.findUnique({ where: { id }, select: { id: true } }));
    case 'REVIEW': return Boolean(await db.review.findUnique({ where: { id }, select: { id: true } }));
    case 'COMMENT': return Boolean(await db.comment.findUnique({ where: { id }, select: { id: true } }));
    case 'MESSAGE': return Boolean(await db.message.findUnique({ where: { id }, select: { id: true } }));
    case 'FORUM_POST': return Boolean(await db.forumPost.findUnique({ where: { id }, select: { id: true } }));
  }
}

export async function createReport(input: CreateReportInput): Promise<{ id: string }> {
  if (!(await targetExists(input.targetType, input.targetId))) {
    throw new DomainError('target_not_found', 404);
  }
  // На себя не жалуемся
  if (input.targetType === 'USER' && input.reporterId && input.targetId === input.reporterId) {
    throw new DomainError('self_report', 400);
  }
  try {
    const r = await db.report.create({
      data: {
        reporterId: input.reporterId,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
        comment: input.comment?.trim() || null,
        contactEmail: input.contactEmail?.trim().toLowerCase() || null,
      },
      select: { id: true },
    });
    return r;
  } catch (e) {
    // Повторная жалоба того же заявителя на тот же объект — идемпотентно
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const existing = await db.report.findFirst({
        where: { reporterId: input.reporterId, targetType: input.targetType, targetId: input.targetId },
        select: { id: true },
      });
      if (existing) return existing;
    }
    throw e;
  }
}

/** Сколько открытых жалоб на объект — сигнал приоритета для админа. */
export async function openReportCount(targetType: ReportTargetType, targetId: string): Promise<number> {
  return db.report.count({ where: { targetType, targetId, status: 'OPEN' } });
}

// ─── Блокировки ──────────────────────────────────────────────────────────────

export async function blockUser(blockerId: string, blockedId: string): Promise<{ blocked: boolean }> {
  if (blockerId === blockedId) throw new DomainError('self_block', 400);
  const target = await db.user.findUnique({ where: { id: blockedId }, select: { id: true } });
  if (!target) throw new DomainError('user_not_found', 404);
  await db.userBlock.upsert({
    where: { blockerId_blockedId: { blockerId, blockedId } },
    create: { blockerId, blockedId },
    update: {},
  });
  return { blocked: true };
}

export async function unblockUser(blockerId: string, blockedId: string): Promise<{ blocked: boolean }> {
  await db.userBlock.deleteMany({ where: { blockerId, blockedId } });
  return { blocked: false };
}

/** Есть ли блокировка В ЛЮБУЮ СТОРОНУ между двумя пользователями. */
export async function isBlockedBetween(a: string, b: string): Promise<boolean> {
  const row = await db.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    },
    select: { blockerId: true },
  });
  return Boolean(row);
}

/** Кого заблокировал пользователь (для настроек). */
export async function blockedByUser(blockerId: string) {
  return db.userBlock.findMany({
    where: { blockerId },
    orderBy: { createdAt: 'desc' },
    select: {
      createdAt: true,
      blocked: {
        select: { id: true, firstName: true, lastName: true, profile: { select: { username: true, status: true } } },
      },
    },
  });
}
