import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { db } from '@/lib/db';
import { ru } from '@/i18n/ru';
import { handleRoute, jsonError } from '@/lib/errors';

// Плановое обслуживание (аудит 2026-07-31, P1: в проде не было НИ ОДНОГО
// планировщика). Задачи внутри НЕЗАВИСИМЫ и изолированы по ошибкам
// (аудит 2026-09-10, П1): раньше это был god-job — первая упавшая задача
// (например, пересчёт рейтингов, не уложившийся в maxDuration на выросшем
// каталоге) молча обрывала ВСЁ после себя, включая анонимизацию ПДн по
// 152-ФЗ и тихий выпуск подтверждений, а /health показывал stale без
// указания, что именно не выполнилось. Теперь каждая задача в своём
// try/catch, итоговая записка перечисляет упавшие поимённо, ok=false при
// любом сбое.
//
// Вызывается cron-ом VM с bearer-секретом JOBS_SECRET.
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
    const { finishJobRun, pruneJobRuns } = await import('@/lib/job-run');

    // Защита от параллельного прогона В САМОМ роуте, а не только flock-ом на
    // VM (аудит 2026-09-10): ручной curl оператора во время работающего крона
    // давал бы два одновременных recomputeRatings. Замок берётся в КОРОТКОЙ
    // транзакции только на время проверки+создания записи (long-running
    // advisory через пул течёт — урок releaseInquiries); сам прогон дальше
    // защищён записью JobRun с finishedAt=null.
    const LOCK_KEY = 0x52504d54; // 'RPMT'
    const runId = await db.$transaction(async (tx) => {
      const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(${LOCK_KEY}) AS locked`;
      if (!locked) return null;
      const running = await tx.jobRun.findFirst({
        where: {
          name: 'maintenance',
          finishedAt: null,
          startedAt: { gt: new Date(Date.now() - 30 * 60_000) },
        },
        select: { id: true },
      });
      if (running) return null;
      const run = await tx.jobRun.create({ data: { name: 'maintenance' } });
      return run.id;
    });
    if (!runId) return NextResponse.json({ ok: true, skipped: 'already_running' });

    // Изоляция ошибок: сбой одной задачи не гасит остальные и не теряется
    const failures: string[] = [];
    const step = async <T>(name: string, fn: () => Promise<T>): Promise<T | null> => {
      try {
        return await fn();
      } catch (e) {
        failures.push(name);
        console.error(`[maintenance] ${name} failed:`, e);
        return null;
      }
    };

    // 1) Полный пересчёт рейтингов — затухание лайков есть функция ВРЕМЕНИ,
    // без периодического прохода старые лайки продолжают весить как свежие
    const profiles = await step('ratings', async () => {
      const { recomputeRatings } = await import('@/lib/rating');
      return recomputeRatings();
    });

    // 2) Почта: настроенный, но неработающий SMTP снаружи неотличим от
    // работающего — письма просто не доходят (2026-08-03)
    await step('mail-check', async () => {
      const { emailConfigured, verifyMailTransport } = await import('@/lib/email');
      if (!emailConfigured()) return;
      const mail = await verifyMailTransport();
      if (!mail.ok) {
        const { alertOperator } = await import('@/lib/telegram');
        void alertOperator(ru.operatorAlerts.mailBroken(mail.error));
      }
    });

    // 3) Сверка веса подписки с реальным состоянием: proRank сам не
    // сбрасывается — истёкшая подписка навсегда оставляла бы полку
    const ranksFixed = await step('sub-ranks', async () => {
      const { reconcileSubRanks } = await import('@/lib/subscription');
      return reconcileSubRanks();
    });

    // 4) Чистка протухшего: rate-limit (окна живут сутки), одноразовые
    // токены, cookie-согласия (3 года доказательной ценности).
    // Деструктуризация ПОИМЕНОВАНА по позициям — вставка cookieConsent
    // вторым элементом молча сдвинула счётчики (аудит 2026-09-09)
    const cutoff = new Date(Date.now() - 25 * 3_600_000);
    const cleanedTokens = await step('gc-tokens', async () => {
      const { count: rateLimitRows } = await db.rateLimit.deleteMany({
        where: { windowStart: { lt: cutoff } },
      });
      const [{ count: resets }, { count: consents }, { count: verifications }] = await Promise.all([
        db.passwordReset.deleteMany({ where: { expiresAt: { lt: cutoff } } }),
        db.cookieConsent.deleteMany({
          where: { createdAt: { lt: new Date(Date.now() - 3 * 365 * 86_400_000) } },
        }),
        db.emailVerification.deleteMany({ where: { expiresAt: { lt: cutoff } } }),
      ]);
      return { rateLimitRows, resets, consents, verifications };
    });

    // 5) Ретенция журнала событий (аудит 2026-08-01, P2). ActivityEvent —
    // самая растущая таблица платформы, читается окном 30 дней; 400 дней
    // хватает на годовые сравнения. Батчами — один deleteMany на миллион
    // строк держал бы длинную транзакцию и раздувал WAL.
    const activityRows = await step('gc-activity', async () => {
      const eventCutoff = new Date(Date.now() - 400 * 24 * 3_600_000);
      let removed = 0;
      for (let pass = 0; pass < 50; pass++) {
        const batch = await db.activityEvent.findMany({
          where: { createdAt: { lt: eventCutoff } },
          select: { id: true },
          take: 5_000,
        });
        if (batch.length === 0) break;
        const { count } = await db.activityEvent.deleteMany({ where: { id: { in: batch.map((r) => r.id) } } });
        removed += count;
        if (batch.length < 5_000) break;
      }
      return removed;
    });

    // 6) Тихий выпуск приглашённых подтверждений съёмок: чистые публикуются
    // после 72ч выдержки, флагованные ждут человека (releaseShootConfirmations)
    const shootsReleased = await step('shoots-release', async () => {
      const { releaseShootConfirmations } = await import('@/lib/shoots');
      return releaseShootConfirmations();
    });

    // Волны доставки заявок отсюда УБРАНЫ (аудит 2026-08-16): у них свой
    // кран каждые 15 минут (rp-inquiries.sh), два лока пересекались в 02:30.

    // 7) Сроки хранения ПДн (аудит 152-ФЗ 2026-08-03): гостевые заявки
    // обезличиваются (факт остаётся для рыночной статистики), разобранные
    // жалобы теряют свободный текст, старые уведомления удаляются
    const pdn = await step('pdn-retention', async () => {
      const INQUIRY_DAYS = 180;
      const REPORT_DAYS = 365;
      const NOTIFICATION_DAYS = 180;
      const { count: inquiriesAnon } = await db.inquiry.updateMany({
        where: {
          createdAt: { lt: new Date(Date.now() - INQUIRY_DAYS * 86_400_000) },
          OR: [{ contactPhone: { not: null } }, { contactEmail: { not: null } }, { contactName: { not: '—' } }],
        },
        data: { contactName: '—', contactPhone: null, contactEmail: null },
      });
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
      return { inquiriesAnon, reportsAnon, notificationsGone };
    });

    // 8) Суточная сводка оператору — ПОСЛЕДНЕЙ: она читает состояние, которое
    // только что привели в порядок, и её сбой не должен мешать работе выше
    await step('daily-digest', async () => {
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
    });

    const jobRuns = (await step('gc-job-runs', () => pruneJobRuns())) ?? 0;

    const cleaned = {
      rateLimitRows: cleanedTokens?.rateLimitRows ?? 0,
      resets: cleanedTokens?.resets ?? 0,
      consents: cleanedTokens?.consents ?? 0,
      verifications: cleanedTokens?.verifications ?? 0,
      activityRows: activityRows ?? 0,
      jobRuns,
      inquiriesAnon: pdn?.inquiriesAnon ?? 0,
      reportsAnon: pdn?.reportsAnon ?? 0,
      notificationsGone: pdn?.notificationsGone ?? 0,
    };
    const cleanedTotal = cleaned.rateLimitRows + cleaned.resets + cleaned.verifications + cleaned.activityRows + cleaned.jobRuns;
    // ok=false при ЛЮБОМ сбое, упавшие задачи названы поимённо — иначе
    // частичный отказ неотличим на дашборде от полного успеха
    const note = failures.length > 0
      ? `${ru.operatorAlerts.maintenanceNote(profiles ?? 0, cleanedTotal)} · ${ru.operatorAlerts.maintenanceFailures(failures.join(', '))}`
      : ru.operatorAlerts.maintenanceNote(profiles ?? 0, cleanedTotal);
    await finishJobRun(runId, failures.length === 0, note);

    return NextResponse.json({
      ok: failures.length === 0,
      failures,
      profiles: profiles ?? 0,
      ranksFixed: ranksFixed ?? 0,
      shootsReleased: shootsReleased ?? 0,
      cleaned,
      tookMs: Date.now() - startedAt,
    });
  });
}
