import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';
import type { TextKind } from '@/lib/text-moderation';

/**
 * Лестница эскалации автомодерации — ОБЩИЙ слой для всех поверхностей
 * публикации: форум, статьи, комментарии.
 *
 * Вынесено из forum.ts (аудит 2026-08-16, P2 «god-модуль»): лестница — не
 * форумная механика, а платформенная, и пока она жила внутри форума,
 * комментарии успели завести собственную прямую вставку ContentViolation,
 * мимо ограничения и авто-блокировки. Отдельный модуль делает «подключи
 * лестницу» очевидным действием, а не археологией.
 *
 * Две ступени принципиальны (инвариант 2026-08-04): ограничение (5 отказов
 * за 30 дней) — это «остановитесь и прочитайте правила», блокировка (12) —
 * «мы вас не переубедим». Одной ступенью первое неотличимо от второго.
 */
const VIOLATION_WINDOW_DAYS = 30;
export const RESTRICT_AFTER = 5;
export const BLOCK_AFTER = 12;

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
