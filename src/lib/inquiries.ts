import { db } from '@/lib/db';
import { resolveCity } from '@/lib/geo-resolve';
import { rateLimit } from '@/lib/rate-limit';
import { DomainError } from '@/lib/errors';
import { notifyManyInApp } from '@/lib/notifications';
import { ELITE_RANK, PRIME_RANK } from '@/lib/subscription';
import { sendEmail } from '@/lib/email';
import { tgSend } from '@/lib/telegram';
import { APP_DOMAIN } from '@/lib/constants';
import { cityNameRu } from '@/lib/geo-data';
import { categoryNameRu } from '@/lib/category-data';
import { formatRubMinor } from '@/lib/money';
import { ru } from '@/i18n/ru';
import { PDN_CONSENT_VERSION } from '@/lib/constants';

/**
 * Маскирует контакты в тексте заявки.
 *
 * Заявка веером уходит всем авторам города вместе с описанием, а заказчики
 * массово пишут телефон и мессенджер прямо в текст. Без маскировки вся
 * механика раскрытия контактов (маскировка, лимит, аудит-лог) обходится
 * чтением описания, а домен и бот платформы становятся каналом рассылки
 * чужих ссылок. У отзывов такой фильтр стоит с самого начала.
 */
const CONTACT_LINK_RE = /(https?:\/\/|www\.|t\.me\/|@[a-z0-9_]{4,}|[a-zа-яё0-9-]{2,}\.(ru|com|net|org|io|me|tg|рф|su|info|biz))/gi;
const CONTACT_PHONE_RE = /(?:\+?\d[\s()\-–—.]*){7,}/g;

export function maskContactsInText(text: string): string {
  return text.replace(CONTACT_LINK_RE, '[ссылка скрыта]').replace(CONTACT_PHONE_RE, '[контакт скрыт]');
}

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

/**
 * Наследует DomainError (аудит 2026-08-01, P2): раньше это был отдельный класс,
 * и каждый роут сам ловил его и лепил статус — маппинг дублировался, а новый
 * роут писался копипастой соседнего, воспроизводя расхождение. Теперь ошибка
 * несёт и код, и статус, а превращает её в ответ единый handleRoute.
 */
export class InquiryError extends DomainError {
  constructor(public code: 'city_not_found' | 'category_not_found' | 'no_contact') {
    super(code, 400);
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

  const city = await resolveCity(input.citySlug);
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
      // След согласия на обработку ПДн (152-ФЗ): API принимает заявку только
      // при pdnConsent=true, здесь фиксируем момент и версию редакции политики
      pdnConsentAt: new Date(),
      pdnConsentVersion: PDN_CONSENT_VERSION,
    },
  });

  // Первыми узнают подписчики: Active+ сразу, Active через два часа, остальные
  // через шесть. Здесь отбираем тех, кому уведомление уходит СЕЙЧАС; всем
  // прочим заявка станет видна по расписанию (см. releaseInquiries).
  const recipients = await db.photographerProfile.findMany({
    where: {
      status: 'APPROVED',
      cityId: city.id,
      ...(categoryId ? { categories: { some: { categoryId } } } : {}),
      // proRank отражает уровень подписки; сверка с реальным состоянием идёт
      // отдельной джобой, поэтому здесь достаточно денормализованного значения
      proRank: { gte: ELITE_RANK },
    },
    select: {
      userId: true,
      user: {
        select: {
          email: true, tgUserId: true,
          // Настройки уведомлений (аудит P1): отписавшемуся не пишем
          notifyInquiriesEmail: true, notifyInquiriesTg: true, unsubToken: true,
        },
      },
    },
  });

  // Единая модель доставки (deep-think Eng P1): notifyInApp — ДОЛГОВЕЧНАЯ запись
  // в БД + live-счётчик (её фотограф увидит гарантированно). email/TG — best-effort
  // фоном (fire-and-forget), чтобы медленный SMTP не подвешивал публичную форму и
  // не терял лид. Мёртвая очередь QUEUED (никто не дренировал) убрана.
  await notifyManyInApp(
    recipients.map((r) => r.userId),
    'notification.inquiry.new',
    // inquiryId нужен волнам доставки: по нему видно, кому уже уходило
    { citySlug: input.citySlug, inquiryId: inquiry.id },
  );

  const link = `https://${APP_DOMAIN}/ru/cabinet`;
  const subject = ru.lifecycle.inquirySubject(cityNameRu(input.citySlug));
  const text = ru.lifecycle.inquiryBody({
    city: cityNameRu(input.citySlug),
    category: input.categorySlug ? categoryNameRu(input.categorySlug) : ru.lifecycle.inquiryNoValue,
    date: input.eventDate ? input.eventDate.toISOString().slice(0, 10) : ru.lifecycle.inquiryNoValue,
    budget: input.budgetMinor != null ? formatRubMinor(input.budgetMinor) : ru.lifecycle.inquiryNoValue,
    // Контакты из текста не уходят веером: их место — в раскрытии по
    // «беру в работу», под лимитом и с записью в журнал
    excerpt: maskContactsInText(input.description).slice(0, 160),
    link,
  });
  // fire-and-forget: не ждём — сервер персистентный (не serverless), промисы
  // доживают после ответа; ошибки глушим (email/tg вторичны к in-app).
  //
  // ПАЧКАМИ, а не всё разом (аудит 2026-07-31, P1): при сотнях адресатов
  // одновременный залп упирается в лимиты — Telegram отвечает 429 примерно
  // после 30 сообщений в секунду и молча теряет всю пачку, SMTP-провайдер
  // режет за всплеск. Отправляем окнами с паузой; доставка «медленнее, но
  // доходит» здесь лучше, чем «мгновенно и половина потеряна».
  void deliverExternal(recipients, subject, text).catch(() => {});

  return { inquiryId: inquiry.id, notified: recipients.length };
}

