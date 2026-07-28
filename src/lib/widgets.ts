import { db } from '@/lib/db';

// Виджеты дашборда: агрегаты сообщества (дёшево, кэшируются ISR на странице).
export interface CommunityStats {
  photographers: number;
  photos: number;
  cities: number;
  stories: number;
}

export async function communityStats(): Promise<CommunityStats> {
  // Публичная витрина считает только контент публичных (APPROVED) профилей —
  // работы снятых с публикации авторов не должны раздувать «N работ».
  const [photographers, photos, cities, stories] = await Promise.all([
    db.photographerProfile.count({ where: { status: 'APPROVED' } }),
    db.photo.count({ where: { status: 'APPROVED', profile: { status: 'APPROVED' } } }),
    db.city.count({ where: { active: true } }),
    db.story.count({ where: { status: 'APPROVED', profile: { status: 'APPROVED' } } }),
  ]);
  return { photographers, photos, cities, stories };
}

export interface ValuedItem {
  username: string;
  firstName: string;
  lastName: string;
  avatarKey: string | null;
  recommendCount: number; // рекомендации = отзывы rating≥4 & verified
}

/**
 * Фотографы, которых ценят заказчики (доброжелательный инвариант 2026-07-25):
 * порядок по РЕКОМЕНДАЦИЯМ (отзывы rating≥4 + verified по реальной съёмке),
 * НЕ по среднему баллу и без публичного ранга. Низкие оценки публично не топят.
 */
export async function valuedPhotographers(limit = 6): Promise<ValuedItem[]> {
  const agg = await db.review.groupBy({
    by: ['profileId'],
    where: { status: 'VISIBLE', rating: { gte: 4 }, verified: true },
    _count: true,
    orderBy: { _count: { profileId: 'desc' } },
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
        recommendCount: a._count,
      };
    })
    .filter((x): x is ValuedItem => x !== null);
}

/** Недавно присоединившиеся одобренные фотографы (виджет «новые в сообществе»). */
export async function recentPhotographers(limit = 6) {
  const profiles = await db.photographerProfile.findMany({
    // «Новые имена» показываем только с готовой работой — пустой профиль бьёт по
    // первому впечатлению (планка качества). Нужно ≥1 одобренное фото.
    where: { status: 'APPROVED', photos: { some: { status: 'APPROVED' } } },
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
