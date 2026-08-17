import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';
import { rateLimit } from '@/lib/rate-limit';
import { ru } from '@/i18n/ru';

/** Планка «выдержанного» аккаунта — та же, что у веса лайка. */
const TRUSTED_CLIENT_AGE_MS = 48 * 3600_000;

// Подтверждённая съёмка — честный якорь доверия (доброжелательная система).
//
// ИНИЦИИРУЕТ ФОТОГРАФ, подтверждает ЗАКАЗЧИК (переворот 2026-08-04).
//
// Раньше отмечал заказчик, а фотограф подтверждал — и механика была мертва:
// у заказчика нет никакой мотивации возвращаться на платформу после съёмки,
// деньги уплачены, сделка закрыта. Пять шагов, четыре из них на его стороне.
// Прогноз был «ноль подтверждённых съёмок у всех профилей», а вместе с ними —
// ноль verified-отзывов и пустой фильтр «с подтверждёнными» в каталоге.
//
// Теперь отмечает тот, кто заинтересован: фотограф, для которого это витрина.
// Заказчику остаётся одно действие — «да, снимали» или «нет».
//
// Двусторонность при этом СОХРАНЕНА и усилена: без ответа заказчика факт не
// публичен, а сам ответ принимается только от аккаунта, которому есть основания
// доверять. Иначе переворот открыл бы прямую дорогу к самонакрутке: автор
// заводит «заказчиков» и подтверждает себе съёмки сам.

/**
 * Фотограф отмечает съёмку с заказчиком. Публичной она станет после его ответа.
 *
 * Отдельная функция от `confirmShoot`: та осталась для случая, когда заказчик
 * сам захотел отметить съёмку со своей стороны — это по-прежнему допустимо и
 * работает так же, просто не является основным путём.
 */
export async function requestShootConfirmation(
  photographerUserId: string,
  clientUserId: string,
  eventDate?: Date | null,
): Promise<void> {
  const profile = await db.photographerProfile.findUnique({
    where: { userId: photographerUserId },
    select: { id: true, status: true },
  });
  if (!profile || profile.status !== 'APPROVED') throw new DomainError('target_not_found', 404);
  if (photographerUserId === clientUserId) throw new DomainError('shoot_self', 400);

  const client = await db.user.findUnique({
    where: { id: clientUserId },
    select: { role: true, status: true },
  });
  if (!client || client.status === 'BANNED') throw new DomainError('target_not_found', 404);

  // Тот же гард реального контакта, что и раньше: переписка в обе стороны
  const [clientToAuthor, authorToClient] = await Promise.all([
    db.message.count({ where: { senderId: clientUserId, recipientId: photographerUserId } }),
    db.message.count({ where: { senderId: photographerUserId, recipientId: clientUserId } }),
  ]);
  if (clientToAuthor === 0 || authorToClient === 0) throw new DomainError('shoot_no_contact', 403);

  // Фотограф инициирует — значит и лимит на нём: иначе один автор мог бы
  // засыпать запросами всех, с кем когда-либо переписывался
  await rateLimit(`shoot-request:user:${photographerUserId}`, 20, 86_400);

  const duplicate = await db.shootConfirmation.findFirst({
    where: { clientUserId, profileId: profile.id, eventDate: eventDate ?? null },
    select: { id: true },
  });
  if (duplicate) throw new DomainError('shoot_already_marked', 409);

  // Явная проверка выше неатомарна: двойной клик проходит оба findFirst до
  // первого create. Дубль ловит БД — уникальный индекс (для NULL-дат —
  // частичный, миграция 2026-08-16), здесь только переводим P2002 в тот же
  // 409. «Снимали вместе N раз» считается от числа записей — дубль это
  // накрутка доверия, а не безобидный мусор
  const shoot = await db.shootConfirmation.create({
    data: {
      clientUserId,
      profileId: profile.id,
      eventDate: eventDate ?? undefined,
      // Кто инициировал — важно для разбора: подтверждения, начатые автором,
      // и подтверждения, начатые заказчиком, имеют разный вес доверия
      initiatedBy: 'PHOTOGRAPHER',
    },
  }).catch((e: unknown) => {
    if (e && typeof e === 'object' && 'code' in e && e.code === 'P2002') {
      throw new DomainError('shoot_already_marked', 409);
    }
    throw e;
  });

  // Заказчику — одно действие: «да, снимали» или «нет»
  const { notifyInApp } = await import('@/lib/notifications');
  void notifyInApp(clientUserId, 'notification.shoot.confirm_request_client', { shootId: shoot.id }).catch(() => {});
}


