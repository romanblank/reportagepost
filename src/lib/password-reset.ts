import { randomBytes, createHash } from 'node:crypto';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { sendEmail } from '@/lib/email';
import { APP_DOMAIN } from '@/lib/constants';
import { ru } from '@/i18n/ru';
import { DomainError } from '@/lib/errors';

// Сброс пароля по email-ссылке. Токен высокоэнтропийный (32 байта), в БД —
// только его sha256-хеш; сырой уходит в письмо. TTL 60 мин, одноразовый.
// Существование email не палим (всегда «письмо отправлено»).

const TTL_MIN = 60;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export async function requestPasswordReset(email: string): Promise<void> {
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) return; // нет юзера или OAuth-only — тихо выходим
  const raw = randomBytes(32).toString('base64url');
  await db.passwordReset.create({
    data: { userId: user.id, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + TTL_MIN * 60_000) },
  });
  const link = `https://${APP_DOMAIN}/ru/reset?token=${raw}`;
  await sendEmail(email, ru.auth.pwreset.emailSubject, ru.auth.pwreset.emailBody(link, TTL_MIN));
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  if (typeof newPassword !== 'string' || newPassword.length < 10) {
    throw new DomainError('weak_password', 400);
  }
  const row = await db.passwordReset.findFirst({
    where: { tokenHash: sha256(token), usedAt: null, expiresAt: { gt: new Date() } },
  });
  if (!row) throw new DomainError('reset_invalid', 400);

  const passwordHash = await hashPassword(newPassword);
  await db.$transaction([
    // passwordChangedAt + tokenVersion++ инвалидируют все прежние сессии (правило проекта)
    db.user.update({
      where: { id: row.userId },
      data: { passwordHash, passwordChangedAt: new Date(), tokenVersion: { increment: 1 } },
    }),
    // гасим ВСЕ активные токены сброса этого юзера (использованный и прочие)
    db.passwordReset.updateMany({ where: { userId: row.userId, usedAt: null }, data: { usedAt: new Date() } }),
  ]);
}
