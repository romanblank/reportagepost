import { describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('engagement: лайки и подписки (БД)', () => {
  it('toggle-лайк пишет события с весом, повторный — снимает', async () => {
    const { db } = await import('@/lib/db');
    const { togglePhotoLike } = await import('@/lib/engagement');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const cat = await db.category.findFirstOrThrow({ where: { slug: 'sports' } });
    const owner = await db.user.create({ data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'В', lastName: 'Ладелец', email: `eng-o-${stamp}@test.local`, emailVerifiedAt: new Date() } });
    const profile = await db.photographerProfile.create({
      data: { userId: owner.id, username: `eng-${stamp}`, cityId: city.id, status: 'APPROVED' },
    });
    const photo = await db.photo.create({
      data: { profileId: profile.id, categoryId: cat.id, storageKey: `photos/eng-${stamp}/original.jpg`, width: 2400, height: 1600, status: 'APPROVED', publishedAt: new Date() },
    });
    const liker = await db.user.create({ data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'Л', lastName: 'Айкер', email: `eng-l-${stamp}@test.local`, emailVerifiedAt: new Date() } });

    expect((await togglePhotoLike(liker.id, photo.id)).liked).toBe(true);
    expect((await togglePhotoLike(liker.id, photo.id)).liked).toBe(false);
    expect((await togglePhotoLike(liker.id, photo.id)).liked).toBe(true);

    const events = await db.activityEvent.findMany({
      where: { targetType: 'PHOTO', targetId: photo.id },
      orderBy: { id: 'asc' },
    });
    expect(events.map((e) => e.type)).toEqual(['PHOTO_LIKE', 'PHOTO_UNLIKE', 'PHOTO_LIKE']);
    expect(events[0].weightMilli).toBe(1000); // клиент — базовый вес

    const likes = await db.like.count({ where: { photoId: photo.id } });
    expect(likes).toBe(1);

    await db.activityEvent.deleteMany({ where: { targetId: photo.id } });
    await db.like.deleteMany({ where: { photoId: photo.id } });
    await db.photo.delete({ where: { id: photo.id } });
    await db.profileCategoryScore.deleteMany({ where: { profileId: profile.id } }); // лайк пересчитывает рейтинг → скоры (FK)
    await db.photographerProfile.delete({ where: { id: profile.id } });
    await db.user.deleteMany({ where: { id: { in: [owner.id, liker.id] } } });
  });

  it('P0-3: анлайк списывает вес исходного лайка даже при смене статуса актора', async () => {
    const { db } = await import('@/lib/db');
    const { togglePhotoLike } = await import('@/lib/engagement');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const cat = await db.category.findFirstOrThrow({ where: { slug: 'sports' } });
    const owner = await db.user.create({ data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'О', lastName: 'В', email: `drift-o-${stamp}@test.local`, emailVerifiedAt: new Date() } });
    const profile = await db.photographerProfile.create({ data: { userId: owner.id, username: `drift-${stamp}`, cityId: city.id, status: 'APPROVED' } });
    const photo = await db.photo.create({ data: { profileId: profile.id, categoryId: cat.id, storageKey: `photos/drift-${stamp}/original.jpg`, width: 2400, height: 1600, status: 'APPROVED', publishedAt: new Date() } });
    // актор — одобренный фотограф (вес лайка 2000)
    const actor = await db.user.create({ data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'А', lastName: 'К', email: `drift-a-${stamp}@test.local`, emailVerifiedAt: new Date() } });
    const actorProfile = await db.photographerProfile.create({ data: { userId: actor.id, username: `drift-a-${stamp}`, cityId: city.id, status: 'APPROVED' } });

    await togglePhotoLike(actor.id, photo.id); // лайк весом 2000
    // статус актора падает (профиль на модерацию → вес актора стал бы 1000)
    await db.photographerProfile.update({ where: { id: actorProfile.id }, data: { status: 'PENDING' } });
    await togglePhotoLike(actor.id, photo.id); // анлайк

    const events = await db.activityEvent.findMany({ where: { targetId: photo.id }, orderBy: { id: 'asc' } });
    expect(events[0].weightMilli).toBe(2000); // лайк
    expect(events[1].weightMilli).toBe(2000); // анлайк списывает ТОТ ЖЕ вес, не 1000
    const net = events.reduce((s, e) => s + (e.type === 'PHOTO_LIKE' ? e.weightMilli : -e.weightMilli), 0);
    expect(net).toBe(0); // никакого фантомного вклада

    await db.activityEvent.deleteMany({ where: { targetId: photo.id } });
    await db.like.deleteMany({ where: { photoId: photo.id } });
    await db.photo.delete({ where: { id: photo.id } });
    await db.profileCategoryScore.deleteMany({ where: { profileId: { in: [profile.id, actorProfile.id] } } }); // лайк пересчитывает рейтинг (FK)
    await db.photographerProfile.deleteMany({ where: { id: { in: [profile.id, actorProfile.id] } } });
    await db.user.deleteMany({ where: { id: { in: [owner.id, actor.id] } } });
  });
});

