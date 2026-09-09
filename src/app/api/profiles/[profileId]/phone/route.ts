import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { revealPhone } from '@/lib/phone-reveal';
import { hashIp } from '@/lib/ip-hash';
import { handleRoute } from '@/lib/errors';
import { clientIp, rateLimit } from '@/lib/rate-limit';

// «Показать номер»: раскрытие кликом (телефона нет в SSR-разметке — спам-ботам
// нечего парсить). Доступно и гостю (лид дороже логин-стены). Rate-limit ДЛЯ ВСЕХ
// (ревью 2026-07-31, P2): один бесплатный аккаунт иначе выкачивал бы номера всего
// каталога без ограничений. Гостю — ключ по IP, сессии — по userId (щедрее:
// живой заказчик листает многих авторов).
export function POST(req: Request, { params }: { params: Promise<{ profileId: string }> }) {
  return handleRoute(async () => {
    const session = await getSession();
    if (session) {
      await rateLimit(`phone-reveal:user:${session.userId}`, 60, 3600);
    } else {
      await rateLimit(`phone-reveal:ip:${clientIp(req)}`, 20, 3600);
    }
    const { profileId } = await params;
    // Гостевой ключ для дедупа событий — HMAC-хеш IP (сырой IP в БД не пишем,
    // PII; голый sha256 перебирался бы — аудит 2026-09-10)
    const guestKey = session ? null : hashIp('phone-reveal', clientIp(req))?.slice(0, 16) ?? null;
    return NextResponse.json(await revealPhone(profileId, session?.userId ?? null, guestKey));
  });
}
