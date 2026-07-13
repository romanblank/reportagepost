// Сид справочников: география РФ (+ категории добавятся после утверждения
// состава оператором). Идемпотентен: upsert по уникальным ключам.
import 'dotenv/config';
import { RU_CITIES, RU_COUNTRY } from '../src/lib/geo-data';

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

  const total = await db.city.count({ where: { countryId: country.id } });
  const active = await db.city.count({ where: { countryId: country.id, active: true } });
  console.log(`Сид гео: страна RU, городов ${total}, активных ${active}`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
