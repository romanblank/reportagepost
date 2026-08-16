import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { db } from '@/lib/db';
import { ru } from '@/i18n/ru';
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
    // Отметка о прогоне — панель администратора показывает, когда задача
    // отработала в последний раз, и краснеет, если она молчит дольше порога
    const { startJobRun, finishJobRun, pruneJobRuns } = await import('@/lib/job-run');
    const runId = await startJobRun('maintenance');
    const profiles = await recomputeRatings();

    // Сверка веса подписки с её реальным состоянием (S5-блокер): proRank
    // проставляется при зачислении и сам по себе не сбрасывается, поэтому
    // истёкшая подписка иначе навсегда оставляла бы автору полку
    // «Рекомендуемые» и приоритет модерации.
    // Почта: проверяем соединение раз в сутки. Настроенный, но неработающий
    // SMTP выглядит снаружи так же, как работающий — письма просто не доходят,
    // и узнаёт об этом первый пользователь, а не оператор (2026-08-03).
    const { emailConfigured, verifyMailTransport } = await import('@/lib/email');
    if (emailConfigured()) {
      const mail = await verifyMailTransport();
      if (!mail.ok) {
        const { alertOperator } = await import('@/lib/telegram');
        void alertOperator(ru.operatorAlerts.mailBroken(mail.error));
      }
    }

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
      // Согласия на cookie: срок доказательной ценности конечен (аудит
      // 2026-08-16 — таблица не чистилась вовсе). Три года покрывают любой
      // мыслимый разбор, дальше запись — только раздувание дампа
      db.cookieConsent.deleteMany({
        where: { createdAt: { lt: new Date(Date.now() - 3 * 365 * 86_400_000) } },
      }),
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

    // Суточная сводка оператору: высокочастотные события не должны звенеть
    // поштучно, иначе канал превращается в шум и его перестают читать
    const { adminDashboard } = await import('@/lib/admin-dashboard');
    const daily = await adminDashboard(1);
    const line = (arr: { key: string; value: number }[]) =>
      arr.filter((k) => k.value > 0).map((k) => `${k.key}: ${k.value}`).join(', ');
    const parts = [line(daily.money), line(daily.demand), line(daily.supply)].filter(Boolean);
    const queues = Object.values(daily.queues).reduce((a, b) => a + b, 0);
    const staleJobs = daily.jobs.filter((j) => j.stale).map((j) => j.name);
    if (parts.length > 0 || queues > 0 || staleJobs.length > 0) {
      const { alertOperator } = await import('@/lib/telegram');
      void alertOperator(
        [
          ru.operatorAlerts.dailyTitle,
          parts.length > 0 ? parts.join(' · ') : ru.operatorAlerts.dailyNothing,
          queues > 0 ? ru.operatorAlerts.dailyQueues(queues) : null,
          staleJobs.length > 0 ? ru.operatorAlerts.dailyStale(staleJobs.join(', ')) : null,
          'https://reportagepost.com/ru/admin',
        ].filter(Boolean).join('\n'),
      );
    }

    // Волны доставки заявок отсюда УБРАНЫ (аудит 2026-08-16): у них свой
    // кран каждые 15 минут (rp-inquiries.sh), и в 02:30 два прогона под
    // разными файловыми локами пересекались гарантированно — read-then-write
    // дедуп пропускал дубль, и уведомление о заявке уходило дважды.

    // ── Сроки хранения персональных данных (аудит 152-ФЗ 2026-08-03) ──────
    // Политика обещает уничтожение «по достижении целей», но в коде срок не был
    // задан НИ ДЛЯ ОДНОЙ таблицы. Самое острое — гостевые заявки: имя, телефон
    // и почта человека, у которого нет аккаунта, а значит нет и способа их
    // удалить. Цель обработки достигается за дни, хранились они вечно.
    const INQUIRY_DAYS = 180;
    const REPORT_DAYS = 365;
    const NOTIFICATION_DAYS = 180;

    // Заявку не удаляем целиком: она нужна для рыночной статистики (спрос по
    // городам и жанрам). Обезличиваем — контакты уходят, факт остаётся.
    const { count: inquiriesAnon } = await db.inquiry.updateMany({
      where: {
        createdAt: { lt: new Date(Date.now() - INQUIRY_DAYS * 86_400_000) },
        // contactName обязателен по схеме — заменяем на метку, остальное чистим
        OR: [{ contactPhone: { not: null } }, { contactEmail: { not: null } }, { contactName: { not: '—' } }],
      },
      data: { contactName: '—', contactPhone: null, contactEmail: null },
    });

    // Разобранные жалобы: свободный текст и контакт заявителя дальше не нужны
    const { count: reportsAnon } = await db.report.updateMany({
      where: {
        status: { in: ['RESOLVED', 'DISMISSED'] },
        createdAt: { lt: new Date(Date.now() - REPORT_DAYS * 86_400_000) },
        OR: [{ comment: { not: null } }, { contactEmail: { not: null } }],
      },
      data: { comment: null, contactEmail: null },
    });

    const { count: notificationsGone } = await db.notification.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - NOTIFICATION_DAYS * 86_400_000) } },
    });

    const jobRuns = await pruneJobRuns();
    await finishJobRun(runId, true, ru.operatorAlerts.maintenanceNote(profiles, rateLimitRows + resets + verifications + activityRows + jobRuns));

    return NextResponse.json({
      ok: true,
      profiles,
      ranksFixed,
      cleaned: { rateLimitRows, resets, verifications, activityRows, jobRuns, inquiriesAnon, reportsAnon, notificationsGone },
      tookMs: Date.now() - startedAt,
    });
  });
}
