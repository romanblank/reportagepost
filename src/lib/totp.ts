import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// TOTP (RFC 6238) на HMAC-SHA1, 6 цифр, окно 30с. Чистые функции — тестируемы,
// без внешних зависимостей. base32 (RFC 4648) для секрета (совместимо с Google
// Authenticator / Яндекс.Ключ и пр.).

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PERIOD = 30;
const DIGITS = 6;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str: string): Buffer {
  const clean = str.toUpperCase().replace(/=+$/,'').replace(/\s/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Новый случайный секрет (20 байт), base32. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  // 64-битный счётчик, big-endian (writeBigUInt64BE)
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (bin % 10 ** DIGITS).toString().padStart(DIGITS, '0');
}

/** Код на момент времени (мс). */
export function totpCode(secretB32: string, atMs = Date.now()): string {
  const counter = Math.floor(atMs / 1000 / PERIOD);
  return hotp(base32Decode(secretB32), counter);
}

/** Проверка кода с окном ±window периодов (допускает рассинхрон часов). */
export function verifyTotp(secretB32: string, code: string, atMs = Date.now(), window = 1): boolean {
  const clean = (code ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  const secret = base32Decode(secretB32);
  const counter = Math.floor(atMs / 1000 / PERIOD);
  for (let w = -window; w <= window; w++) {
    const expected = hotp(secret, counter + w);
    const a = Buffer.from(expected);
    const b = Buffer.from(clean);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

/** otpauth://-URI для QR / ручного ввода в приложение-аутентификатор. */
export function otpauthUri(secretB32: string, account: string, issuer = 'Репортаж Пост'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: secretB32,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(PERIOD),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
