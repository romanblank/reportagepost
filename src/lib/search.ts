import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { RU_CITIES } from '@/lib/geo-data';

/**
 * Поиск фотографов (аудит 2026-08-01, P2).
 *
 * Был подстрочный ILIKE с жёстким потолком в 24 записи, без пагинации, без
 * фильтров и без устойчивости к опечатке или чужой раскладке. Два следствия,
 * оба дорогие: клиент, которому фотографа порекомендовали («ищу Петра, снимал
 * у друзей»), при малейшей неточности не находил никого — а это потерянный
 * лид; и сам фотограф, не увидевший себя в выдаче, делал вывод, что его на
 * площадке нет.
 *
 * Теперь: похожесть по триграммам (pg_trgm) поверх точных совпадений,
 * исправление раскладки, фильтры по городу и жанру, честная пагинация с общим
 * числом найденного.
 */

export interface SearchResult {
  username: string;
  firstName: string;
  lastName: string;
  verified: boolean;
  avatarKey: string | null;
  citySlug: string;
  categories: string[];
  photoKeys: string[];
  // Публичный сигнал доверия — ЧИСЛО отзывов, без среднего балла. Средний балл
  // публично не выводится (design-record «доброжелательный рейтинг»), и уезжать
  // в разметку страницы он тоже не должен: в отзывах профиля этот же проп уже
  // приходилось убирать (аудит 2026-08-01, P2).
  reviewCount: number;
}

