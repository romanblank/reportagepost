import { db } from '@/lib/db';
import { REAL_PROFILE } from '@/lib/admin-dashboard';

/**
 * Слой «почему»: воронка и удержание.
 *
 * Панель отвечает на вопрос «что происходит», а этот модуль — «где рвётся».
 * Разница практическая: увидев «заявок 40, съёмок 2», владелец знает цифры, но
 * не знает, на каком шаге теряются тридцать восемь — фотографы не отвечают,
 * заказчики не доводят до съёмки или до заявки просто не доходят.
 *
 * Считаем по когорте: берём заявки за период и смотрим, что случилось ИМЕННО с
 * ними. Иначе получается сравнение тёплого с мягким — заявки этого месяца
 * против съёмок, выросших из заявок прошлого.
 */

export type FunnelStep = {
  key: string;
  count: number;
  /** Доля от предыдущего шага; null у первого. */
  ofPrev: number | null;
};

export type Analysis = {
  funnel: FunnelStep[];
  /** Медиана времени до первой реакции фотографа на заявку, в часах. */
  medianResponseHours: number | null;
  /** Авторы, опубликовавшие хоть один кадр после одобрения анкеты. */
  activation: { approved: number; published: number };
  /** Заказчики, вернувшиеся за второй съёмкой. */
  repeatClients: { withShoot: number; returning: number };
  periodDays: number;
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export async function adminAnalysis(periodDays = 30): Promise<Analysis> {
  const since = new Date(Date.now() - periodDays * 86_400_000);

  // Когорта заявок периода — дальше смотрим только их судьбу
  const inquiries = await db.inquiry.findMany({
    where: { createdAt: { gte: since } },
    select: {
      id: true,
      createdAt: true,
      clientUserId: true,
      handlings: { select: { state: true, createdAt: true }, orderBy: { createdAt: 'asc' } },
    },
  });

  const answered = inquiries.filter((i) => i.handlings.length > 0);
  const taken = inquiries.filter((i) => i.handlings.some((h) => h.state === 'IN_PROGRESS'));

  // Съёмки считаем по тем же заказчикам: прямой связи «заявка → съёмка» в
  // данных нет — фотограф и заказчик договариваются в переписке, и требовать
  // от них отмечать связь значило бы получить неверные данные вместо неполных
  const clientIds = [...new Set(inquiries.map((i) => i.clientUserId).filter((id): id is string => Boolean(id)))];
  const shoots = clientIds.length > 0
    ? await db.shootConfirmation.count({
        where: { clientUserId: { in: clientIds }, state: 'CONFIRMED', createdAt: { gte: since }, profile: REAL_PROFILE },
      })
    : 0;

  const step = (key: string, count: number, prev: number | null): FunnelStep => ({
    key,
    count,
    ofPrev: prev === null || prev === 0 ? null : Math.round((count / prev) * 100),
  });

  const funnel = [
    step('inquiries', inquiries.length, null),
    step('answered', answered.length, inquiries.length),
    step('taken', taken.length, answered.length),
    step('shoots', shoots, taken.length),
  ];

  // Время до первой реакции: заказчик ждёт ответа, и часы здесь важнее процентов
  const responseHours = answered
    .map((i) => (i.handlings[0].createdAt.getTime() - i.createdAt.getTime()) / 3_600_000)
    .filter((h) => h >= 0);

  // Активация автора: одобрили анкету — начал ли он вообще публиковать работы
  const approvedProfiles = await db.photographerProfile.findMany({
    where: { status: 'APPROVED', createdAt: { gte: since }, ...REAL_PROFILE },
    select: { id: true, _count: { select: { photos: { where: { status: 'APPROVED' } } } } },
  });

  // Возвраты заказчиков — то, ради чего вся модель доверия
  const shootRows = await db.shootConfirmation.groupBy({
    by: ['clientUserId'],
    where: { state: 'CONFIRMED', profile: REAL_PROFILE },
    _count: { _all: true },
  });

  return {
    funnel,
    medianResponseHours: median(responseHours),
    activation: {
      approved: approvedProfiles.length,
      published: approvedProfiles.filter((p) => p._count.photos > 0).length,
    },
    repeatClients: {
      withShoot: shootRows.length,
      returning: shootRows.filter((r) => r._count._all > 1).length,
    },
    periodDays,
  };
}
