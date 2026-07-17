import { db } from '@/lib/db';
import { notifyInApp } from '@/lib/notifications';
import { sendEmail } from '@/lib/email';
import { tgSend } from '@/lib/telegram';
import { APP_DOMAIN } from '@/lib/constants';
import { cityNameRu } from '@/lib/geo-data';
import { categoryNameRu } from '@/lib/category-data';
import { formatRubMinor } from '@/lib/money';
import { ru } from '@/i18n/ru';

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
    select: { userId: true, user: { select: { email: true, tgUserId: true } } },
  });

  // Единая модель доставки (deep-think Eng P1): notifyInApp — ДОЛГОВЕЧНАЯ запись
  // в БД + live-счётчик (её фотограф увидит гарантированно). email/TG — best-effort
  // фоном (fire-and-forget), чтобы медленный SMTP не подвешивал публичную форму и
  // не терял лид. Мёртвая очередь QUEUED (никто не дренировал) убрана.
  await Promise.all(
    recipients.map((r) => notifyInApp(r.userId, 'notification.inquiry.new', { citySlug: input.citySlug })),
  );

  const link = `https://${APP_DOMAIN}/ru/cabinet`;
  const subject = ru.lifecycle.inquirySubject(cityNameRu(input.citySlug));
  const text = ru.lifecycle.inquiryBody({
    city: cityNameRu(input.citySlug),
    category: input.categorySlug ? categoryNameRu(input.categorySlug) : ru.lifecycle.inquiryNoValue,
    date: input.eventDate ? input.eventDate.toISOString().slice(0, 10) : ru.lifecycle.inquiryNoValue,
    budget: input.budgetMinor != null ? formatRubMinor(input.budgetMinor) : ru.lifecycle.inquiryNoValue,
    excerpt: input.description.slice(0, 160),
    link,
  });
  // fire-and-forget: не ждём — сервер персистентный (не serverless), промисы
  // доживают после ответа; ошибки глушим (email/tg вторичны к in-app).
  void Promise.all(
    recipients.flatMap((r) => {
      const jobs: Promise<void>[] = [];
      if (r.user.email) jobs.push(sendEmail(r.user.email, subject, text));
      if (r.user.tgUserId) jobs.push(tgSend(r.user.tgUserId, text));
      return jobs;
    }),
  ).catch(() => {});

  return { inquiryId: inquiry.id, notified: recipients.length };
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
