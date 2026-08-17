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

    // Заказчик без подтверждённой почты отмечать съёмки не может — НО только
    // когда почта в принципе работает. Иначе требование запирало бы механику
    // целиком: подтвердиться неоткуда, и ни одной подтверждённой съёмки на
    // платформе не появилось бы вовсе (найдено аудитом 2026-08-04).
    const unverified = await db.user.create({ data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'Н', lastName: 'П', email: `sh-unv-${stamp}@test.local` } });
    await db.message.create({ data: { senderId: unverified.id, recipientId: owner.id, body: 'добрый день' } });
    await db.message.create({ data: { senderId: owner.id, recipientId: unverified.id, body: 'здравствуйте' } });

    const savedSmtp = { host: process.env.SMTP_HOST, user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD, gate: process.env.EMAIL_GATE };
    try {
      // Почта работает → фрикция включена
      process.env.SMTP_HOST = 'smtp.test';
      process.env.SMTP_USER = 'u';
      process.env.SMTP_PASSWORD = 'p';
      delete process.env.EMAIL_GATE;
      await expect(confirmShoot(unverified.id, profile.id)).rejects.toMatchObject({ code: 'shoot_email_unverified' });

      // Почта не настроена → требование снято, механика жива
      delete process.env.SMTP_HOST;
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASSWORD;
      await expect(confirmShoot(unverified.id, profile.id)).resolves.toBeUndefined();
      await db.shootConfirmation.deleteMany({ where: { clientUserId: unverified.id } });
    } finally {
      if (savedSmtp.host === undefined) delete process.env.SMTP_HOST; else process.env.SMTP_HOST = savedSmtp.host;
      if (savedSmtp.user === undefined) delete process.env.SMTP_USER; else process.env.SMTP_USER = savedSmtp.user;
      if (savedSmtp.pass === undefined) delete process.env.SMTP_PASSWORD; else process.env.SMTP_PASSWORD = savedSmtp.pass;
      if (savedSmtp.gate === undefined) delete process.env.EMAIL_GATE; else process.env.EMAIL_GATE = savedSmtp.gate;
    }

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
    await db.shootConfirmation.deleteMany({ where: { clientUserId: { in: [client.id, unverified.id] } } });
    await db.review.deleteMany({ where: { profileId: profile.id } });
    await db.shootConfirmation.deleteMany({ where: { profileId: profile.id } });
    await db.message.deleteMany({ where: { OR: [{ senderId: owner.id }, { recipientId: owner.id }] } });
    await db.photographerProfile.delete({ where: { id: profile.id } });
    await db.user.deleteMany({ where: { id: { in: [owner.id, client.id, unverified.id, stranger.id] } } });
  });
});

/**
 * Переворот подтверждения: инициирует ФОТОГРАФ, отвечает заказчик.
 *
 * Раз инициатива у автора, соблазн очевиден — завести «заказчиков» и
 * подтвердить себе съёмки. Поэтому ответ засчитывается публично только от
 * аккаунта с признаками доверия; остальные подтверждаются, но уходят к
 * человеку на проверку и публичного факта не дают.
 */