/** Внешняя доставка пачками с паузой — щадит лимиты Telegram и SMTP. */
async function deliverExternal(
  recipients: {
    user: {
      email: string | null; tgUserId: string | null;
      notifyInquiriesEmail: boolean; notifyInquiriesTg: boolean; unsubToken: string | null;
    };
  }[],
  subject: string,
  text: string,
): Promise<void> {
  const BATCH = 20;
  const PAUSE_MS = 1100; // ~20 сообщений в секунду — вдвое ниже лимита Telegram
  for (let i = 0; i < recipients.length; i += BATCH) {
    const chunk = recipients.slice(i, i + BATCH);
    await Promise.all(
      chunk.flatMap((r) => {
        const jobs: Promise<void>[] = [];
        // Уважаем настройки: отключил канал — не пишем в него
        if (r.user.email && r.user.notifyInquiriesEmail) {
          // Ссылка «отписаться» обязательна в регулярной рассылке
          const unsub = r.user.unsubToken
            ? `\n\n${ru.lifecycle.unsubscribeLine(`https://${APP_DOMAIN}/ru/unsubscribe?token=${r.user.unsubToken}`)}`
            : '';
          jobs.push(sendEmail(r.user.email, subject, text + unsub).catch(() => {}));
        }
        if (r.user.tgUserId && r.user.notifyInquiriesTg) {
          jobs.push(tgSend(r.user.tgUserId, text).catch(() => {}));
        }
        return jobs;
      }),
    );
    if (i + BATCH < recipients.length) await new Promise((res) => setTimeout(res, PAUSE_MS));
  }

  // Оператору — сразу: заявка заказчика это спрос, ради которого всё строится,
  // и реакция на неё измеряется часами, а не сутками
  const { alertOperator } = await import('@/lib/telegram');
  void alertOperator(ru.operatorAlerts.newInquiry);
}

/**
 * Маскирование контактов заказчика (аудит 2026-08-01, P2).
 *
 * Заявка веерная: её видят все одобренные фотографы города. Раньше вместе с ней
 * уходили и телефон, и почта — то есть один аккаунт, прошедший модерацию, одним
 * запросом выгружал всю базу лидов города. Для заказчика это неожиданно: он
 * писал «фотографу», а контакты получили десятки человек.
 *
 * Теперь в списке контакты скрыты, а раскрываются по явному «беру в работу» —
 * с записью в аудит-лог и суточным лимитом. Показываем достаточно, чтобы
 * отличить заявки друг от друга, но недостаточно, чтобы связаться в обход.
 */
function maskPhone(phone: string): string {
  // +7 999 123-45-67 → +7 ••• ••• 67
  const tail = phone.slice(-2);
  return `${phone.slice(0, 2)} ••• ••• ${tail}`;
}

function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  if (!domain) return '•••';
  const head = name.slice(0, 1);
  return `${head}${'•'.repeat(Math.max(2, Math.min(name.length - 1, 5)))}@${domain}`;
}

/**
 * Заявки для фотографа: его город, открытые, с ЕГО отметкой обработки.
 * (PRO-гейт добавится в S5.)
 *
 * Отметка личная (аудит 2026-08-01, P2): заявку видят все фотографы города,
 * поэтому общий статус закрыл бы лид всем сразу. Отработанные уезжают вниз —
 * сверху то, чем ещё никто не занимался.
 */
export async function inquiriesForPhotographer(userId: string) {
  const profile = await db.photographerProfile.findUnique({ where: { userId } });
  if (!profile || profile.status !== 'APPROVED') return null;

  const rows = await db.inquiry.findMany({
    where: { cityId: profile.cityId, status: 'OPEN' },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      category: true,
      city: true,
      handlings: { where: { profileId: profile.id }, select: { state: true } },
    },
  });

  return rows
    .map((i) => {
      const handling = i.handlings[0]?.state ?? null;
      // Контакты открыты только тому, кто взял заявку в работу
      const revealed = handling === 'IN_PROGRESS';
      return {
        ...i,
        handling,
        contactsRevealed: revealed,
        contactPhone: i.contactPhone && !revealed ? maskPhone(i.contactPhone) : i.contactPhone,
        contactEmail: i.contactEmail && !revealed ? maskEmail(i.contactEmail) : i.contactEmail,
      };
    })
    .sort((a, b) => {
      // Новые сверху, «в работе» следом, «не берусь» — в конец
      const rank = (h: string | null) => (h === null ? 0 : h === 'IN_PROGRESS' ? 1 : 2);
      return rank(a.handling) - rank(b.handling) || b.createdAt.getTime() - a.createdAt.getTime();
    });
}

