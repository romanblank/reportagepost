import { db } from '@/lib/db';
import { enqueueForMany } from '@/lib/notifications';

export interface CreateInquiryInput {
  clientUserId?: string;
  contactName: string;
  contactPhone?: string;
  contactEmail?: string;
  citySlug: string;
  categorySlug?: string;
  eventDate?: Date;
  budgetMinor?: number;
  description: string;
}

export class InquiryError extends Error {
  constructor(public code: 'city_not_found' | 'category_not_found' | 'no_contact') {
    super(code);
  }
}

/**
 * Создание заявки + постановка уведомлений фотографам города
 * (при указанной категории — только совпадающим по категории).
 * Возвращает id заявки и число адресатов.
 */
export async function createInquiry(
  input: CreateInquiryInput,
): Promise<{ inquiryId: string; notified: number }> {
  if (!input.contactPhone && !input.contactEmail && !input.clientUserId) {
    throw new InquiryError('no_contact'); // гостю нужен хотя бы один контакт
  }

  const city = await db.city.findFirst({ where: { slug: input.citySlug } });
  if (!city) throw new InquiryError('city_not_found');

  let categoryId: string | undefined;
  if (input.categorySlug) {
    const category = await db.category.findUnique({ where: { slug: input.categorySlug } });
    if (!category || !category.active) throw new InquiryError('category_not_found');
    categoryId = category.id;
  }

  const inquiry = await db.inquiry.create({
    data: {
      clientUserId: input.clientUserId,
      contactName: input.contactName,
      contactPhone: input.contactPhone,
      contactEmail: input.contactEmail,
      cityId: city.id,
      categoryId,
      eventDate: input.eventDate,
      budgetMinor: input.budgetMinor,
      description: input.description,
    },
  });

  const recipients = await db.photographerProfile.findMany({
    where: {
      status: 'APPROVED',
      cityId: city.id,
      ...(categoryId ? { categories: { some: { categoryId } } } : {}),
    },
    select: { userId: true },
  });

  const notified = await enqueueForMany(
    recipients.map((r) => r.userId),
    'EMAIL',
    'notification.inquiry.new',
    { inquiryId: inquiry.id, citySlug: input.citySlug, categorySlug: input.categorySlug ?? null },
  );

  return { inquiryId: inquiry.id, notified };
}

/** Заявки для фотографа: его город, открытые. (PRO-гейт добавится в S5.) */
export async function inquiriesForPhotographer(userId: string) {
  const profile = await db.photographerProfile.findUnique({ where: { userId } });
  if (!profile || profile.status !== 'APPROVED') return null;

  return db.inquiry.findMany({
    where: { cityId: profile.cityId, status: 'OPEN' },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { category: true, city: true },
  });
}
