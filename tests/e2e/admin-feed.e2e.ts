import { describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

/**
 * Единая лента админки читает ВСЮ базу, поэтому её содержимое зависит от всего,
 * что происходит одновременно. В юнит-батарее файлы идут параллельно, и
 * соседний тест успевал удалить свои записи между нашей вставкой и чтением —
 * проверка падала не из-за дефекта. E2E-батарея выполняется последовательно,
 * и здесь утверждение «в общей ленте видно оба типа событий» проверяемо честно.
 */
describe.skipIf(!hasDb)('E2E: лента админки сводит разные события', () => {
  it('заявка и жалоба попадают в одну ленту, порядок — по времени', async () => {
    const { db } = await import('@/lib/db');
    const { adminActivity } = await import('@/lib/admin-dashboard');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const guest = await db.user.create({
      data: { role: 'CLIENT', status: 'ACTIVE', firstName: 'Ж', lastName: 'Л', email: `feed-${stamp}@test.local` },
    });
    const inquiry = await db.inquiry.create({
      data: { cityId: city.id, description: 'тестовая заявка ленты', contactName: 'Тест', contactEmail: `feed-${stamp}@test.local` },
    });
    const report = await db.report.create({
      data: { reporterId: guest.id, targetType: 'USER', targetId: guest.id, reason: 'SPAM' },
    });

    try {
      const items = await adminActivity(1000);
      // Только что созданное обязано быть видно СРАЗУ. Раньше лента отсекала
      // события временем приложения, а createdAt ставит база: при расхождении
      // часов свежайшее событие — то, ради которого админку и открывают, —
      // выпадало, и заметить это можно было только случайно
      expect(items.some((i) => i.kind === 'report'), 'свежая жалоба не видна сразу').toBe(true);
      for (let i = 1; i < items.length; i++) {
        expect(items[i - 1].at.getTime()).toBeGreaterThanOrEqual(items[i].at.getTime());
      }
      const kinds = new Set(items.map((i) => i.kind));
      expect(kinds.has('inquiry'), 'заявки не попали в ленту').toBe(true);
      expect(kinds.has('report'), 'жалобы не попали в ленту').toBe(true);
    } finally {
      await db.report.delete({ where: { id: report.id } });
      await db.inquiry.delete({ where: { id: inquiry.id } });
      await db.user.delete({ where: { id: guest.id } });
    }
  });
});
