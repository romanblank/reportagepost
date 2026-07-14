import { db } from '@/lib/db';

// Виджеты дашборда: агрегаты сообщества (дёшево, кэшируются ISR на странице).
export interface CommunityStats {
  photographers: number;
  photos: number;
  cities: number;
  stories: number;
}

export async function communityStats(): Promise<CommunityStats> {
  const [photographers, photos, cities, stories] = await Promise.all([
    db.photographerProfile.count({ where: { status: 'APPROVED' } }),
    db.photo.count({ where: { status: 'APPROVED' } }),
    db.city.count({ where: { active: true } }),
    db.story.count({ where: { status: 'APPROVED' } }),
  ]);
  return { photographers, photos, cities, stories };
}

export interface TopRatedItem {
  username: string;
  firstName: string;
  lastName: string;
  avatarKey: string | null;
  ratingAvg: number;
  ratingCount: number;
}

/** Топ фотографов по отзывам (виджет доверия, MyWed). Только VISIBLE-отзывы. */
export async function topRatedPhotographers(limit = 6): Promise<TopRatedItem[]> {
  const agg = await db.review.groupBy({
    by: ['profileId'],
    where: { status: 'VISIBLE' },
    _avg: { rating: true },
    _count: true,
    orderBy: [{ _avg: { rating: 'desc' } }, { _count: { profileId: 'desc' } }],
    take: limit,
  });
  if (agg.length === 0) return [];
  const profiles = await db.photographerProfile.findMany({
    where: { id: { in: agg.map((a) => a.profileId) }, status: 'APPROVED' },
    select: { id: true, username: true, avatarKey: true, user: { select: { firstName: true, lastName: true } } },
  });
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return agg
    .map((a) => {
      const p = byId.get(a.profileId);
      if (!p) return null;
      return {
        username: p.username,
        firstName: p.user.firstName,
        lastName: p.user.lastName,
        avatarKey: p.avatarKey,
        ratingAvg: a._avg.rating ?? 0,
        ratingCount: a._count,
      };
    })
    .filter((x): x is TopRatedItem => x !== null);
}

/** Недавно присоединившиеся одобренные фотографы (виджет «новые в сообществе»). */
export async function recentPhotographers(limit = 6) {
  const profiles = await db.photographerProfile.findMany({
    where: { status: 'APPROVED' },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      user: { select: { firstName: true, lastName: true } },
      city: true,
      photos: { where: { status: 'APPROVED' }, orderBy: { publishedAt: 'desc' }, take: 1 },
    },
  });
  return profiles;
}
