import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';
import { logAudit } from '@/lib/audit';
import { REAL_USER } from '@/lib/admin-dashboard';

/**
 * Управление людьми из админки.
 *
 * До этого администратор мог модерировать контент, но не мог ничего сделать с
 * его автором: найти человека по почте, посмотреть, что он вообще делал на
 * платформе, закрыть доступ спамеру. Единственным инструментом было гашение
 * анкеты — то есть наказание за поведение решалось через контент.
 *
 * Все действия здесь необратимы для пользователя и заметны снаружи, поэтому
 * каждое пишется в аудит-лог: кто, над кем, когда и почему.
 */

export type UserSearchResult = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  role: string;
  status: string;
  createdAt: Date;
  username: string | null;
  profileStatus: string | null;
};

/**
 * Поиск по имени, почте и адресу страницы.
 *
 * Ищем и по частям: администратор чаще помнит «Иванов» или кусок домена, чем
 * точный адрес. Пустой запрос отдаёт последних зарегистрированных — это
 * полезнее пустого экрана.
 */
export async function searchUsers(query: string, limit = 40): Promise<UserSearchResult[]> {
  const q = query.trim().toLowerCase();
  const where: Prisma.UserWhereInput = q.length === 0
    ? {}
    : {
        OR: [
          { email: { contains: q, mode: 'insensitive' } },
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          // Связь «один к одному» фильтруется через is — иначе Prisma не примет условие
          { profile: { is: { username: { contains: q, mode: 'insensitive' } } } },
        ],
      };

  const rows = await db.user.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true, firstName: true, lastName: true, email: true, role: true, status: true, createdAt: true,
      profile: { select: { username: true, status: true } },
    },
  });
  return rows.map((u) => ({
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    role: u.role,
    status: u.status,
    createdAt: u.createdAt,
    username: u.profile?.username ?? null,
    profileStatus: u.profile?.status ?? null,
  }));
}

export type UserCard = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  role: string;
  status: string;
  createdAt: Date;
  emailVerifiedAt: Date | null;
  lastSeenAt: Date | null;
  twoFactorEnabled: boolean;
  profile: { username: string; status: string; city: string | null } | null;
  subscription: { tier: string; until: Date | null; requestedAt: Date | null } | null;
  counts: {
    photos: number;
    videos: number;
    reviewsWritten: number;
    messagesSent: number;
    inquiries: number;
    reportsAgainst: number;
  };
};

/** Карточка человека: всё, что нужно для решения, в одном месте. */
export async function userCard(userId: string): Promise<UserCard | null> {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true, firstName: true, lastName: true, email: true, phone: true, role: true, status: true,
      createdAt: true, emailVerifiedAt: true, lastSeenAt: true, twoFactorEnabledAt: true,
      profile: { select: { id: true, username: true, status: true, city: { select: { slug: true } } } },
      subscription: { select: { tier: true, currentPeriodEnd: true, proRequestedAt: true } },
    },
  });
  if (!u) return null;

  const profileId = u.profile?.id;
  const [photos, videos, reviewsWritten, messagesSent, inquiries, reportsAgainst] = await Promise.all([
    profileId ? db.photo.count({ where: { profileId } }) : 0,
    profileId ? db.profileVideo.count({ where: { profileId } }) : 0,
    db.review.count({ where: { authorUserId: userId } }),
    db.message.count({ where: { senderId: userId } }),
    db.inquiry.count({ where: { clientUserId: userId } }),
    // Жалобы НА человека: и на него самого, и на его анкету
    // Жалоба на анкету подаётся как жалоба на пользователя — отдельного типа
    // PROFILE в перечне нет
    db.report.count({ where: { targetType: 'USER', targetId: userId } }),
  ]);

  return {
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    phone: u.phone,
    role: u.role,
    status: u.status,
    createdAt: u.createdAt,
    emailVerifiedAt: u.emailVerifiedAt,
    lastSeenAt: u.lastSeenAt,
    twoFactorEnabled: Boolean(u.twoFactorEnabledAt),
    profile: u.profile
      ? { username: u.profile.username, status: u.profile.status, city: u.profile.city?.slug ?? null }
      : null,
    subscription: u.subscription
      ? { tier: u.subscription.tier, until: u.subscription.currentPeriodEnd, requestedAt: u.subscription.proRequestedAt }
      : null,
    counts: { photos, videos, reviewsWritten, messagesSent, inquiries, reportsAgainst },
  };
}

/**
 * Закрыть или вернуть доступ.
 *
 * Блокировка отзывает и все живые сессии: иначе человек с открытой вкладкой
 * продолжал бы писать в личку, а «заблокирован» относилось бы только к
 * следующему входу.
 *
 * Администратора заблокировать нельзя — это единственный способ управления
 * платформой, и снять блокировку было бы уже некому.
 */
export async function setUserBlocked(
  actorUserId: string,
  userId: string,
  blocked: boolean,
  reason: string,
): Promise<void> {
  if (actorUserId === userId) throw new DomainError('cannot_block_self', 400);
  const target = await db.user.findUnique({ where: { id: userId }, select: { role: true, status: true } });
  if (!target) throw new DomainError('no_user', 404);
  if (target.role === 'ADMIN') throw new DomainError('cannot_block_admin', 400);
  if (blocked && reason.trim().length < 3) throw new DomainError('validation', 400);

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        status: blocked ? 'BANNED' : 'ACTIVE',
        // Отзыв сессий: без этого блокировка начинает действовать только со
        // следующего входа, а у человека уже открыта вкладка
        ...(blocked ? { tokenVersion: { increment: 1 } } : {}),
      },
    });
    await logAudit(tx, actorUserId, blocked ? 'user.block' : 'user.unblock', 'USER', userId, { reason: reason.trim().slice(0, 200) });
  });

  if (blocked) {
    // Наказание должно откатывать вред, а не только закрывать дверь. Лайки
    // накрутчика двигают merit-порядок, и, поймав кольцо аккаунтов, оператор
    // не мог вернуть выдачу к честной: голоса жили дальше сами по себе.
    const liked = await db.like.findMany({
      where: { userId },
      select: { photo: { select: { profileId: true } } },
    });
    const profileIds = [...new Set(liked.map((l) => l.photo?.profileId).filter((id): id is string => Boolean(id)))];
    await db.like.deleteMany({ where: { userId } });

    const { recomputeOne } = await import('@/lib/rating');
    for (const id of profileIds) await recomputeOne(id).catch(() => {});
  }
}

/** Сколько всего людей на платформе — без демо и тестов. */
export async function realUserCount(): Promise<number> {
  return db.user.count({ where: REAL_USER });
}
