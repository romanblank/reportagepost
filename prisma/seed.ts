// Сид справочников: география РФ + категории (6 базовых, утверждены 2026-07-13).
// Идемпотентен: upsert по уникальным ключам.
import 'dotenv/config';
import { RU_CITIES, RU_COUNTRY } from '../src/lib/geo-data';
import { CATEGORIES } from '../src/lib/category-data';

async function main() {
  const { db } = await import('../src/lib/db');

  const country = await db.country.upsert({
    where: { code: RU_COUNTRY.code },
    update: { active: true },
    create: {
      code: RU_COUNTRY.code,
      slug: RU_COUNTRY.slug,
      nameKey: `geo.country.${RU_COUNTRY.slug}`,
      active: true,
    },
  });

  for (const city of RU_CITIES) {
    await db.city.upsert({
      where: { countryId_slug: { countryId: country.id, slug: city.slug } },
      update: { active: city.active ?? false },
      create: {
        countryId: country.id,
        slug: city.slug,
        nameKey: `geo.city.${city.slug}`,
        active: city.active ?? false,
      },
    });
  }

  for (const cat of CATEGORIES) {
    await db.category.upsert({
      where: { slug: cat.slug },
      update: { sortOrder: cat.sortOrder, active: true },
      create: {
        slug: cat.slug,
        nameKey: `category.${cat.slug}`,
        sortOrder: cat.sortOrder,
        active: true,
      },
    });
  }

  const total = await db.city.count({ where: { countryId: country.id } });
  const active = await db.city.count({ where: { countryId: country.id, active: true } });
  const cats = await db.category.count({ where: { active: true } });
  console.log(`Сид: страна RU, городов ${total} (активных ${active}), категорий ${cats}`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