/**
 * Подтверждение по ПРИГЛАШЕНИЮ автора (импорт репутации, 2026-08-17).
 *
 * Отличие от confirmShoot: гард «есть переписка» снят — приглашение и есть
 * контакт (заказчик пришёл по подписанной ссылке автора). Trust-модель при
 * этом строже, а не мягче: state сразу CONFIRMED (интент автора выражен самим
 * приглашением), но публичный вес — только после проверки человеком, если
 * аккаунт без признаков доверия. Приглашённый заказчик почти всегда свежий,
 * то есть почти всегда needsReview: первые «снимали вместе» пройдут через
 * оператора, и это осознанная цена запуска механизма на пустой платформе.
 */
export async function confirmShootByInvite(
  clientUserId: string,
  profileId: string,
  eventDate?: Date | null,
): Promise<{ needsReview: boolean }> {
  const profile = await db.photographerProfile.findUnique({
    where: { id: profileId },
    select: { status: true, userId: true },
  });
  if (!profile || profile.status !== 'APPROVED') throw new DomainError('not_found', 404);
  if (profile.userId === clientUserId) throw new DomainError('shoot_self', 400);

  await rateLimit(`shoot-invite:user:${clientUserId}`, 5, 86_400);
  // Кап на ПРОФИЛЬ: поток приглашённых подтверждений одному автору ограничен,
  // иначе накрутчик заваливает очередь оператора сотней записей за вечер
  await rateLimit(`shoot-invite-accept:profile:${profileId}`, 10, 86_400);

  // ВСЕГДА к человеку — без исключений (закрыто 2026-08-17 по вопросу
  // оператора «так можно накрутить?»). Первая версия пропускала мимо очереди
  // аккаунты с подтверждённой почтой или старше 48 часов — но у приглашённого
  // пути нет второго сигнала обычного пути («аккаунт заведён ДО первого
  // контакта»), а подтвердить почту накрутчику — пять минут. Единственный
  // честный сигнал платформы не должен иметь автоматической двери с улицы:
  // объём на старте штучный, и взгляд человека — осознанная цена механизма.
  const needsReview = true;
  await db.shootConfirmation.create({
    data: {
      clientUserId,
      profileId,
      eventDate: eventDate ?? undefined,
      initiatedBy: 'PHOTOGRAPHER',
      state: 'CONFIRMED',
      respondedAt: new Date(),
      needsReview,
    },
  }).catch((e: unknown) => {
    if (e && typeof e === 'object' && 'code' in e && e.code === 'P2002') {
      throw new DomainError('shoot_already_marked', 409);
    }
    throw e;
  });

  if (needsReview) {
    const { alertOperator } = await import('@/lib/telegram');
    void alertOperator(ru.operatorAlerts.shootNeedsReview).catch(() => {});
  }
  const { notifyInApp } = await import('@/lib/notifications');
  void notifyInApp(profile.userId, 'notification.shoot.invite_confirmed', { profileId }).catch(() => {});
  return { needsReview };
}

