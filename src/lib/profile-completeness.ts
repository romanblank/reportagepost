// Полнота анкеты (паритет MyWed: ведём фотографа к 100%). Чистая функция —
// тестируемо. Возвращает процент и список незаполненного (ключи для i18n).

export interface CompletenessInput {
  hasAvatar: boolean;
  bio: string | null;
  experienceYears: number | null;
  equipment: string | null;
  teamInfo: string | null;
  hasContact: boolean; // whatsapp | telegram | siteUrl
  photosCount: number;
  minPhotos: number;
}

export type CompletenessKey =
  | 'avatar' | 'bio' | 'experience' | 'equipment' | 'team' | 'contact' | 'photos';

export function profileCompleteness(i: CompletenessInput): { pct: number; missing: CompletenessKey[] } {
  const checks: [boolean, CompletenessKey][] = [
    [i.hasAvatar, 'avatar'],
    [Boolean(i.bio && i.bio.trim().length >= 40), 'bio'],
    [i.experienceYears != null, 'experience'],
    [Boolean(i.equipment && i.equipment.trim()), 'equipment'],
    [Boolean(i.teamInfo && i.teamInfo.trim()), 'team'],
    [i.hasContact, 'contact'],
    [i.photosCount >= i.minPhotos, 'photos'],
  ];
  const done = checks.filter(([ok]) => ok).length;
  const missing = checks.filter(([ok]) => !ok).map(([, k]) => k);
  return { pct: Math.round((done / checks.length) * 100), missing };
}
