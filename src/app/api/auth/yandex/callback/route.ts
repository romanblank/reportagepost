import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { APP_DOMAIN } from '@/lib/constants';
import { exchangeCode, fetchYandexUser, yandexOAuthConfigured } from '@/lib/yandex-oauth';
import {
  SESSION_COOKIE, createSessionToken, sessionCookieOptions,
  YANDEX_STATE_COOKIE, YANDEX_PENDING_COOKIE, createYandexPendingToken, shortLivedCookieOptions,
} from '@/lib/auth';

const BASE = `https://${APP_DOMAIN}`;
const abs = (path: string) => new URL(path, BASE);

// Callback Яндекс-входа: проверяем CSRF-state, меняем код на токен (сервер+секрет),
// тянем профиль. Линкуем по yandexId → по email; иначе — на выбор роли.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  if (url.searchParams.get('error')) return NextResponse.redirect(abs('/ru/login?error=yandex_denied'));
  if (!yandexOAuthConfigured()) return NextResponse.redirect(abs('/ru/login?error=yandex_off'));

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieState = req.cookies.get(YANDEX_STATE_COOKIE)?.value;
  if (!code || !state || !cookieState || state !== cookieState) {
    return NextResponse.redirect(abs('/ru/login?error=yandex_state'));
  }

  let profile;
  try {
    const token = await exchangeCode(code);
    profile = await fetchYandexUser(token);
  } catch {
    return NextResponse.redirect(abs('/ru/login?error=yandex_failed'));
  }

  const clearState = (res: NextResponse) => { res.cookies.set(YANDEX_STATE_COOKIE, '', shortLivedCookieOptions(0)); return res; };
  const login = async (userId: string, role: 'PHOTOGRAPHER' | 'CLIENT' | 'ADMIN', tokenVersion: number, to: string) => {
    const token = await createSessionToken({ userId, role, tokenVersion });
    const res = NextResponse.redirect(abs(to));
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return clearState(res);
  };

  // 1) уже связан по yandexId
  const byYandex = await db.user.findUnique({ where: { yandexId: profile.yandexId } });
  if (byYandex) {
    if (byYandex.status === 'BANNED') return clearState(NextResponse.redirect(abs('/ru/login?error=banned')));
    return login(byYandex.id, byYandex.role, byYandex.tokenVersion, '/ru/cabinet');
  }

  // 2) есть аккаунт с этим email (Яндекс верифицирует владение) → линкуем
  if (profile.email) {
    const byEmail = await db.user.findUnique({ where: { email: profile.email } });
    if (byEmail) {
      if (byEmail.status === 'BANNED') return clearState(NextResponse.redirect(abs('/ru/login?error=banned')));
      await db.user.update({
        where: { id: byEmail.id },
        data: {
          yandexId: profile.yandexId,
          // Вход через Яндекс — доказательство владения адресом
          ...(byEmail.emailVerifiedAt ? {} : { emailVerifiedAt: new Date() }),
        },
      });
      return login(byEmail.id, byEmail.role, byEmail.tokenVersion, '/ru/cabinet');
    }
  }

  // 3) новый пользователь → на выбор роли (профиль в подписанном pending-токене)
  const pending = await createYandexPendingToken(profile);
  const res = NextResponse.redirect(abs('/ru/auth/role'));
  res.cookies.set(YANDEX_PENDING_COOKIE, pending, shortLivedCookieOptions(900));
  return clearState(res);
}
