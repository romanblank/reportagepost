import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { PDN_CONSENT_VERSION } from '@/lib/constants';
import {
  SESSION_COOKIE, createSessionToken, sessionCookieOptions,
  YANDEX_PENDING_COOKIE, verifyYandexPendingToken, shortLivedCookieOptions,
} from '@/lib/auth';

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
  const { role } = parsed.data;

  const clearPending = (res: NextResponse) => { res.cookies.set(YANDEX_PENDING_COOKIE, '', shortLivedCookieOptions(0)); return res; };
  const finish = async (userId: string, r: 'PHOTOGRAPHER' | 'CLIENT' | 'ADMIN', tokenVersion: number, to: string) => {
    const token = await createSessionToken({ userId, role: r, tokenVersion });
    const res = NextResponse.json({ ok: true, redirect: to });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return clearPending(res);
  };

  // Гонка/повтор: если аккаунт уже создан (yandexId или email) — линкуем/входим.
  const byYandex = await db.user.findUnique({ where: { yandexId: profile.yandexId } });
  if (byYandex) return finish(byYandex.id, byYandex.role, byYandex.tokenVersion, '/ru/cabinet');
  if (profile.email) {
    const byEmail = await db.user.findUnique({ where: { email: profile.email } });
    if (byEmail) {
      // Связывать можно только с аккаунтом, который заведомо принадлежит
      // этому же человеку: подтверждённым адресом или созданным через вход
      // без пароля. Иначе получается захват: злоумышленник регистрирует
      // аккаунт на ЧУЖУЮ почту (подтверждение при регистрации не требуется),
      // задаёт свой пароль — и когда настоящий владелец адреса входит через
      // Яндекс, он попадает в аккаунт, пароль от которого знает чужой человек.
      const safeToLink = Boolean(byEmail.emailVerifiedAt) || !byEmail.passwordHash;
      if (!safeToLink) {
        return clearPending(NextResponse.json({ error: 'email_taken' }, { status: 409 }));
      }

      await db.user.update({
        where: { id: byEmail.id },
        data: {
          yandexId: profile.yandexId,
          // Вход через Яндекс — доказательство владения адресом
          ...(byEmail.emailVerifiedAt ? {} : { emailVerifiedAt: new Date() }),
        },
      });
      return finish(byEmail.id, byEmail.role, byEmail.tokenVersion, '/ru/cabinet');
    }
  }

  const user = await db.user.create({
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
  return finish(user.id, user.role, user.tokenVersion, role === 'PHOTOGRAPHER' ? '/ru/onboarding' : '/ru/cabinet');
}
