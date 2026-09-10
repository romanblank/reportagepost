import { db } from '@/lib/db';
import { REAL_USER, REAL_PROFILE } from '@/lib/admin-dashboard';

/**
 * Продуктовая воронка автора (оценка 2026-09-10: главный недоинвест — при
 * образцовой инфра-наблюдаемости продуктовой не было вообще).
 *
 * На бете вопрос второго дня: «из 20 приглашённых зарегистрировались 14,
 * анкету начали 9, десять кадров залили 4 — где отваливаются?». Воронка
 * первых 50 авторов не восстанавливается задним числом, поэтому снимок
 * считается из СОСТОЯНИЯ данных (не из событийного журнала): на десятках
 * людей это точнее и даёт поимённые списки застрявших — оператор беты
 * работает с именами, а не с процентами.
 *
 * Только настоящие люди (REAL_USER/REAL_PROFILE) — столп Truth.
 */

export const FUNNEL_STEP_KEYS = [
  'registered',
  'profileStarted',
  'photosStarted',
  'photosTen',
  'submitted',
  'approved',
  'viewed',
  'engaged',
  'confirmedShoot',
] as const;
export type FunnelStepKey = (typeof FUNNEL_STEP_KEYS)[number];

export interface FunnelStep {
  key: FunnelStepKey;
  count: number;
  /** Застрявшие ИМЕННО на этом шаге (дошли, дальше не прошли), до 20 имён. */
  stuck: { name: string; username: string | null; sinceDays: number }[];
}

export interface AuthorFunnel {
  steps: FunnelStep[];
  periodDays: number;
}

const STUCK_LIMIT = 20;

