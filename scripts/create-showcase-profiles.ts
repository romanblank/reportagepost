import 'dotenv/config';
import { db } from '@/lib/db';

/**
 * Заводит демонстрационные анкеты, которые потом наполняет `seed-showcase`.
 *
 * Раньше их создавали руками через админку, и после чистки витрины заливка
 * молча делала ноль работы: скрипт наполнения ищет уже существующие анкеты и
 * не создаёт их. «Профилей к наполнению: 0» — единственное, что об этом
 * сообщалось.
 *
 * Все анкеты помечены `isDemo`: за ними нет живого автора, и заказчик обязан
 * видеть это на карточке и на странице ДО того, как напишет.
 */
const NAMES: Record<string, { first: string; last: string; city: string }> = {
  'futazh-concerts-festivals-0': { first: 'Артём', last: 'Волков', city: 'moscow' },
  'futazh-concerts-festivals-1': { first: 'Мария', last: 'Северова', city: 'saint-petersburg' },
  'futazh-sports-0': { first: 'Илья', last: 'Гончар', city: 'moscow' },
  'futazh-sports-1': { first: 'Анна', last: 'Дорохова', city: 'saint-petersburg' },
  'futazh-business-events-0': { first: 'Павел', last: 'Крамской', city: 'moscow' },
  'futazh-business-events-1': { first: 'Ольга', last: 'Линза', city: 'saint-petersburg' },
  'futazh-corporate-0': { first: 'Денис', last: 'Ярцев', city: 'moscow' },
  'futazh-corporate-1': { first: 'Екатерина', last: 'Мороз', city: 'saint-petersburg' },
  'futazh-private-events-0': { first: 'Глеб', last: 'Ушаков', city: 'moscow' },
  'futazh-private-events-1': { first: 'Вера', last: 'Полянская', city: 'saint-petersburg' },
  'futazh-street-city-0': { first: 'Тимур', last: 'Азаров', city: 'moscow' },
  'futazh-street-city-1': { first: 'Лиза', last: 'Кравец', city: 'saint-petersburg' },
};

/** Жанр берём из самого адреса: он и задавал набор кадров при заливке. */
function categorySlug(username: string): string {
  return username.replace(/^futazh-/, '').replace(/-\d+$/, '');
}

async function main() {
  let created = 0;
  let existed = 0;

  for (const [username, who] of Object.entries(NAMES)) {
    const existing = await db.photographerProfile.findUnique({ where: { username } });
    if (existing) {
      // Признак демо проставляем и существующим: витрина могла быть заведена
      // до того, как пометка появилась
      await db.photographerProfile.update({ where: { id: existing.id }, data: { isDemo: true } });
      existed += 1;
      continue;
    }

    const city = await db.city.findFirstOrThrow({ where: { slug: who.city } });
    const category = await db.category.findFirstOrThrow({ where: { slug: categorySlug(username) } });

    const user = await db.user.upsert({
      where: { email: `${username}@demo.local` },
      create: {
        email: `${username}@demo.local`,
        role: 'PHOTOGRAPHER',
        status: 'ACTIVE',
        firstName: who.first,
        lastName: who.last,
      },
      update: {},
    });

    await db.photographerProfile.create({
      data: {
        userId: user.id,
        username,
        cityId: city.id,
        // Демо публикуется сразу: очередь модерации существует для живых
        // авторов, а не для нашего же наполнения
        status: 'APPROVED',
        isDemo: true,
        categories: { create: [{ categoryId: category.id }] },
      },
    });
    created += 1;
  }

  console.log(`Демо-анкет создано: ${created}, уже было: ${existed}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
