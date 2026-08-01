import { afterAll, describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

// Слаг города уникален только внутри страны (аудит 2026-08-01, P2).
//
// Шесть серверных путей резолвили город через findFirst({ where: { slug } }),
// то есть полагались на глобальную уникальность, которой в схеме нет. При
// включении второй страны первый же совпадающий слаг (moscow есть и в США)
// отправил бы анкету фотографа или заявку клиента в другую страну — молча.
describe.skipIf(!hasDb)('resolveCity: одинаковый слаг в разных странах не путается (БД)', () => {
  const countryIds: string[] = [];
  const cityIds: string[] = [];
  afterAll(async () => {
    const { db } = await import('@/lib/db');
    await db.city.deleteMany({ where: { id: { in: cityIds } } });
    await db.country.deleteMany({ where: { id: { in: countryIds } } });
  });

  it('возвращает город запрошенной страны, а не первый попавшийся', async () => {
    const { db } = await import('@/lib/db');
    const { resolveCity } = await import('@/lib/geo-resolve');

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const sharedSlug = `dvoinik-${stamp}`;

    // Две страны с городом одного и того же слага — ровно тот случай, который
    // ломал бы продукт при выходе за пределы РФ.
    const mk = async (code: string, slug: string, nameKey: string) => {
      const c = await db.country.create({ data: { code, slug, nameKey } });
      countryIds.push(c.id);
      const city = await db.city.create({ data: { countryId: c.id, slug: sharedSlug, nameKey } });
      cityIds.push(city.id);
      return { country: c, city };
    };

    const a = await mk(`X${stamp.slice(-4, -2)}`, `strana-a-${stamp}`, 'geo.country.test-a');
    const b = await mk(`Y${stamp.slice(-4, -2)}`, `strana-b-${stamp}`, 'geo.country.test-b');

    expect((await resolveCity(sharedSlug, a.country.slug))?.id).toBe(a.city.id);
    expect((await resolveCity(sharedSlug, b.country.slug))?.id).toBe(b.city.id);
    // Несуществующая страна — честный null, а не «какой-нибудь» город
    expect(await resolveCity(sharedSlug, 'net-takoy-strany')).toBeNull();
  });

  it('по умолчанию ищет в РФ — текущая единственная страна платформы', async () => {
    const { resolveCity } = await import('@/lib/geo-resolve');
    const moscow = await resolveCity('moscow');
    expect(moscow?.slug).toBe('moscow');
  });
});