/** Заказчик отмечает съёмку сам. Публичной она станет после подтверждения автором. */
export async function confirmShoot(clientUserId: string, profileId: string, eventDate?: Date | null): Promise<void> {
  const profile = await db.photographerProfile.findUnique({
    where: { id: profileId },
    select: { status: true, userId: true },
  });
  if (!profile || profile.status !== 'APPROVED') throw new DomainError('target_not_found', 404);
  if (profile.userId === clientUserId) throw new DomainError('shoot_self', 400);
  const actor = await db.user.findUnique({
    where: { id: clientUserId },
    select: { role: true, emailVerifiedAt: true },
  });
  if (actor?.role !== 'CLIENT') throw new DomainError('shoot_clients_only', 403);
  // Sybil-фрикция: подтверждённый адрес почты. Без неё завести десяток
  // «заказчиков» стоит ноль усилий — а каждый из них выдаёт verified-отзыв.
  // Требование подтверждённой почты — Sybil-фрикция, но она осмысленна только
  // если письмо ВООБЩЕ можно получить. Пока почта не настроена или не работает,
  // это требование запирает механику целиком: ни одной подтверждённой съёмки, а
  // значит ни одного verified-отзыва и пустой фильтр «с подтверждёнными» в
  // каталоге. Тот же рубильник, что у гейта лички и отзывов.
  const { verificationRequired } = await import('@/lib/email-verification');
  if (verificationRequired() && !actor.emailVerifiedAt) {
    throw new DomainError('shoot_email_unverified', 403);
  }
  // Анти-форж (S4): подтвердить съёмку можно только при РЕАЛЬНОМ контакте на
  // платформе — двусторонней переписке (клиент писал автору И автор отвечал).
  // Блокирует нулевой-эффорт фейк-verified (создать клиента → сразу подтвердить
  // любому автору). Полная двусторонняя аккцептация автором — design-record для S4.
  const [clientToAuthor, authorToClient] = await Promise.all([
    db.message.count({ where: { senderId: clientUserId, recipientId: profile.userId } }),
    db.message.count({ where: { senderId: profile.userId, recipientId: clientUserId } }),
  ]);
  if (clientToAuthor === 0 || authorToClient === 0) throw new DomainError('shoot_no_contact', 403);
  await rateLimit(`shoot:user:${clientUserId}`, 10, 3600); // антиспам подтверждений

  // Повторная отметка той же съёмки — не «второй раз снимали», а дубль.
  // Уникальный индекс ловит записи с датой; записи без даты он пропускает
  // (в SQL NULL ≠ NULL), поэтому проверяем явно.
  const duplicate = await db.shootConfirmation.findFirst({
    where: { clientUserId, profileId, eventDate: eventDate ?? null },
    select: { id: true },
  });
  if (duplicate) throw new DomainError('shoot_already_marked', 409);

  // Гонку двойного клика закрывает БД (уникальный индекс, для NULL-дат —
  // частичный); P2002 → тот же 409, что и явная проверка
  await db.shootConfirmation.create({
    data: { clientUserId, profileId, eventDate: eventDate ?? undefined },
  }).catch((e: unknown) => {
    if (e && typeof e === 'object' && 'code' in e && e.code === 'P2002') {
      throw new DomainError('shoot_already_marked', 409);
    }
    throw e;
  });

  // Фотографу — приглашение подтвердить: без его ответа отметка не публична
  const { notifyInApp } = await import('@/lib/notifications');
  void notifyInApp(profile.userId, 'notification.shoot.confirm_request', { profileId }).catch(() => {});
}

/**
 * Ответ фотографа на отметку заказчика: подтвердить или оспорить.
 * До ответа отметка не даёт ни публичных фактов, ни verified-отзыва.
 */
export async function respondToShoot(
  photographerUserId: string,
  shootId: string,
  accept: boolean,
): Promise<void> {
  const shoot = await db.shootConfirmation.findUnique({
    where: { id: shootId },
    select: { id: true, state: true, profile: { select: { userId: true } } },
  });
  if (!shoot) throw new DomainError('target_not_found', 404);
  if (shoot.profile.userId !== photographerUserId) throw new DomainError('forbidden', 403);
  if (shoot.state !== 'PENDING') throw new DomainError('shoot_already_answered', 409);

  await db.shootConfirmation.update({
    where: { id: shootId },
    data: { state: accept ? 'CONFIRMED' : 'DISPUTED', respondedAt: new Date() },
  });
}

