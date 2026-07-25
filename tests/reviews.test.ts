import { describe, expect, it } from 'vitest';
import 'dotenv/config';
import { validateReview } from '@/lib/reviews';

describe('reviews guard: чистая валидация', () => {
  it('оценка вне 1..5 и дробная — отклоняется', () => {
    expect(() => validateReview(0, 'ок')).toThrow('review_rating');
    expect(() => validateReview(6, 'ок')).toThrow('review_rating');
    expect(() => validateReview(3.5, 'ок')).toThrow('review_rating');
  });
  it('пустой/длинный/ссылки/телефоны — отклоняются', () => {
    expect(() => validateReview(5, '   ')).toThrow('review_empty');
    expect(() => validateReview(5, 'a'.repeat(2001))).toThrow('review_too_long');
    expect(() => validateReview(5, 'сайт example.com')).toThrow('review_no_links');
    expect(() => validateReview(5, 'звони +7 900 123 45 67')).toThrow('review_no_contacts');
  });
  it('валидный отзыв проходит', () => {
    expect(validateReview(5, '  Отличная съёмка!  ')).toEqual({ rating: 5, body: 'Отличная съёмка!' });
  });
});

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('reviews: правила и агрегат (БД)', () => {
  it('клиент/не-себе/один-на-пару/verified/ответ владельца/агрегат', async () => {
    const { db } = await import('@/lib/db');
    const { addReview, replyToReview, reviewsForProfile } = await import('@/lib/reviews');
    const { confirmShoot } = await import('@/lib/shoots');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const owner = await db.user.create({ data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Ф', lastName: 'Г', email: `rv-o-${stamp}@test.local` } });
    const profile = await db.photographerProfile.create({ data: { userId: owner.id, username: `rv-${stamp}`, cityId: city.id, status: 'APPROVED' } });
    const client = await db.user.create({ data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'К', lastName: 'Л', email: `rv-c-${stamp}@test.local` } });
    const otherPhotog = await db.user.create({ data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Д', lastName: 'Ф', email: `rv-p-${stamp}@test.local` } });

    // фотограф-не-клиент не может
    await expect(addReview(otherPhotog.id, profile.id, 5, 'топ')).rejects.toThrow('review_clients_only');
    // владелец о себе — нельзя (даже будь он клиентом; тут проверяем self через клиента-владельца невозможно — проверяем на другом профиле self)
    const selfProfileClient = await db.user.create({ data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'С', lastName: 'Ам', email: `rv-s-${stamp}@test.local` } });
    const selfProfile = await db.photographerProfile.create({ data: { userId: selfProfileClient.id, username: `rvs-${stamp}`, cityId: city.id, status: 'APPROVED' } });
    await expect(addReview(selfProfileClient.id, selfProfile.id, 5, 'сам себе')).rejects.toThrow('review_self');

    // клиент оставляет отзыв — verified=false (съёмка не подтверждена)
    const r1 = await addReview(client.id, profile.id, 4, 'хорошая работа');
    expect((await db.review.findUniqueOrThrow({ where: { id: r1.id } })).verified).toBe(false);
    // повторный — нельзя
    await expect(addReview(client.id, profile.id, 5, 'ещё раз')).rejects.toThrow('review_exists');

    // verified=true, если заказчик подтвердил реальную съёмку
    const client2 = await db.user.create({ data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'В', lastName: 'Е', email: `rv-c2-${stamp}@test.local` } });
    await confirmShoot(client2.id, profile.id);
    const r2 = await addReview(client2.id, profile.id, 5, 'снимал у него, супер');
    expect((await db.review.findUniqueOrThrow({ where: { id: r2.id } })).verified).toBe(true);

    // ответ владельца; чужой ответить не может
    await expect(replyToReview(client.id, r1.id, 'спасибо')).rejects.toThrow('forbidden');
    await replyToReview(owner.id, r1.id, 'Спасибо за отзыв!');
    expect((await db.review.findUniqueOrThrow({ where: { id: r1.id } })).reply).toBe('Спасибо за отзыв!');

    // агрегат: (4 + 5) / 2 = 4.5, count 2
    const { aggregate, items } = await reviewsForProfile(profile.id);
    expect(aggregate.count).toBe(2);
    expect(aggregate.avg).toBeCloseTo(4.5, 5);
    expect(items[0].verified).toBe(true); // verified сортируется выше

    // отзывы влияют на рейтинг: reviewMilli = avg(4.5) × min(2,20) × 200 = 1800
    const prof = await db.photographerProfile.findUniqueOrThrow({ where: { id: profile.id } });
    expect(prof.ratingScore).toBeGreaterThanOrEqual(1800);

    await db.notification.deleteMany({ where: { userId: { in: [owner.id, client.id, otherPhotog.id, selfProfileClient.id, client2.id] } } });
    await db.shootConfirmation.deleteMany({ where: { profileId: { in: [profile.id, selfProfile.id] } } });
    await db.review.deleteMany({ where: { profileId: { in: [profile.id, selfProfile.id] } } });
    await db.photographerProfile.deleteMany({ where: { id: { in: [profile.id, selfProfile.id] } } });
    await db.user.deleteMany({ where: { id: { in: [owner.id, client.id, otherPhotog.id, selfProfileClient.id, client2.id] } } });
  });
});
