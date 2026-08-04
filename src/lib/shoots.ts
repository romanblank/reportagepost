import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';
import { rateLimit } from '@/lib/rate-limit';

// Подтверждённая съёмка — честный якорь доверия (доброжелательная система).
// Заказчик отмечает, что съёмка состоялась, ФОТОГРАФ подтверждает. Только после
// этого появляются публичные факты «снимали вместе»/«клиенты возвращаются» и
// признак verified у отзыва.
//
// Двусторонность введена S4-хардерингом (2026-08-02): односторонняя отметка
// была self-attested, и после снятия инвайт-гейта автор мог бы завести фейковых
// «заказчиков» и накрутить себе доверие. Трение работает в правильную сторону —
// подтверждать съёмку выгодно самому фотографу.

/** Заказчик отмечает съёмку. Публичной она станет после подтверждения автором. */
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

  await db.shootConfirmation.create({
    data: { clientUserId, profileId, eventDate: eventDate ?? undefined },
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
    where: { profileId, state: 'CONFIRMED' },
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
      where: { clientUserId, profileId, state: 'CONFIRMED' },
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
