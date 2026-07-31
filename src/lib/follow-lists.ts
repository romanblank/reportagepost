import { db } from '@/lib/db';

// Follow-списки (паритет MyWed): публичные страницы «подписчики»/«подписки»
// у профиля фотографа. Подписчик-фотограф — карточкой со ссылкой на профиль;
// подписчик-заказчик — именем без ссылки (публичной страницы у него нет).

export interface FollowEntry {
  firstName: string;
  lastName: string;
  // null — заказчик (без публичной страницы)
  username: string | null;
  avatarKey: string | null;
  city: string | null; // slug города (для подписи ссылкой не является)
}

const LIST_CAP = 200; // бета: без пагинации, кап от вырожденных случаев

const USER_SELECT = {
  firstName: true,
  lastName: true,
  profile: { select: { username: true, avatarKey: true, status: true, city: { select: { slug: true } } } },
} as const;

type UserRow = {
  firstName: string;
  lastName: string;
  profile: { username: string; avatarKey: string | null; status: string; city: { slug: string } } | null;
};

function toEntry(u: UserRow): FollowEntry {
  // Ссылка/аватар — только на APPROVED-профиль (PENDING/чужие статусы не светим)
  const pub = u.profile && u.profile.status === 'APPROVED' ? u.profile : null;
  return {
    firstName: u.firstName,
    lastName: u.lastName,
    username: pub?.username ?? null,
    avatarKey: pub?.avatarKey ?? null,
    city: pub?.city.slug ?? null,
  };
}

/** Кто подписан на userId (свежие сверху). */
export async function followersOf(userId: string): Promise<FollowEntry[]> {
  const rows = await db.follow.findMany({
    where: { followeeId: userId },
    orderBy: { createdAt: 'desc' },
    take: LIST_CAP,
    select: { follower: { select: USER_SELECT } },
  });
  return rows.map((r) => toEntry(r.follower));
}

/** На кого подписан userId (свежие сверху). */
export async function followingOf(userId: string): Promise<FollowEntry[]> {
  const rows = await db.follow.findMany({
    where: { followerId: userId },
    orderBy: { createdAt: 'desc' },
    take: LIST_CAP,
    select: { followee: { select: USER_SELECT } },
  });
  return rows.map((r) => toEntry(r.followee));
}
