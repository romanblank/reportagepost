import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';

// Аудит-лог действий администратора (spec/02-admin §10). Пишется ВНУТРИ той же
// транзакции, что и само действие — консистентность (действие без записи или
// запись без действия недопустимы). Читается только через экран /ru/admin/audit.

type Client = Prisma.TransactionClient | typeof db;

export async function logAudit(
  client: Client,
  actorUserId: string,
  action: string,
  targetType: string,
  targetId: string,
  meta?: Prisma.InputJsonValue,
): Promise<void> {
  await client.adminAudit.create({
    data: { actorUserId, action, targetType, targetId, meta: meta ?? Prisma.JsonNull },
  });
}
