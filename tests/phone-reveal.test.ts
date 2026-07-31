import { describe, expect, it } from 'vitest';
import 'dotenv/config';

// «Показать номер»: раскрытие ТОЛЬКО при опт-ине (showPhone) + APPROVED + телефон
// есть; событие PHONE_REVEAL пишется с дедупом повторов зрителя; владелец не
// накручивает свою статистику. Правило c: без DATABASE_URL — skip.
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('phone-reveal: «Показать номер» (БД)', () => {
  it('гарды (нет опт-ина / не APPROVED / нет телефона) → 404; раскрытие пишет событие; повтор зрителя дедупится; владелец без события', async () => {
    const { db } = await import('@/lib/db');
    const { revealPhone } = await import('@/lib/phone-reveal');
    const { DomainError } = await import('@/lib/errors');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const phone = `+7999${String(Date.now()).slice(-7)}`;

    const owner = await db.user.create({
      data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Т', lastName: 'Елефонов', email: `ph-${stamp}@test.local`, phone },
    });
    const profile = await db.photographerProfile.create({
      data: { userId: owner.id, username: `ph-${stamp}`, cityId: city.id, status: 'APPROVED', showPhone: false },
    });
    const viewer = await db.user.create({
      data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'З', lastName: 'Ритель', email: `vw-${stamp}@test.local` },
    });

    // 1) Без опт-ина — недоступен (гостю и залогиненному)
    await expect(revealPhone(profile.id, null)).rejects.toThrowError(DomainError);
    await expect(revealPhone(profile.id, viewer.id)).rejects.toThrowError(DomainError);

    // 2) Опт-ин, но профиль не APPROVED — недоступен
    await db.photographerProfile.update({ where: { id: profile.id }, data: { showPhone: true, status: 'PENDING' } });
    await expect(revealPhone(profile.id, viewer.id)).rejects.toThrowError(DomainError);

    // 3) APPROVED + опт-ин → номер; событие PHONE_REVEAL записано
    await db.photographerProfile.update({ where: { id: profile.id }, data: { status: 'APPROVED' } });
    expect((await revealPhone(profile.id, viewer.id)).phone).toBe(phone);
    const evWhere = { type: 'PHONE_REVEAL' as const, targetType: 'PROFILE' as const, targetId: profile.id };
    expect(await db.activityEvent.count({ where: evWhere })).toBe(1);

    // 4) Повтор того же зрителя в окне дедупа — событие НЕ дублируется
    await revealPhone(profile.id, viewer.id);
    expect(await db.activityEvent.count({ where: evWhere })).toBe(1);

    // 5) Гость: событие пишется ТОЛЬКО с guestKey (IP-хэш из роута) и один раз
    // в окне (ревью P3: без дедупа цикл раздувал метрику); без ключа — не пишется
    await revealPhone(profile.id, null); // без ключа → номер отдан, события нет
    expect(await db.activityEvent.count({ where: evWhere })).toBe(1);
    await revealPhone(profile.id, null, 'guesthash1');
    await revealPhone(profile.id, null, 'guesthash1'); // повтор того же IP-хэша — дедуп
    expect(await db.activityEvent.count({ where: evWhere })).toBe(2);

    // 6) Владелец смотрит свой номер — событие не пишется
    await revealPhone(profile.id, owner.id);
    expect(await db.activityEvent.count({ where: evWhere })).toBe(2);

    // 7) Телефона нет у аккаунта → недоступен даже при опт-ине
    await db.user.update({ where: { id: owner.id }, data: { phone: null } });
    await expect(revealPhone(profile.id, viewer.id)).rejects.toThrowError(DomainError);

    // Cleanup (события/дедуп-маркеры → профиль → пользователи)
    await db.activityEvent.deleteMany({ where: { targetId: profile.id } });
    await db.rateLimit.deleteMany({ where: { key: { startsWith: `phrev:${profile.id}` } } });
    await db.profileCategoryScore.deleteMany({ where: { profileId: profile.id } });
    await db.photographerProfile.delete({ where: { id: profile.id } });
    await db.user.deleteMany({ where: { id: { in: [owner.id, viewer.id] } } });
  });
});
