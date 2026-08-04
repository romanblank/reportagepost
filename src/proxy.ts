import { NextResponse, type NextRequest } from 'next/server';
import { RU_CITIES, RU_COUNTRY } from '@/lib/geo-data';
import { CATEGORIES } from '@/lib/category-data';

/**
 * Честный 404 для каталожных адресов (S4, долг из CLAUDE.md).
 *
 * Страницы `/ru/[country]/[city]` и `/ru/[country]/[city]/[category]` объявлены
 * `force-dynamic` (читают searchParams и базу). На таких страницах Next начинает
 * стримить ответ раньше, чем выполнится `notFound()`, поэтому статус уже
 * отправлен: несуществующий город отдавал **HTTP 200** с версткой «не найдено».
 * Это классический soft-404 — поисковик считает страницу существующей и держит
 * мусорный адрес в индексе. Пробовали `notFound()` в generateMetadata — не
 * помогает по той же причине.
 *
 * Здесь проверка идёт ДО рендера и по СТАТИЧЕСКИМ спискам (страна, 60 городов,
 * 6 жанров) — без обращения к базе, поэтому она дешёвая и не мешает
 * `force-dynamic` делать свою работу. Реально существующие адреса проходят
 * дальше без изменений; всё остальное получает настоящий 404 и нашу же
 * страницу «не найдено».
 *
 * Города и жанры — тот же источник, из которого засевается база, так что
 * расхождения между проверкой и данными не возникает.
 */
const CITY_SLUGS = new Set(RU_CITIES.map((c) => c.slug));
const CATEGORY_SLUGS = new Set(CATEGORIES.map((c) => c.slug));

const CATALOG_PATH = /^\/ru\/([^/]+)\/([^/]+)(?:\/([^/]+))?\/?$/;

/**
 * Собственные разделы платформы: /ru/photographer/…, /ru/cabinet/… и прочие.
 * Первый сегмент у них — не страна, и трогать их нельзя. Список зеркалит
 * каталоги в src/app/ru; проверяется тестом, чтобы новый раздел не начал
 * молча получать 404 (admin, auth, cabinet, community, forgot, inquiry, journal, legal, login, match, messages, notifications, onboarding, photo, photographer, pro, register, reset, search, story, unsubscribe, verify-email).
 */
const APP_SECTIONS = new Set([
  'admin',
  'auth',
  'cabinet',
  'community',
  'forgot',
  'forum',
  'inquiry',
  'journal',
  'legal',
  'login',
  'match',
  'messages',
  'notifications',
  'onboarding',
  'photo',
  'photographer',
  'pro',
  'register',
  'reset',
  'search',
  'story',
  'unsubscribe',
  'verify-email',
]);

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const match = CATALOG_PATH.exec(pathname);
  if (!match) return NextResponse.next();

  const [, country, city, category] = match;

  // Разделы платформы обрабатывают свои роуты — пропускаем не глядя
  if (APP_SECTIONS.has(country)) return NextResponse.next();

  // Всё остальное на этом уровне претендует быть страной каталога, поэтому
  // проверяется целиком: страна, город и (если есть) жанр.
  const known =
    country === RU_COUNTRY.slug &&
    CITY_SLUGS.has(city) &&
    (category === undefined || CATEGORY_SLUGS.has(category));
  if (known) return NextResponse.next();

  // Отдаём системную страницу «не найдено» — но с настоящим кодом 404
  const url = req.nextUrl.clone();
  url.pathname = '/_not-found';
  return NextResponse.rewrite(url, { status: 404 });
}

export const config = {
  // Только каталожные адреса: остальное не трогаем, чтобы не платить за прогон
  // прокси на каждом запросе статики и API.
  matcher: ['/ru/:country/:city', '/ru/:country/:city/:category'],
};
