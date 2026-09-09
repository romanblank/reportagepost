import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { PDN_CONSENT_VERSION } from '@/lib/constants';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import {
  SESSION_COOKIE, createSessionToken, sessionCookieOptions,
  PENDING_2FA_COOKIE, createPending2faToken, pending2faCookieOptions,
  YANDEX_NEXT_COOKIE, YANDEX_PENDING_COOKIE, verifyYandexPendingToken, shortLivedCookieOptions,
} from '@/lib/auth';
import { safeToLink } from '@/lib/oauth-link';

const Schema = z.object({
  role: z.enum(['PHOTOGRAPHER', 'CLIENT']),
  pdnConsent: z.literal(true), // согласие ПДн обязательно и при входе через Яндекс (152-ФЗ)
});

// Завершение регистрации через Яндекс: профиль берём из ВЕРИФИЦИРОВАННОГО pending-
// токена (не из тела — клиенту не верим), роль/согласие — из тела.
export async function POST(req: NextRequest) {
  const pendingToken = req.cookies.get(YANDEX_PENDING_COOKIE)?.value;
  const profile = pendingToken ? await verifyYandexPendingToken(pendingToken) : null;
  if (!profile) return NextResponse.json({ error: 'expired' }, { status: 401 });

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'validation' }, { status: 400 });
  // Роут завершает вход через Яндекс и СОЗДАЁТ аккаунт. Сессии здесь ещё нет,
  // поэтому ограничиваем по адресу: без лимита один источник мог бы штамповать
  // аккаунты, а это единственная точка платформы, где они появляются без
  // пароля и без письма
  await rateLimit(`yandex-complete:ip:${clientIp(req)}`, 20, 3600);

  const { role } = parsed.data;

  const clearPending = (res: NextResponse) => { res.cookies.set(YANDEX_PENDING_COOKIE, '', shortLivedCookieOptions(0)); return res; };
  // Возврат по next-cookie (ссылка-приглашение подтвердить съёмку) важнее
  // дефолтного кабинета; принимаем только локальный /ru/-путь
  const nextCookie = req.cookies.get(YANDEX_NEXT_COOKIE)?.value;
  const safeNext = nextCookie && /^\/ru\//.test(nextCookie) ? nextCookie : null;
  type LinkableUser = {
    id: string;
    role: 'PHOTOGRAPHER' | 'CLIENT' | 'ADMIN';
    tokenVersion: number;
    twoFactorEnabledAt: Date | null;
  };
  const finish = async (user: LinkableUser, to: string) => {
    // 2FA действует и на этом пути (аудит 2026-09-10, П1): ветки byYandex и
    // byEmail попадают сюда для СУЩЕСТВУЮЩИХ аккаунтов, у которых второй
    // фактор может быть включён. Клиент по twoFactor уводит на экран кода.
    if (user.twoFactorEnabledAt) {
      const pending = await createPending2faToken(user.id);
      const dest = safeNext ? `/ru/login?2fa=1&next=${encodeURIComponent(safeNext)}` : '/ru/login?2fa=1';
      const res = NextResponse.json({ ok: true, twoFactor: true, redirect: dest });
      res.cookies.set(PENDING_2FA_COOKIE, pending, pending2faCookieOptions());
      res.cookies.set(YANDEX_NEXT_COOKIE, '', shortLivedCookieOptions(0));
      return clearPending(res);
    }
    const token = await createSessionToken({ userId: user.id, role: user.role, tokenVersion: user.tokenVersion });
    const res = NextResponse.json({ ok: true, redirect: safeNext ?? to });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    res.cookies.set(YANDEX_NEXT_COOKIE, '', shortLivedCookieOptions(0));
    return clearPending(res);
  };

  // Гонка/повтор: если аккаунт уже создан (yandexId или email) — линкуем/входим.
  // BANNED зеркалит callback (аудит 2026-09-10, П3): getSession всё равно не
  // пустил бы, но выставлять cookie забаненному незачем.
  const byYandex = await db.user.findUnique({ where: { yandexId: profile.yandexId } });
  if (byYandex) {
    if (byYandex.status === 'BANNED') return clearPending(NextResponse.json({ error: 'banned' }, { status: 403 }));
    return finish(byYandex, '/ru/cabinet');
  }
  if (profile.email) {
    const byEmail = await db.user.findUnique({ where: { email: profile.email } });
    if (byEmail) {
      if (byEmail.status === 'BANNED') return clearPending(NextResponse.json({ error: 'banned' }, { status: 403 }));
      // Гард захвата аккаунта — общий модуль oauth-link (одна копия на оба пути)
      if (!safeToLink(byEmail)) {
        return clearPending(NextResponse.json({ error: 'email_taken' }, { status: 409 }));
      }
      // При включённой 2FA линковку откладываем до второго фактора — как в callback
      if (byEmail.twoFactorEnabledAt) {
        return finish(byEmail, '/ru/cabinet');
      }

      await db.user.update({
        where: { id: byEmail.id },
        data: {
          yandexId: profile.yandexId,
          // Вход через Яндекс — доказательство владения адресом
          ...(byEmail.emailVerifiedAt ? {} : { emailVerifiedAt: new Date() }),
        },
      });
      return finish(byEmail, '/ru/cabinet');
    }
  }

  let user;
  try {
    user = await db.user.create({
      data: {
        role,
        status: role === 'CLIENT' ? 'ACTIVE' : 'PENDING',
        firstName: profile.firstName,
        lastName: profile.lastName,
        email: profile.email,
        yandexId: profile.yandexId,
        pdnConsentAt: new Date(),
        pdnConsentVersion: PDN_CONSENT_VERSION,
        // Яндекс подтверждает владение адресом при выдаче профиля — значит для
        // нас он подтверждён. Иначе такой человек навсегда заперт: подтвердить
        // съёмку и оставить отзыв нельзя, а письма ему никто не отправлял.
        emailVerifiedAt: profile.email ? new Date() : null,
      },
    });
  } catch (e) {
    // Двойной сабмит формы роли: оба запроса прочитали «аккаунта нет», второй
    // create падает на уникальном yandexId/email. Это не ошибка человека —
    // аккаунт уже есть, входим в него (аудит 2026-09-10, П2)
    if ((e as { code?: string }).code === 'P2002') {
      const existing = await db.user.findUnique({ where: { yandexId: profile.yandexId } });
      if (existing && existing.status !== 'BANNED') return finish(existing, '/ru/cabinet');
    }
    throw e;
  }
  return finish(user, role === 'PHOTOGRAPHER' ? '/ru/onboarding' : '/ru/cabinet');
}
