import type { SubscriptionTier } from '@prisma/client';
// Тарифы PRO. Деньги — в минорных единицах (копейки), инвариант «деньги = integer».
// Цена зависит от города (VISION/S5): столицы — премиум-паритет с MyWed, дальше
// вниз. Оператор меняет суммы ЗДЕСЬ. Разворот 2026-07-16 (deep-think): оффер PRO
// строится на СТАТУСЕ (бейдж/Признание/безлимит/founding), заявки — вторичный
// перк (заработает с ростом клиентского спроса). Годовая = ~10×месяц (−17%).

// Производные от enum Prisma, а не третья копия союза (аудит 2026-08-01, P2)
export type PlanTier = SubscriptionTier;
export type PaidTier = Exclude<SubscriptionTier, 'FREE'>;
export type CityTier = 'A' | 'B' | 'C';

export interface CityPrice {
  plan: PaidTier;
  cityTier: CityTier;
  monthlyMinor: number;
  annualMinor: number;
}

// Столицы (единственный платящий сегмент на старте — премиум-паритет с MyWed-Мск).
const TIER_A_CITIES = new Set(['moscow', 'saint-petersburg']);
// Миллионники.
const TIER_B_CITIES = new Set([
  'novosibirsk', 'yekaterinburg', 'kazan', 'nizhny-novgorod', 'chelyabinsk',
  'samara', 'omsk', 'rostov-on-don', 'ufa', 'krasnoyarsk', 'perm', 'voronezh',
  'volgograd', 'krasnodar',
]);

// Цены: платный уровень × город. Elite ≈ 2× Prime. Годовая ≈ 10×месяц (−17%).
const PRICE: Record<PaidTier, Record<CityTier, { monthlyMinor: number; annualMinor: number }>> = {
  PRIME: {
    A: { monthlyMinor: 99_000, annualMinor: 990_000 }, // 990 ₽ / 9 900 ₽
    B: { monthlyMinor: 69_000, annualMinor: 690_000 }, // 690 ₽ / 6 900 ₽
    C: { monthlyMinor: 49_000, annualMinor: 490_000 }, // 490 ₽ / 4 900 ₽
  },
  ELITE: {
    A: { monthlyMinor: 189_000, annualMinor: 1_890_000 }, // 1 890 ₽ / 18 900 ₽
    B: { monthlyMinor: 129_000, annualMinor: 1_290_000 }, // 1 290 ₽ / 12 900 ₽
    C: { monthlyMinor: 89_000, annualMinor: 890_000 }, //   890 ₽ /  8 900 ₽
  },
};

export function cityTierOf(citySlug: string | null | undefined): CityTier {
  if (citySlug && TIER_A_CITIES.has(citySlug)) return 'A';
  if (citySlug && TIER_B_CITIES.has(citySlug)) return 'B';
  return 'C';
}

export function priceForCity(citySlug: string | null | undefined, plan: PaidTier = 'PRIME'): CityPrice {
  const cityTier = cityTierOf(citySlug);
  return { plan, cityTier, ...PRICE[plan][cityTier] };
}

// Экономия годовой оплаты в % (для витрины). Одинакова по тарифам (~17%).
export function annualSavingPct(p: CityPrice): number {
  return Math.round((1 - p.annualMinor / (p.monthlyMinor * 12)) * 100);
}

// Founding-member: круг амбассадора получает 3 мес бесплатного PRO (grace), затем
// цена города −30% НАВСЕГДА. Ургентность + лояльность + первая конверсия.
export const FOUNDING_DISCOUNT_PCT = 30;
export const BETA_GRACE_DAYS = 90; // бесплатный PRO бете
export const TRIAL_DAYS = 14; // пробный PRO по клику (без карты)

export function foundingPrice(p: CityPrice): CityPrice {
  const k = (100 - FOUNDING_DISCOUNT_PCT) / 100;
  return {
    plan: p.plan,
    cityTier: p.cityTier,
    monthlyMinor: Math.round((p.monthlyMinor * k) / 1000) * 1000,
    annualMinor: Math.round((p.annualMinor * k) / 1000) * 1000,
  };
}

