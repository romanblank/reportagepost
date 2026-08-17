import { SignJWT, jwtVerify } from 'jose';

/**
 * Приглашение прошлого заказчика подтвердить съёмку.
 *
 * Первые авторы приходят со своей репутацией, но все их заказчики — вне
 * платформы: отметить съёмку можно было только из переписки, которой нет.
 * Единственный честный сигнал доверия («снимали вместе N раз») на старте был
 * недостижим — механизм импорта репутации дешевле конкурсов и работает на
 * пустой платформе (аудит 2026-08-16, продуктовый №8).
 *
 * Подписанный токен вместо таблицы: состояния у приглашения нет (оно не
 * одноразовое — автор шлёт одну ссылку нескольким прошлым клиентам), а
 * подделку исключает подпись. Trust-модель НЕ ослабляется: приглашённый
 * заказчик — почти всегда свежий аккаунт, его подтверждение уходит в
 * needsReview к человеку. Наказывать за новизну нельзя, пропускать накрутку —
 * тоже: очередь и решает.
 */
const PURPOSE = 'shoot-invite';
const TTL = '30d';

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET is not set');
  return new TextEncoder().encode(secret);
}

export async function createShootInvite(profileId: string): Promise<string> {
  return new SignJWT({ profileId, purpose: PURPOSE })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TTL)
    .sign(secretKey());
}

export async function verifyShootInvite(token: string): Promise<{ profileId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.purpose !== PURPOSE || typeof payload.profileId !== 'string') return null;
    return { profileId: payload.profileId };
  } catch {
    return null;
  }
}
