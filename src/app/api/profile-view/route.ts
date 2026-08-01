import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { recordProfileView, viewedRecently } from '@/lib/analytics';
import { handleRoute, jsonError } from '@/lib/errors';
// clientIp — из общего модуля (аудит 2026-08-01, P2): здесь жила его копия,
// и правка приоритета заголовков (x-real-ip перед XFF — она уже была) должна
// была вноситься в два места. Map-лимитер ниже остаётся: для beacon-а с
// частотой в десятки в минуту запись в БД на каждый запрос неоправданна.
import { clientIp } from '@/lib/rate-limit';

// Beacon просмотра профиля (POST { profileId }). Защита от инфляции метрики
// (это платная ценность Prime/Elite) и абьюза открытого эндпоинта:
//  1) cookie-дедуп rp_pv — один просмотр профиля на браузер в пределах 6ч (ловит
//     refresh как у анонимов, так и у авторизованных);
//  2) in-memory rate-limit по IP — бэкстоп против скриптового накрута;
//  3) DB-дедуп по актору (авторизованные, на случай очищенных cookie);
//  4) владелец не считается; боты без JS не пишут.

const PV_COOKIE = 'rp_pv';
const PV_MAX = 40; // сколько profileId помним в cookie
const PV_TTL = 6 * 60 * 60; // 6ч

// Простой per-IP rate-limit (одна инстанция контейнера → Map живёт между запросами)
const RL = new Map<string, number[]>();
function rateLimited(ip: string, max = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const arr = (RL.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (arr.length >= max) { RL.set(ip, arr); return true; }
  arr.push(now);
  RL.set(ip, arr);
  if (RL.size > 5000) { for (const [k, v] of RL) if (v.every((t) => now - t > windowMs)) RL.delete(k); }
  return false;
}

function viewedCookie(req: Request): string[] {
  const m = (req.headers.get('cookie') ?? '').match(/(?:^|;\s*)rp_pv=([^;]+)/);
  if (!m) return [];
  try { return decodeURIComponent(m[1]).split(',').filter(Boolean); } catch { return []; }
}

export function POST(req: Request) {
  return handleRoute(async () => {
    // Отказ от аналитики уважаем (аудит 2026-08-01, P2): beacon просмотра — это
    // необязательный трекинг, и раньше он шёл независимо от решения человека
    // в cookie-баннере. Считаем просмотр только при явном согласии; отсутствие
    // решения тоже трактуем как отказ — молчание согласием не является.
    const consent = (req.headers.get('cookie') ?? '').match(/(?:^|;\s*)rp_consent=([^;]+)/)?.[1] ?? '';
    if (!consent.startsWith('all')) return NextResponse.json({ ok: true, counted: false });

    const body = await req.json().catch(() => ({}));
    const profileId = typeof body?.profileId === 'string' ? body.profileId : null;
    if (!profileId) return jsonError('bad_request', 400);

    const profile = await db.photographerProfile.findUnique({
      where: { id: profileId },
      select: { userId: true, status: true },
    });
    if (!profile || profile.status !== 'APPROVED') return NextResponse.json({ ok: true });

    const session = await getSession();
    const actorUserId = session?.userId ?? null;
    if (actorUserId && actorUserId === profile.userId) return NextResponse.json({ ok: true });

    // cookie-дедуп: уже смотрел этот профиль недавно
    const viewed = viewedCookie(req);
    if (viewed.includes(profileId)) return NextResponse.json({ ok: true });

    // rate-limit по IP (тихо игнорируем накрут, без 429-шума)
    if (rateLimited(clientIp(req))) return NextResponse.json({ ok: true });

    // DB-дедуп для авторизованных (cookie могли очистить)
    if (actorUserId && (await viewedRecently(profileId, actorUserId))) return NextResponse.json({ ok: true });

    await recordProfileView(profileId, actorUserId);

    const res = NextResponse.json({ ok: true });
    res.cookies.set(PV_COOKIE, [...viewed, profileId].slice(-PV_MAX).join(','), {
      httpOnly: true, sameSite: 'lax', path: '/', maxAge: PV_TTL,
    });
    return res;
  });
}