/**
 * Ответ ЗАКАЗЧИКА на отметку фотографа: подтвердить или отклонить.
 *
 * Здесь же — защита от самонакрутки, ради которой переворот вообще возможен.
 * Раз инициирует фотограф, соблазн очевиден: завести десяток «заказчиков» и
 * подтвердить себе съёмки с них. Поэтому ответ засчитывается публично только
 * от аккаунта, которому есть основания доверять:
 *
 *  - подтверждённая почта ИЛИ аккаунт старше двух суток — та же планка, что у
 *    веса лайка: свежая пачка регистраций ничего не даёт;
 *  - аккаунт не создан ПОЗЖЕ первого контакта с этим автором — иначе картина
 *    «завёл клиента и сразу подтвердился» проходит по всем прочим проверкам.
 *
 * Не прошедший планку ответ не отвергается: съёмка становится подтверждённой,
 * но помечается как требующая проверки — публичного факта не даёт, а редакция
 * видит её в очереди. Наказывать человека за то, что он новый, нельзя;
 * пропускать накрутку — тоже.
 */
export async function respondToShootRequest(
  clientUserId: string,
  shootId: string,
  accept: boolean,
): Promise<void> {
  const shoot = await db.shootConfirmation.findUnique({
    where: { id: shootId },
    select: {
      id: true, state: true, clientUserId: true, createdAt: true,
      profile: { select: { id: true, userId: true } },
    },
  });
  if (!shoot) throw new DomainError('target_not_found', 404);
  if (shoot.clientUserId !== clientUserId) throw new DomainError('forbidden', 403);
  if (shoot.state !== 'PENDING') throw new DomainError('shoot_already_answered', 409);

  if (!accept) {
    await db.shootConfirmation.update({
      where: { id: shootId },
      data: { state: 'DISPUTED', respondedAt: new Date() },
    });
    return;
  }

  const client = await db.user.findUnique({
    where: { id: clientUserId },
    select: { createdAt: true, emailVerifiedAt: true },
  });
  const firstContact = await db.message.findFirst({
    where: {
      OR: [
        { senderId: clientUserId, recipientId: shoot.profile.userId },
        { senderId: shoot.profile.userId, recipientId: clientUserId },
      ],
    },
    orderBy: { createdAt: 'asc' },
    select: { createdAt: true },
  });

  const seasoned =
    Boolean(client?.emailVerifiedAt) ||
    Boolean(client && Date.now() - client.createdAt.getTime() > TRUSTED_CLIENT_AGE_MS);
  // Аккаунт заведён уже после начала переписки с этим автором — типичная
  // картина накрутки: «создал заказчика → написал себе → подтвердил»
  const bornBeforeContact =
    !firstContact || !client || client.createdAt.getTime() <= firstContact.createdAt.getTime();

  const trustworthy = seasoned && bornBeforeContact;

  await db.shootConfirmation.update({
    where: { id: shootId },
    data: {
      state: 'CONFIRMED',
      respondedAt: new Date(),
      // Съёмка подтверждена, но публичного веса не имеет, пока её не посмотрит
      // человек: показывать «снимали вместе» по цепочке из свежих аккаунтов
      // значит обесценить единственный честный сигнал платформы
      needsReview: !trustworthy,
    },
  });

  if (!trustworthy) {
    const { alertOperator } = await import('@/lib/telegram');
    void alertOperator(ru.operatorAlerts.shootNeedsReview);
  }
}

/** Запросы фотографа, ожидающие ответа заказчика (его кабинет). */
export async function pendingShootsForClient(clientUserId: string) {
  return db.shootConfirmation.findMany({
    where: { clientUserId, state: 'PENDING', initiatedBy: 'PHOTOGRAPHER' },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      eventDate: true,
      createdAt: true,
      profile: {
        select: { username: true, user: { select: { firstName: true, lastName: true } } },
      },
    },
  });
}

/** Отметки, ожидающие ответа фотографа (кабинет). */
export async function pendingShootsForPhotographer(photographerUserId: string) {
  const profile = await db.photographerProfile.findUnique({
    where: { userId: photographerUserId },
    select: { id: true },
  });
  if (!profile) return [];
  return db.shootConfirmation.findMany({
    where: { profileId: profile.id, state: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      eventDate: true,
      createdAt: true,
      client: { select: { firstName: true, lastName: true } },
    },
  });
}

