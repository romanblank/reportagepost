import { describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

// Env-зависимость (правило c): нужен локальный PG
describe.skipIf(!hasDb)('форум: публикация и автомодерация (БД)', () => {
  async function makePhotographer(tag: string) {
    const { db } = await import('@/lib/db');
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const user = await db.user.create({
      data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Форум', lastName: tag, email: `forum-${tag}-${stamp}@test.local` },
    });
    const profile = await db.photographerProfile.create({
      data: { userId: user.id, username: `forum-${tag}-${stamp}`, cityId: city.id, status: 'APPROVED' },
    });
    return { user, profile };
  }

  async function cleanup(userId: string, profileId: string) {
    const { db } = await import('@/lib/db');
    await db.forumPost.deleteMany({ where: { authorUserId: userId } });
    await db.forumThread.deleteMany({ where: { authorUserId: userId } });
    await db.contentViolation.deleteMany({ where: { userId } });
    await db.profileCategoryScore.deleteMany({ where: { profileId } });
    await db.photographerProfile.delete({ where: { id: profileId } });
    await db.user.delete({ where: { id: userId } });
  }

  it('нормальная тема публикуется сразу и получает читаемый адрес', async () => {
    const { createThread, threadBySlug } = await import('@/lib/forum');
    const { user, profile } = await makePhotographer('ok');

    const out = await createThread(user.id, {
      sectionSlug: 'craft',
      title: 'Свет в тёмном зале на конференции',
      body: 'Снимаю конференции в залах со смешанным светом. Держу выдержку 1/160 и вытягиваю тени, но кожа уходит в зелень. Как выстраиваете баланс белого?',
    });

    expect(out.status).toBe('PUBLISHED');
    // Адрес латиницей: ссылку на тему пересылают в мессенджерах, и кириллица
    // превратилась бы в строку процентов
    expect(out.slug).toMatch(/^[a-z0-9-]+$/);
    expect(out.slug).toContain('svet');

    const view = await threadBySlug(out.slug!);
    expect(view?.posts).toHaveLength(1);

    await cleanup(user.id, profile.id);
  });

  it('тема с телефоном не публикуется и объясняет, что именно не так', async () => {
    const { createThread } = await import('@/lib/forum');
    const { db } = await import('@/lib/db');
    const { user, profile } = await makePhotographer('phone');

    const out = await createThread(user.id, {
      sectionSlug: 'clients',
      title: 'Ищу второго фотографа на свадьбу в июле',
      body: 'Нужен второй стрелок на съёмку 12 июля в Подмосковье, оплата достойная. Звоните мне на +7 999 111-22-33, обсудим детали.',
    });

    expect(out.status).toBe('REJECTED');
    expect(out.reason).toBe('contacts');
    expect(out.quote).toBeTruthy();
    // Отказ оставляет след для накопления, но первое нарушение ничем не
    // ограничивает: система защищает настоящее, а не наказывает за прошлое
    expect(out.violations).toBe(1);
    const stored = await db.forumThread.findFirstOrThrow({ where: { authorUserId: user.id } });
    expect(stored.status).toBe('REJECTED');

    await cleanup(user.id, profile.id);
  });

  it('отклонённая тема не показывается ни в разделе, ни по прямой ссылке', async () => {
    const { createThread, threadsInSection, threadBySlug } = await import('@/lib/forum');
    const { user, profile } = await makePhotographer('hidden');

    const out = await createThread(user.id, {
      sectionSlug: 'gear',
      title: 'Продам объектив срочно недорого пишите',
      body: 'ПРОДАЮ ОБЪЕКТИВ СРОЧНО НЕДОРОГО ПИШИТЕ ПРЯМО СЕЙЧАС ЦЕНА ДОГОВОРНАЯ ОТДАМ ПЕРВОМУ',
    });
    expect(out.status).toBe('REJECTED');

    const list = await threadsInSection('gear', 500);
    expect(list.some((t) => t.id === out.id)).toBe(false);
    expect(await threadBySlug(out.slug!)).toBeNull();

    await cleanup(user.id, profile.id);
  });

  it('заказчик тему завести не может — раздел иначе наполнится предложениями работы', async () => {
    const { createThread } = await import('@/lib/forum');
    const { db } = await import('@/lib/db');
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const client = await db.user.create({
      data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'Иван', lastName: 'Клиентов', email: `cl-${stamp}@test.local` },
    });

    await expect(
      createThread(client.id, {
        sectionSlug: 'craft',
        title: 'Ищу фотографа на корпоратив в декабре',
        body: 'Нужен фотограф на корпоративное мероприятие, около двухсот гостей, вечерняя съёмка в ресторане.',
      }),
    ).rejects.toThrow();

    await db.user.delete({ where: { id: client.id } });
  });

  it('ответ поднимает тему только если опубликован', async () => {
    const { createThread, createPost } = await import('@/lib/forum');
    const { db } = await import('@/lib/db');
    const { user, profile } = await makePhotographer('bump');

    const thread = await createThread(user.id, {
      sectionSlug: 'business',
      title: 'Как оформляете предоплату по договору',
      body: 'Работаю с компаниями и упираюсь в предоплату: бухгалтерия просит счёт заранее, а даты плавают. Как у вас устроено?',
    });
    const before = await db.forumThread.findUniqueOrThrow({ where: { id: thread.id } });

    const bad = await createPost(user.id, thread.id, 'Пишите мне в телеграм @photo_business, всё расскажу подробно.');
    expect(bad.status).toBe('REJECTED');
    const afterBad = await db.forumThread.findUniqueOrThrow({ where: { id: thread.id } });
    // Отклонённый текст не поднимает тему наверх: иначе спамом можно двигать
    // раздел, ничего в него не добавляя
    expect(afterBad.postCount).toBe(before.postCount);
    expect(afterBad.lastPostAt.getTime()).toBe(before.lastPostAt.getTime());

    const good = await createPost(user.id, thread.id, 'Беру 30% предоплаты по счёту, дату фиксируем отдельным письмом — работает уже третий год.');
    expect(good.status).toBe('PUBLISHED');
    const afterGood = await db.forumThread.findUniqueOrThrow({ where: { id: thread.id } });
    expect(afterGood.postCount).toBe(before.postCount + 1);

    await cleanup(user.id, profile.id);
  });

  it('повторная отправка без правки не пускают к человеку, а исправленный текст публикуется сам', async () => {
    const { createThread, createPost, resubmitPost } = await import('@/lib/forum');
    const { user, profile } = await makePhotographer('resub');

    const thread = await createThread(user.id, {
      sectionSlug: 'platform',
      title: 'Не приходит уведомление о новой заявке',
      body: 'Заявки появляются в кабинете, а письма о них не приходят уже неделю. Проверял папку со спамом, там пусто.',
    });
    const rejected = await createPost(user.id, thread.id, 'Мой адрес olga@example.com — напишите туда, если у вас так же.');
    expect(rejected.status).toBe('REJECTED');

    // Тот же текст: очередь оператора не должны наполнять люди, ничего не
    // исправившие
    await expect(
      resubmitPost(user.id, rejected.id, 'Мой адрес olga@example.com — напишите туда, если у вас так же.'),
    ).rejects.toThrow();

    // Исправленный проходит автомат и публикуется сразу: ответ должен прийти
    // мгновенно, а не через сутки ожидания человека
    const fixed = await resubmitPost(user.id, rejected.id, 'У меня то же самое: заявки в кабинете есть, писем нет уже неделю.');
    expect(fixed.status).toBe('PUBLISHED');

    await cleanup(user.id, profile.id);
  });

  it('систематические отказы ограничивают публикации', async () => {
    const { createThread, assertCanPublish } = await import('@/lib/forum');
    const { db } = await import('@/lib/db');
    const { user, profile } = await makePhotographer('limit');

    for (let i = 0; i < 5; i += 1) {
      await db.contentViolation.create({ data: { userId: user.id, kind: 'post', reason: 'contacts' } });
    }
    await expect(assertCanPublish(user.id)).rejects.toThrow();
    await expect(
      createThread(user.id, {
        sectionSlug: 'craft',
        title: 'Совершенно нормальная тема про свет',
        body: 'Текст, к которому у автомодерации нет ни одной претензии, но публиковать его уже нельзя из-за накопленных отказов.',
      }),
    ).rejects.toThrow();

    // Старые нарушения не считаются: счётчик смотрит только недавнее окно
    await db.contentViolation.updateMany({
      where: { userId: user.id },
      data: { createdAt: new Date(Date.now() - 60 * 86_400_000) },
    });
    await expect(assertCanPublish(user.id)).resolves.toBeUndefined();

    await cleanup(user.id, profile.id);
  });

  it('отклонённую ТЕМУ можно исправить и отправить снова', async () => {
    const { createThread, resubmitThread, threadBySlug, myRejected } = await import('@/lib/forum');
    const { user, profile } = await makePhotographer('rethread');

    const bad = await createThread(user.id, {
      sectionSlug: 'clients',
      title: 'Ищу напарника на съёмку в июле месяце',
      body: 'Нужен второй фотограф на свадьбу, пишите на почту naparnik@example.com, обсудим условия и гонорар.',
    });
    expect(bad.status).toBe('REJECTED');

    // Отказ обязан быть виден и после закрытия вкладки — иначе объяснение
    // существует ровно одну минуту
    const mine = await myRejected(user.id);
    expect(mine.threads.some((t) => t.id === bad.id)).toBe(true);

    const fixed = await resubmitThread(user.id, bad.id, {
      title: 'Ищу напарника на съёмку в июле месяце',
      body: 'Нужен второй фотограф на свадьбу в Подмосковье, дата двенадцатое июля. Условия обсудим в личных сообщениях.',
    });
    expect(fixed.status).toBe('PUBLISHED');
    const view = await threadBySlug(bad.slug!);
    expect(view?.posts).toHaveLength(1);

    await cleanup(user.id, profile.id);
  });

  it('автор темы узнаёт об ответе', async () => {
    const { createThread, createPost } = await import('@/lib/forum');
    const { db } = await import('@/lib/db');
    const owner = await makePhotographer('owner');
    const guest = await makePhotographer('guest');

    const thread = await createThread(owner.user.id, {
      sectionSlug: 'gear',
      title: 'Какой объектив брать на репортаж в зале',
      body: 'Снимаю конференции в небольших залах, света мало. Думаю между зумом и фиксом — что берёте вы и почему?',
    });
    await createPost(guest.user.id, thread.id, 'Беру фикс 35 мм: в тесном зале зум всё равно стоит на широком конце, а светосила выигрывает.');

    const notes = await db.notification.findMany({
      where: { userId: owner.user.id, type: 'notification.forum.reply' },
    });
    // Вопрос, на который ответили молча, останется незамеченным, и разговор
    // оборвётся на первом же круге
    expect(notes.length).toBe(1);

    // На свой же ответ уведомления быть не должно
    await createPost(owner.user.id, thread.id, 'Спасибо, попробую фикс на ближайшей съёмке и напишу, что вышло.');
    expect(await db.notification.count({ where: { userId: owner.user.id, type: 'notification.forum.reply' } })).toBe(1);

    await db.notification.deleteMany({ where: { userId: owner.user.id } });
    await cleanup(guest.user.id, guest.profile.id);
    await cleanup(owner.user.id, owner.profile.id);
  });

});
