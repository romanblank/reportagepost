import { hash, verify } from '@node-rs/argon2';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import type { UserRole } from '@prisma/client';

// ─── Пароли (argon2id — стандарт 2026) ─────────────────────────────────────

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

export function verifyPassword(hashStr: string, plain: string): Promise<boolean> {
  return verify(hashStr, plain).catch(() => false);
}

// ─── Сессии: JWT (HS256) в httpOnly-cookie ──────────────────────────────────

export const SESSION_COOKIE = 'rp_session';
const SESSION_TTL_DAYS = 30;

export interface SessionPayload {
  userId: string;
  role: UserRole;
}

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('AUTH_SECRET не задан или короче 32 символов (.env)');
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ userId: payload.userId, role: payload.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_DAYS}d`)
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (typeof payload.userId !== 'string' || typeof payload.role !== 'string') return null;
    return { userId: payload.userId, role: payload.role as UserRole };
  } catch {
    return null; // истёкший/битый токен = нет сессии, не ошибка
  }
}

/** Текущая сессия из cookie (Server Components / Route Handlers). */
export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  };
}
