import { describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

// Подтверждённая съёмка — единственный честный якорь доверия платформы: из неё
// растут публичные факты «снимали вместе N раз» / «заказчиков вернулись» и
// признак verified у отзыва. Поэтому тут проверяется не только счастливый путь,
// но и то, чем этот механизм можно было бы накрутить.
describe.skipIf(!hasDb)('shoots: подтверждённая съёмка — факты доверия (БД)', () => {
  it('двустороннее подтверждение, гейты, дедуп «возвращаются», verified', async () => {
    const { db } = await import('@/lib/db');
    const { confirmShoot, respondToShoot, pendingShootsForPhotographer, shootStats, hasShotWith, shootsByClient } =
      await import('@/lib/shoots');
    const { DomainError } = await import('@/lib/errors');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const owner = await db.user.create({ data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'А', lastName: 'Н', email: `sh-own-${stamp}@test.local` } });
    const profile = await db.photographerProfile.create({ data: { userId: owner.id, username: `sh-${stamp}`, cityId: city.id, status: 'APPROVED' } });
    const client = await db.user.create({
      data: {
        role: 'CLIENT', status: 'ACTIVE', firstName: 'К', lastName: 'Л', email: `sh-cl-${stamp}@test.local`,
        // Sybil-фрикция: без подтверждённой почты отмечать съёмки нельзя (ниже проверяется)
        emailVerifiedAt: new Date(),
      },
    });

    expect(await hasShotWith(client.id, profile.id)).toBe(false);

    // Гейт связи: без переписки отметить нельзя
    await expect(confirmShoot(client.id, profile.id)).rejects.toThrow(DomainError);
    // односторонней недостаточно (только клиент написал)
    await db.message.create({ data: { senderId: client.id, recipientId: owner.id, body: 'здравствуйте, интересует съёмка' } });
    await expect(confirmShoot(client.id, profile.id)).rejects.toThrow(DomainError);
    // автор ответил → двусторонний контакт есть
    await db.message.create({ data: { senderId: owner.id, recipientId: client.id, body: 'да, обсудим детали' } });

    // Отметка заказчика САМА ПО СЕБЕ публичной не становится: до ответа автора
    // нет ни фактов на странице, ни verified у отзыва. Именно это отсекает
    // накрутку фейковыми «заказчиками» после снятия инвайт-гейта (S4).
    const day1 = new Date('2026-05-10T00:00:00Z');
    await confirmShoot(client.id, profile.id, day1);
    expect(await hasShotWith(client.id, profile.id)).toBe(false);
    expect(await shootStats(profile.id)).toEqual({ count: 0, clients: 0, returning: 0 });

    const pending = await pendingShootsForPhotographer(owner.id);
    expect(pending).toHaveLength(1);

    // Чужой автор ответить за него не может
    const stranger = await db.user.create({ data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Ч', lastName: 'Ж', email: `sh-str-${stamp}@test.local` } });
    await expect(respondToShoot(stranger.id, pending[0].id, true)).rejects.toThrow(DomainError);

    // Автор подтвердил → факт становится публичным
    await respondToShoot(owner.id, pending[0].id, true);
    expect(await hasShotWith(client.id, profile.id)).toBe(true);
    expect(await shootStats(profile.id)).toEqual({ count: 1, clients: 1, returning: 0 });

    // Повторный ответ на ту же отметку не проходит
    await expect(respondToShoot(owner.id, pending[0].id, false)).rejects.toThrow(DomainError);

    // Накрутка «возвращаются»: та же съёмка отмечена повторно — отклоняется
    await expect(confirmShoot(client.id, profile.id, day1)).rejects.toThrow(DomainError);
    expect(await shootStats(profile.id)).toEqual({ count: 1, clients: 1, returning: 0 });

    // Другая дата — законная вторая съёмка, но снова через подтверждение автора
    const day2 = new Date('2026-06-20T00:00:00Z');
    await confirmShoot(client.id, profile.id, day2);
    expect(await shootStats(profile.id)).toEqual({ count: 1, clients: 1, returning: 0 }); // ещё PENDING
    const pending2 = await pendingShootsForPhotographer(owner.id);
    await respondToShoot(owner.id, pending2[0].id, true);
    expect(await shootStats(profile.id)).toEqual({ count: 2, clients: 1, returning: 1 });

    // Оспоренная съёмка в факты не идёт
    const day3 = new Date('2026-07-01T00:00:00Z');
    await confirmShoot(client.id, profile.id, day3);
    const pending3 = await pendingShootsForPhotographer(owner.id);
    await respondToShoot(owner.id, pending3[0].id, false);
    expect(await shootStats(profile.id)).toEqual({ count: 2, clients: 1, returning: 1 });

    // Заказчик без подтверждённой почты отмечать съёмки не может
    const unverified = await db.user.create({ data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'Н', lastName: 'П', email: `sh-unv-${stamp}@test.local` } });
    await db.message.create({ data: { senderId: unverified.id, recipientId: owner.id, body: 'добрый день' } });
    await db.message.create({ data: { senderId: owner.id, recipientId: unverified.id, body: 'здравствуйте' } });
    await expect(confirmShoot(unverified.id, profile.id)).rejects.toMatchObject({ code: 'shoot_email_unverified' });

    // Владелец не может отметить съёмку у себя; фотограф не «клиент»
    await expect(confirmShoot(owner.id, profile.id)).rejects.toThrow(DomainError);

    // Кабинет заказчика: съёмка без отзыва → reviewed:false; после отзыва → true
    let mine = await shootsByClient(client.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ profileId: profile.id, count: 2, reviewed: false });
    await db.review.create({ data: { authorUserId: client.id, profileId: profile.id, rating: 5, body: 'супер' } });
    mine = await shootsByClient(client.id);
    expect(mine[0].reviewed).toBe(true);

    // cleanup (FK-порядок)
    await db.notification.deleteMany({ where: { userId: { in: [owner.id, client.id, unverified.id, stranger.id] } } });
    await db.review.deleteMany({ where: { profileId: profile.id } });
    await db.shootConfirmation.deleteMany({ where: { profileId: profile.id } });
    await db.message.deleteMany({ where: { OR: [{ senderId: owner.id }, { recipientId: owner.id }] } });
    await db.photographerProfile.delete({ where: { id: profile.id } });
    await db.user.deleteMany({ where: { id: { in: [owner.id, client.id, unverified.id, stranger.id] } } });
  });
});
