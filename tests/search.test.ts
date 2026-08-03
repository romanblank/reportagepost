import { afterAll, describe, expect, it } from 'vitest';
import 'dotenv/config';

const hasDb = Boolean(process.env.DATABASE_URL);

// Поиск (аудит 2026-08-01, P2). Был подстрочный ILIKE с потолком в 24 записи:
// опечатка не прощалась, чужая раскладка тоже, пагинации не было вовсе.
// Поиск по имени — главный сценарий клиента, которому фотографа
// порекомендовали; промах здесь стоит лида.
describe.skipIf(!hasDb)('search: опечатки, раскладка, фильтры, пагинация (БД)', () => {
  const userIds: string[] = [];
  afterAll(async () => {
    const { db } = await import('@/lib/db');
    await db.photo.deleteMany({ where: { profile: { userId: { in: userIds } } } });
    await db.profileCategory.deleteMany({ where: { profile: { userId: { in: userIds } } } });
    await db.profileCategoryScore.deleteMany({ where: { profile: { userId: { in: userIds } } } });
    await db.photographerProfile.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  });

  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const lastName = `Кожевникоф${stamp.slice(-4)}`; // уникальная, но «человеческая» фамилия

  it('находит по опечатке и по неверной раскладке, уважает фильтры и страницы', async () => {
    const { db } = await import('@/lib/db');
    const { searchPhotographers } = await import('@/lib/search');

    const moscow = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const other = await db.city.findFirstOrThrow({ where: { slug: { not: 'moscow' } } });
    const sport = await db.category.findFirstOrThrow({ where: { slug: 'sports' } });
    const concerts = await db.category.findFirstOrThrow({ where: { slug: 'concerts-festivals' } });

    const mk = async (tag: string, cityId: string, categoryId: string) => {
      const u = await db.user.create({
        data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Пётр', lastName, email: `srch-${tag}-${stamp}@test.local` },
      });
      userIds.push(u.id);
      const p = await db.photographerProfile.create({
        data: { userId: u.id, username: `srch-${tag}-${stamp}`, cityId, status: 'APPROVED' },
      });
      await db.profileCategory.create({ data: { profileId: p.id, categoryId } });
      // Планка каталога: без опубликованной работы профиль в выдачу не идёт
      await db.photo.create({
        data: { profileId: p.id, categoryId, storageKey: `photos/srch-${tag}-${stamp}/original.jpg`,
                width: 2400, height: 1600, status: 'APPROVED', publishedAt: new Date() },
      });
      return p;
    };

    await mk('a', moscow.id, sport.id);
    await mk('b', moscow.id, concerts.id);
    await mk('c', other.id, sport.id);

    const mine = (r: { items: { username: string }[] }) =>
      r.items.filter((i) => i.username.endsWith(stamp));

    // Точное совпадение фамилии
    const exact = await searchPhotographers(lastName);
    expect(mine(exact)).toHaveLength(3);

    // Опечатка в одну букву — раньше не находилось НИЧЕГО
    const typo = await searchPhotographers(lastName.replace('о', 'а'));
    expect(mine(typo).length).toBeGreaterThan(0);

    // Фильтр по городу и по жанру сужают, а не ломают выдачу
    const inMoscow = await searchPhotographers(lastName, { citySlug: 'moscow' });
    expect(mine(inMoscow)).toHaveLength(2);
    const sportsOnly = await searchPhotographers(lastName, { citySlug: 'moscow', categorySlug: 'sports' });
    expect(mine(sportsOnly)).toHaveLength(1);

    // Пагинация честная: общее число известно, вторая страница существует
    const first = await searchPhotographers(lastName, { pageSize: 2 });
    expect(first.total).toBeGreaterThanOrEqual(3);
    expect(first.items).toHaveLength(2);
    expect(first.hasNext).toBe(true);
    const second = await searchPhotographers(lastName, { pageSize: 2, page: 2 });
    expect(second.items.length).toBeGreaterThan(0);
    expect(second.page).toBe(2);

    // Средний балл в публичную выдачу не попадает — только число отзывов
    expect(Object.keys(first.items[0])).not.toContain('ratingAvg');
  });

  it('исправляет раскладку и честно сообщает, что именно искали', async () => {
    const { searchPhotographers } = await import('@/lib/search');
    // «Gtnh» на латинской раскладке = «Петр» на кириллической
    const res = await searchPhotographers('Gtnh');
    expect(res.correctedQuery).toBe('Петр');
    expect(res.items.length).toBeGreaterThan(0);
  });

  it('опечатка прощается и в КОРОТКОЙ фамилии — там триграммы строже всего', async () => {
    // «Свет» и «Свит» отличаются одной буквой, но их похожесть всего 0.25:
    // при фиксированном пороге 0.3 короткие фамилии — а их набирают чаще —
    // теряли бы опечатку целиком.
    const { db } = await import('@/lib/db');
    const { searchPhotographers } = await import('@/lib/search');

    const city = await db.city.findFirstOrThrow({ where: { slug: 'moscow' } });
    const cat = await db.category.findFirstOrThrow({ where: { slug: 'sports' } });
    const u = await db.user.create({
      data: { role: 'PHOTOGRAPHER', status: 'ACTIVE', firstName: 'Илья', lastName: 'Свет', email: `srchs-${stamp}@test.local` },
    });
    userIds.push(u.id);
    const p = await db.photographerProfile.create({
      data: { userId: u.id, username: `srchs-${stamp}`, cityId: city.id, status: 'APPROVED' },
    });
    await db.photo.create({
      data: { profileId: p.id, categoryId: cat.id, storageKey: `photos/srchs-${stamp}/original.jpg`,
              width: 2400, height: 1600, status: 'APPROVED', publishedAt: new Date() },
    });

    const typo = await searchPhotographers('Свит');
    expect(typo.items.some((i) => i.username === `srchs-${stamp}`)).toBe(true);
  });

  it('слишком короткий запрос не выдаёт всю базу', async () => {
    const { searchPhotographers } = await import('@/lib/search');
    const res = await searchPhotographers('к');
    expect(res.items).toHaveLength(0);
    expect(res.total).toBe(0);
  });
});

