import { describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('feeds: подписки и рекомендации (БД)', () => {
  it('лента подписок отдаёт фото автора, на которого подписан; рек-лента фолбэчит', async () => {
    const { db } = await import('@/lib/db');
    const { followingFeed, recommendedFeed } = await import('@/lib/feeds');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const cat = await db.category.findFirstOrThrow({ where: { slug: 'sports' } });
    const author = await db.user.create({ data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'А', lastName: 'В', email: `feed-a-${stamp}@test.local` } });
    const profile = await db.photographerProfile.create({ data: { userId: author.id, username: `feed-${stamp}`, cityId: city.id, status: 'APPROVED' } });
    const photo = await db.photo.create({ data: { profileId: profile.id, categoryId: cat.id, storageKey: `photos/feed-${stamp}/original.jpg`, width: 2400, height: 1600, status: 'APPROVED', publishedAt: new Date() } });
    const follower = await db.user.create({ data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'П', lastName: 'К', email: `feed-f-${stamp}@test.local` } });

    // без подписки — пусто
    expect(await followingFeed(follower.id)).toHaveLength(0);
    await db.follow.create({ data: { followerId: follower.id, followeeId: author.id } });
    const feed = await followingFeed(follower.id);
    expect(feed.some((p) => p.photoId === photo.id)).toBe(true);

    // рек-лента без лайков истории — не персональная, но что-то отдаёт (фолбэк)
    const rec = await recommendedFeed(follower.id);
    expect(rec.personalized).toBe(false);

    await db.follow.deleteMany({ where: { followeeId: author.id } });
    await db.photo.delete({ where: { id: photo.id } });
    await db.photographerProfile.delete({ where: { id: profile.id } });
    await db.user.deleteMany({ where: { id: { in: [author.id, follower.id] } } });
  });

  it('находки редакции: подписчики получают большинство слотов, но кураторские не вытесняются', async () => {
    const { db } = await import('@/lib/db');
    const { editorsChoice } = await import('@/lib/feeds');
    const { grantFoundingSub } = await import('@/lib/subscription');

    // Тест переписан (аудит 2026-08-01, P1). Прежняя версия была сломана по
    // конструкции: (1) editorsChoiceAt ставился в БУДУЩЕЕ, чтобы свои фото
    // всплыли наверх — в проде такого не бывает, тест проверял небывалое
    // состояние; (2) ожидалось жёсткое `toBe(4)` из формулы round(5*0.8) —
    // это проверка РЕАЛИЗАЦИИ: смена коэффициента на 0.75 роняет тест, хотя
    // продукт работает верно; (3) выдача не фильтровалась по своим данным,
    // поэтому чужие editors-choice фото в базе ломали расклад.
    // Теперь: реальные даты в прошлом, изоляция по своим авторам и проверка
    // СВОЙСТВА — буст подписчиков есть, но кураторские не исчезают совсем.
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const cat = await db.category.findFirstOrThrow({ where: { slug: 'sports' } });
    const uids: string[] = [];
    const subUsernames = new Set<string>();
    const ourUsernames = new Set<string>();

    const mk = async (tag: string, subscribed: boolean, minutesAgo: number) => {
      const u = await db.user.create({ data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: tag, lastName: 'Q', email: `ec-${tag}-${stamp}@test.local` } });
      uids.push(u.id);
      const uname = `ec-${tag}-${stamp}`;
      ourUsernames.add(uname);
      const p = await db.photographerProfile.create({ data: { userId: u.id, username: uname, cityId: city.id, status: 'APPROVED' } });
      await db.photo.create({
        data: {
          profileId: p.id, categoryId: cat.id, storageKey: `photos/${uname}/original.jpg`,
          width: 2400, height: 1600, status: 'APPROVED', publishedAt: new Date(),
          // Отметка редакции — в прошлом, как в реальной жизни
          editorsChoiceAt: new Date(Date.now() - minutesAgo * 60_000),
        },
      });
      if (subscribed) { await grantFoundingSub(u.id, 'moscow', 'PRIME'); subUsernames.add(uname); }
    };

    // Свежие отметки — у нашего набора, поэтому он окажется в начале выдачи
    for (let i = 0; i < 5; i++) await mk(`sub${i}`, true, i + 1);
    for (let i = 0; i < 2; i++) await mk(`cur${i}`, false, i + 10);

    const res = await editorsChoice(20);
    const ours = res.filter((r) => ourUsernames.has(r.username));
    const fromSub = ours.filter((r) => subUsernames.has(r.username)).length;
    const fromCurated = ours.length - fromSub;

    // Свойства, а не формула: буст подписки работает, но полка не схлопывается
    // в «только платные» — это прямо противоречило бы антиклассизм-инварианту.
    expect(ours.length).toBeGreaterThan(0);
    expect(fromSub).toBeGreaterThan(0);
    expect(fromCurated).toBeGreaterThan(0);
    expect(fromSub).toBeGreaterThanOrEqual(fromCurated);

    await db.photo.deleteMany({ where: { profile: { userId: { in: uids } } } });
    await db.subscription.deleteMany({ where: { userId: { in: uids } } });
    await db.profileCategoryScore.deleteMany({ where: { profile: { userId: { in: uids } } } });
    await db.photographerProfile.deleteMany({ where: { userId: { in: uids } } });
    await db.user.deleteMany({ where: { id: { in: uids } } });
  });

  it('лучшее недели: ранжирует по текущим лайкам в окне; лайк вне окна недели не в счёте', async () => {
    const { db } = await import('@/lib/db');
    const { bestOfWeek, bestOfYear } = await import('@/lib/feeds');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const day = 86_400_000;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const cat = await db.category.findFirstOrThrow({ where: { slug: 'sports' } });
    const author = await db.user.create({ data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Б', lastName: 'В', email: `bw-${stamp}@test.local` } });
    const profile = await db.photographerProfile.create({ data: { userId: author.id, username: `bw-${stamp}`, cityId: city.id, status: 'APPROVED' } });
    const mk = async (n: string) => (await db.photo.create({ data: { profileId: profile.id, categoryId: cat.id, storageKey: `photos/bw-${stamp}-${n}/original.jpg`, width: 2400, height: 1600, status: 'APPROVED', publishedAt: new Date() } })).id;
    const [pFresh, pOld] = await Promise.all([mk('fresh'), mk('old')]);
    const liker = async (n: string) => (await db.user.create({ data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'Л', lastName: n, email: `bwl-${n}-${stamp}@test.local` } })).id;
    const [l1, l2] = await Promise.all([liker('1'), liker('2')]);

    const now = Date.now();
    await db.like.createMany({
      data: [
        { userId: l1, photoId: pFresh, weightMilli: 2000, createdAt: new Date(now - 2 * day) }, // в окне недели
        { userId: l2, photoId: pOld, weightMilli: 5000, createdAt: new Date(now - 20 * day) }, // вне недели, в году
      ],
    });

    // Лимит берём заведомо больше содержимого базы: на наполненной демо-данными
    // БД дефолтные 60 позиций занимают соседи, и тест падал не из-за логики.
    const week = await bestOfWeek(500);
    expect(week.find((p) => p.photoId === pFresh)?.scoreMilli).toBe(2000);
    expect(week.some((p) => p.photoId === pOld)).toBe(false); // лайк 20 дней назад — не в неделе

    const year = await bestOfYear(500);
    expect(year.find((p) => p.photoId === pOld)?.scoreMilli).toBe(5000); // в году виден

    await db.like.deleteMany({ where: { photoId: { in: [pFresh, pOld] } } });
    await db.photo.deleteMany({ where: { id: { in: [pFresh, pOld] } } });
    await db.photographerProfile.delete({ where: { id: profile.id } });
    await db.user.deleteMany({ where: { id: { in: [author.id, l1, l2] } } });
  });

  it('фото/серия непубличного профиля НЕ всплывают в лентах/дискавери (аудит 2026-07-28)', async () => {
    const { db } = await import('@/lib/db');
    const { freshPhotos } = await import('@/lib/feeds');
    const { freshStories } = await import('@/lib/discovery');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const cat = await db.category.findFirstOrThrow({ where: { slug: 'concerts-festivals' } });
    // Профиль СНЯТ С ПУБЛИКАЦИИ (NEEDS_REVISION), но контент APPROVED
    const u = await db.user.create({ data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Скрыт', lastName: 'Ый', email: `hidden-${stamp}@test.local` } });
    const p = await db.photographerProfile.create({ data: { userId: u.id, username: `hidden-${stamp}`, cityId: city.id, status: 'NEEDS_REVISION' } });
    const photo = await db.photo.create({ data: { profileId: p.id, categoryId: cat.id, storageKey: `photos/hidden-${stamp}/o.jpg`, width: 2400, height: 1600, status: 'APPROVED', publishedAt: new Date() } });
    const story = await db.story.create({ data: { profileId: p.id, categoryId: cat.id, title: 'Скрытая серия', status: 'APPROVED', publishedAt: new Date(), coverPhotoId: photo.id, photos: { connect: [{ id: photo.id }] } } });

    expect((await freshPhotos(200)).some((x) => x.photoId === photo.id)).toBe(false);
    expect((await freshStories(50)).some((x) => x.id === story.id)).toBe(false);

    // публикуем профиль → контент появляется
    await db.photographerProfile.update({ where: { id: p.id }, data: { status: 'APPROVED' } });
    expect((await freshPhotos(200)).some((x) => x.photoId === photo.id)).toBe(true);
    expect((await freshStories(50)).some((x) => x.id === story.id)).toBe(true);

    await db.story.delete({ where: { id: story.id } });
    await db.photo.delete({ where: { id: photo.id } });
    await db.photographerProfile.delete({ where: { id: p.id } });
    await db.user.delete({ where: { id: u.id } });
  });
});

/**
 * Сохранённые кадры (партнёр 2026-08-18): личная закладка, НЕ лайк.
 * Стережём три вещи: переключатель работает, лента отдаёт только свои,
 * закладка на непубличный кадр невозможна (утечка через ленту сохранённых).
 */
describe.skipIf(!hasDb)('сохранённые кадры (БД)', () => {
  it('toggle сохраняет и снимает; лента личная; PENDING не сохранить', async () => {
    const { db } = await import('@/lib/db');
    const { toggleSavePhoto, savedFeed } = await import('@/lib/feeds');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const cat = await db.category.findFirstOrThrow({ where: { slug: 'sports' } });
    const author = await db.user.create({
      data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Сейв', lastName: 'Автор', email: `save-a-${stamp}@test.local` },
    });
    const profile = await db.photographerProfile.create({
      data: { userId: author.id, username: `save-${stamp}`, cityId: city.id, status: 'APPROVED' },
    });
    const photo = await db.photo.create({
      data: { profileId: profile.id, categoryId: cat.id, storageKey: `photos/save-${stamp}/web.jpg`, width: 2400, height: 1600, status: 'APPROVED', publishedAt: new Date() },
    });
    const pending = await db.photo.create({
      data: { profileId: profile.id, categoryId: cat.id, storageKey: `photos/savep-${stamp}/web.jpg`, width: 2400, height: 1600, status: 'PENDING' },
    });
    const viewer = await db.user.create({
      data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'Сейв', lastName: 'Зритель', email: `save-v-${stamp}@test.local` },
    });
    const other = await db.user.create({
      data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'Сейв', lastName: 'Чужой', email: `save-o-${stamp}@test.local` },
    });

    try {
      expect((await toggleSavePhoto(viewer.id, photo.id)).saved).toBe(true);
      // Лента личная: у чужого пусто
      expect((await savedFeed(viewer.id)).some((p) => p.photoId === photo.id)).toBe(true);
      expect((await savedFeed(other.id)).length).toBe(0);
      // Повторный toggle снимает
      expect((await toggleSavePhoto(viewer.id, photo.id)).saved).toBe(false);
      expect((await savedFeed(viewer.id)).length).toBe(0);
      // Непубличный кадр закладке недоступен
      await expect(toggleSavePhoto(viewer.id, pending.id)).rejects.toMatchObject({ status: 404 });
    } finally {
      await db.savedPhoto.deleteMany({ where: { userId: { in: [viewer.id, other.id] } } });
      await db.photo.deleteMany({ where: { profileId: profile.id } });
      await db.photographerProfile.delete({ where: { id: profile.id } });
      await db.user.deleteMany({ where: { id: { in: [author.id, viewer.id, other.id] } } });
    }
  });
});

