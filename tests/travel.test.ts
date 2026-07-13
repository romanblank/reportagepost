import { describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('travel: выездные графики (БД)', () => {
  it('приезжий виден в чужом городе на дату, не в свой', async () => {
    const { db } = await import('@/lib/db');
    const { addTravelPlan, visitingCity } = await import('@/lib/travel');
    const { DomainError } = await import('@/lib/errors');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const spb = await db.city.findFirstOrThrow({ where: { slug: 'saint-petersburg' } });
    const owner = await db.user.create({ data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Т', lastName: 'Р', email: `trav-${stamp}@test.local` } });
    const profile = await db.photographerProfile.create({ data: { userId: owner.id, username: `trav-${stamp}`, cityId: spb.id, status: 'APPROVED' } });

    // выезд в свой город — отказ
    await expect(addTravelPlan(owner.id, { citySlug: 'saint-petersburg', fromDate: '2026-09-01', toDate: '2026-09-05' })).rejects.toThrow(DomainError);

    await addTravelPlan(owner.id, { citySlug: 'moscow', fromDate: '2026-09-10', toDate: '2026-09-15' });

    const onDate = new Date('2026-09-12T00:00:00Z');
    const visiting = await visitingCity('moscow', onDate);
    expect(visiting.some((p) => p.profile.username === `trav-${stamp}`)).toBe(true);

    const outOfRange = await visitingCity('moscow', new Date('2026-10-01T00:00:00Z'));
    expect(outOfRange.some((p) => p.profile.username === `trav-${stamp}`)).toBe(false);

    await db.travelPlan.deleteMany({ where: { profileId: profile.id } });
    await db.photographerProfile.delete({ where: { id: profile.id } });
    await db.user.delete({ where: { id: owner.id } });
  });
});
