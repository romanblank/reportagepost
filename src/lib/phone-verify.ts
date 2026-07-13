import { randomInt } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { hashPassword, verifyPassword } from '@/lib/auth';
import { smsProvider } from '@/lib/sms';
import { DomainError } from '@/lib/errors';
import { rateLimit } from '@/lib/rate-limit';

const CODE_TTL_MIN = 10;
const MAX_ATTEMPTS = 5;
const E164 = /^\+[1-9]\d{7,14}$/;

/** Отправляет код на телефон. Код — argon2-хеш в БД, TTL 10 мин. */
export async function startPhoneVerification(userId: string, phone: string): Promise<void> {
  if (!E164.test(phone)) throw new DomainError('bad_phone', 400);

  // Антибомбинг чужого номера (аудит P1-2): лимит по НОМЕРУ-цели, независимо
  // от аккаунта-отправителя — 5 SMS/сутки на номер
  await rateLimit(`sms:phone:${phone}`, 5, 86_400);

  // Телефон уникален по User.phone — не даём привязать чужой уже верифицированный
  const taken = await db.user.findFirst({
    where: { phone, phoneVerifiedAt: { not: null }, id: { not: userId } },
  });
  if (taken) throw new DomainError('phone_taken', 409);

  const code = String(randomInt(100000, 1000000)); // 6 цифр
  const codeHash = await hashPassword(code);
  const expiresAt = new Date(Date.now() + CODE_TTL_MIN * 60_000);

  // один активный код на пользователя
  await db.phoneVerification.deleteMany({ where: { userId } });
  await db.phoneVerification.create({ data: { userId, phone, codeHash, expiresAt } });

  await smsProvider.send(phone, `Reportage Post: код подтверждения ${code}`);
}

/**
 * Проверяет код. При успехе ставит User.phone + phoneVerifiedAt.
 * Guard: TTL, лимит попыток, argon2-сверка (код в открытом виде не хранится).
 */
export async function confirmPhoneVerification(userId: string, code: string): Promise<void> {
  const record = await db.phoneVerification.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });
  if (!record) throw new DomainError('no_pending_code', 400);
  if (record.expiresAt < new Date()) {
    await db.phoneVerification.delete({ where: { id: record.id } });
    throw new DomainError('code_expired', 400);
  }

  // Атомарный расход попытки (аудит P1-1): updateMany с условием attempts<MAX
  // защищает от TOCTOU при пачке параллельных PUT — иначе счётчик обходится.
  const spend = await db.phoneVerification.updateMany({
    where: { id: record.id, attempts: { lt: MAX_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (spend.count === 0) {
    await db.phoneVerification.delete({ where: { id: record.id } });
    throw new DomainError('too_many_attempts', 429);
  }

  const ok = await verifyPassword(record.codeHash, code);
  if (!ok) throw new DomainError('code_invalid', 400);

  try {
    await db.$transaction([
      db.user.update({ where: { id: userId }, data: { phone: record.phone, phoneVerifiedAt: new Date() } }),
      db.phoneVerification.deleteMany({ where: { userId } }),
    ]);
  } catch (e) {
    // Номер заняли за время TTL (User.phone @unique) — чистый 409, не 500
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new DomainError('phone_taken', 409);
    }
    throw e;
  }
}
