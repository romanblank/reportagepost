// E2E-батарея (правило №7): полный жизненный цикл через сервисный слой на живой
// БД + автоаудитор выдач. Гоняется перед значимым релизом.
// Запуск: npm run e2e (нужен локальный PG). Всё создаётся и убирается за собой.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

vi.mock('@/lib/sms', () => ({
  smsProvider: { isConfigured: () => true, send: vi.fn(async () => ({ id: 'e2e' })) },
}));

beforeAll(() => {
  process.env.AUTH_SECRET ??= 'test-secret-32-chars-minimum-000000';
});

// Автоаудитор выдачи: ловит плейсхолдеры, англ. enum в местах для человека, обрывы
function auditText(label: string, value: string) {
  const bad = [/undefined/i, /\bnull\b/i, /\bNaN\b/, /\[object Object\]/, /PENDING|APPROVED|REJECTED/];
  for (const re of bad) {
    expect(re.test(value), `${label}: подозрительная выдача «${value}»`).toBe(false);
  }
}

describe.skipIf(!hasDb)('E2E: полный цикл фотографа и заказчика', () => {
  const ids: { users: string[]; profiles: string[] } = { users: [], profiles: [] };

  afterAll(async () => {
    const { db } = await import('@/lib/db');
    for (const pid of ids.profiles) {
      await db.like.deleteMany({ where: { photo: { profileId: pid } } });
      await db.story.deleteMany({ where: { profileId: pid } });
      await db.photo.deleteMany({ where: { profileId: pid } });
      await db.profileCategory.deleteMany({ where: { profileId: pid } });
      await db.busyDate.deleteMany({ where: { profileId: pid } });
      await db.travelPlan.deleteMany({ where: { profileId: pid } });
      await db.favoritePhotographer.deleteMany({ where: { profileId: pid } });
      await db.photographerProfile.delete({ where: { id: pid } }).catch(() => {});
    }
    for (const uid of ids.users) {
      await db.subscription.deleteMany({ where: { userId: uid } });
      await db.activityEvent.deleteMany({ where: { actorUserId: uid } });
      await db.inquiry.deleteMany({ where: { clientUserId: uid } });
      await db.notification.deleteMany({ where: { userId: uid } });
      await db.like.deleteMany({ where: { userId: uid } });
      await db.follow.deleteMany({ where: { OR: [{ followerId: uid }, { followeeId: uid }] } });
      await db.user.delete({ where: { id: uid } }).catch(() => {});
    }
  });

  it('регистрация→онбординг→модерация→каталог→заявка→лайк→серия', async () => {
    const { db } = await import('@/lib/db');
    const { hashPassword } = await import('@/lib/auth');
    const { approveProfile } = await import('@/lib/moderation');
    const { catalogForCity } = await import('@/lib/catalog');
    const { createInquiry, inquiriesForPhotographer, releaseInquiries } = await import('@/lib/inquiries');
    const { togglePhotoLike } = await import('@/lib/engagement');
    const { createStory, approveStory } = await import('@/lib/stories');
    const { cityNameRu } = await import('@/lib/geo-data');
    const { categoryNameRu } = await import('@/lib/category-data');
    const { formatRubMinor } = await import('@/lib/money');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const cat = await db.category.findFirstOrThrow({ where: { slug: 'concerts-festivals' } });

    // 1. Фотограф регистрируется (PENDING)
    const photographer = await db.user.create({
      data: { role: 'PHOTOGRAPHER', status: 'PENDING', firstName: 'Пётр', lastName: 'Снимаев', email: `e2e-ph-${stamp}@test.local`, passwordHash: await hashPassword('correct-horse-42') },
    });
    ids.users.push(photographer.id);

    // 2. Онбординг: профиль + фото + пакет
    const profile = await db.photographerProfile.create({
      data: {
        userId: photographer.id, username: `e2e-${stamp}`, cityId: city.id, bio: 'Снимаю концерты и фестивали по всей стране.',
        status: 'PENDING',
        categories: { create: [{ categoryId: cat.id }] },
        packages: { create: [{ hours: 3, priceMinor: 1500000, currency: 'RUB' }] },
        photos: { create: Array.from({ length: 15 }, (_, i) => ({ categoryId: cat.id, storageKey: `photos/e2e-${stamp}-${i}/original.jpg`, width: 2400, height: 1600 })) },
      },
    });
    ids.profiles.push(profile.id);

    // 3. Модерация одобряет
    const { published } = await approveProfile(profile.id);
    expect(published).toBe(15);
    expect((await db.user.findUniqueOrThrow({ where: { id: photographer.id } })).status).toBe('ACTIVE');

    // 4. Каталог показывает фотографа с человекочитаемой ценой
    const { cards } = await catalogForCity({ citySlug: 'moscow' });
    const card = cards.find((c) => c.username === `e2e-${stamp}`);
    expect(card).toBeTruthy();
    auditText('карточка каталога', `${card!.firstName} ${card!.lastName}`);
    if (card!.minPackage) auditText('цена', formatRubMinor(card!.minPackage.priceMinor));
    auditText('город', cityNameRu(city.slug));
    auditText('категория', categoryNameRu(cat.slug));

    // 5. Заказчик оставляет заявку → фотограф её видит
    const client = await db.user.create({ data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'Ирина', lastName: 'Заказова', email: `e2e-cl-${stamp}@test.local` } });
    ids.users.push(client.id);
    const { inquiryId, notified } = await createInquiry({
      clientUserId: client.id, contactName: 'Ирина', contactEmail: 'irina@test.local',
      citySlug: 'moscow', categorySlug: 'concerts-festivals', description: 'Нужен фотограф на фестиваль, полный день, две сцены.',
    });
    expect(inquiryId).toBeTruthy();
    // Наш фотограф без подписки, и заявка до него доходит НЕ сразу: первые
    // часы она у подписчиков. Сквозной путь обязан показывать именно это —
    // иначе фора существует в коде, но не в том, что мы считаем нормой
    expect(notified).toBe(0);
    expect((await inquiriesForPhotographer(photographer.id))?.some((i) => i.id === inquiryId)).toBe(false);

    // …а после окончания форы — доходит, и это тот же самый заказ
    const { INQUIRY_HEAD_START_HOURS } = await import('@/lib/pricing');
    const afterHeadStart = new Date(Date.now() + (INQUIRY_HEAD_START_HOURS.ELITE + 1) * 3_600_000);
    await releaseInquiries(afterHeadStart);
    const feed = await inquiriesForPhotographer(photographer.id, afterHeadStart);
    expect(feed?.some((i) => i.id === inquiryId)).toBe(true);
    auditText('описание заявки', feed![0].description);

    // 6. Лайк фото
    const photo = await db.photo.findFirstOrThrow({ where: { profileId: profile.id } });
    expect((await togglePhotoLike(client.id, photo.id)).liked).toBe(true);

    // 7. Серия → модерация → опубликована (серии — перк Active, грантим подписку)
    const { grantFoundingSub } = await import('@/lib/subscription');
    await grantFoundingSub(photographer.id, 'moscow', 'PRIME');
    const storyPhotos = await db.photo.findMany({ where: { profileId: profile.id }, take: 6, select: { id: true } });
    const { storyId } = await createStory(photographer.id, { title: 'Фестиваль лета', categorySlug: 'concerts-festivals', photoIds: storyPhotos.map((p) => p.id) });
    await approveStory(storyId);
    const story = await db.story.findUniqueOrThrow({ where: { id: storyId } });
    expect(story.status).toBe('APPROVED');
    auditText('заголовок серии', story.title);
  });
});
