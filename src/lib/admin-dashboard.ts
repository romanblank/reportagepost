import { db } from '@/lib/db';
import { JOB_THRESHOLDS } from '@/lib/job-thresholds';
import { Prisma } from '@prisma/client';

/**
 * Данные командного центра администратора.
 *
 * Админка проектируется не от таблиц, а от вопросов, на которые владельцу
 * нужен ответ. Их здесь четыре, в порядке важности:
 *   1. Идём ли мы к первой оплате подписки (метрика №1)?
 *   2. Есть ли спрос — заявки заказчиков, и отвечают ли на них авторы?
 *   3. Что требует моего решения прямо сейчас (очереди)?
 *   4. Работает ли машина под этим (фоновые задачи, интеграции)?
 *
 * ── TRUTH ────────────────────────────────────────────────────────────────
 * Первое, что должна делать аналитика, — отделить настоящее от служебного.
 * В базе живут три сорта нереальных данных: демонстрационная витрина
 * (`futazh-*` и её заказчики `@demo.local`), тестовые аккаунты (`@test.local`)
 * и сам администратор. Ни один из них не является рынком, и если их не
 * вычесть, каждая цифра ниже будет врать в свою пользу — а решения принимаются
 * по этим цифрам.
 */

/** Признак служебных адресов: демо-витрина и тесты. */
const FAKE_EMAIL_SUFFIXES = ['@test.local', '@demo.local'];
const DEMO_USERNAME_PREFIX = 'futazh-';

/** Условие «настоящий пользователь» для запросов по User. */
export const REAL_USER: Prisma.UserWhereInput = {
  role: { not: 'ADMIN' },
  NOT: FAKE_EMAIL_SUFFIXES.map((s) => ({ email: { endsWith: s } })),
};

/** Условие «настоящая анкета» для запросов по PhotographerProfile. */
export const REAL_PROFILE: Prisma.PhotographerProfileWhereInput = {
  // Признак демо — в данных (`isDemo`), а префикс имени оставлен как второй
  // эшелон: витрину заводили до появления флага, и анкета, помеченная только
  // именем, не должна вернуться в метрики. Достаточно ЛЮБОГО признака —
  // иначе демо, заведённое под обычным именем, начнёт льстить цифрам
  isDemo: false,
  username: { not: { startsWith: DEMO_USERNAME_PREFIX } },
  user: REAL_USER,
};

export type Kpi = {
  key: string;
  value: number;
  /** Изменение к предыдущему периоду той же длины; null — сравнивать не с чем. */
  delta: number | null;
};

export type QueueCounts = {
  profiles: number;
  photos: number;
  videos: number;
  stories: number;
  reports: number;
  proRequests: number;
};

export type JobHealth = {
  name: string;
  lastRunAt: Date | null;
  ok: boolean | null;
  /** Порог тревоги в часах — под реальную частоту задачи, а не общий. */
  staleAfterHours: number;
  stale: boolean;
  note: string | null;
};

export type Dashboard = {
  money: Kpi[];
  demand: Kpi[];
  supply: Kpi[];
  queues: QueueCounts;
  jobs: JobHealth[];
  periodDays: number;
};