// Индексы поиска однажды уже были мёртвыми: объявлены по сырым колонкам, а
// запрос сравнивал выражение replace(lower(col),'ё','е') — планировщик их не
// брал, и каждый поиск шёл полным сканом. Здесь это фиксируется структурно.
describe.skipIf(!hasDb)('поиск: индексы соответствуют запросу (БД)', () => {
  it('существуют индексы по нормализованному выражению, а не только по колонке', async () => {
    const { db } = await import('@/lib/db');
    const rows = await db.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes
      WHERE tablename IN ('User', 'PhotographerProfile') AND indexdef LIKE '%gin_trgm_ops%'
    `;
    const defs = rows.map((r) => r.indexdef).join('\n');
    // Ровно то выражение, которым ищет search.ts
    expect(defs, 'нет индекса по replace(lower(firstName))').toMatch(/replace\(lower\(.?firstName.?\)/);
    expect(defs, 'нет индекса по replace(lower(lastName))').toMatch(/replace\(lower\(.?lastName.?\)/);
  });

  it('запрос использует оператор %, а не функцию similarity в условии', async () => {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const src = readFileSync(path.join(process.cwd(), 'src/lib/search.ts'), 'utf8');
    // Комментарии выкидываем: слово similarity в пояснении — не вызов функции
    const whereBlock = src
      .slice(src.indexOf('AND ('), src.indexOf('ORDER BY'))
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n');
    // similarity() в WHERE не индексируется в принципе — только оператор %
    expect(whereBlock).not.toMatch(/similarity\(/);
    expect(whereBlock).toMatch(/%\s*\$\{qn\}/);
    // Порог обязан задаваться в той же транзакции, иначе % берёт дефолт 0.3
    expect(src).toContain("set_config('pg_trgm.similarity_threshold'");
  });
});