describe.skipIf(!hasDb)('shoots: инициатива фотографа и защита от самонакрутки (БД)', () => {
  it('свежий «заказчик», заведённый после начала переписки, не даёт публичного факта', async () => {
    const { db } = await import('@/lib/db');
    const { requestShootConfirmation, respondToShootRequest, shootStats } = await import('@/lib/shoots');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const owner = await db.user.create({
      data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Ф', lastName: 'Т', email: `sr-own-${stamp}@test.local` },
    });
    const profile = await db.photographerProfile.create({
      data: { userId: owner.id, username: `sr-${stamp}`, cityId: city.id, status: 'APPROVED' },
    });

    // Честный заказчик: подтверждённая почта, аккаунт существовал до переписки
    const real = await db.user.create({
      data: {
        role: 'CLIENT', status: 'ACTIVE', firstName: 'Р', lastName: 'К', email: `sr-real-${stamp}@test.local`,
        emailVerifiedAt: new Date(), createdAt: new Date(Date.now() - 30 * 86_400_000),
      },
    });
    // Подставной: создан ПОСЛЕ первого контакта, почта не подтверждена
    const fake = await db.user.create({
      data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'П', lastName: 'Д', email: `sr-fake-${stamp}@test.local` },
    });

    try {
      for (const client of [real, fake]) {
        await db.message.create({ data: { senderId: client.id, recipientId: owner.id, body: 'здравствуйте' } });
        await db.message.create({ data: { senderId: owner.id, recipientId: client.id, body: 'добрый день' } });
      }
      // У подставного переписка датируется РАНЬШЕ его регистрации — ровно та
      // картина, которую даёт «создал клиента и сразу подтвердил»
      await db.message.updateMany({
        where: { senderId: fake.id },
        data: { createdAt: new Date(fake.createdAt.getTime() - 3_600_000) },
      });

      await requestShootConfirmation(owner.id, real.id, new Date('2026-05-10T00:00:00Z'));
      await requestShootConfirmation(owner.id, fake.id, new Date('2026-06-10T00:00:00Z'));

      const pending = await db.shootConfirmation.findMany({ where: { profileId: profile.id }, select: { id: true, clientUserId: true } });
      for (const p of pending) await respondToShootRequest(p.clientUserId, p.id, true);

      const rows = await db.shootConfirmation.findMany({ where: { profileId: profile.id }, select: { clientUserId: true, needsReview: true } });
      expect(rows.find((r) => r.clientUserId === real.id)?.needsReview, 'честный заказчик отправлен на проверку').toBe(false);
      expect(rows.find((r) => r.clientUserId === fake.id)?.needsReview, 'подставной прошёл как настоящий').toBe(true);

      // Публичный факт — только по проверенному
      const stats = await shootStats(profile.id);
      expect(stats.count).toBe(1);
      expect(stats.clients).toBe(1);
    } finally {
      // Уведомления ссылаются на пользователя (FK RESTRICT) — чистим первыми
      await db.notification.deleteMany({ where: { userId: { in: [owner.id, real.id, fake.id] } } });
      await db.shootConfirmation.deleteMany({ where: { profileId: profile.id } });
      await db.message.deleteMany({ where: { OR: [{ senderId: owner.id }, { recipientId: owner.id }] } });
      await db.photographerProfile.delete({ where: { id: profile.id } });
      await db.user.deleteMany({ where: { id: { in: [owner.id, real.id, fake.id] } } });
    }
  });
});

/**
 * Гонка двойной отметки БЕЗ даты (аудит 2026-08-16, P1): составной уникальный
 * индекс NULL-даты пропускает (NULL ≠ NULL), а findFirst→create неатомарен —
 * двойной клик создавал два подтверждения. «Снимали вместе N раз» считается
 * от числа записей, то есть дубль — накрутка доверия. Закрыто частичным
 * уникальным индексом + P2002→409.
 */
describe.skipIf(!hasDb)('съёмки: гонка двойной отметки без даты (БД)', () => {
  it('параллельные confirmShoot дают ровно одну запись', async () => {
    const { db } = await import('@/lib/db');
    const { confirmShoot } = await import('@/lib/shoots');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const author = await db.user.create({
      data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Гонка', lastName: 'Автор', email: `race-a-${stamp}@test.local` },
    });
    const profile = await db.photographerProfile.create({
      data: { userId: author.id, username: `race-${stamp}`, cityId: city.id, status: 'APPROVED' },
    });
    const client = await db.user.create({
      data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'Гонка', lastName: 'Клиент', email: `race-c-${stamp}@test.local` },
    });
    // Переписка в обе стороны — гард confirmShoot требует контакта
    await db.message.create({ data: { senderId: client.id, recipientId: author.id, body: 'были на съёмке' } });
    await db.message.create({ data: { senderId: author.id, recipientId: client.id, body: 'да, отснято' } });

    try {
      // Пять одновременных попыток — как серия двойных кликов
      const results = await Promise.allSettled(
        Array.from({ length: 5 }, () => confirmShoot(client.id, profile.id, null)),
      );
      const okCount = results.filter((r) => r.status === 'fulfilled').length;
      expect(okCount).toBeGreaterThanOrEqual(1);

      // Инвариант — в БАЗЕ: запись ровно одна, сколько бы кликов ни прошло
      const rows = await db.shootConfirmation.count({
        where: { clientUserId: client.id, profileId: profile.id, eventDate: null },
      });
      expect(rows).toBe(1);
    } finally {
      await db.shootConfirmation.deleteMany({ where: { clientUserId: client.id } });
      await db.message.deleteMany({ where: { senderId: { in: [client.id, author.id] } } });
      await db.notification.deleteMany({ where: { userId: { in: [client.id, author.id] } } });
      await db.photographerProfile.delete({ where: { id: profile.id } });
      await db.user.deleteMany({ where: { id: { in: [client.id, author.id] } } });
    }
  });
});