/**
 * «Отмеченные» (партнёр 2026-08-18): глобальная подборка по živому отклику
 * за 30 дней. Стережём: демо исключены, отклик определяет состав, страница
 * не выдаёт мест — данные без позиций (сортировка есть, номеров нет).
 */
describe.skipIf(!hasDb)('отмеченные авторы (БД)', () => {
  it('живой автор с откликом попадает, демо — никогда', async () => {
    const { db } = await import('@/lib/db');
    const { markedPhotographers } = await import('@/lib/catalog');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'omsk' } });
    const cat = await db.category.findFirstOrThrow({ where: { slug: 'sports' } });

    const mk = async (tag: string, demo: boolean) => {
      const u = await db.user.create({
        data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Отм', lastName: tag, email: `mark-${tag}-${stamp}@test.local` },
      });
      const p = await db.photographerProfile.create({
        data: { userId: u.id, username: `mark-${tag}-${stamp}`, cityId: city.id, status: 'APPROVED', isDemo: demo },
      });
      const ph = await db.photo.create({
        data: { profileId: p.id, categoryId: cat.id, storageKey: `photos/mark-${tag}-${stamp}/web.jpg`, width: 2400, height: 1600, status: 'APPROVED', publishedAt: new Date() },
      });
      return { u, p, ph };
    };
    const real = await mk('real', false);
    const demo = await mk('demo', true);
    const fan = await db.user.create({
      data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'Фанат', lastName: 'Отметок', email: `mark-f-${stamp}@test.local` },
    });
    await db.like.createMany({
      data: [
        { userId: fan.id, photoId: real.ph.id, weightMilli: 1000 },
        { userId: fan.id, photoId: demo.ph.id, weightMilli: 1000 },
      ],
    });

    try {
      const cards = await markedPhotographers(500);
      const names = cards.map((c) => c.username);
      expect(names).toContain(real.p.username);
      expect(names).not.toContain(demo.p.username);
    } finally {
      await db.like.deleteMany({ where: { userId: fan.id } });
      await db.photo.deleteMany({ where: { profileId: { in: [real.p.id, demo.p.id] } } });
      await db.photographerProfile.deleteMany({ where: { id: { in: [real.p.id, demo.p.id] } } });
      await db.user.deleteMany({ where: { id: { in: [real.u.id, demo.u.id, fan.id] } } });
    }
  });
});
