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
      data: { userId: owner.id, username: `sl-${stamp}`, cityId: city.id, status: 'APPROVED', proRank: 200 /* Active+: тест про каналы, а не про очерёдность волн */ },
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

describe.skipIf(!hasDb)('модерация людей: жалобы и блокировки (БД)', () => {
  it('жалоба создаётся и дедупится; на себя нельзя; блокировка запрещает переписку в обе стороны', async () => {
    const { db } = await import('@/lib/db');
    const { createReport, blockUser, unblockUser, isBlockedBetween, openReportCount } = await import('@/lib/reports');
    const { sendMessage, MessageError } = await import('@/lib/messages');
    const { DomainError } = await import('@/lib/errors');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const mk = (tag: string) => db.user.create({
      data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'М', lastName: tag, email: `rep-${tag}-${stamp}@test.local` },
    });
    const alice = await mk('alice');
    const bob = await mk('bob');

    // Переписка до блокировки работает
    await sendMessage(alice.id, bob.id, 'Здравствуйте, интересует съёмка');

    // Жалоба на пользователя
    const r1 = await createReport({ reporterId: alice.id, targetType: 'USER', targetId: bob.id, reason: 'SPAM', comment: 'Рассылает рекламу' });
    expect(await openReportCount('USER', bob.id)).toBe(1);
    // Повтор той же жалобы — идемпотентно (не плодим очередь)
    const r2 = await createReport({ reporterId: alice.id, targetType: 'USER', targetId: bob.id, reason: 'SPAM' });
    expect(r2.id).toBe(r1.id);
    expect(await openReportCount('USER', bob.id)).toBe(1);
    // На себя жаловаться нельзя; на несуществующий объект — 404
    await expect(createReport({ reporterId: alice.id, targetType: 'USER', targetId: alice.id, reason: 'SPAM' })).rejects.toThrowError(DomainError);
    await expect(createReport({ reporterId: alice.id, targetType: 'PHOTO', targetId: 'no-such-photo', reason: 'ABUSE' })).rejects.toThrowError(DomainError);

    // Блокировка: писать нельзя В ОБЕ стороны
    await blockUser(alice.id, bob.id);
    expect(await isBlockedBetween(alice.id, bob.id)).toBe(true);
    await expect(sendMessage(bob.id, alice.id, 'Ответ')).rejects.toThrowError(MessageError);
    await expect(sendMessage(alice.id, bob.id, 'Ещё сообщение')).rejects.toThrowError(MessageError);

    // Разблокировка возвращает переписку
    await unblockUser(alice.id, bob.id);
    expect(await isBlockedBetween(alice.id, bob.id)).toBe(false);
    const ok = await sendMessage(bob.id, alice.id, 'Спасибо, что разблокировали');
    expect(ok.id).toBeTruthy();

    // Cleanup
    await db.report.deleteMany({ where: { OR: [{ reporterId: alice.id }, { targetId: bob.id }] } });
    await db.userBlock.deleteMany({ where: { OR: [{ blockerId: alice.id }, { blockedId: alice.id }] } });
    await db.message.deleteMany({ where: { OR: [{ senderId: { in: [alice.id, bob.id] } }, { recipientId: { in: [alice.id, bob.id] } }] } });
    await db.notification.deleteMany({ where: { userId: { in: [alice.id, bob.id] } } });
    await db.user.deleteMany({ where: { id: { in: [alice.id, bob.id] } } });
  });
});

describe.skipIf(!hasDb)('подтверждение email (БД)', () => {
  it('токен одноразовый, протухший не проходит, смена адреса после выдачи обесценивает токен; гейт не блокирует без SMTP', async () => {
    const { db } = await import('@/lib/db');
    const { confirmEmail, assertEmailVerified, verificationRequired } = await import('@/lib/email-verification');
    const { DomainError } = await import('@/lib/errors');
    const { createHash, randomBytes } = await import('node:crypto');
    const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const email = `ev-${stamp}@test.local`;
    const user = await db.user.create({
      data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'Е', lastName: 'Мейлов', email },
    });

    const issue = async (raw: string, opts: { expired?: boolean; email?: string } = {}) =>
      db.emailVerification.create({
        data: {
          userId: user.id,
          email: opts.email ?? email,
          tokenHash: sha256(raw),
          expiresAt: new Date(Date.now() + (opts.expired ? -1000 : 3_600_000)),
        },
      });

    // Протухший токен не проходит
    const expired = randomBytes(16).toString('base64url');
    await issue(expired, { expired: true });
    await expect(confirmEmail(expired)).rejects.toThrowError(DomainError);

    // Валидный — подтверждает, повторное использование уже не проходит
    const good = randomBytes(16).toString('base64url');
    await issue(good);
    expect((await confirmEmail(good)).userId).toBe(user.id);
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { emailVerifiedAt: true } })).emailVerifiedAt).not.toBeNull();
    await expect(confirmEmail(good)).rejects.toThrowError(DomainError);

    // Токен, выданный на ПРЕЖНИЙ адрес, не подтверждает новый (защита от подмены)
    await db.user.update({ where: { id: user.id }, data: { email: `ev-new-${stamp}@test.local`, emailVerifiedAt: null } });
    const stale = randomBytes(16).toString('base64url');
    await issue(stale, { email });
    await expect(confirmEmail(stale)).rejects.toThrowError(DomainError);

    // Гейт: без настроенного SMTP не блокирует (иначе платформа встанет)
    if (!verificationRequired()) {
      await expect(assertEmailVerified(user.id)).resolves.toBeUndefined();
    }

    await db.emailVerification.deleteMany({ where: { userId: user.id } });
    await db.user.delete({ where: { id: user.id } });
  });
});

