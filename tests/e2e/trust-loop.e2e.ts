// E2E-батарея №2: петля доверия доброжелательной системы (2026-07-25).
// Подтверждённая съёмка → verified-отзыв → «Признательность заказчиков» →
// valuedPhotographers → discovery-ленты → кабинет заказчика. + авто-аудитор.
// Запуск: npm run e2e (нужен локальный PG). Всё создаётся и убирается за собой.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

beforeAll(() => {
  process.env.AUTH_SECRET ??= 'test-secret-32-chars-minimum-000000';
});

function auditText(label: string, value: string) {
  const bad = [/undefined/i, /\bnull\b/i, /\bNaN\b/, /\[object Object\]/, /PENDING|APPROVED|REJECTED|VISIBLE|HIDDEN/];
  for (const re of bad) {
    expect(re.test(value), `${label}: подозрительная выдача «${value}»`).toBe(false);
  }
}

describe.skipIf(!hasDb)('E2E: петля доверия (съёмка→отзыв→признание→discovery)', () => {
  const ids: { users: string[]; profiles: string[] } = { users: [], profiles: [] };

  afterAll(async () => {
    const { db } = await import('@/lib/db');
    for (const pid of ids.profiles) {
      await db.review.deleteMany({ where: { profileId: pid } });
      await db.shootConfirmation.deleteMany({ where: { profileId: pid } });
      await db.like.deleteMany({ where: { photo: { profileId: pid } } });
      await db.photo.deleteMany({ where: { profileId: pid } });
      await db.profileCategory.deleteMany({ where: { profileId: pid } });
      await db.photographerProfile.delete({ where: { id: pid } }).catch(() => {});
    }
    for (const uid of ids.users) {
      await db.activityEvent.deleteMany({ where: { actorUserId: uid } });
      await db.notification.deleteMany({ where: { userId: uid } });
      await db.review.deleteMany({ where: { authorUserId: uid } });
      await db.shootConfirmation.deleteMany({ where: { clientUserId: uid } });
      await db.message.deleteMany({ where: { OR: [{ senderId: uid }, { recipientId: uid }] } });
      await db.user.delete({ where: { id: uid } }).catch(() => {});
    }
  });

  it('подтверждённая съёмка делает отзыв verified, кормит признание и discovery', async () => {
    const { db } = await import('@/lib/db');
    const { approveProfile } = await import('@/lib/moderation');
    const { confirmShoot, respondToShoot, pendingShootsForPhotographer, shootStats, shootsByClient } = await import('@/lib/shoots');
    const { addReview, reviewsForProfile } = await import('@/lib/reviews');
    const { valuedPhotographers } = await import('@/lib/widgets');
    const { editorsChoice, bestOfWeek, toggleEditorsChoice } = await import('@/lib/feeds');
    const { categoryPreviews } = await import('@/lib/discovery');
    const { togglePhotoLike } = await import('@/lib/engagement');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const cat = await db.category.findFirstOrThrow({ where: { slug: 'business-events' } });

    // Фотограф онбордится и одобряется
    const ph = await db.user.create({ data: { role: 'PHOTOGRAPHER', status: 'PENDING', firstName: 'Мария', lastName: 'Светова', email: `e2e-tl-ph-${stamp}@test.local` } });
    ids.users.push(ph.id);
    const profile = await db.photographerProfile.create({
      data: {
        userId: ph.id, username: `e2e-tl-${stamp}`, cityId: city.id, status: 'PENDING',
        categories: { create: [{ categoryId: cat.id }] },
        photos: { create: Array.from({ length: 3 }, (_, i) => ({ categoryId: cat.id, storageKey: `photos/e2e-tl-${stamp}-${i}/original.jpg`, width: 2400, height: 1600 })) },
      },
    });
    ids.profiles.push(profile.id);
    await approveProfile(profile.id);

    // Заказчик-1 подтверждает съёмку → факты + verified-отзыв
    const c1 = await db.user.create({
      data: {
        role: 'CLIENT', status: 'ACTIVE', firstName: 'Олег', lastName: 'Клиентов', email: `e2e-tl-c1-${stamp}@test.local`,
        // S4-гейт: отмечать съёмки может только заказчик с подтверждённой почтой
        emailVerifiedAt: new Date(),
      },
    });
    ids.users.push(c1.id);
    // S4-гейт confirmShoot: двусторонняя переписка клиент↔автор
    await db.message.create({ data: { senderId: c1.id, recipientId: ph.id, body: 'здравствуйте, интересует съёмка' } });
    await db.message.create({ data: { senderId: ph.id, recipientId: c1.id, body: 'да, обсудим детали' } });

    // Отметка заказчика ждёт подтверждения автора — до него фактов нет
    await confirmShoot(c1.id, profile.id);
    expect(await shootStats(profile.id)).toMatchObject({ count: 0, clients: 0, returning: 0 });

    const [pendingShoot] = await pendingShootsForPhotographer(ph.id);
    await respondToShoot(ph.id, pendingShoot.id, true);
    const stats = await shootStats(profile.id);
    expect(stats).toMatchObject({ count: 1, clients: 1, returning: 0 });

    const r1 = await addReview(c1.id, profile.id, 5, 'Сняла наш форум блестяще, всё по делу.');
    expect((await db.review.findUniqueOrThrow({ where: { id: r1.id } })).verified).toBe(true);

    // Заказчик-2 БЕЗ съёмки ставит низкую оценку → verified=false и НЕ в публичном фиде
    const c2 = await db.user.create({ data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'Нина', lastName: 'Спорнова', email: `e2e-tl-c2-${stamp}@test.local` } });
    ids.users.push(c2.id);
    await addReview(c2.id, profile.id, 2, 'Не сошлись по срокам.');

    // Публично — только rating≥4 («Признательность заказчиков»), низкая оценка не топит
    const pub = await reviewsForProfile(profile.id);
    expect(pub.items).toHaveLength(1);
    expect(pub.items[0].rating).toBe(5);
    expect(pub.items[0].verified).toBe(true);
    auditText('публичный отзыв', pub.items[0].body);
    auditText('автор отзыва', pub.items[0].authorName);

    // valuedPhotographers — по рекомендациям (rating≥4+verified), без публичного среднего
    const valued = await valuedPhotographers(20);
    const mine = valued.find((v) => v.username === `e2e-tl-${stamp}`);
    expect(mine?.recommendCount).toBeGreaterThanOrEqual(1);
    auditText('ценят заказчики', `${mine!.firstName} ${mine!.lastName}`);

    // Discovery: лайк → bestOfWeek; отметка редакции → editorsChoice; превью категорий
    const photo = await db.photo.findFirstOrThrow({ where: { profileId: profile.id } });
    await togglePhotoLike(c1.id, photo.id);
    const week = await bestOfWeek(50);
    expect(week.some((p) => p.username === `e2e-tl-${stamp}`)).toBe(true);
    auditText('лучшее недели', `${week[0].firstName} ${week[0].lastName}`);

    await toggleEditorsChoice(photo.id);
    const ec = await editorsChoice(50);
    expect(ec.some((p) => p.photoId === photo.id)).toBe(true);

    const cats = await categoryPreviews();
    const bizCat = cats.find((c) => c.slug === 'business-events');
    expect(bizCat?.photoCount).toBeGreaterThanOrEqual(3);
    for (const c of cats) auditText('жанр', c.nameRu);

    // Кабинет заказчика: съёмка отмечена как «отзыв оставлен»
    const shoots = await shootsByClient(c1.id);
    expect(shoots).toHaveLength(1);
    expect(shoots[0]).toMatchObject({ username: `e2e-tl-${stamp}`, count: 1, reviewed: true });
  });
});
