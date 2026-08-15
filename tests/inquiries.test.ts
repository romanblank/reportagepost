import { describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

// Env-зависимость (правило c): нужен локальный PG
describe.skipIf(!hasDb)('inquiries: создание и доставка (БД)', () => {
  it('заявка без контактов гостя отклоняется', async () => {
    const { createInquiry, InquiryError } = await import('@/lib/inquiries');
    await expect(
      createInquiry({
        contactName: 'Гость',
        citySlug: 'moscow',
        description: 'Нужен фотограф на конференцию в сентябре, полный день.',
      }),
    ).rejects.toThrow(InquiryError);
  });

  it('заявка создаётся и ставит уведомления фотографам города/категории', async () => {
    const { db } = await import('@/lib/db');
    const { createInquiry } = await import('@/lib/inquiries');

    // Самодостаточность (урок CI 2026-07-13): создаём своего APPROVED-фотографа,
    // не полагаясь на состояние БД
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const category = await db.category.findFirstOrThrow({ where: { slug: 'concerts-festivals' } });
    const photographer = await db.user.create({
      data: {
        role: 'PHOTOGRAPHER', status: 'ACTIVE',
        firstName: 'Инк', lastName: 'Тестов', email: `inq-${stamp}@test.local`,
      },
    });
    const { ELITE_RANK } = await import('@/lib/subscription');
    const profile = await db.photographerProfile.create({
      data: {
        userId: photographer.id, username: `inq-${stamp}`, cityId: city.id,
        // Ранг задаём явно: с появлением форы на заявку адресата первой волны
        // определяет уровень подписки, а не только город с жанром. Без этого
        // тест был бы зелёным лишь на базе, где случайно живёт чей-то Elite
        status: 'APPROVED', proRank: ELITE_RANK,
        categories: { create: [{ categoryId: category.id }] },
      },
    });

    const { inquiryId, notified } = await createInquiry({
      contactName: 'Тест Заказчиков',
      contactEmail: 'client@test.local',
      citySlug: 'moscow',
      categorySlug: 'concerts-festivals',
      eventDate: new Date('2026-09-01T00:00:00Z'),
      budgetMinor: 3_000_000,
      description: 'Concert coverage needed, full evening, two stages, test inquiry.',
    });

    expect(inquiryId).toBeTruthy();
    // Наш собственный Elite-фотограф города и жанра — он и есть первая волна
    expect(notified).toBeGreaterThanOrEqual(1);

    // Новая модель: durable-доставка через notifyInApp (канал IN_APP), не QUEUED
    const inApp = await db.notification.findMany({
      where: { type: 'notification.inquiry.new', channel: 'IN_APP' },
    });
    expect(inApp.length).toBeGreaterThanOrEqual(notified);

    // уборка тестовых данных
    await db.notification.deleteMany({ where: { type: 'notification.inquiry.new' } });
    await db.inquiry.delete({ where: { id: inquiryId } });
    await db.profileCategory.deleteMany({ where: { profileId: profile.id } });
    await db.photographerProfile.delete({ where: { id: profile.id } });
    await db.user.delete({ where: { id: photographer.id } });
  });

  it('чужая категория — уведомлений нет, заявка есть', async () => {
    const { db } = await import('@/lib/db');
    const { createInquiry } = await import('@/lib/inquiries');

    const { inquiryId, notified } = await createInquiry({
      contactName: 'Спорт Заказчик',
      contactEmail: 'sport@test.local',
      citySlug: 'chita', // тихий город: другие тесты не создают там фотографов
      categorySlug: 'sports',
      description: 'Sports match photo coverage needed, test inquiry record.',
    });
    expect(notified).toBe(0);
    await db.inquiry.delete({ where: { id: inquiryId } });
  });
});

/**
 * Фора подписчиков на заявку.
 *
 * Единственный перк, ценность которого не зависит от нашей посещаемости: она
 * растёт от числа заявок. Проверяем главное — что заявка в итоге доходит ДО
 * ВСЕХ, а подписка влияет только на очерёдность. Продавать эксклюзив навсегда
 * означало бы оставить заказчика с меньшим выбором.
 */
describe.skipIf(!hasDb)('заявки: фора подписчиков, но не эксклюзив (БД)', () => {
  it('первыми узнают Active+, остальные — следующей волной', async () => {
    const { db } = await import('@/lib/db');
    const { createInquiry, releaseInquiries } = await import('@/lib/inquiries');
    const { ELITE_RANK, PRIME_RANK } = await import('@/lib/subscription');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });

    const mk = async (tag: string, rank: number) => {
      const u = await db.user.create({
        data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: tag, lastName: 'В', email: `wave-${tag}-${stamp}@test.local` },
      });
      await db.photographerProfile.create({
        data: { userId: u.id, username: `wave-${tag}-${stamp}`, cityId: city.id, status: 'APPROVED', proRank: rank },
      });
      return u.id;
    };
    const elite = await mk('e', ELITE_RANK);
    const prime = await mk('p', PRIME_RANK);
    const free = await mk('f', 0);

    try {
      const { inquiryId } = await createInquiry({
        citySlug: 'moscow', description: 'Нужен фотограф на конференцию, полный день',
        contactName: 'Тест', contactEmail: `cl-${stamp}@test.local`,
      });

      const got = async (userId: string) =>
        db.notification.count({ where: { userId, type: 'notification.inquiry.new' } });

      // Сразу после создания уведомление есть только у верхнего уровня
      expect(await got(elite)).toBe(1);
      expect(await got(prime)).toBe(0);
      expect(await got(free)).toBe(0);

      // Отматываем создание на семь часов назад — прошли обе волны
      await db.inquiry.update({
        where: { id: inquiryId },
        data: { createdAt: new Date(Date.now() - 7 * 3_600_000) },
      });
      await releaseInquiries();

      // Заявка дошла до ВСЕХ — подписка влияет только на очерёдность
      expect(await got(prime)).toBe(1);
      expect(await got(free)).toBe(1);
      // И никому не продублировалась
      expect(await got(elite)).toBe(1);

      await db.inquiry.delete({ where: { id: inquiryId } });
    } finally {
      await db.notification.deleteMany({ where: { userId: { in: [elite, prime, free] } } });
      await db.photographerProfile.deleteMany({ where: { userId: { in: [elite, prime, free] } } });
      await db.user.deleteMany({ where: { id: { in: [elite, prime, free] } } });
    }
  });

  it('без подписчиков в городе фора схлопывается: релиз всем сразу', async () => {
    const { db } = await import('@/lib/db');
    const { createInquiry, inquiriesForPhotographer } = await import('@/lib/inquiries');

    // Город, который другие тесты не трогают: проверка «нет ни одного
    // подписчика» глобальна по городу, и чужой Elite из параллельного файла
    // сделал бы тест ложно-красным
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'omsk' } });

    const u = await db.user.create({
      data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Пустой', lastName: 'Город', email: `nosub-${stamp}@test.local` },
    });
    await db.photographerProfile.create({
      data: { userId: u.id, username: `nosub-${stamp}`, cityId: city.id, status: 'APPROVED', proRank: 0 },
    });

    try {
      // На платформе без подписчиков задержка наказывала бы заказчика ради
      // пустого места: шесть часов заявку не видел бы ВООБЩЕ НИКТО
      const { inquiryId, notified } = await createInquiry({
        citySlug: 'omsk', description: 'Нужен фотограф на юбилей, вечер, ресторан в центре',
        contactName: 'Тест', contactEmail: `nosub-cl-${stamp}@test.local`,
      });

      // Уведомление ушло сразу, хотя автор бесплатный
      expect(notified).toBeGreaterThanOrEqual(1);
      expect(
        await db.notification.count({ where: { userId: u.id, type: 'notification.inquiry.new' } }),
      ).toBe(1);

      // И в кабинете заявка видна сразу, а не через шесть часов
      const visible = (await inquiriesForPhotographer(u.id))?.some((i) => i.id === inquiryId);
      expect(visible).toBe(true);

      await db.inquiry.delete({ where: { id: inquiryId } });
    } finally {
      await db.notification.deleteMany({ where: { userId: u.id } });
      await db.photographerProfile.deleteMany({ where: { userId: u.id } });
      await db.user.delete({ where: { id: u.id } });
    }
  });

  it('фора действует и в кабинете, а не только в уведомлениях', async () => {
    const { db } = await import('@/lib/db');
    const { createInquiry, inquiriesForPhotographer } = await import('@/lib/inquiries');
    const { ELITE_RANK } = await import('@/lib/subscription');

    // Фора, которую видно только в письмах, — не фора: фотограф без подписки
    // откроет кабинет и увидит тот же заказ в ту же минуту. Проверяем ленту
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'chita' } });
    const category = await db.category.findFirstOrThrow({ where: { slug: 'sports' } });

    const make = async (tag: string, rank: number) => {
      const u = await db.user.create({
        data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Лента', lastName: tag, email: `feed-${tag}-${stamp}@test.local` },
      });
      const p = await db.photographerProfile.create({
        data: {
          userId: u.id, username: `feed-${tag}-${stamp}`, cityId: city.id,
          status: 'APPROVED', proRank: rank, categories: { create: [{ categoryId: category.id }] },
        },
      });
      if (rank >= ELITE_RANK) {
        await db.subscription.create({
          data: { userId: u.id, tier: 'ELITE', currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000) },
        });
      }
      return { u, p };
    };

    const elite = await make('elite', ELITE_RANK);
    const free = await make('free', 0);

    const { inquiryId } = await createInquiry({
      contactName: 'Заказчик Форы', contactEmail: 'headstart@test.local',
      citySlug: 'chita', categorySlug: 'sports',
      description: 'Съёмка матча, нужен фотограф на весь день, тестовая заявка.',
    });

    const seen = async (userId: string) =>
      (await inquiriesForPhotographer(userId))?.some((i) => i.id === inquiryId) ?? false;

    expect(await seen(elite.u.id)).toBe(true);
    expect(await seen(free.u.id)).toBe(false);

    await db.inquiry.delete({ where: { id: inquiryId } });
    await db.notification.deleteMany({ where: { type: 'notification.inquiry.new' } });
    await db.subscription.deleteMany({ where: { userId: elite.u.id } });
    for (const { u, p } of [elite, free]) {
      await db.profileCategory.deleteMany({ where: { profileId: p.id } });
      await db.profileCategoryScore.deleteMany({ where: { profileId: p.id } });
      await db.photographerProfile.delete({ where: { id: p.id } });
      await db.user.delete({ where: { id: u.id } });
    }
  });

});

