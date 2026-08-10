import { describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

// Env-зависимость (правило c): нужен локальный PG
describe.skipIf(!hasDb)('витрина сообщества считает то, что обещает (БД)', () => {
  it('города — где есть авторы, а не строки справочника', async () => {
    const { db } = await import('@/lib/db');
    const { communityStats } = await import('@/lib/widgets');

    // Справочник заведомо шире: городов в нём десятки, авторов — единицы.
    // Раньше витрина показывала «2 города» при одном фотографе в одном городе:
    // цифра обещала заказчику выбор, которого нет
    const citiesInCatalogue = await db.city.count({ where: { active: true } });
    const withAuthors = (
      await db.photographerProfile.groupBy({ by: ['cityId'], where: { status: 'APPROVED' } })
    ).length;

    const stats = await communityStats();
    expect(stats.cities).toBe(withAuthors);
    expect(stats.cities).toBeLessThanOrEqual(citiesInCatalogue);
  });
});
