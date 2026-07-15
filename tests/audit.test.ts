import { describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('audit: аудит-лог действий админа (БД)', () => {
  it('approveProfile с актором пишет AdminAudit profile.approve', async () => {
    const { db } = await import('@/lib/db');
    const { approveProfile } = await import('@/lib/moderation');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const spb = await db.city.findFirstOrThrow({ where: { slug: 'saint-petersburg' } });
    const admin = await db.user.create({ data: { role: 'ADMIN', status: 'ACTIVE', firstName: 'А', lastName: 'Д', email: `adm-${stamp}@test.local` } });
    const owner = await db.user.create({ data: { role: 'PHOTOGRAPHER', status: 'PENDING', firstName: 'Ф', lastName: 'Т', email: `mod-${stamp}@test.local` } });
    const profile = await db.photographerProfile.create({ data: { userId: owner.id, username: `mod-${stamp}`, cityId: spb.id, status: 'PENDING' } });

    await approveProfile(profile.id, admin.id);

    const rows = await db.adminAudit.findMany({ where: { actorUserId: admin.id, targetId: profile.id } });
    expect(rows.length).toBe(1);
    expect(rows[0].action).toBe('profile.approve');
    expect(rows[0].targetType).toBe('PROFILE');

    // cleanup (AdminAudit → user из-за FK RESTRICT)
    await db.adminAudit.deleteMany({ where: { actorUserId: admin.id } });
    await db.photo.deleteMany({ where: { profileId: profile.id } });
    await db.photographerProfile.delete({ where: { id: profile.id } });
    await db.user.deleteMany({ where: { id: { in: [admin.id, owner.id] } } });
  });
});
