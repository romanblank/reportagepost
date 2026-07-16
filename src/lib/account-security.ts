import { db } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/auth';
import { DomainError } from '@/lib/errors';

// Управление аккаунтом из настроек: смена пароля/email/имени. Все операции —
// с проверкой владения (по session userId) и подтверждением пароля где нужно.

export async function changePassword(userId: string, current: string, next: string): Promise<void> {
  if (typeof next !== 'string' || next.length < 10) throw new DomainError('weak_password', 400);
  const user = await db.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user) throw new DomainError('no_user', 404);
  // Аккаунт без пароля (OAuth/создан админом) — задаёт пароль без «текущего»
  if (user.passwordHash && !(await verifyPassword(user.passwordHash, current))) {
    throw new DomainError('wrong_password', 403);
  }
  await db.user.update({
    where: { id: userId },
    // passwordChangedAt + tokenVersion++ инвалидируют прочие сессии
    data: { passwordHash: await hashPassword(next), passwordChangedAt: new Date(), tokenVersion: { increment: 1 } },
  });
}

export async function changeEmail(userId: string, newEmail: string, password: string): Promise<void> {
  const email = newEmail.trim().toLowerCase();
  const user = await db.user.findUnique({ where: { id: userId }, select: { passwordHash: true, email: true } });
  if (!user) throw new DomainError('no_user', 404);
  if (user.passwordHash && !(await verifyPassword(user.passwordHash, password))) {
    throw new DomainError('wrong_password', 403);
  }
  if (email === user.email) return;
  const taken = await db.user.findUnique({ where: { email } });
  if (taken) throw new DomainError('email_taken', 409);
  await db.user.update({ where: { id: userId }, data: { email } });
}

export async function changeName(userId: string, firstName: string, lastName: string): Promise<void> {
  const f = firstName.trim();
  const l = lastName.trim();
  if (f.length < 2 || f.length > 60 || l.length < 2 || l.length > 60) throw new DomainError('bad_name', 400);
  await db.user.update({ where: { id: userId }, data: { firstName: f, lastName: l } });
}