function since(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

async function withDelta(
  key: string,
  count: (from: Date, to: Date) => Promise<number>,
  days: number,
): Promise<Kpi> {
  const now = new Date();
  const start = since(days);
  const prevStart = since(days * 2);
  const [value, prev] = await Promise.all([count(start, now), count(prevStart, start)]);
  return { key, value, delta: prev === 0 ? null : Math.round(((value - prev) / prev) * 100) };
}

/**
 * Пороги свежести под РЕАЛЬНУЮ частоту каждой задачи.
 *
 * Общий порог даёт либо ложные тревоги (задача раз в неделю), либо тишину при
 * поломке (задача раз в две минуты «протухнет» только через сутки).
 */

export async function adminDashboard(periodDays = 30): Promise<Dashboard> {
  const [money, demand, supply, queues, jobs] = await Promise.all([
    Promise.all([
      // Метрика №1 — оплаченные подписки. Пока приём оплаты не открыт, ценность
      // строки в том, что она стоит первой и остаётся нулевой: это честно
      // показывает, что до цели ещё не дошли.
      withDelta('paidSubscriptions', async (from, to) =>
        db.payment.count({ where: { status: 'CONFIRMED', createdAt: { gte: from, lt: to }, user: REAL_USER } }), periodDays),
      withDelta('proRequests', async (from, to) =>
        db.subscription.count({ where: { proRequestedAt: { gte: from, lt: to }, user: REAL_USER } }), periodDays),
    ]),
    Promise.all([
      withDelta('inquiries', async (from, to) =>
        db.inquiry.count({ where: { createdAt: { gte: from, lt: to } } }), periodDays),
      withDelta('shoots', async (from, to) =>
        db.shootConfirmation.count({
          where: { state: 'CONFIRMED', createdAt: { gte: from, lt: to }, profile: REAL_PROFILE },
        }), periodDays),
      withDelta('reviews', async (from, to) =>
        db.review.count({ where: { createdAt: { gte: from, lt: to }, profile: REAL_PROFILE } }), periodDays),
    ]),
    Promise.all([
      withDelta('newPhotographers', async (from, to) =>
        db.photographerProfile.count({ where: { createdAt: { gte: from, lt: to }, ...REAL_PROFILE } }), periodDays),
      withDelta('approvedPhotographers', async (from, to) =>
        db.photographerProfile.count({
          // Дата одобрения отдельно не хранится — считаем по публикации первого
          // кадра автора: это и есть момент, когда он появился в каталоге
          where: { status: 'APPROVED', photos: { some: { publishedAt: { gte: from, lt: to } } }, ...REAL_PROFILE },
        }), periodDays),
      withDelta('newClients', async (from, to) =>
        db.user.count({ where: { role: 'CLIENT', createdAt: { gte: from, lt: to }, ...REAL_USER } }), periodDays),
    ]),
    (async (): Promise<QueueCounts> => {
      const [profiles, photos, videos, stories, reports, proRequests] = await Promise.all([
        db.photographerProfile.count({ where: { status: 'PENDING' } }),
        db.photo.count({ where: { status: 'PENDING' } }),
        db.profileVideo.count({ where: { status: 'PENDING', processing: 'READY' } }),
        db.story.count({ where: { status: 'PENDING' } }),
        db.report.count({ where: { status: 'OPEN' } }),
        db.subscription.count({
          // Запросил подписку и всё ещё на бесплатном уровне — ждёт ручной
          // активации оператором (приём оплаты пока не открыт)
          where: { proRequestedAt: { not: null }, tier: 'FREE' },
        }),
      ]);
      return { profiles, photos, videos, stories, reports, proRequests };
    })(),
    (async (): Promise<JobHealth[]> => {
      const names = Object.keys(JOB_THRESHOLDS);
      const runs = await Promise.all(
        names.map((name) =>
          db.jobRun.findFirst({ where: { name }, orderBy: { startedAt: 'desc' } }),
        ),
      );
      return names.map((name, i) => {
        const run = runs[i];
        const staleAfterHours = JOB_THRESHOLDS[name];
        const lastRunAt = run?.startedAt ?? null;
        const stale =
          lastRunAt === null || Date.now() - lastRunAt.getTime() > staleAfterHours * 3_600_000;
        return { name, lastRunAt, ok: run?.ok ?? null, staleAfterHours, stale, note: run?.note ?? null };
      });
    })(),
  ]);

  return { money, demand, supply, queues, jobs, periodDays };
}

export type ActivityItem = {
  at: Date;
  kind: string;
  title: string;
  href: string | null;
};

/**
 * Единая лента активности вместо вкладки на каждый тип события.
 *
 * Разнородные события сводятся одним `UNION ALL` нормализованных подзапросов —
 * так «что вообще происходит на платформе» читается одним взглядом, а не
 * складыванием пяти таблиц в голове. Служебные аккаунты отфильтрованы там же,
 * где считаются цифры: лента и метрики обязаны показывать один и тот же мир.
 */
export async function adminActivity(limit = 60, before?: Date): Promise<ActivityItem[]> {
  // Отсечка нужна только для листания «показать ещё». Раньше по умолчанию сюда
  // подставлялось время ПРИЛОЖЕНИЯ, а createdAt ставит база: при малейшем
  // расхождении часов самое свежее событие — то, ради которого админку и
  // открывают, — в ленту не попадало.
  const cutoff = before ?? null;
  const rows = await db.$queryRaw<{ at: Date; kind: string; title: string; href: string | null }[]>`
    SELECT * FROM (
      SELECT p."createdAt" AS at, 'profile' AS kind,
             concat(u."firstName", ' ', u."lastName", ' — новая анкета') AS title,
             concat('/ru/photographer/', p.username) AS href
        FROM "PhotographerProfile" p JOIN "User" u ON u.id = p."userId"
       WHERE p.username NOT LIKE ${DEMO_USERNAME_PREFIX + '%'} AND u.email NOT LIKE '%@test.local'

      UNION ALL
      SELECT i."createdAt", 'inquiry',
             -- У города в базе только slug и ключ перевода: человекочитаемое
             -- имя живёт в словаре, поэтому в ленту берём slug
             concat('Заявка заказчика: ', coalesce(c.slug, '—')), '/ru/admin/moderation'
        FROM "Inquiry" i LEFT JOIN "City" c ON c.id = i."cityId"

      UNION ALL
      SELECT s."createdAt", 'shoot', 'Подтверждена съёмка', NULL
        FROM "ShootConfirmation" s WHERE s.state = 'CONFIRMED'

      UNION ALL
      SELECT r."createdAt", 'review', 'Новый отзыв', NULL
        FROM "Review" r

      UNION ALL
      SELECT rp."createdAt", 'report', concat('Жалоба: ', rp.reason), '/ru/admin/reports'
        FROM "Report" rp

      UNION ALL
      SELECT a."createdAt", 'admin', concat('Действие админа: ', a.action), '/ru/admin/audit'
        FROM "AdminAudit" a
    ) AS feed
    WHERE (${cutoff}::timestamptz IS NULL OR at < ${cutoff}::timestamptz)
    ORDER BY at DESC
    LIMIT ${limit}
  `;
  return rows;
}
