import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { db } from '@/lib/db';
import { recomputeRatings } from '@/lib/rating';
import { handleRoute, jsonError } from '@/lib/errors';

// Плановое обслуживание (аудит 2026-07-31, P1: в проде не было НИ ОДНОГО
// планировщика). Что делает:
// 1) полный пересчёт рейтингов — затухание лайков есть функция ВРЕМЕНИ, без
//    периодического прохода старые лайки продолжают весить как свежие;
// 2) чистка протухших строк RateLimit — таблица росла бесконечно (строка на
//    каждый ключ×окно) и не убиралась никогда.
//
// Вызывается GitHub Actions по расписанию с bearer-секретом JOBS_SECRET.
// Без секрета в окружении роут выключен (не оставляем открытую дверь).
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = process.env.JOBS_SECRET;
  if (!secret) return false;
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function POST(req: Request) {
  return handleRoute(async () => {
    if (!authorized(req)) return jsonError('forbidden', 403);

    const startedAt = Date.now();
    const profiles = await recomputeRatings();

    // Сверка веса подписки с её реальным состоянием (S5-блокер): proRank
    // проставляется при зачислении и сам по себе не сбрасывается, поэтому
    // истёкшая подписка иначе навсегда оставляла бы автору полку
    // «Рекомендуемые» и приоритет модерации.
    const { reconcileSubRanks } = await import('@/lib/subscription');
    const ranksFixed = await reconcileSubRanks();

    // Окна rate-limit живут максимум сутки — всё старше не нужно никому
    const cutoff = new Date(Date.now() - 25 * 3_600_000);
    const { count: rateLimitRows } = await db.rateLimit.deleteMany({
      where: { windowStart: { lt: cutoff } },
    });

    // Протухшие одноразовые токены (сброс пароля, подтверждение почты)
    const [{ count: resets }, { count: verifications }] = await Promise.all([
      db.passwordReset.deleteMany({ where: { expiresAt: { lt: cutoff } } }),
      db.emailVerification.deleteMany({ where: { expiresAt: { lt: cutoff } } }),
    ]);

    // Ретенция журнала событий (аудит 2026-08-01, P2). ActivityEvent — самая
    // растущая таблица платформы (строка на каждый уникальный просмотр
    // профиля), а читается окном 30 дней. Без ретенции бесконечно дорожают
    // дамп, restore-drill и сама запись. 400 дней — больше года, чтобы
    // годовые сравнения оставались возможны.
    // Батчами: один deleteMany на миллион строк держал бы длинную транзакцию
    // и раздувал WAL.
    const eventCutoff = new Date(Date.now() - 400 * 24 * 3_600_000);
    let activityRows = 0;
    for (let pass = 0; pass < 50; pass++) {
      const batch = await db.activityEvent.findMany({
        where: { createdAt: { lt: eventCutoff } },
        select: { id: true },
        take: 5_000,
      });
      if (batch.length === 0) break;
      const { count } = await db.activityEvent.deleteMany({ where: { id: { in: batch.map((r) => r.id) } } });
      activityRows += count;
      if (batch.length < 5_000) break;
    }

    return NextResponse.json({
      ok: true,
      profiles,
      ranksFixed,
      cleaned: { rateLimitRows, resets, verifications, activityRows },
      tookMs: Date.now() - startedAt,
    });
  });
}
