import { cache } from 'react';
import { hash, verify } from '@node-rs/argon2';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import type { UserRole } from '@prisma/client';
import { db } from '@/lib/db';

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
  tokenVersion: number;
}

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('AUTH_SECRET не задан или короче 32 символов (.env)');
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ userId: payload.userId, role: payload.role, tokenVersion: payload.tokenVersion })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_DAYS}d`)
    .sign(secretKey());
}

/** Проверка ТОЛЬКО подписи/структуры (без БД) — для edge/дешёвых сценариев. */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (
      typeof payload.userId !== 'string' ||
      typeof payload.role !== 'string' ||
      typeof payload.tokenVersion !== 'number'
    ) {
      return null;
    }
    return { userId: payload.userId, role: payload.role as UserRole, tokenVersion: payload.tokenVersion };
  } catch {
    return null; // истёкший/битый токен = нет сессии, не ошибка
  }
}

/**
 * Текущая сессия из cookie с проверкой актуальности по БД (Server Components /
 * Route Handlers): отклоняет BANNED и токены со старым tokenVersion (отзыв при
 * бане/смене пароля/логауте-везде). Стоит одного запроса — приемлемо для SSR/API.
 */
// cache() (аудит №5): дедуп в пределах одного рендер-прохода — layout и
// SiteHeader зовут getSession каждый, без cache это двойная JWT-верификация +
// запрос к БД на каждой странице.
export const getSession = cache(async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const claims = await verifySessionToken(token);
  if (!claims) return null;

  const user = await db.user.findUnique({
    where: { id: claims.userId },
    select: { status: true, role: true, tokenVersion: true },
  });
  if (!user || user.status === 'BANNED' || user.tokenVersion !== claims.tokenVersion) return null;

  // роль берём из БД (актуальнее токена, если менялась)
  return { userId: claims.userId, role: user.role, tokenVersion: user.tokenVersion };
});

// ─── Промежуточный стейт «первый фактор пройден» (2FA) ──────────────────────
// После верного пароля, если у юзера включена 2FA, полную сессию НЕ выдаём —
// выдаём короткоживущий подписанный токен, дающий право только на экран ввода кода.
export const PENDING_2FA_COOKIE = 'rp_2fa';

export async function createPending2faToken(userId: string): Promise<string> {
  return new SignJWT({ userId, typ: '2fa' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(secretKey());
}

export async function verifyPending2faToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.typ !== '2fa' || typeof payload.userId !== 'string') return null;
    return payload.userId;
  } catch {
    return null;
  }
}

export function pending2faCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 10 * 60,
  };
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

// ─── Яндекс OAuth: CSRF-state + промежуточный профиль (до выбора роли) ────────
export const YANDEX_STATE_COOKIE = 'rp_yx_state';
export const YANDEX_PENDING_COOKIE = 'rp_yx_pending';

export interface YandexPending {
  yandexId: string;
  email: string | null;
  firstName: string;
  lastName: string;
}

// Подписанный токен с ВЕРИФИЦИРОВАННЫМ у Яндекса профилем — чтобы не доверять
// клиенту при завершении регистрации (выбор роли). typ:'yandex', 15 мин.
export async function createYandexPendingToken(p: YandexPending): Promise<string> {
  return new SignJWT({ typ: 'yandex', ...p })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(secretKey());
}

export async function verifyYandexPendingToken(token: string): Promise<YandexPending | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.typ !== 'yandex' || typeof payload.yandexId !== 'string') return null;
    return {
      yandexId: payload.yandexId,
      email: (typeof payload.email === 'string' ? payload.email : null),
      firstName: typeof payload.firstName === 'string' ? payload.firstName : 'Пользователь',
      lastName: typeof payload.lastName === 'string' ? payload.lastName : '—',
    };
  } catch {
    return null;
  }
}

export function shortLivedCookieOptions(maxAgeSec: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSec,
  };
}