// Лимиты портфолио по уровню. Черновик — оператор утверждает.
export const FREE_PORTFOLIO_LIMIT = 20; // кадров на FREE
export const PRIME_PORTFOLIO_LIMIT = 300; // «без ограничений» Prime — разумный потолок против злоупотреблений
export const ELITE_PORTFOLIO_LIMIT = 1000; // Elite — расширенный потолок
export const FREE_STORIES_ALLOWED = false; // фотоистории — только подписка

// Видео по уровням (решение 2026-08-02, design-record в vault).
//
// Гейтим количество и длительность, а не сам факт: ролик на странице нужен
// прежде всего заказчику, и профиль без видео — хуже выглядящая витрина
// платформы, а наказан был бы тот, кто выбирает исполнителя. Лимиты по объёму
// в продукте уже приняты (портфолио), и видео ложится в ту же логику.
//
// Качество не режем ни на одном уровне: экономия egress на 720p для FREE —
// копейки, а первое впечатление у искушённой аудитории единственное.
//
// Настоящий перк Active+ — не шестой ролик (он никому не нужен), а шоурил,
// играющий в обложке профиля вместо статичного кадра: это видно заказчику с
// первого экрана.
export const FREE_VIDEO_LIMIT = 1;
export const PRIME_VIDEO_LIMIT = 4;
export const ELITE_VIDEO_LIMIT = 6;
export const FREE_VIDEO_SECONDS = 60;
export const PAID_VIDEO_SECONDS = 90;

export function videoLimit(tier: PlanTier): number {
  if (tier === 'ELITE') return ELITE_VIDEO_LIMIT;
  if (tier === 'PRIME') return PRIME_VIDEO_LIMIT;
  return FREE_VIDEO_LIMIT;
}

/** Потолок длительности ролика: у бесплатного уровня короче. */
export function videoSecondsLimit(tier: PlanTier): number {
  return tier === 'FREE' ? FREE_VIDEO_SECONDS : PAID_VIDEO_SECONDS;
}

/** Шоурил в обложке профиля — перк верхнего уровня. */
export function coverShowreelAllowed(tier: PlanTier): boolean {
  return tier === 'ELITE';
}

export function portfolioLimit(tier: PlanTier): number {
  if (tier === 'ELITE') return ELITE_PORTFOLIO_LIMIT;
  if (tier === 'PRIME') return PRIME_PORTFOLIO_LIMIT;
  return FREE_PORTFOLIO_LIMIT;
}

// Матрица тарифов для витрины. Порядок = порядок в сравнении. Статус-первый оффер:
// сначала то, что ценно на пустом каталоге (бейдж/безлимит/признание), заявки —
// ниже. Ключи фич → i18n (ru.pro.features).
export interface PlanFeature {
  key: string;
  minTier: PlanTier; // минимальный уровень, с которого фича доступна
}

const TIER_ORDER: Record<PlanTier, number> = { FREE: 0, PRIME: 1, ELITE: 2 };

// Доступна ли фича на данном уровне (уровень ≥ минимального).
export function featureInTier(f: PlanFeature, tier: PlanTier): boolean {
  return TIER_ORDER[tier] >= TIER_ORDER[f.minTier];
}