export interface SearchPage {
  items: SearchResult[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
  /** Показать «искали X, показываем Y» — когда сработало исправление раскладки. */
  correctedQuery: string | null;
}

export interface SearchFilters {
  citySlug?: string;
  categorySlug?: string;
  page?: number;
  pageSize?: number;
}

const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 48;
/**
 * Порог похожести зависит от длины запроса.
 *
 * Триграммы к коротким словам беспощадны: «Свет» и «Свит» отличаются одной
 * буквой, но их похожесть всего 0.25 — при фиксированном пороге 0.3 опечатка
 * в короткой фамилии не прощалась бы, хотя именно короткие фамилии набирают
 * чаще всего. Для длинных слов планку держим высокой, иначе в выдачу лезет
 * случайное совпадение по паре триграмм («Кожевников» ↔ «Кожевникав» = 0.57,
 * запас большой).
 */
function similarityThreshold(q: string): number {
  return q.length <= 5 ? 0.2 : 0.3;
}

/**
 * Нормализация ё → е.
 *
 * Обнаружено тестом раскладки: «Пётр» не находился по запросу «Петр» — при том
 * что пишут почти всегда через «е», а в паспорте и в профиле стоит «ё».
 * Триграммы этих слов расходятся достаточно, чтобы не дотянуть до порога
 * похожести. То же с фамилиями: Фёдоров, Артёмов, Семёнов — самый частый класс
 * промахов русского поиска.
 */
function normalizeYo(value: string): string {
  return value.replace(/ё/g, 'е').replace(/Ё/g, 'Е');
}

// Раскладка: набранное «Bdfyjd» вместо «Иванов» — обычное дело, когда человек
// не посмотрел на строку ввода. Дешёвая проверка, заметно спасающая выдачу.
const LAYOUT_EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
const LAYOUT_RU = 'йцукенгшщзхъфывапролджэячсмитьбю ё';

function fixLayout(input: string): string {
  let out = '';
  for (const ch of input) {
    const lower = ch.toLowerCase();
    const i = LAYOUT_EN.indexOf(lower);
    if (i === -1) {
      out += ch;
      continue;
    }
    const mapped = LAYOUT_RU[i];
    out += ch === lower ? mapped : mapped.toUpperCase();
  }
  return out;
}

interface SearchRow {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  verified: boolean;
  avatarKey: string | null;
  citySlug: string;
  total: bigint;
}

export async function searchPhotographers(
  query: string,
  filters: SearchFilters = {},
): Promise<SearchPage> {
  const raw = query.trim();
  const pageSize = Math.min(filters.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const page = Math.max(1, filters.page ?? 1);
  const empty: SearchPage = { items: [], total: 0, page, pageSize, hasNext: false, correctedQuery: null };
  if (raw.length < 2) return empty;

  // Пробуем исходный запрос; если он ничего не даст — вариант с исправленной
  // раскладкой. Порядок важен: осмысленный латинский запрос (username) не
  // должен подменяться кириллической абракадаброй.
  const attempts = [raw];
  const swapped = fixLayout(raw);
  if (swapped !== raw) attempts.push(swapped);

  for (const [index, q] of attempts.entries()) {
    const result = await runSearch(q, filters, page, pageSize);
    if (result.total > 0) {
      return { ...result, correctedQuery: index > 0 ? q : null };
    }
  }
  return empty;
}

async function runSearch(
  q: string,
  filters: SearchFilters,
  page: number,
  pageSize: number,
): Promise<Omit<SearchPage, 'correctedQuery'>> {
  const qn = normalizeYo(q).toLowerCase();
  const minSimilarity = similarityThreshold(qn);
  const like = `%${qn}%`;
  const offset = (page - 1) * pageSize;

  // Города, чьё русское название похоже на запрос: в базе имя города — ключ
  // локализации, поэтому сопоставляем по справочнику.
  const citySlugs = RU_CITIES
    .filter((c) => normalizeYo(c.nameRu).toLowerCase().includes(qn))
    .map((c) => c.slug);

  const cityFilter = filters.citySlug
    ? Prisma.sql`AND c.slug = ${filters.citySlug}`
    : Prisma.empty;
  const categoryFilter = filters.categorySlug
    ? Prisma.sql`AND EXISTS (
        SELECT 1 FROM "ProfileCategory" pc
        JOIN "Category" cat ON cat.id = pc."categoryId"
        WHERE pc."profileId" = p.id AND cat.slug = ${filters.categorySlug}
      )`
    : Prisma.empty;
  const cityMatch = citySlugs.length
    ? Prisma.sql`OR c.slug = ANY(${citySlugs})`
    : Prisma.empty;

  // Порог похожести и сам запрос — в одной транзакции: SET LOCAL действует
  // только внутри неё, а без него оператор % возьмёт значение по умолчанию
  const [, rows] = await db.$transaction([
    // SET не принимает параметры-плейсхолдеры, поэтому set_config:
    // третий аргумент true = действует до конца транзакции
    db.$executeRaw`SELECT set_config('pg_trgm.similarity_threshold', ${String(minSimilarity)}, true)`,
    db.$queryRaw<SearchRow[]>`
    SELECT p.id,
           p.username,
           u."firstName",
           u."lastName",
           p.verified,
           p."avatarKey",
           c.slug AS "citySlug",
           COUNT(*) OVER() AS total
    FROM "PhotographerProfile" p
    JOIN "User" u ON u.id = p."userId"
    JOIN "City" c ON c.id = p."cityId"
    WHERE p.status = 'APPROVED'
      -- Планка та же, что в каталоге: без опубликованной работы профиль не показываем
      AND EXISTS (SELECT 1 FROM "Photo" ph WHERE ph."profileId" = p.id AND ph.status = 'APPROVED')
      ${cityFilter}
      ${categoryFilter}
      AND (
        p.username ILIKE ${like}
        OR replace(lower(u."firstName"), 'ё', 'е') LIKE ${like}
        OR replace(lower(u."lastName"), 'ё', 'е') LIKE ${like}
        -- Опечатка и другое окончание: «Ивонов», «Иванову»
        -- Оператор %, а не функция similarity(): GIN-индекс умеет только его.
        -- Порог задаётся ниже через pg_trgm.similarity_threshold в той же
        -- транзакции — иначе планировщик читает всю таблицу (было Seq Scan).
        OR replace(lower(u."firstName"), 'ё', 'е') % ${qn}
        OR replace(lower(u."lastName"), 'ё', 'е') % ${qn}
        OR lower(p.username) % ${qn}
        ${cityMatch}
      )
    ORDER BY
      -- Точное совпадение имени или адреса страницы — всегда первым
      (replace(lower(u."firstName"), 'ё', 'е') = ${qn}
        OR replace(lower(u."lastName"), 'ё', 'е') = ${qn}
        OR lower(p.username) = ${qn}) DESC,
      GREATEST(
        similarity(replace(lower(u."firstName"), 'ё', 'е'), ${qn}),
        similarity(replace(lower(u."lastName"), 'ё', 'е'), ${qn}),
        similarity(p.username, ${qn})
      ) DESC,
      p."ratingScore" DESC
    LIMIT ${pageSize} OFFSET ${offset}
  `,
  ]);

  const total = rows.length > 0 ? Number(rows[0].total) : 0;
  if (rows.length === 0) return { items: [], total: 0, page, pageSize, hasNext: false };

  const ids = rows.map((r) => r.id);
  const [categories, photos, reviews] = await Promise.all([
    db.profileCategory.findMany({
      where: { profileId: { in: ids } },
      select: { profileId: true, category: { select: { slug: true } } },
    }),
    db.photo.findMany({
      where: { profileId: { in: ids }, status: 'APPROVED' },
      orderBy: { publishedAt: 'desc' },
      select: { profileId: true, storageKey: true },
    }),
    db.review.groupBy({
      by: ['profileId'],
      where: { profileId: { in: ids }, status: 'VISIBLE', rating: { gte: 4 }, verified: true },
      _count: true,
    }),
  ]);

  const catMap = new Map<string, string[]>();
  for (const c of categories) {
    catMap.set(c.profileId, [...(catMap.get(c.profileId) ?? []), c.category.slug]);
  }
  const photoMap = new Map<string, string[]>();
  for (const ph of photos) {
    const cur = photoMap.get(ph.profileId) ?? [];
    if (cur.length < 3) photoMap.set(ph.profileId, [...cur, ph.storageKey]);
  }
  const revMap = new Map(reviews.map((r) => [r.profileId, r._count]));

  return {
    items: rows.map((r) => ({
      username: r.username,
      firstName: r.firstName,
      lastName: r.lastName,
      verified: r.verified,
      avatarKey: r.avatarKey,
      citySlug: r.citySlug,
      categories: catMap.get(r.id) ?? [],
      photoKeys: photoMap.get(r.id) ?? [],
      reviewCount: revMap.get(r.id) ?? 0,
    })),
    total,
    page,
    pageSize,
    hasNext: page * pageSize < total,
  };
}
