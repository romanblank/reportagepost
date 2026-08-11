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

export async function adminInquiries(limit = 100): Promise<AdminInquiry[]> {
  const rows = await db.inquiry.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true, createdAt: true, contactName: true, contactPhone: true, contactEmail: true,
      eventDate: true, budgetMinor: true, description: true, status: true, clientUserId: true,
      city: { select: { slug: true } },
      category: { select: { slug: true } },
      handlings: { select: { state: true } },
    },
  });

  return rows.map((i) => ({
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