export interface ShootStats {
  count: number; // всего подтверждённых съёмок
  clients: number; // разных заказчиков
  returning: number; // заказчиков с ≥2 съёмками (возвращаются)
}

/**
 * Факты «снимали вместе» — только по ПОДТВЕРЖДЁННЫМ обеими сторонами съёмкам.
 *
 * «Возвращаются» считается по разным ДАТАМ съёмок, а не по числу записей:
 * иначе один заказчик, отметивший одну и ту же съёмку дважды, накручивал бы
 * самый ценный факт профиля. Отметки без даты схлопываются в одну — по ним
 * нельзя утверждать, что съёмок было несколько.
 */
export async function shootStats(profileId: string): Promise<ShootStats> {
  const rows = await db.shootConfirmation.findMany({
    // needsReview — подтверждение пришло с аккаунта без признаков доверия:
    // в публичные факты такое не идёт, пока его не посмотрит человек
    where: { profileId, state: 'CONFIRMED', needsReview: false },
    select: { clientUserId: true, eventDate: true },
  });

  const datesByClient = new Map<string, Set<string>>();
  for (const r of rows) {
    const key = r.eventDate ? r.eventDate.toISOString().slice(0, 10) : 'no-date';
    const set = datesByClient.get(r.clientUserId) ?? new Set<string>();
    set.add(key);
    datesByClient.set(r.clientUserId, set);
  }

  let count = 0;
  let returning = 0;
  for (const dates of datesByClient.values()) {
    count += dates.size;
    if (dates.size >= 2) returning += 1;
  }
  return { count, clients: datesByClient.size, returning };
}

/**
 * Была ли ПОДТВЕРЖДЁННАЯ обеими сторонами съёмка (для verified-отзыва).
 * Ожидающая ответа фотографа отметка признака verified не даёт — иначе
 * двусторонность обходилась бы одним лишним отзывом.
 */
export async function hasShotWith(clientUserId: string, profileId: string): Promise<boolean> {
  return (
    (await db.shootConfirmation.count({
      where: { clientUserId, profileId, state: 'CONFIRMED', needsReview: false },
    })) > 0
  );
}

export interface ClientShoot {
  profileId: string;
  username: string;
  firstName: string;
  lastName: string;
  avatarKey: string | null;
  count: number;
  reviewed: boolean; // оставил ли заказчик отзыв этому автору
}

/** Съёмки заказчика (кабинет): по авторам + отметка «отзыв оставлен» — петля признания. */
export async function shootsByClient(clientUserId: string): Promise<ClientShoot[]> {
  const grouped = await db.shootConfirmation.groupBy({
    by: ['profileId'],
    where: { clientUserId, state: 'CONFIRMED' },
    _count: true,
  });
  if (grouped.length === 0) return [];
  const profileIds = grouped.map((g) => g.profileId);
  const [profiles, reviews] = await Promise.all([
    db.photographerProfile.findMany({
      where: { id: { in: profileIds }, status: 'APPROVED' },
      select: { id: true, username: true, avatarKey: true, user: { select: { firstName: true, lastName: true } } },
    }),
    db.review.findMany({ where: { authorUserId: clientUserId, profileId: { in: profileIds } }, select: { profileId: true } }),
  ]);
  const byId = new Map(profiles.map((p) => [p.id, p]));
  const reviewed = new Set(reviews.map((r) => r.profileId));
  return grouped
    .map((g) => {
      const p = byId.get(g.profileId);
      if (!p) return null;
      return {
        profileId: g.profileId,
        username: p.username,
        firstName: p.user.firstName,
        lastName: p.user.lastName,
        avatarKey: p.avatarKey,
        count: g._count,
        reviewed: reviewed.has(g.profileId),
      } satisfies ClientShoot;
    })
    .filter((x): x is ClientShoot => x !== null);
}
