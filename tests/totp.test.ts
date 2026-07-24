import { describe, expect, it } from 'vitest';
import { base32Encode, base32Decode, totpCode, verifyTotp, otpauthUri } from '@/lib/totp';
import { APP_NAME } from '@/lib/constants';

// Эталонный секрет RFC 6238 (Appendix B): ASCII "12345678901234567890"
const SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('totp: RFC 6238 (чистые функции, без env)', () => {
  it('base32 round-trip', () => {
    expect(base32Decode(base32Encode(Buffer.from('12345678901234567890'))).toString()).toBe('12345678901234567890');
  });

  it('коды совпадают с документированными векторами RFC 6238 (SHA-1, 6 цифр)', () => {
    // T=59с → шаг 1 → 8-значный 94287082 → 6-значный 287082
    expect(totpCode(SECRET, 59 * 1000)).toBe('287082');
    // T=1111111109 → 07081804 → 081804
    expect(totpCode(SECRET, 1111111109 * 1000)).toBe('081804');
    // T=1234567890 → 89005924 → 005924
    expect(totpCode(SECRET, 1234567890 * 1000)).toBe('005924');
  });

  it('verifyTotp: свежий код проходит, чужой/старый — нет; окно ±1 период', () => {
    const now = 1111111109 * 1000;
    expect(verifyTotp(SECRET, '081804', now)).toBe(true);
    expect(verifyTotp(SECRET, '000000', now)).toBe(false);
    expect(verifyTotp(SECRET, 'abc', now)).toBe(false);
    // соседний период (−30с) в окне ±1 — проходит
    expect(verifyTotp(SECRET, totpCode(SECRET, now - 30_000), now, 1)).toBe(true);
    // два периода назад — вне окна
    expect(verifyTotp(SECRET, totpCode(SECRET, now - 90_000), now, 1)).toBe(false);
  });

  it('otpauthUri содержит секрет и издателя', () => {
    const uri = otpauthUri(SECRET, 'user@test.local');
    expect(uri).toContain('otpauth://totp/');
    expect(uri).toContain(`secret=${SECRET}`);
    // issuer кодируется как application/x-www-form-urlencoded (пробел → '+')
    const encIssuer = encodeURIComponent(APP_NAME).replace(/%20/g, '+');
    expect(uri).toContain(`issuer=${encIssuer}`);
  });
});
