import { describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

/**
 * Демо-наполнение существует, чтобы платформа не выглядела пустой на показе.
 * Цена такой витрины — заказчик, написавший несуществующему автору. Поэтому
 * признак живёт в данных и обязан доезжать до карточки каталога.
 */
describe.skipIf(!hasDb)('демонстрационные профили честно помечены (БД)', () => {
  it('признак демо доходит до карточки каталога', async () => {
    const { db } = await import('@/lib/db');
    const { catalogForCity } = await import('@/lib/catalog');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const category = await db.category.findFirstOrThrow({ where: { slug: 'concerts-festivals' } });

    const user = await db.user.create({
      data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Демо', lastName: 'Пример', email: `demo-${stamp}@test.local` },
    });
    const profile = await db.photographerProfile.create({
      data: {
        userId: user.id, username: `demo-${stamp}`, cityId: city.id, status: 'APPROVED',
        isDemo: true, categories: { create: [{ categoryId: category.id }] },
      },
    });

    // Каталог показывает только авторов с опубликованными кадрами
    await db.photo.create({
      data: {
        profileId: profile.id, categoryId: category.id, status: 'APPROVED',
        storageKey: `test/demo-${stamp}/original.jpg`, width: 100, height: 100,
      },
    });

    const { cards } = await catalogForCity({ citySlug: 'moscow' });
    const card = cards.find((c) => c.username === `demo-${stamp}`);
    expect(card, 'демо-профиль не попал в каталог').toBeTruthy();
    // Без этого признака карточка неотличима от настоящего автора, и заказчик
    // узнает правду только после того, как напишет
    expect(card!.isDemo).toBe(true);

    // Обычный профиль остаётся без пометки
    const plainUser = await db.user.create({
      data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Живой', lastName: 'Автор', email: `live-${stamp}@test.local` },
    });
    const plain = await db.photographerProfile.create({
      data: {
        userId: plainUser.id, username: `live-${stamp}`, cityId: city.id, status: 'APPROVED',
        categories: { create: [{ categoryId: category.id }] },
      },
    });
    await db.photo.create({
      data: {
        profileId: plain.id, categoryId: category.id, status: 'APPROVED',
        storageKey: `test/live-${stamp}/original.jpg`, width: 100, height: 100,
      },
    });
    const { cards: after } = await catalogForCity({ citySlug: 'moscow' });
    expect(after.find((c) => c.username === `live-${stamp}`)!.isDemo).toBe(false);

    for (const p of [profile, plain]) {
      await db.photo.deleteMany({ where: { profileId: p.id } });
      await db.profileCategory.deleteMany({ where: { profileId: p.id } });
      await db.profileCategoryScore.deleteMany({ where: { profileId: p.id } });
      await db.photographerProfile.delete({ where: { id: p.id } });
    }
    await db.user.deleteMany({ where: { id: { in: [user.id, plainUser.id] } } });
  });
});
