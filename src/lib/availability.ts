import { db } from '@/lib/db';
import { DomainError } from '@/lib/errors';

// Календарь занятости: фотограф отмечает занятые дни. Каталог фильтрует
// «свободен на дату» (busyDates none) — см. catalog.ts. Даты — UTC-полночь.

function parseDate(dateStr: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) throw new DomainError('bad_date', 400);
  const date = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new DomainError('bad_date', 400);
  return date;
}

async function approvedProfile(userId: string) {
  const profile = await db.photographerProfile.findUnique({ where: { userId } });
  if (!profile) throw new DomainError('no_profile', 409);
  if (profile.status !== 'APPROVED') throw new DomainError('profile_not_approved', 403);
  return profile;
}

/** Toggle занятости дня. Возвращает новое состояние (true = занят). */
export async function toggleBusyDate(userId: string, dateStr: string): Promise<boolean> {
  const profile = await approvedProfile(userId);
  const date = parseDate(dateStr);

  // Идемпотентный toggle, как у всех остальных (favorites/save/like/follow):
  // read-then-write с голыми delete/create на двойном тапе давал гонку —
  // P2025 или P2002 наружу как 500 (аудит 2026-09-10, П2)
  const existing = await db.busyDate.findUnique({
    where: { profileId_date: { profileId: profile.id, date } },
  });
  if (existing) {
    await db.busyDate.deleteMany({ where: { profileId: profile.id, date } });
    return false;
  }
  try {
    await db.busyDate.create({ data: { profileId: profile.id, date } });
  } catch (e) {
    // Параллельный запрос уже отметил день — итог тот же: занят
    if ((e as { code?: string }).code !== 'P2002') throw e;
  }
  return true;
}

/** Будущие занятые дни (с сегодняшней UTC-полуночи), 'YYYY-MM-DD'. */
export async function listBusyDates(userId: string, from: Date): Promise<string[]> {
  const profile = await db.photographerProfile.findUnique({ where: { userId } });
  if (!profile) throw new DomainError('no_profile', 409);
  const rows = await db.busyDate.findMany({
    where: { profileId: profile.id, date: { gte: from } },
    orderBy: { date: 'asc' },
    select: { date: true },
  });
  return rows.map((r) => r.date.toISOString().slice(0, 10));
}