/**
 * Текст заявки — тоже канал контактов (аудит 2026-08-16, P1): заказчики пишут
 * телефон и мессенджер прямо в описание, и без маскировки весь механизм
 * раскрытия (лимит, аудит-лог) обходится чтением description — выгрузка лидов
 * города одним GET без следа.
 */
describe.skipIf(!hasDb)('заявки: контакты в тексте скрыты до раскрытия (БД)', () => {
  it('description маскируется в списке и открывается взявшему в работу', async () => {
    const { db } = await import('@/lib/db');
    const { createInquiry, inquiriesForPhotographer, setInquiryHandling } = await import('@/lib/inquiries');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'omsk' } });
    const u = await db.user.create({
      data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Маска', lastName: 'Текста', email: `mask-${stamp}@test.local` },
    });
    await db.photographerProfile.create({
      data: { userId: u.id, username: `mask-${stamp}`, cityId: city.id, status: 'APPROVED', proRank: 0 },
    });

    try {
      const { inquiryId } = await createInquiry({
        citySlug: 'omsk',
        contactName: 'Тест', contactEmail: `mask-cl-${stamp}@test.local`,
        description: 'Съёмка юбилея. Пишите сразу мне: +7 999 123-45-67 или t.me/leadleak',
      });

      const before = (await inquiriesForPhotographer(u.id))?.find((i) => i.id === inquiryId);
      expect(before).toBeTruthy();
      // Ни телефона, ни ссылки в тексте до раскрытия
      expect(before!.description).not.toContain('123-45-67');
      expect(before!.description).not.toContain('t.me/leadleak');

      // «Беру в работу» — легальный путь: текст открывается целиком
      await setInquiryHandling(u.id, inquiryId, 'IN_PROGRESS');
      const after = (await inquiriesForPhotographer(u.id))?.find((i) => i.id === inquiryId);
      expect(after!.description).toContain('123-45-67');

      await db.inquiryHandling.deleteMany({ where: { inquiryId } });
      await db.inquiry.delete({ where: { id: inquiryId } });
    } finally {
      await db.notification.deleteMany({ where: { userId: u.id } });
      await db.photographerProfile.deleteMany({ where: { userId: u.id } });
      await db.user.delete({ where: { id: u.id } });
    }
  });
});
