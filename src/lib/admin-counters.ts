import { db } from '@/lib/db';

/**
 * Сколько всего ждёт решения — по разделам.
 *
 * Без счётчиков администратор обязан обойти каждый раздел, чтобы узнать, есть
 * ли там работа. Для человека, ведущего платформу один, это означает, что
 * очередь замечают не тогда, когда она появилась, а когда о ней напомнили
 * снаружи — то есть с опозданием.
 *
 * Один проход по базе: меню рисуется на каждой странице администрирования, и
 * пять отдельных запросов там ни к чему.
 */
export type AdminCounters = {
  moderation: number;
  queue: number;
  inquiries: number;
  billing: number;
  reports: number;
};

export async function adminCounters(): Promise<AdminCounters> {
  const [profiles, photos, videos, threads, posts, articles, comments, untouched, requests, reports] =
    await Promise.all([
      db.photographerProfile.count({ where: { status: 'PENDING' } }),
      db.photo.count({ where: { status: 'PENDING' } }),
      db.profileVideo.count({ where: { status: 'PENDING' } }),
      db.forumThread.count({ where: { status: 'IN_REVIEW' } }),
      db.forumPost.count({ where: { status: 'IN_REVIEW' } }),
      db.article.count({ where: { status: 'IN_REVIEW' } }),
      db.comment.count({ where: { status: 'IN_REVIEW' } }),
      // Заявки без единого отклика — единственная «очередь», где ждёт не наш
      // контент, а живой заказчик
      db.inquiry.count({ where: { status: 'OPEN', handlings: { none: {} } } }),
      db.subscription.count({ where: { proRequestedAt: { not: null }, tier: 'FREE' } }),
      db.report.count({ where: { status: 'OPEN' } }),
    ]);

  return {
    moderation: profiles + photos + videos,
    queue: threads + posts + articles + comments,
    inquiries: untouched,
    billing: requests,
    reports,
  };
}