/**
 * Импорт репутации (2026-08-17): приглашённый заказчик подтверждает съёмку,
 * состоявшуюся до платформы. Trust-модель не ослабляется: свежий аккаунт →
 * needsReview → человек. Токен подписан — подделка profileId невозможна.
 */
describe.skipIf(!hasDb)('съёмки: подтверждение по приглашению (БД)', () => {
  it('свежий аккаунт подтверждает → needsReview, публичного веса нет', async () => {
    const { db } = await import('@/lib/db');
    const { confirmShootByInvite, shootStats } = await import('@/lib/shoots');
    const { createShootInvite, verifyShootInvite } = await import('@/lib/shoot-invite');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const author = await db.user.create({
      data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Инв', lastName: 'Автор', email: `inv-a-${stamp}@test.local` },
    });
    const profile = await db.photographerProfile.create({
      data: { userId: author.id, username: `inv-${stamp}`, cityId: city.id, status: 'APPROVED' },
    });
    // Свежий заказчик без подтверждённой почты — типичный приглашённый
    const client = await db.user.create({
      data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'Инв', lastName: 'Клиент', email: `inv-c-${stamp}@test.local` },
    });

    try {
      // Токен: подписывается и разбирается, чужой не проходит
      const token = await createShootInvite(profile.id);
      expect((await verifyShootInvite(token))?.profileId).toBe(profile.id);
      expect(await verifyShootInvite(token.slice(0, -3) + 'abc')).toBeNull();

      const { needsReview } = await confirmShootByInvite(client.id, profile.id, null);
      expect(needsReview).toBe(true);

      // И ДАЖЕ «выдержанный» аккаунт (почта подтверждена) идёт к человеку:
      // первая версия пропускала таких мимо очереди, а подтвердить почту
      // накрутчику — пять минут (закрыто по вопросу оператора 2026-08-17)
      const seasonedClient = await db.user.create({
        data: {
          role: 'CLIENT', status: 'ACTIVE', firstName: 'Выдержанный', lastName: 'Клиент',
          email: `inv-s-${stamp}@test.local`, emailVerifiedAt: new Date(),
          createdAt: new Date(Date.now() - 10 * 86_400_000),
        },
      });
      try {
        const r2 = await confirmShootByInvite(seasonedClient.id, profile.id, new Date('2026-06-01'));
        expect(r2.needsReview).toBe(true);
      } finally {
        await db.shootConfirmation.deleteMany({ where: { clientUserId: seasonedClient.id } });
        await db.user.delete({ where: { id: seasonedClient.id } });
      }

      // Запись есть, но публичная статистика её НЕ считает до решения человека
      const stats = await shootStats(profile.id);
      expect(stats.count).toBe(0);

      // Повторное подтверждение той же съёмки — 409, не дубль
      await expect(confirmShootByInvite(client.id, profile.id, null)).rejects.toMatchObject({ status: 409 });
    } finally {
      await db.shootConfirmation.deleteMany({ where: { profileId: profile.id } });
      await db.notification.deleteMany({ where: { userId: { in: [author.id, client.id] } } });
      await db.photographerProfile.delete({ where: { id: profile.id } });
      await db.user.deleteMany({ where: { id: { in: [author.id, client.id] } } });
    }
  });
});