/**
 * Отметка фотографа по заявке: «беру в работу» / «не берусь» / снять отметку.
 * Идемпотентна, чужие заявки (другой город) не принимает.
 */
export async function setInquiryHandling(
  userId: string,
  inquiryId: string,
  state: 'IN_PROGRESS' | 'DECLINED' | null,
): Promise<void> {
  const profile = await db.photographerProfile.findUnique({ where: { userId } });
  if (!profile || profile.status !== 'APPROVED') throw new DomainError('forbidden', 403);

  const inquiry = await db.inquiry.findUnique({ where: { id: inquiryId }, select: { cityId: true } });
  if (!inquiry) throw new DomainError('not_found', 404);
  // Отмечать можно только то, что фотографу вообще показывают
  if (inquiry.cityId !== profile.cityId) throw new DomainError('forbidden', 403);

  if (state === null) {
    await db.inquiryHandling.deleteMany({ where: { inquiryId, profileId: profile.id } });
    return;
  }

  // «Беру в работу» = раскрытие контактов заказчика. Это обращение с чужими
  // персональными данными, поэтому оно ограничено и оставляет след.
  if (state === 'IN_PROGRESS') {
    const already = await db.inquiryHandling.findUnique({
      where: { inquiryId_profileId: { inquiryId, profileId: profile.id } },
      select: { state: true },
    });
    if (already?.state !== 'IN_PROGRESS') {
      // Суточный потолок: добросовестному автору 20 лидов в день с запасом
      // хватает, а массовую выгрузку базы города это обрубает.
      await rateLimit(`inquiry-reveal:user:${userId}`, 20, 24 * 3600);
      await db.adminAudit.create({
        data: {
          actorUserId: userId,
          action: 'inquiry.contacts.reveal',
          targetType: 'INQUIRY',
          targetId: inquiryId,
          meta: { profileId: profile.id },
        },
      });
    }
  }

  await db.inquiryHandling.upsert({
    where: { inquiryId_profileId: { inquiryId, profileId: profile.id } },
    create: { inquiryId, profileId: profile.id, state },
    update: { state },
  });
}


/**
 * Открывает заявки следующей волне авторов.
 *
 * Заявка не «принадлежит» подписчикам — она лишь доходит до них раньше.
 * Джоба вызывается плановым обслуживанием и досылает уведомления тем, чьё
 * время пришло: Active через два часа после создания, все остальные через
 * шесть. Заказчик от этого ничего не теряет: его заявку в итоге видят все, а
 * подписчики просто успевают ответить первыми.
 *
 * Повторно одному и тому же автору не шлём: отметка о доставке — сам факт
 * наличия уведомления по этой заявке.
 */
export async function releaseInquiries(now: Date = new Date()): Promise<number> {
  const { INQUIRY_HEAD_START_HOURS } = await import('@/lib/pricing');
  const waves: { after: number; minRank: number; maxRank: number }[] = [
    { after: INQUIRY_HEAD_START_HOURS.ELITE - INQUIRY_HEAD_START_HOURS.PRIME, minRank: PRIME_RANK, maxRank: ELITE_RANK - 1 },
    { after: INQUIRY_HEAD_START_HOURS.ELITE, minRank: 0, maxRank: PRIME_RANK - 1 },
  ];

  let delivered = 0;

  for (const wave of waves) {
    const since = new Date(now.getTime() - wave.after * 3_600_000);
    const inquiries = await db.inquiry.findMany({
      where: { createdAt: { lte: since, gte: new Date(since.getTime() - 24 * 3_600_000) } },
      select: { id: true, cityId: true, categoryId: true, city: { select: { slug: true } } },
    });

    for (const inquiry of inquiries) {
      const recipients = await db.photographerProfile.findMany({
        where: {
          status: 'APPROVED',
          cityId: inquiry.cityId,
          ...(inquiry.categoryId ? { categories: { some: { categoryId: inquiry.categoryId } } } : {}),
          proRank: { gte: wave.minRank, lte: wave.maxRank },
        },
        select: { userId: true },
      });
      if (recipients.length === 0) continue;

      // Кому уже уходило уведомление по этой заявке — пропускаем
      const already = await db.notification.findMany({
        where: {
          userId: { in: recipients.map((r) => r.userId) },
          type: 'notification.inquiry.new',
          payload: { path: ['inquiryId'], equals: inquiry.id },
        },
        select: { userId: true },
      });
      const seen = new Set(already.map((a) => a.userId));
      const targets = recipients.map((r) => r.userId).filter((id) => !seen.has(id));
      if (targets.length === 0) continue;

      await notifyManyInApp(targets, 'notification.inquiry.new', {
        citySlug: inquiry.city.slug,
        inquiryId: inquiry.id,
      });
      delivered += targets.length;
    }
  }

  return delivered;
}
