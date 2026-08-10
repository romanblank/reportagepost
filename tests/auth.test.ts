import { beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';
import {
  createSessionToken,
  hashPassword,
  verifyPassword,
  verifySessionToken,
} from '@/lib/auth';

beforeAll(() => {
  process.env.AUTH_SECRET ??= 'test-secret-32-chars-minimum-000000';
});

describe('auth: пароли', () => {
  it('argon2: хеш проверяется, неверный пароль отклоняется', async () => {
    const h = await hashPassword('correct horse battery staple');
    expect(await verifyPassword(h, 'correct horse battery staple')).toBe(true);
    expect(await verifyPassword(h, 'wrong')).toBe(false);
    expect(await verifyPassword('битый-хеш', 'x')).toBe(false); // не бросает
  });
});

describe('auth: сессии', () => {
  it('JWT: подписывается и верифицируется, мусор отклоняется', async () => {
    const token = await createSessionToken({ userId: 'u1', role: 'PHOTOGRAPHER', tokenVersion: 0 });
    const session = await verifySessionToken(token);
    expect(session).toEqual({ userId: 'u1', role: 'PHOTOGRAPHER', tokenVersion: 0 });
    expect(await verifySessionToken('garbage.token.here')).toBeNull();
  });
});


