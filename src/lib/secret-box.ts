import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Обратимое шифрование секретов, которые нельзя хешировать.
 *
 * Пароли и токены мы храним хешами — сверять их можно и так. Но секрет TOTP
 * нужен целиком, чтобы посчитать код, поэтому хеш не годится. Хранить его
 * открытым тоже нельзя: дамп базы каждую ночь уезжает в объектное хранилище, и
 * вместе с ним уехал бы второй фактор всех пользователей (аудит 152-ФЗ
 * 2026-08-03). Значит — шифрование ключом, который в дампе не лежит.
 *
 * AES-256-GCM: даёт и конфиденциальность, и проверку целостности — подменённый
 * шифротекст не расшифруется, а не выдаст мусор.
 *
 * Без ключа в окружении значение остаётся как есть: платформа не должна
 * падать из-за незаведённой переменной, а `isEncrypted` позволяет читать и
 * старые незашифрованные записи во время перехода.
 */
const PREFIX = 'enc.v1.';

function key(): Buffer | null {
  const raw = process.env.SECRET_BOX_KEY;
  if (!raw || raw.length < 16) return null;
  // Ключ произвольной длины сводим к 32 байтам — так его удобно задавать
  return createHash('sha256').update(raw).digest();
}

export function secretBoxAvailable(): boolean {
  return key() !== null;
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function encryptSecret(plain: string): string {
  const k = key();
  if (!k) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', k, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64url')}.${enc.toString('base64url')}.${tag.toString('base64url')}`;
}

export function decryptSecret(stored: string): string {
  if (!isEncrypted(stored)) return stored; // запись из времён до шифрования
  const k = key();
  if (!k) throw new Error('SECRET_BOX_KEY не задан, а значение зашифровано');
  const [, payload] = stored.split(PREFIX);
  const [ivB64, dataB64, tagB64] = payload.split('.');
  const decipher = createDecipheriv('aes-256-gcm', k, Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()]).toString('utf8');
}
