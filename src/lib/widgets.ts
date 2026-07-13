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

/** Недавно присоединившиеся одобренные фотографы (виджет «новые в сообществе»). */
export async function recentPhotographers(limit = 6) {
  const profiles = await db.photographerProfile.findMany({
    where: { status: 'APPROVED' },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      user: true,
      city: true,
      photos: { where: { status: 'APPROVED' }, orderBy: { publishedAt: 'desc' }, take: 1 },
    },
  });
  return profiles;
}