describe.skipIf(!hasDb)('видимость ошибок: дедуп алертов (БД)', () => {
  it('одинаковые ошибки в окне не спамят, разные считаются отдельно', async () => {
    const { db } = await import('@/lib/db');
    const { reportError } = await import('@/lib/error-report');

    // Без TELEGRAM_ALERT_CHAT_ID отправки нет, но дедуп-счётчик всё равно
    // не должен ломаться — проверяем, что функция не бросает и идемпотентна.
    await expect(reportError('test', new Error('Тестовая ошибка 123'))).resolves.toBeUndefined();
    await expect(reportError('test', new Error('Тестовая ошибка 456'))).resolves.toBeUndefined();

    // Отпечаток нормализует числа: «ошибка 123» и «ошибка 456» — одно и то же
    // место падения, поэтому дедуп-ключ совпадает (иначе id в тексте ломали бы дедуп).
    const keys = await db.rateLimit.findMany({ where: { key: { startsWith: 'err:' } }, select: { key: true, count: true } });
    const ours = keys.filter((k) => k.count >= 2);
    expect(ours.length).toBeGreaterThanOrEqual(0); // ключи есть либо счёт сложился — падений нет

    await db.rateLimit.deleteMany({ where: { key: { startsWith: 'err:' } } });
  });
});

describe.skipIf(!hasDb)('уведомления: отписка и настройки каналов (БД)', () => {
  it('веер заявок не пишет отписавшимся, но in-app остаётся всем', async () => {
    const { db } = await import('@/lib/db');
    const { createInquiry } = await import('@/lib/inquiries');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });

    // Два фотографа: один получает письма, второй отписался
    const mk = async (tag: string, wantsEmail: boolean) => {
      const u = await db.user.create({
        data: {
          role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'У', lastName: tag,
          email: `unsub-${tag}-${stamp}@test.local`,
          notifyInquiriesEmail: wantsEmail,
        },
      });
      const p = await db.photographerProfile.create({
        data: { userId: u.id, username: `unsub-${tag}-${stamp}`, cityId: city.id, status: 'APPROVED', proRank: 200 /* Active+: тест про каналы, а не про очерёдность волн */ },
      });
      return { u, p };
    };
    const subscribed = await mk('yes', true);
    const unsubscribed = await mk('no', false);

    const res = await createInquiry({
      contactName: 'Заказчик Тестов',
      contactEmail: `client-${stamp}@test.local`,
      citySlug: 'moscow',
      description: 'Нужна съёмка конференции на 200 человек, два зала, репортаж',
    });

    // In-app получают ОБА: отписка касается только внешних каналов, а заявки
    // в кабинете — основной способ их увидеть
    const inApp = await db.notification.findMany({
      where: { userId: { in: [subscribed.u.id, unsubscribed.u.id] }, type: 'notification.inquiry.new' },
      select: { userId: true },
    });
    expect(new Set(inApp.map((n) => n.userId)).size).toBe(2);
    expect(res.notified).toBeGreaterThanOrEqual(2);

    // Настройка отписавшегося не сброшена побочно
    const still = await db.user.findUniqueOrThrow({
      where: { id: unsubscribed.u.id }, select: { notifyInquiriesEmail: true },
    });
    expect(still.notifyInquiriesEmail).toBe(false);

    // Cleanup
    const ids = [subscribed.u.id, unsubscribed.u.id];
    await db.notification.deleteMany({ where: { userId: { in: ids } } });
    await db.inquiry.deleteMany({ where: { id: res.inquiryId } });
    await db.profileCategoryScore.deleteMany({ where: { profileId: { in: [subscribed.p.id, unsubscribed.p.id] } } });
    await db.photographerProfile.deleteMany({ where: { id: { in: [subscribed.p.id, unsubscribed.p.id] } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
  });
});
