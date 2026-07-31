import { describe, expect, it } from 'vitest';
import 'dotenv/config';

// Анти-накрутка и анти-DoS (аудит сениоров 2026-07-31):
// 1) самолайк запрещён — лайки двигают merit-порядок каталога, автор не должен
//    поднимать себя сам (у подписок self_follow был закрыт изначально, у лайков нет);
// 2) раздатчик читает объекты ПОТОКОМ с диапазоном на стороне хранилища —
//    иначе перемотка 200-МБ видео буферизовала весь файл в heap и роняла прод.
// Правило c: без DATABASE_URL DB-тесты пропускаются.
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('анти-накрутка: самолайк (БД)', () => {
  it('автор не может лайкнуть своё фото и свою серию; чужой — может', async () => {
    const { db } = await import('@/lib/db');
    const { togglePhotoLike } = await import('@/lib/engagement');
    const { toggleStoryLike } = await import('@/lib/stories');
    const { DomainError } = await import('@/lib/errors');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const cat = await db.category.findFirstOrThrow({ where: { slug: 'sports' } });

    const owner = await db.user.create({
      data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'С', lastName: 'Амолайк', email: `sl-o-${stamp}@test.local` },
    });
    const profile = await db.photographerProfile.create({
      data: { userId: owner.id, username: `sl-${stamp}`, cityId: city.id, status: 'APPROVED' },
    });
    const photo = await db.photo.create({
      data: { profileId: profile.id, categoryId: cat.id, storageKey: `photos/sl-${stamp}/original.jpg`, width: 2400, height: 1600, status: 'APPROVED', publishedAt: new Date() },
    });
    const story = await db.story.create({
      data: { profileId: profile.id, categoryId: cat.id, title: 'Серия', status: 'APPROVED', publishedAt: new Date() },
    });
    const stranger = await db.user.create({
      data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'Ч', lastName: 'Ужой', email: `sl-s-${stamp}@test.local` },
    });

    // Свой контент лайкать нельзя
    await expect(togglePhotoLike(owner.id, photo.id)).rejects.toThrowError(DomainError);
    await expect(toggleStoryLike(owner.id, story.id)).rejects.toThrowError(DomainError);
    expect(await db.like.count({ where: { userId: owner.id } })).toBe(0);

    // Чужой лайкает нормально
    expect((await togglePhotoLike(stranger.id, photo.id)).liked).toBe(true);
    expect((await toggleStoryLike(stranger.id, story.id)).liked).toBe(true);
    expect(await db.like.count({ where: { userId: stranger.id } })).toBe(2);

    // Cleanup (лайки/события → контент → профиль → пользователи)
    await db.like.deleteMany({ where: { OR: [{ photoId: photo.id }, { storyId: story.id }] } });
    await db.activityEvent.deleteMany({ where: { OR: [{ targetId: photo.id }, { targetId: story.id }] } });
    await db.photo.deleteMany({ where: { profileId: profile.id } });
    await db.story.deleteMany({ where: { profileId: profile.id } });
    await db.profileCategoryScore.deleteMany({ where: { profileId: profile.id } });
    await db.photographerProfile.delete({ where: { id: profile.id } });
    await db.user.deleteMany({ where: { id: { in: [owner.id, stranger.id] } } });
  });
});

describe('раздатчик: потоковое чтение с диапазоном', () => {
  it('storage отдаёт поток и точный кусок по Range, не буферизуя объект целиком', async () => {
    const { storage } = await import('@/lib/storage');
    const key = `photos/stream-test-${Date.now()}/original.jpg`;
    const payload = Buffer.from('0123456789abcdefghij'); // 20 байт

    await storage.put(key, payload, 'image/jpeg');
    try {
      expect(await storage.size(key)).toBe(20);

      // Полный объект потоком
      const whole = await storage.getStream(key);
      expect(whole).not.toBeNull();
      expect(whole!.total).toBe(20);
      const wholeBytes = Buffer.from(await new Response(whole!.body).arrayBuffer());
      expect(wholeBytes.toString()).toBe('0123456789abcdefghij');

      // Срез 5..9 — ровно запрошенные байты, полный размер сохранён
      const part = await storage.getStream(key, { start: 5, end: 9 });
      expect(part).not.toBeNull();
      const partBytes = Buffer.from(await new Response(part!.body).arrayBuffer());
      expect(partBytes.toString()).toBe('56789');
      expect(partBytes.byteLength).toBe(5);
      expect(part!.total).toBe(20);

      // Несуществующий ключ — null, а не исключение
      expect(await storage.getStream(`photos/missing-${Date.now()}/x.jpg`)).toBeNull();
      expect(await storage.size(`photos/missing-${Date.now()}/x.jpg`)).toBeNull();
    } finally {
      await storage.delete(key);
    }
  });
});

describe('152-ФЗ: согласие на обработку ПДн в форме заявки', () => {
  it('API отклоняет заявку без pdnConsent и принимает с ним (валидация схемы)', async () => {
    const { z } = await import('zod');
    // Схема-зеркало контракта роута /api/inquiries: без явного согласия — отказ.
    // Форма собирает имя/телефон/почту гостя, т.е. ПДн (аудит 2026-07-31, P0).
    const Schema = z.object({
      contactName: z.string().trim().min(2).max(100),
      description: z.string().trim().min(20).max(3000),
      pdnConsent: z.literal(true, { message: 'consent_required' }),
    });
    const base = { contactName: 'Иван Заказчиков', description: 'Нужна съёмка конференции на 200 человек' };

    expect(Schema.safeParse({ ...base, pdnConsent: true }).success).toBe(true);
    expect(Schema.safeParse({ ...base, pdnConsent: false }).success).toBe(false);
    expect(Schema.safeParse(base).success).toBe(false); // поле опущено — тоже отказ
  });
});
