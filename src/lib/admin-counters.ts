import { db } from '@/lib/db';

/**
 * Сколько всего ждёт решения — по разделам.
 *
 * Без счётчиков администратор обязан обойти каждый раздел, чтобы узнать, есть
 * ли там работа: очередь замечают не когда она появилась, а когда о ней
 * напомнили снаружи.
 *
 * Считаем ОДНИМ запросом. Меню рисуется на каждой из четырнадцати страниц
 * администрирования, и десять отдельных обращений к базе на каждый показ —
 * это сто сорок запросов на обход разделов ради девяти чисел.
 */
export type AdminCounters = {
  moderation: number;
  queue: number;
  inquiries: number;
  billing: number;
  reports: number;
};

type Row = {
  profiles: bigint;
  photos: bigint;
  videos: bigint;
  threads: bigint;
  posts: bigint;
  articles: bigint;
  comments: bigint;
  untouched: bigint;
  requests: bigint;
  reports: bigint;
};

export async function adminCounters(): Promise<AdminCounters> {
  const [row] = await db.$queryRaw<Row[]>`
    SELECT
      (SELECT count(*) FROM "PhotographerProfile" WHERE status = 'PENDING') AS profiles,
      (SELECT count(*) FROM "Photo" WHERE status = 'PENDING') AS photos,
      (SELECT count(*) FROM "ProfileVideo" WHERE status = 'PENDING') AS videos,
      (SELECT count(*) FROM "ForumThread" WHERE status = 'IN_REVIEW') AS threads,
      (SELECT count(*) FROM "ForumPost" WHERE status = 'IN_REVIEW') AS posts,
      (SELECT count(*) FROM "Article" WHERE status = 'IN_REVIEW') AS articles,
      (SELECT count(*) FROM "Comment" WHERE status = 'IN_REVIEW') AS comments,
      -- Заявки без единого отклика: единственная очередь, где ждёт не наш
      -- контент, а живой заказчик
      (SELECT count(*) FROM "Inquiry" i
        WHERE i.status = 'OPEN'
          AND NOT EXISTS (SELECT 1 FROM "InquiryHandling" h WHERE h."inquiryId" = i.id)) AS untouched,
      (SELECT count(*) FROM "Subscription" WHERE "proRequestedAt" IS NOT NULL AND tier = 'FREE') AS requests,
      (SELECT count(*) FROM "Report" WHERE status = 'OPEN') AS reports
  `;

  const n = (v: bigint | number | undefined) => Number(v ?? 0);

  return {
    moderation: n(row?.profiles) + n(row?.photos) + n(row?.videos),
    queue: n(row?.threads) + n(row?.posts) + n(row?.articles) + n(row?.comments),
    inquiries: n(row?.untouched),
    billing: n(row?.requests),
    reports: n(row?.reports),
  };
}