export async function authorFunnel(periodDays = 90): Promise<AuthorFunnel> {
  const since = new Date(Date.now() - periodDays * 24 * 3_600_000);

  // Один проход по фотографам периода со всем нужным для классификации —
  // на масштабе беты (десятки людей) это дешевле и проще восьми count-ов,
  // а главное, даёт поимённые списки без повторных запросов
  const users = await db.user.findMany({
    where: { ...REAL_USER, role: 'PHOTOGRAPHER', createdAt: { gte: since } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      createdAt: true,
      profile: {
        select: {
          id: true,
          username: true,
          status: true,
          _count: { select: { photos: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  const profileIds = users.map((u) => u.profile?.id).filter((id): id is string => Boolean(id));
  // Сигналы «жизни после одобрения» — тремя запросами на всю когорту
  const [viewedRows, handlingRows, shootRows] = await Promise.all([
    profileIds.length
      ? db.activityEvent.groupBy({
          by: ['targetId'],
          where: { type: 'PROFILE_VIEW', targetType: 'PROFILE', targetId: { in: profileIds } },
          _count: true,
        })
      : Promise.resolve([]),
    profileIds.length
      ? db.inquiryHandling.groupBy({
          by: ['profileId'],
          where: { profileId: { in: profileIds }, state: 'IN_PROGRESS' },
          _count: true,
        })
      : Promise.resolve([]),
    profileIds.length
      ? db.shootConfirmation.groupBy({
          by: ['profileId'],
          where: { profileId: { in: profileIds }, state: 'CONFIRMED', needsReview: false },
          _count: true,
        })
      : Promise.resolve([]),
  ]);
  const viewed = new Set(viewedRows.map((r) => r.targetId));
  const tookInquiry = new Set(handlingRows.map((r) => r.profileId));
  const hasShoot = new Set(shootRows.map((r) => r.profileId));

  // Шаг автора = самый дальний достигнутый рубеж. Порог 10 кадров — тот же,
  // что в онбординге (минимум для отправки на модерацию).
  const stepOf = (u: (typeof users)[number]): number => {
    const p = u.profile;
    if (!p) return 0; // зарегистрировался, анкету не начал
    if (p._count.photos === 0) return 1; // анкета есть, кадров нет
    if (p._count.photos < 10) return 2; // кадры пошли, до порога не дошёл
    if (p.status === 'DRAFT') return 3; // набрал кадры, не отправил
    if (p.status !== 'APPROVED') return 4; // на модерации/доработке/отказ
    if (!viewed.has(p.id)) return 5; // одобрен, ни одного просмотра
    if (!tookInquiry.has(p.id)) return 6; // смотрят, откликов на заявки нет
    if (!hasShoot.has(p.id)) return 7; // работает с заявками, съёмки нет
    return 8; // подтверждённая съёмка — воронка пройдена
  };

  const byStep = users.map((u) => ({ u, step: stepOf(u) }));
  const steps: FunnelStep[] = FUNNEL_STEP_KEYS.map((key, i) => {
    // count шага = сколько людей ДОШЛИ до него (кумулятивно, как читают воронку)
    const reached = byStep.filter(({ step }) => step >= i);
    const stuckHere = byStep.filter(({ step }) => step === i).slice(0, STUCK_LIMIT);
    return {
      key,
      count: reached.length,
      stuck: stuckHere.map(({ u }) => ({
        name: `${u.firstName} ${u.lastName}`,
        username: u.profile?.username ?? null,
        sinceDays: Math.floor((Date.now() - u.createdAt.getTime()) / 86_400_000),
      })),
    };
  });

  return { steps, periodDays };
}

/**
 * «Доказательство ценности» для кабинета автора: что платформа ему ПРИНЕСЛА
 * (пункт S3-приоритета, висел с 2026-08-04). Retention-блок и одновременно
 * аргумент в разговоре о подписке: «через платформу вы получили N заявок
 * и M съёмок» — числа, а не обещания.
 */
export interface ValueSummary {
  inquiriesReceived: number; // заявок города/жанра дошло до автора
  inquiriesTaken: number; // взял в работу (раскрыл контакты)
  clientsMessaged: number; // уникальных заказчиков, написавших в личку
  shoots: number; // подтверждённых съёмок
  returningClients: number; // заказчиков, вернувшихся повторно
}

export async function valueSummary(userId: string, profileId: string): Promise<ValueSummary> {
  const [inquiriesReceived, inquiriesTaken, senders, shootRows] = await Promise.all([
    // Долговечная запись о доставке заявки — in-app-уведомление (модель
    // доставки платформы), считаем по нему
    db.notification.count({ where: { userId, type: 'notification.inquiry.new' } }),
    db.inquiryHandling.count({ where: { profileId, state: 'IN_PROGRESS' } }),
    db.message.findMany({
      where: { recipientId: userId, sender: { role: 'CLIENT' } },
      select: { senderId: true },
      distinct: ['senderId'],
    }),
    db.shootConfirmation.findMany({
      where: { profileId, state: 'CONFIRMED', needsReview: false },
      select: { clientUserId: true },
    }),
  ]);

  const byClient = new Map<string, number>();
  for (const s of shootRows) byClient.set(s.clientUserId, (byClient.get(s.clientUserId) ?? 0) + 1);

  return {
    inquiriesReceived,
    inquiriesTaken,
    clientsMessaged: senders.length,
    shoots: shootRows.length,
    returningClients: [...byClient.values()].filter((n) => n > 1).length,
  };
}

/** Сводка воронки для стартовой панели админки: люди, застрявшие до каталога. */
export async function funnelPreview(periodDays = 90): Promise<{ registered: number; approved: number; stuckBeforeCatalog: number }> {
  const since = new Date(Date.now() - periodDays * 24 * 3_600_000);
  const [registered, approved] = await Promise.all([
    db.user.count({ where: { ...REAL_USER, role: 'PHOTOGRAPHER', createdAt: { gte: since } } }),
    db.photographerProfile.count({ where: { ...REAL_PROFILE, status: 'APPROVED', user: { ...REAL_USER, createdAt: { gte: since } } } }),
  ]);
  return { registered, approved, stuckBeforeCatalog: registered - approved };
}
