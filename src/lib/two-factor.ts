import { createHash, randomBytes } from 'node:crypto';
import { db } from '@/lib/db';
import { generateTotpSecret, verifyTotp, otpauthUri } from '@/lib/totp';
import { DomainError } from '@/lib/errors';

// Двухфакторная аутентификация (TOTP). Секрет храним в User.totpSecret; 2FA
// считается включённой только после подтверждения кодом (twoFactorEnabledAt).
// Резервные коды — одноразовые, хранятся хешами.

const BACKUP_COUNT = 10;
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

function genBackupCode(): string {
  const hex = randomBytes(5).toString('hex'); // 10 hex-символов
  return `${hex.slice(0, 5)}-${hex.slice(5)}`;
}

async function loadUser(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, totpSecret: true, twoFactorEnabledAt: true },
  });
  if (!user) throw new DomainError('no_user', 404);
  return user;
}

/** Начать подключение: сгенерировать секрет (ещё не включено). */
export async function beginEnroll(userId: string): Promise<{ secret: string; uri: string }> {
  const user = await loadUser(userId);
  if (user.twoFactorEnabledAt) throw new DomainError('already_enabled', 409);
  const secret = generateTotpSecret();
  await db.user.update({ where: { id: userId }, data: { totpSecret: secret } });
  return { secret, uri: otpauthUri(secret, user.email ?? userId) };
}

/** Подтвердить код → включить 2FA и выдать резервные коды (показываются один раз). */
export async function confirmEnroll(userId: string, code: string): Promise<string[]> {
  const user = await loadUser(userId);
  if (user.twoFactorEnabledAt) throw new DomainError('already_enabled', 409);
  if (!user.totpSecret) throw new DomainError('not_started', 409);
  if (!verifyTotp(user.totpSecret, code)) throw new DomainError('bad_code', 400);

  const codes = Array.from({ length: BACKUP_COUNT }, genBackupCode);
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { twoFactorEnabledAt: new Date() } }),
    db.recoveryCode.deleteMany({ where: { userId } }),
    db.recoveryCode.createMany({ data: codes.map((c) => ({ userId, codeHash: sha256(c) })) }),
  ]);
  return codes;
}

/** Проверить второй фактор при входе (TOTP или резервный код). */
export async function verifySecondFactor(userId: string, code: string): Promise<boolean> {
  const user = await loadUser(userId);
  if (!user.twoFactorEnabledAt || !user.totpSecret) return false;

  if (verifyTotp(user.totpSecret, code)) return true;

  // резервный код (одноразовый)
  const normalized = code.trim().toLowerCase();
  const row = await db.recoveryCode.findFirst({
    where: { userId, codeHash: sha256(normalized), usedAt: null },
  });
  if (!row) return false;
  await db.recoveryCode.update({ where: { id: row.id }, data: { usedAt: new Date() } });
  return true;
}

/** Отключить 2FA (после верного второго фактора). */
export async function disable(userId: string, code: string): Promise<void> {
  const ok = await verifySecondFactor(userId, code);
  if (!ok) throw new DomainError('bad_code', 400);
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { totpSecret: null, twoFactorEnabledAt: null } }),
    db.recoveryCode.deleteMany({ where: { userId } }),
  ]);
}

export async function twoFactorStatus(userId: string): Promise<{ enabled: boolean; recoveryLeft: number }> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { twoFactorEnabledAt: true } });
  const recoveryLeft = user?.twoFactorEnabledAt
    ? await db.recoveryCode.count({ where: { userId, usedAt: null } })
    : 0;
  return { enabled: Boolean(user?.twoFactorEnabledAt), recoveryLeft };
}
