import { db } from '@/lib/db';

// Follow-списки (паритет MyWed): публичные страницы «подписчики»/«подписки»
// у профиля фотографа. Подписчик-фотограф — карточкой со ссылкой на профиль.
// Приватность (ревью 2026-07-31, P2): у заказчика и немодерированного автора
// публичной страницы нет и согласия на публичность имени не было — их фамилия
// сокращается до инициала УЖЕ В ВЫБОРКЕ (минимизация данных на источнике).

export interface FollowEntry {
  firstName: string;
  lastName: string; // без публичного профиля — только инициал («Иванов» → «И.»)
  // null — нет публичной страницы (заказчик или автор вне каталога)
  username: string | null;
  avatarKey: string | null;
  city: string | null; // slug города
  isClient: boolean; // для подписи: «Заказчик» vs «Автор» (не-APPROVED фотограф)
}

const LIST_CAP = 200; // бета: без пагинации, кап от вырожденных случаев

const USER_SELECT = {
  firstName: true,
  lastName: true,
  role: true,
  profile: { select: { username: true, avatarKey: true, status: true, city: { select: { slug: true } } } },
} as const;

type UserRow = {
  firstName: string;
  lastName: string;
  role: string;
  profile: { username: string; avatarKey: string | null; status: string; city: { slug: string } } | null;
};

function toEntry(u: UserRow): FollowEntry {
  // Ссылка/аватар/полное имя — только у APPROVED-профиля
  const pub = u.profile && u.profile.status === 'APPROVED' ? u.profile : null;
  return {
    firstName: u.firstName,
    lastName: pub ? u.lastName : `${u.lastName[0] ?? ''}.`,
    username: pub?.username ?? null,
    avatarKey: pub?.avatarKey ?? null,
    city: pub?.city.slug ?? null,
    isClient: u.role === 'CLIENT',
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
