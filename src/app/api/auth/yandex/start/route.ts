import { NextResponse } from 'next/server';
import { buildAuthUrl, yandexStartConfigured } from '@/lib/yandex-oauth';
import { YANDEX_NEXT_COOKIE, YANDEX_STATE_COOKIE, shortLivedCookieOptions } from '@/lib/auth';

// Старт Яндекс-входа: генерим CSRF-state, кладём в httpOnly-cookie, редиректим на
// страницу согласия Яндекса. Достаточно ClientID (секрет нужен на callback).
export function GET(req: Request) {
  if (!yandexStartConfigured()) {
    return NextResponse.redirect(new URL('/ru/login?error=yandex_off', `https://reportagepost.com`));
  }
  const state = crypto.randomUUID();
  const res = NextResponse.redirect(buildAuthUrl(state));
  res.cookies.set(YANDEX_STATE_COOKIE, state, shortLivedCookieOptions(600));
  // ?next= — возврат после входа (приглашение подтвердить съёмку). Только
  // локальный путь: открытый редирект через OAuth-цикл недопустим
  const next = new URL(req.url).searchParams.get('next');
  if (next && /^\/ru\//.test(next) && next.length < 500) {
    res.cookies.set(YANDEX_NEXT_COOKIE, next, shortLivedCookieOptions(600));
  }
  return res;
}
