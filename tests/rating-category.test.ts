import { describe, expect, it } from 'vitest';
import 'dotenv/config';

// Жанровый рейтинг (рейтинг v2, категория×город): специалист жанра выше
// генералиста ВНУТРИ жанра при равной базе; чистка строк покинутых категорий;
// выдача категории сортируется по жанровому скору. Правило c: без DATABASE_URL — skip.
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('rating: жанровые скоры (БД)', () => {
  it('recomputeOne пишет скоры по жанрам: лайки спортивных фото двигают ТОЛЬКО спорт; чистит покинутые категории; каталог категории сортирует по жанровому скору', async () => {
    const { db } = await import('@/lib/db');
    const { recomputeOne } = await import('@/lib/rating');
    const { catalogForCity } = await import('@/lib/catalog');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const sports = await db.category.findFirstOrThrow({ where: { slug: 'sports' } });
    const corp = await db.category.findFirstOrThrow({ where: { slug: 'corporate' } });

    // Два автора в обеих категориях: «спортивный специалист» и «генералист».
    const mk = async (tag: string) => {
      const user = await db.user.create({
        data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Ж', lastName: tag, email: `cat-${tag}-${stamp}@test.local` },
      });
      const profile = await db.photographerProfile.create({
        data: {
          userId: user.id,
          username: `cat-${tag}-${stamp}`,
          cityId: city.id,
          status: 'APPROVED',
          categories: { create: [{ categoryId: sports.id }, { categoryId: corp.id }] },
        },
      });
      return { user, profile };
    };
    const spec = await mk('spec');
    const gen = await mk('gen');

    // У обоих по фото в каждом жанре (равная база/полнота).
    const photo = (profileId: string, categoryId: string, key: string) =>
      db.photo.create({
        data: { profileId, categoryId, storageKey: `photos/cat-${stamp}/${key}.jpg`, width: 2400, height: 1600, status: 'APPROVED', publishedAt: new Date() },
      });
    const specSport = await photo(spec.profile.id, sports.id, 'ss');
    await photo(spec.profile.id, corp.id, 'sc');
    const genSport = await photo(gen.profile.id, sports.id, 'gs');
    const genCorp = await photo(gen.profile.id, corp.id, 'gc');

    // Лайки: специалисту 3 на спортивное фото; генералисту 1 на спорт + 2 на корпоративы
    // (глобальный engagement РАВЕН: 3000 против 3000 — различает только жанровый).
    const liker = async (n: string) =>
      (await db.user.create({ data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'Л', lastName: n, email: `cl-${n}-${stamp}@test.local` } })).id;
    const likerIds = await Promise.all(['a', 'b', 'c', 'd', 'e', 'f'].map(liker));
    const now = new Date();
    await db.like.createMany({
      data: [
        { userId: likerIds[0], photoId: specSport.id, weightMilli: 1000, createdAt: now },
        { userId: likerIds[1], photoId: specSport.id, weightMilli: 1000, createdAt: now },
        { userId: likerIds[2], photoId: specSport.id, weightMilli: 1000, createdAt: now },
        { userId: likerIds[3], photoId: genSport.id, weightMilli: 1000, createdAt: now },
        { userId: likerIds[4], photoId: genCorp.id, weightMilli: 1000, createdAt: now },
        { userId: likerIds[5], photoId: genCorp.id, weightMilli: 1000, createdAt: now },
      ],
    });

    await recomputeOne(spec.profile.id, now);
    await recomputeOne(gen.profile.id, now);

    const score = (profileId: string, categoryId: string) =>
      db.profileCategoryScore.findUniqueOrThrow({ where: { profileId_categoryId: { profileId, categoryId } } });

    // Глобальные равны, жанровые различают: спорт — специалист выше; корп — генералист.
    const [specGlobal, genGlobal] = await Promise.all([
      db.photographerProfile.findUniqueOrThrow({ where: { id: spec.profile.id }, select: { ratingScore: true } }),
      db.photographerProfile.findUniqueOrThrow({ where: { id: gen.profile.id }, select: { ratingScore: true } }),
    ]);
    expect(specGlobal.ratingScore).toBe(genGlobal.ratingScore);
    expect((await score(spec.profile.id, sports.id)).scoreMilli)
      .toBeGreaterThan((await score(gen.profile.id, sports.id)).scoreMilli);
    expect((await score(gen.profile.id, corp.id)).scoreMilli)
      .toBeGreaterThan((await score(spec.profile.id, corp.id)).scoreMilli);

    // Каталог категории (город+жанр): в спорте специалист ПЕРВЫМ, в корпоративах — генералист.
    const bothUsernames = [spec.profile.username, gen.profile.username];
    const orderOf = async (categorySlug: string) => {
      const page = await catalogForCity({ citySlug: 'moscow', categorySlug });
      return page.cards.map((c) => c.username).filter((u) => bothUsernames.includes(u ?? ''));
    };
    expect(await orderOf('sports')).toEqual([spec.profile.username, gen.profile.username]);
    expect(await orderOf('corporate')).toEqual([gen.profile.username, spec.profile.username]);

    // Чистка: специалист уходит из корпоративов (категория + фото) → строка скора удаляется.
    await db.like.deleteMany({ where: { photo: { profileId: spec.profile.id, categoryId: corp.id } } });
    await db.photo.deleteMany({ where: { profileId: spec.profile.id, categoryId: corp.id } });
    await db.profileCategory.delete({
      where: { profileId_categoryId: { profileId: spec.profile.id, categoryId: corp.id } },
    });
    await recomputeOne(spec.profile.id, now);
    expect(
      await db.profileCategoryScore.findUnique({
        where: { profileId_categoryId: { profileId: spec.profile.id, categoryId: corp.id } },
      }),
    ).toBeNull();
    expect(
      await db.profileCategoryScore.findUnique({
        where: { profileId_categoryId: { profileId: spec.profile.id, categoryId: sports.id } },
      }),
    ).not.toBeNull();

    // Cleanup (FK-порядок: лайки/скоры/фото/категории/профили → пользователи)
    const profileIds = [spec.profile.id, gen.profile.id];
    await db.like.deleteMany({ where: { photo: { profileId: { in: profileIds } } } });
    await db.profileCategoryScore.deleteMany({ where: { profileId: { in: profileIds } } });
    await db.photo.deleteMany({ where: { profileId: { in: profileIds } } });
    await db.profileCategory.deleteMany({ where: { profileId: { in: profileIds } } });
    await db.photographerProfile.deleteMany({ where: { id: { in: profileIds } } });
    await db.user.deleteMany({ where: { email: { contains: `-${stamp}@test.local` } } });
  });
});
