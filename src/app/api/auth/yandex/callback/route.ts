import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { APP_DOMAIN } from '@/lib/constants';
import { exchangeCode, fetchYandexUser, yandexOAuthConfigured } from '@/lib/yandex-oauth';
import { safeToLink } from '@/lib/oauth-link';
import {
  SESSION_COOKIE, createSessionToken, sessionCookieOptions,
  PENDING_2FA_COOKIE, createPending2faToken, pending2faCookieOptions,
  YANDEX_NEXT_COOKIE, YANDEX_STATE_COOKIE, YANDEX_PENDING_COOKIE, createYandexPendingToken, shortLivedCookieOptions,
} from '@/lib/auth';

const BASE = `https://${APP_DOMAIN}`;
const abs = (path: string) => new URL(path, BASE);

type LinkableUser = {
  id: string;
  role: 'PHOTOGRAPHER' | 'CLIENT' | 'ADMIN';
  tokenVersion: number;
  twoFactorEnabledAt: Date | null;
};

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
  // Возврат по next-cookie (приглашение подтвердить съёмку): дефолтные
  // адреса перекрываются только локальным /ru/-путём из нашей же cookie
  const nextCookie = req.cookies.get(YANDEX_NEXT_COOKIE)?.value;
  const safeNext = nextCookie && /^\/ru\//.test(nextCookie) ? nextCookie : null;
  const login = async (user: LinkableUser, to: string) => {
    // 2FA обязана действовать и здесь (аудит 2026-09-10, П1): второй фактор
    // ставят ровно на случай компрометации пароля/почты, а вход через Яндекс —
    // это вход по чужому паролю Яндекса или по доступу к ящику. Полная сессия
    // без кода превращала бы 2FA в декорацию.
    if (user.twoFactorEnabledAt) {
      const pending = await createPending2faToken(user.id);
      const dest = safeNext ? `/ru/login?2fa=1&next=${encodeURIComponent(safeNext)}` : '/ru/login?2fa=1';
      const res = NextResponse.redirect(abs(dest));
      res.cookies.set(PENDING_2FA_COOKIE, pending, pending2faCookieOptions());
      res.cookies.set(YANDEX_NEXT_COOKIE, '', shortLivedCookieOptions(0));
      return clearState(res);
    }
    const token = await createSessionToken({ userId: user.id, role: user.role, tokenVersion: user.tokenVersion });
    const res = NextResponse.redirect(abs(safeNext ?? to));
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    res.cookies.set(YANDEX_NEXT_COOKIE, '', shortLivedCookieOptions(0));
    return clearState(res);
  };

  // 1) уже связан по yandexId
  const byYandex = await db.user.findUnique({ where: { yandexId: profile.yandexId } });
  if (byYandex) {
    if (byYandex.status === 'BANNED') return clearState(NextResponse.redirect(abs('/ru/login?error=banned')));
    return login(byYandex, '/ru/cabinet');
  }

  // 2) есть аккаунт с этим email (Яндекс верифицирует владение) → линкуем.
  // Гард захвата аккаунта — общий модуль oauth-link (одна копия на оба пути)
  if (profile.email) {
    const byEmail = await db.user.findUnique({ where: { email: profile.email } });
    if (byEmail) {
      if (byEmail.status === 'BANNED') return clearState(NextResponse.redirect(abs('/ru/login?error=banned')));
      if (!safeToLink(byEmail)) {
        return clearState(NextResponse.redirect(abs('/ru/login?error=email_taken')));
      }
      // Линковка при включённой 2FA — только ПОСЛЕ второго фактора: иначе
      // доступ к ящику жертвы позволял бы привязать чужой Яндекс к её
      // аккаунту в обход кода. yandexId пишем после верификации — здесь
      // достаточно отправить на экран кода без записи.
      if (byEmail.twoFactorEnabledAt) {
        return login(byEmail, '/ru/cabinet');
      }

      await db.user.update({
        where: { id: byEmail.id },
        data: {
          yandexId: profile.yandexId,
          // Вход через Яндекс — доказательство владения адресом
          ...(byEmail.emailVerifiedAt ? {} : { emailVerifiedAt: new Date() }),
        },
      });
      return login(byEmail, '/ru/cabinet');
    }
  }

  // 3) новый пользователь → на выбор роли (профиль в подписанном pending-токене)
  const pending = await createYandexPendingToken(profile);
  const res = NextResponse.redirect(abs('/ru/auth/role'));
  res.cookies.set(YANDEX_PENDING_COOKIE, pending, shortLivedCookieOptions(900));
  return clearState(res);
}