/**
 * Вес голоса зависит от доверия к аккаунту.
 *
 * Лайки двигают порядок каталога, а стоят атакующему ноль: регистрация
 * открыта, подтверждение почты для лайка не требуется. Двадцать свежих
 * аккаунтов давали больше, чем идеально заполненная анкета честного автора.
 */
describe.skipIf(!hasDb)('анти-накрутка: голос свежего аккаунта не двигает merit (БД)', () => {
  it('лайк ставится, но вес нулевой, пока аккаунт не подтверждён и не выдержан', async () => {
    const { db } = await import('@/lib/db');
    const { togglePhotoLike } = await import('@/lib/engagement');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const cat = await db.category.findFirstOrThrow({ where: { slug: 'sports' } });
    const owner = await db.user.create({
      data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'А', lastName: 'В', email: `w-own-${stamp}@test.local` },
    });
    const profile = await db.photographerProfile.create({
      data: { userId: owner.id, username: `w-${stamp}`, cityId: city.id, status: 'APPROVED' },
    });
    const photo = await db.photo.create({
      data: { profileId: profile.id, categoryId: cat.id, storageKey: `photos/w-${stamp}/original.jpg`, width: 2400, height: 1600, status: 'APPROVED', publishedAt: new Date() },
    });

    // Свежий аккаунт без подтверждённой почты — ровно то, что штампует накрутчик
    const fresh = await db.user.create({
      data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'С', lastName: 'В', email: `w-fresh-${stamp}@test.local` },
    });
    // Подтверждённый — обычный живой зритель
    const trusted = await db.user.create({
      data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'Д', lastName: 'В', email: `w-tr-${stamp}@test.local`, emailVerifiedAt: new Date() },
    });

    try {
      await togglePhotoLike(fresh.id, photo.id);
      const freshLike = await db.like.findFirstOrThrow({ where: { userId: fresh.id, photoId: photo.id } });
      // Лайк существует — человек видит отклик; но выдачу он не двигает
      expect(freshLike.weightMilli).toBe(0);

      await togglePhotoLike(trusted.id, photo.id);
      const trustedLike = await db.like.findFirstOrThrow({ where: { userId: trusted.id, photoId: photo.id } });
      expect(trustedLike.weightMilli).toBeGreaterThan(0);
    } finally {
      await db.like.deleteMany({ where: { photoId: photo.id } });
      await db.activityEvent.deleteMany({ where: { actorUserId: { in: [fresh.id, trusted.id] } } });
      await db.photo.delete({ where: { id: photo.id } });
      // Жанровый скор ссылается на профиль — удаляется первым (правило FK)
      await db.profileCategoryScore.deleteMany({ where: { profileId: profile.id } });
      await db.photographerProfile.delete({ where: { id: profile.id } });
      await db.user.deleteMany({ where: { id: { in: [owner.id, fresh.id, trusted.id] } } });
    }
  });
});
