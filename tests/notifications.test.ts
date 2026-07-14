import { describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('in-app уведомления: создание/непрочитанные/отметка (БД)', () => {
  it('notifyInApp → в списке и в непрочитанных; markNotificationsRead обнуляет', async () => {
    const { db } = await import('@/lib/db');
    const { notifyInApp, inAppNotifications, unreadNotificationCount, markNotificationsRead } = await import('@/lib/notifications');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const u = await db.user.create({ data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Н', lastName: 'У', email: `nt-${stamp}@test.local` } });

    expect(await unreadNotificationCount(u.id)).toBe(0);
    await notifyInApp(u.id, 'notification.review.new', {});
    await notifyInApp(u.id, 'notification.message.new', {});
    expect(await unreadNotificationCount(u.id)).toBe(2);

    const items = await inAppNotifications(u.id);
    expect(items).toHaveLength(2);
    expect(items[0].type).toBe('notification.message.new'); // свежее сверху
    expect(items[0].readAt).toBeNull();

    await markNotificationsRead(u.id);
    expect(await unreadNotificationCount(u.id)).toBe(0);
    expect((await inAppNotifications(u.id))[0].readAt).not.toBeNull();

    await db.notification.deleteMany({ where: { userId: u.id } });
    await db.user.delete({ where: { id: u.id } });
  });
});