// Разворот 2026-07-25 (синергия, не классовость): каталог ранжируется MERIT, а
// НЕ платной позицией. Подписка даёт ИНСТРУМЕНТЫ и УЧАСТИЕ, а не место над
// коллегами. Заявки/контакты открыты всем (как MyWed). Prime — полный
// инструментарий мастерской + вход в «Признание»; Elite — усиление участия
// (рекомендуемые/редподборки), расширенная аналитика, ранний доступ.
export const PLAN_FEATURES: PlanFeature[] = [
  { key: 'page', minTier: 'FREE' }, // публичная страница + профиль в каталоге
  { key: 'inquiries', minTier: 'FREE' }, // приём заявок от заказчиков — открыто всем
  { key: 'portfolioBasic', minTier: 'FREE' }, // портфолио до FREE_PORTFOLIO_LIMIT
  // Первый перк, ценность которого не зависит от посещаемости каталога
  { key: 'inquiryHeadStart', minTier: 'PRIME' },
  { key: 'videoBasic', minTier: 'FREE' }, // один шоурил до FREE_VIDEO_SECONDS
  { key: 'portfolioUnlimited', minTier: 'PRIME' }, // портфолио без границ + фотоистории
  { key: 'videoMore', minTier: 'PRIME' }, // до PRIME_VIDEO_LIMIT роликов, до PAID_VIDEO_SECONDS
  { key: 'richProfile', minTier: 'PRIME' }, // пакеты цен, FAQ, оборудование, команда
  { key: 'recognition', minTier: 'PRIME' }, // бейдж + участие в «Признании»
  { key: 'analytics', minTier: 'PRIME' }, // статистика просмотров и сохранений
  { key: 'fastReview', minTier: 'PRIME' }, // приоритетное рассмотрение изменений
  { key: 'presentationPdf', minTier: 'PRIME' }, // презентация портфолио одним файлом
  { key: 'inquiryHeadStartPlus', minTier: 'ELITE' },
  { key: 'salesKit', minTier: 'PRIME' },
  { key: 'articles', minTier: 'PRIME' }, // документы для работы с компаниями
  { key: 'presentationPdfPlus', minTier: 'ELITE' },
  { key: 'coverShowreel', minTier: 'ELITE' }, // шоурил играет в обложке профиля
  { key: 'recommended', minTier: 'ELITE' }, // ротация в «Рекомендуемых» + приоритет редподборок
  { key: 'analyticsPlus', minTier: 'ELITE' }, // кто смотрел/сохранял, тренды
  { key: 'earlyAccess', minTier: 'ELITE' }, // ранний доступ к фичам + персональный онбординг
];

/**
 * Фора на заявку — единственный перк, ценность которого не зависит от нашей
 * посещаемости.
 *
 * Заявка первые часы видна только подписчикам города и жанра, дальше — всем.
 * Ценность растёт от числа заявок, а не от размера каталога: то есть перк
 * работает уже на пустой платформе и одновременно заставляет нас заниматься
 * спросом — без заявок он сам себя обесценивает, и это видно сразу.
 *
 * Заказчику это не вредит: заявка всё равно доходит до всех авторов, просто
 * подписчики успевают ответить первыми. Продавать эксклюзив НАВСЕГДА мы не
 * будем — это превратило бы платформу в платный доступ к лидам, а заказчика
 * оставило бы с меньшим выбором.
 */
export const INQUIRY_HEAD_START_HOURS: Record<PlanTier, number> = {
  ELITE: 6, // видит сразу
  PRIME: 4, // через 2 часа после Active+
  FREE: 0, // через 6 часов, вместе со всеми
};

/** Через сколько часов после создания заявка становится видна этому уровню. */
/**
 * Сколько кадров уходит в презентацию портфолио.
 *
 * Бесплатный уровень получает её не урезанной «пробником», а короткой: шесть
 * кадров — это нормальная визитка, которую не стыдно отправить. Смысл
 * подписки здесь не в том, чтобы разблокировать файл, а в том, что на встрече
 * с компанией показывают серию, а не превью.
 */
/**
 * Сколько статей в журнал можно подать за месяц.
 *
 * Ноль здесь не стоит намеренно: право высказаться не продаётся, поэтому
 * бесплатный уровень пишет одну статью в месяц, а подписка снимает потолок
 * постепенно. Ограничение количественное и по причине, а не для витрины —
 * редакционный разбор статьи стоит времени, и поток должен быть посильным.
 */
export const ARTICLE_QUOTA: Record<PlanTier, number> = { FREE: 1, PRIME: 2, ELITE: 6 };

export const PDF_PHOTO_LIMIT: Record<PlanTier, number> = { FREE: 6, PRIME: 20, ELITE: 40 };

export function inquiryVisibleAfterHours(tier: PlanTier): number {
  return INQUIRY_HEAD_START_HOURS.ELITE - INQUIRY_HEAD_START_HOURS[tier];
}
