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
    // Города, где ЕСТЬ авторы, а не города из справочника. Раньше витрина
    // показывала «2 города» при одном фотографе в одном городе — цифра обещала
    // выбор, которого нет, и это первое, что заказчик проверяет
    db.photographerProfile
      .groupBy({ by: ['cityId'], where: { status: 'APPROVED' } })
      .then((rows) => rows.length),
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

/**
 * География сообщества: одобренные авторы по городам (партнёр 2026-08-18,
 * «Сообщество» как бизнес-раздел для партнёров и рекламодателей).
 * Демо-профили исключены — цифры для внешних глаз обязаны быть честными.
 */
export async function communityGeo(): Promise<{ slug: string; count: number }[]> {
  const rows = await db.photographerProfile.groupBy({
    by: ['cityId'],
    where: { status: 'APPROVED', isDemo: false },
    _count: true,
    orderBy: { _count: { cityId: 'desc' } },
    take: 30,
  });
  if (rows.length === 0) return [];
  const cities = await db.city.findMany({
    where: { id: { in: rows.map((r) => r.cityId) } },
    select: { id: true, slug: true },
  });
  const slugById = new Map(cities.map((c) => [c.id, c.slug]));
  return rows
    .map((r) => ({ slug: slugById.get(r.cityId) ?? '', count: r._count }))
    .filter((r) => r.slug);
}

/**
 * Техника сообщества: бренды камер из анкет + популярные модели из EXIF
 * загруженных кадров. Второй источник честнее первого: анкету заполняют
 * словами, EXIF пишет сама камера.
 */
export async function communityGear(): Promise<{
  brands: { brand: string; count: number }[];
  topCameras: { model: string; count: number }[];
}> {
  const profiles = await db.photographerProfile.findMany({
    where: { status: 'APPROVED', isDemo: false, cameraBrands: { isEmpty: false } },
    select: { cameraBrands: true },
  });
  const brandCount = new Map<string, number>();
  for (const p of profiles) {
    for (const b of p.cameraBrands) brandCount.set(b, (brandCount.get(b) ?? 0) + 1);
  }
  const brands = [...brandCount]
    .map(([brand, count]) => ({ brand, count }))
    .sort((a, b) => b.count - a.count);

  const cams = await db.photo.groupBy({
    by: ['cameraModel'],
    where: { status: 'APPROVED', cameraModel: { not: null }, profile: { isDemo: false } },
    _count: true,
    orderBy: { _count: { cameraModel: 'desc' } },
    take: 12,
  });
  const topCameras = cams
    .filter((c) => c.cameraModel)
    .map((c) => ({ model: c.cameraModel as string, count: c._count }));

  return { brands, topCameras };
}