/**
 * Тихий выпуск после выдержки (2026-08-17): человек смотрит только аномалии.
 * Чистая запись (почта подтверждена, нет всплеска, нет кластера адреса)
 * публикуется сама через 72 часа; любой флаг оставляет её в очереди.
 */
describe.skipIf(!hasDb)('съёмки: тихий выпуск приглашённых подтверждений (БД)', () => {
  it('чистая — выпускается, кластер одного адреса — остаётся человеку', async () => {
    const { db } = await import('@/lib/db');
    const { releaseShootConfirmations } = await import('@/lib/shoots');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'omsk' } });
    const mkUser = (tag: string, verified: boolean) =>
      db.user.create({
        data: {
          role: 'CLIENT', status: 'ACTIVE', firstName: tag, lastName: 'Р',
          email: `rel-${tag}-${stamp}@test.local`,
          ...(verified ? { emailVerifiedAt: new Date() } : {}),
        },
      });
    // ДВА автора: флаг всплеска считается по профилю, и чистый случай не
    // должен попадать под всплеск, созданный фермой соседнего теста
    const author = await db.user.create({
      data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Рел', lastName: 'Автор', email: `rel-a-${stamp}@test.local` },
    });
    const profile = await db.photographerProfile.create({
      data: { userId: author.id, username: `rel-${stamp}`, cityId: city.id, status: 'APPROVED' },
    });
    const author2 = await db.user.create({
      data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Рел2', lastName: 'Автор', email: `rel-a2-${stamp}@test.local` },
    });
    const profile2 = await db.photographerProfile.create({
      data: { userId: author2.id, username: `rel2-${stamp}`, cityId: city.id, status: 'APPROVED' },
    });
    const clean = await mkUser('clean', true);
    const farmA = await mkUser('farma', true);
    const farmB = await mkUser('farmb', true);
    const noMail = await mkUser('nomail', false);

    const old = new Date(Date.now() - 80 * 3_600_000); // старше 72ч
    const mkShoot = (clientId: string, ipHash: string | null, date: string, profId = profile.id) =>
      db.shootConfirmation.create({
        data: {
          clientUserId: clientId, profileId: profId, initiatedBy: 'PHOTOGRAPHER',
          state: 'CONFIRMED', needsReview: true, ipHash, createdAt: old,
          eventDate: new Date(date),
        },
      });

    try {
      const ok = await mkShoot(clean.id, `hash-clean-${stamp}`, '2026-05-01');
      // Ферма — ВТОРОМУ автору: два РАЗНЫХ клиента с одного адреса
      const f1 = await mkShoot(farmA.id, `hash-farm-${stamp}`, '2026-05-02', profile2.id);
      const f2 = await mkShoot(farmB.id, `hash-farm-${stamp}`, '2026-05-03', profile2.id);
      // Без подтверждённой почты
      const nm = await mkShoot(noMail.id, `hash-nm-${stamp}`, '2026-05-04', profile2.id);

      await releaseShootConfirmations();

      const state = async (id: string) =>
        (await db.shootConfirmation.findUniqueOrThrow({ where: { id }, select: { needsReview: true } })).needsReview;
      expect(await state(ok.id)).toBe(false); // чистая вышла
      expect(await state(f1.id)).toBe(true); // кластер — ждёт человека
      expect(await state(f2.id)).toBe(true);
      expect(await state(nm.id)).toBe(true); // без почты — ждёт
    } finally {
      await db.shootConfirmation.deleteMany({ where: { profileId: { in: [profile.id, profile2.id] } } });
      await db.photographerProfile.deleteMany({ where: { id: { in: [profile.id, profile2.id] } } });
      await db.user.deleteMany({ where: { id: { in: [author.id, author2.id, clean.id, farmA.id, farmB.id, noMail.id] } } });
    }
  });
});
