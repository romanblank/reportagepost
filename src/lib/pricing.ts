// Тарифы PRO. Деньги — в минорных единицах (копейки), инвариант «деньги = integer».
// Цена зависит от города (VISION/S5): столицы — премиум-паритет с MyWed, дальше
// вниз. Оператор меняет суммы ЗДЕСЬ. Разворот 2026-07-16 (deep-think): оффер PRO
// строится на СТАТУСЕ (бейдж/Признание/безлимит/founding), заявки — вторичный
// перк (заработает с ростом клиентского спроса). Годовая = ~10×месяц (−17%).

export type PlanTier = 'FREE' | 'PRO';
export type CityTier = 'A' | 'B' | 'C';

export interface CityPrice {
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

const PRICE_BY_TIER: Record<CityTier, { monthlyMinor: number; annualMinor: number }> = {
  A: { monthlyMinor: 99_000, annualMinor: 990_000 }, // 990 ₽ / 9 900 ₽
  B: { monthlyMinor: 69_000, annualMinor: 690_000 }, // 690 ₽ / 6 900 ₽
  C: { monthlyMinor: 49_000, annualMinor: 490_000 }, // 490 ₽ / 4 900 ₽
};

export function cityTierOf(citySlug: string | null | undefined): CityTier {
  if (citySlug && TIER_A_CITIES.has(citySlug)) return 'A';
  if (citySlug && TIER_B_CITIES.has(citySlug)) return 'B';
  return 'C';
}

export function priceForCity(citySlug: string | null | undefined): CityPrice {
  const cityTier = cityTierOf(citySlug);
  return { cityTier, ...PRICE_BY_TIER[cityTier] };
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
    cityTier: p.cityTier,
    monthlyMinor: Math.round((p.monthlyMinor * k) / 1000) * 1000,
    annualMinor: Math.round((p.annualMinor * k) / 1000) * 1000,
  };
}

// Лимиты портфолио (численная граница FREE/PRO). Черновик — оператор утверждает.
export const FREE_PORTFOLIO_LIMIT = 20; // кадров в портфолио на FREE
export const PRO_PORTFOLIO_LIMIT = 300; // «без ограничений» PRO — с разумным потолком против злоупотреблений
export const FREE_STORIES_ALLOWED = false; // фотоистории — только PRO

export function portfolioLimit(tier: PlanTier): number {
  return tier === 'PRO' ? PRO_PORTFOLIO_LIMIT : FREE_PORTFOLIO_LIMIT;
}

// Матрица тарифов для витрины. Порядок = порядок в сравнении. Статус-первый оффер:
// сначала то, что ценно на пустом каталоге (бейдж/безлимит/признание), заявки —
// ниже. Ключи фич → i18n (ru.pro.features).
export interface PlanFeature {
  key: string;
  free: boolean;
}

export const PLAN_FEATURES: PlanFeature[] = [
  { key: 'page', free: true }, // публичная страница + профиль в каталоге
  { key: 'portfolioBasic', free: true }, // портфолио до FREE_PORTFOLIO_LIMIT
  { key: 'recognition', free: false }, // бейдж PRO и участие в «Признании»
  { key: 'portfolioUnlimited', free: false }, // портфолио без ограничений + фотоистории
  { key: 'richProfile', free: false }, // пакеты цен, FAQ, оборудование, команда
  { key: 'priority', free: false }, // приоритет в каталоге и поиске
  { key: 'inquiries', free: false }, // полный доступ к заявкам заказчиков
  { key: 'analytics', free: false }, // статистика просмотров и сохранений
  { key: 'fastReview', free: false }, // приоритетное рассмотрение
];
