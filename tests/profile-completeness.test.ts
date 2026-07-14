import { describe, expect, it } from 'vitest';
import { profileCompleteness } from '@/lib/profile-completeness';

const full = {
  hasAvatar: true,
  bio: 'Достаточно длинный рассказ о себе, стиле и опыте съёмок событий.',
  experienceYears: 8,
  equipment: 'Sony A7IV',
  teamInfo: 'соло',
  hasContact: true,
  photosCount: 20,
  minPhotos: 15,
};

describe('profileCompleteness (чистая функция)', () => {
  it('всё заполнено → 100%, ничего не пропущено', () => {
    const r = profileCompleteness(full);
    expect(r.pct).toBe(100);
    expect(r.missing).toEqual([]);
  });

  it('ничего не заполнено → 0%, все пункты в missing', () => {
    const r = profileCompleteness({
      hasAvatar: false, bio: null, experienceYears: null, equipment: null,
      teamInfo: null, hasContact: false, photosCount: 0, minPhotos: 15,
    });
    expect(r.pct).toBe(0);
    expect(r.missing).toContain('avatar');
    expect(r.missing).toContain('photos');
    expect(r.missing.length).toBe(7);
  });

  it('короткое bio (<40) и мало фото не засчитываются', () => {
    const r = profileCompleteness({ ...full, bio: 'коротко', photosCount: 3 });
    expect(r.missing).toContain('bio');
    expect(r.missing).toContain('photos');
    expect(r.pct).toBeLessThan(100);
  });
});
