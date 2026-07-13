import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';

// Выездные графики: фотограф объявляет период работы в чужом городе.
// Каталог города B показывает и «своих», и приезжих на пересекающийся период.

export async function addTravelPlan(
  userId: string,
  input: { citySlug: string; fromDate: string; toDate: string },
): Promise<{ id: string }> {
  const profile = await db.photographerProfile.findUnique({ where: { userId } });
  if (!profile || profile.status !== 'APPROVED') throw new DomainError('profile_not_approved', 403);

  const from = new Date(`${input.fromDate}T00:00:00Z`);
  const to = new Date(`${input.toDate}T00:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
    throw new DomainError('bad_dates', 400);
  }
  const city = await db.city.findFirst({ where: { slug: input.citySlug } });
  if (!city) throw new DomainError('city_not_found', 400);
  if (city.id === profile.cityId) throw new DomainError('home_city', 400); // выезд в свой город бессмыслен

  const plan = await db.travelPlan.create({
    data: { profileId: profile.id, cityId: city.id, fromDate: from, toDate: to },
  });
  return { id: plan.id };
}

export async function removeTravelPlan(userId: string, planId: string): Promise<void> {
  const profile = await db.photographerProfile.findUnique({ where: { userId } });
  if (!profile) throw new DomainError('no_profile', 409);
  // IDOR: удаляем только свой план
  const res = await db.travelPlan.deleteMany({ where: { id: planId, profileId: profile.id } });
  if (res.count === 0) throw new DomainError('not_found', 404);
}

export async function travelPlansFor(userId: string) {
  const profile = await db.photographerProfile.findUnique({ where: { userId } });
  if (!profile) return [];
  return db.travelPlan.findMany({
    where: { profileId: profile.id, toDate: { gte: new Date() } },
    orderBy: { fromDate: 'asc' },
    include: { city: true },
  });
}

/** Приезжие фотографы в городе на дату (или на «сейчас..будущее», если дата не задана). */
export async function visitingCity(citySlug: string, onDate?: Date) {
  const city = await db.city.findFirst({ where: { slug: citySlug } });
  if (!city) return [];
  const dateFilter = onDate
    ? { fromDate: { lte: onDate }, toDate: { gte: onDate } }
    : { toDate: { gte: new Date() } };

  const plans = await db.travelPlan.findMany({
    where: { cityId: city.id, ...dateFilter, profile: { status: 'APPROVED' } },
    orderBy: { fromDate: 'asc' },
    take: 24, // аудит P2: лимит приезжих на странице
    include: {
      profile: {
        include: {
          user: { select: { firstName: true, lastName: true } },
          city: true, // домашний город (для пометки «выезд из …»)
          photos: { where: { status: 'APPROVED' }, orderBy: { publishedAt: 'desc' }, take: 6 },
        },
      },
    },
  });
  return plans;
}
