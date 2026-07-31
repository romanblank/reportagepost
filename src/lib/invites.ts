import { randomBytes } from 'node:crypto';
import { db } from '@/lib/db';

/**
 * Инвайт-гейт (инвариант закрытости до S4): проверяет и «расходует» код.
 * Возвращает id кода или null (невалиден/исчерпан/истёк).
 * Атомарно: updateMany с условием защищает от гонки на последнем использовании.
 */
export async function consumeInviteCode(code: string): Promise<string | null> {
  const invite = await db.inviteCode.findUnique({ where: { code } });
  if (!invite) return null;
  if (invite.expiresAt && invite.expiresAt < new Date()) return null;

  const updated = await db.inviteCode.updateMany({
    where: { id: invite.id, usedCount: { lt: invite.maxUses } },
    data: { usedCount: { increment: 1 } },
  });
  return updated.count === 1 ? invite.id : null;
}

/**
 * Вернуть потреблённое использование инвайта (аудит 2026-07-31, P0).
 * Инвайт — валюта закрытой беты: если после его списания регистрация не
 * состоялась (гонка на уникальном email), код обязан вернуться в оборот,
 * иначе приглашённый человек остаётся без входа, а оператор — без понимания.
 */
export async function releaseInviteCode(inviteCodeId: string): Promise<void> {
  await db.inviteCode.updateMany({
    where: { id: inviteCodeId, usedCount: { gt: 0 } },
    data: { usedCount: { decrement: 1 } },
  });
}

/** Создать персональный инвайт (S3). Код — случайный base64url. */
export async function createInvite(opts: {
  issuedByUserId: string;
  note?: string;
  maxUses?: number;
  expiresAt?: Date | null;
}) {
  const code = randomBytes(9).toString('base64url');
  return db.inviteCode.create({
    data: {
      code,
      note: opts.note?.trim() || null,
      maxUses: opts.maxUses && opts.maxUses > 0 ? Math.min(opts.maxUses, 1000) : 1,
      expiresAt: opts.expiresAt ?? null,
      issuedByUserId: opts.issuedByUserId,
    },
  });
}

export interface InviteRow {
  id: string;
  code: string;
  note: string | null;
  maxUses: number;
  usedCount: number;
  registered: number; // сколько реально зарегистрировалось по коду
  expiresAt: Date | null;
  createdAt: Date;
}

/** Список инвайтов со статистикой (админ). */
export async function invitesList(limit = 100): Promise<InviteRow[]> {
  const rows = await db.inviteCode.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { _count: { select: { users: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    note: r.note,
    maxUses: r.maxUses,
    usedCount: r.usedCount,
    registered: r._count.users,
    expiresAt: r.expiresAt,
    createdAt: r.createdAt,
  }));
}
