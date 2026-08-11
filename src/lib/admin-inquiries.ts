import { db } from '@/lib/db';
import { REAL_USER } from '@/lib/admin-dashboard';

/**
 * Заявки глазами владельца платформы.
 *
 * На панели заявки были числом, и это скрывало главное: доходит ли заказ до
 * авторов и берёт ли его кто-нибудь. Заявка, которую никто не взял, — не
 * строка статистики, а человек, которому не ответили, и с ним ещё можно
 * что-то сделать: позвонить, подобрать автора руками, понять, почему тишина.
 *
 * Поэтому список показывает не «сколько», а состояние каждой: сколько авторов
 * увидели, кто откликнулся, сколько отказались.
 */
export type AdminInquiry = {
  id: string;
  createdAt: Date;
  contactName: string;
  contactPhone: string | null;
  contactEmail: string | null;
  citySlug: string;
  categorySlug: string | null;
  eventDate: Date | null;
  budgetMinor: number | null;
  description: string;
  status: string;
  /** Сколько авторов взяли заявку в работу. */
  taken: number;
  /** Сколько отказались — это тоже сигнал: заказ есть, но никому не подходит. */
  declined: number;
  /** Есть ли аккаунт у заказчика — гостю писать можно только на почту. */
  isGuest: boolean;
};

export type InquiryFilter = 'all' | 'untouched' | 'taken' | 'closed';

export const INQUIRIES_PER_PAGE = 25;

/**
 * Список заявок с отбором и страницами.
 *
 * Отбор «без единого отклика» — не украшение фильтра, а рабочий режим: именно
 * с этими заявками ещё можно что-то сделать, и искать их глазами среди сотни
 * остальных бессмысленно.
 */
export async function adminInquiries(
  filter: InquiryFilter = 'all',
  page = 1,
): Promise<{ items: AdminInquiry[]; total: number }> {
  const where =
    filter === 'untouched'
      ? { status: 'OPEN' as const, handlings: { none: {} } }
      : filter === 'taken'
        ? { handlings: { some: { state: 'IN_PROGRESS' as const } } }
        : filter === 'closed'
          ? { status: { not: 'OPEN' as const } }
          : {};

  const total = await db.inquiry.count({ where });
  const rows = await db.inquiry.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    skip: (Math.max(1, page) - 1) * INQUIRIES_PER_PAGE,
    take: INQUIRIES_PER_PAGE,
    select: {
      id: true, createdAt: true, contactName: true, contactPhone: true, contactEmail: true,
      eventDate: true, budgetMinor: true, description: true, status: true, clientUserId: true,
      city: { select: { slug: true } },
      category: { select: { slug: true } },
      handlings: { select: { state: true } },
    },
  });

  const items = rows.map((i) => ({
    id: i.id,
    createdAt: i.createdAt,
    contactName: i.contactName,
    contactPhone: i.contactPhone,
    contactEmail: i.contactEmail,
    citySlug: i.city.slug,
    categorySlug: i.category?.slug ?? null,
    eventDate: i.eventDate,
    budgetMinor: i.budgetMinor,
    description: i.description,
    status: i.status,
    taken: i.handlings.filter((h) => h.state === 'IN_PROGRESS').length,
    declined: i.handlings.filter((h) => h.state === 'DECLINED').length,
    isGuest: i.clientUserId === null,
  }));

  return { items, total };
}

/**
 * Сводка спроса: то, что владелец должен увидеть первым.
 *
 * «Без единого отклика» — самая важная строка: она означает не проблему
 * статистики, а заказчика, оставшегося без ответа.
 */
export async function inquiryOverview(periodDays = 30): Promise<{
  total: number;
  untouched: number;
  taken: number;
  guests: number;
}> {
  const since = new Date(Date.now() - periodDays * 86_400_000);
  const rows = await db.inquiry.findMany({
    where: { createdAt: { gte: since } },
    select: { clientUserId: true, handlings: { select: { state: true } } },
  });

  return {
    total: rows.length,
    untouched: rows.filter((r) => r.handlings.length === 0).length,
    taken: rows.filter((r) => r.handlings.some((h) => h.state === 'IN_PROGRESS')).length,
    guests: rows.filter((r) => r.clientUserId === null).length,
  };
}

/** Сколько людей на платформе — без демо и тестовых аккаунтов. */
export async function realClientCount(): Promise<number> {
  return db.user.count({ where: { role: 'CLIENT', ...REAL_USER } });
}
