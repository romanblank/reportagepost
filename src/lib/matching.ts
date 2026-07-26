import { catalogForCity, type CatalogCard } from '@/lib/catalog';
import { RU_CITIES } from '@/lib/geo-data';
import { CATEGORIES, categoryNameRu } from '@/lib/category-data';
import { cityNameRu } from '@/lib/geo-data';
import { llmComplete } from '@/lib/ai-gpt';
import { ru } from '@/i18n/ru';

// Подбор авторов под задачу. Свободный бриф разбирается ЭВРИСТИКОЙ (ключевые
// слова + синонимы поверх фиксированного словаря: 60 городов, 6 жанров, бюджет) —
// без внешнего ИИ: бесплатно, мгновенно, работает с RU-сервера, ноль зависимостей.
// Затем ДЕТЕРМИНИРОВАННЫЙ матч по каталогу. LLM (см. ai-gpt.ts) — опциональный
// апгрейд на потом (не Яндекс), если эвристики перестанет хватать.

export interface Brief {
  citySlug: string;
  categorySlug?: string;
  date?: Date;
  maxBudgetMinor?: number;
  text?: string;
}

export interface ParsedBrief {
  citySlug?: string;
  categorySlug?: string;
  maxBudgetMinor?: number;
}

/** Сырые поля формы подбора (строки из searchParams). */
export interface RawBriefFields {
  city?: string;
  category?: string;
  date?: string;
  budget?: string;
}

/**
 * Сводит явные поля формы и распознанный из свободного текста бриф в единый Brief.
 * Приоритет: явный выбор в форме > текст > дефолт. Пустой селект («Любой город»)
 * НЕ затирает город, распознанный из текста (иначе ломается обещание «поймём сами»).
 */
export function resolveBrief(raw: RawBriefFields, parsed: ParsedBrief, text?: string): Brief {
  const explicitCity = raw.city && RU_CITIES.some((c) => c.slug === raw.city) ? raw.city : undefined;
  const explicitCat = raw.category && CATEGORIES.some((c) => c.slug === raw.category) ? raw.category : undefined;
  const citySlug = explicitCity ?? parsed.citySlug ?? 'moscow';
  const categorySlug = explicitCat ?? parsed.categorySlug;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw.date ?? '') ? new Date(`${raw.date}T00:00:00Z`) : undefined;
  const budgetRub = Number(raw.budget) > 0 ? Number(raw.budget) : undefined;
  const maxBudgetMinor = budgetRub ? budgetRub * 100 : parsed.maxBudgetMinor;
  return { citySlug, categorySlug, date, maxBudgetMinor, text };
}

// Короткие формы городов-якорей (полное имя матчится общим проходом ниже).
const CITY_ALIASES: Record<string, string[]> = {
  moscow: ['москв', 'мск', 'в мск'],
  'saint-petersburg': ['петербург', 'питер', 'спб', 'петербурге'],
};

// Синонимы жанров (стем-фрагменты, регистр уже понижен).
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'business-events': ['конференц', 'форум', 'делов', 'бизнес', 'презентац', 'саммит', 'митап', 'нетворк', 'пленар'],
  corporate: ['корпоратив', 'тимбилдинг', 'день компании', 'новогодн корпор'],
  'concerts-festivals': ['концерт', 'фестивал', 'рейв', 'шоу', 'выступлен', 'гастрол', 'опенэйр', 'open air', 'техно', 'рок', 'электрон'],
  sports: ['спорт', 'матч', 'турнир', 'соревнован', 'забег', 'марафон', 'гонк', 'чемпионат', 'единоборств', 'фитнес'],
  'private-events': ['свадьб', 'юбилей', 'день рожден', 'днюх', 'частн', 'вечеринк', 'крестин', 'выпускн', 'помолвк', 'семейн'],
  'street-city': ['улич', 'стрит', 'город и', 'репортаж с улиц', 'прогулк по город'],
};

/** Бюджет в рублях из брифа: «40к», «40 тыс», «до 40000», «бюджет 30 000 ₽». */
function parseBudgetRub(t: string): number | undefined {
  // «к»/«тыс» не перед буквой (\b не знает кириллицу в JS — используем lookahead)
  let m = t.match(/(\d+)\s*(?:к|тыс)(?![а-яёa-z])/i);
  if (m) { const n = Number(m[1]) * 1000; if (n >= 1000 && n < 10_000_000) return n; }
  m = t.match(/(?:до|бюджет|₽|руб)\D{0,8}(\d[\d\s]{2,})/) ?? t.match(/(\d[\d\s]{3,})\s*(?:₽|руб|р\.)/);
  if (m) { const n = Number(m[1].replace(/\s/g, '')); if (n >= 1000 && n < 10_000_000) return n; }
  return undefined;
}

/** Эвристический разбор свободного брифа → структура. Без внешнего ИИ. */
export function parseBriefHeuristic(text: string): ParsedBrief {
  const t = text.trim().toLowerCase();
  if (t.length < 3) return {};
  const out: ParsedBrief = {};

  // город: сначала короткие формы якорей, затем полное имя любого города
  for (const [slug, aliases] of Object.entries(CITY_ALIASES)) {
    if (aliases.some((a) => t.includes(a))) { out.citySlug = slug; break; }
  }
  if (!out.citySlug) {
    const city = RU_CITIES.find((c) => c.nameRu.length >= 4 && t.includes(c.nameRu.toLowerCase()));
    if (city) out.citySlug = city.slug;
  }

  // жанр: первый по количеству совпавших ключевых слов
  let best: { slug: string; hits: number } | null = null;
  for (const [slug, kws] of Object.entries(CATEGORY_KEYWORDS)) {
    const hits = kws.filter((k) => t.includes(k)).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { slug, hits };
  }
  if (best) out.categorySlug = best.slug;

  const budget = parseBudgetRub(t);
  if (budget) out.maxBudgetMinor = budget * 100;

  return out;
}

const LLM_SYSTEM =
  'Ты помощник каталога событийных фотографов. Извлеки из запроса строго JSON вида ' +
  '{"city":"<город или null>","category":"<деловые события|корпоративы|концерты и фестивали|спорт|частные события|город и уличный репортаж|null>","budgetRub":<число или null>}. ' +
  'category выбери ближайшую по смыслу из списка. Только JSON, без пояснений.';

/**
 * Гибрид: эвристика первой (быстро/бесплатно), LLM-фолбэк ТОЛЬКО если эвристика
 * не нашла город или жанр (покрывает опечатки/сленг/необычные формулировки).
 * LLM — не Яндекс (OpenAI-совместимый, env), вывод валидируется guard'ом,
 * эвристика приоритетна для найденного. Без LLM-конфига → чистая эвристика.
 */
export async function parseBriefText(text: string): Promise<ParsedBrief> {
  const heur = parseBriefHeuristic(text);
  if (heur.citySlug && heur.categorySlug) return heur; // ясный бриф — LLM не нужен

  const raw = await llmComplete(LLM_SYSTEM, text.trim());
  if (!raw) return heur;
  const llm = guardParsed(raw); // валидация вывода модели против справочников
  return {
    citySlug: heur.citySlug ?? llm.citySlug,
    categorySlug: heur.categorySlug ?? llm.categorySlug,
    maxBudgetMinor: heur.maxBudgetMinor ?? llm.maxBudgetMinor,
  };
}

/** Чистый guard разбора LLM (тестируем без сети). */
export function guardParsed(raw: string): ParsedBrief {
  let obj: unknown;
  try {
    const jsonStr = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
    obj = JSON.parse(jsonStr);
  } catch {
    return {};
  }
  if (!obj || typeof obj !== 'object') return {};
  const o = obj as Record<string, unknown>;
  const out: ParsedBrief = {};

  // город → slug (нечёткое: nameRu содержит/равен)
  if (typeof o.city === 'string' && o.city.trim()) {
    const q = o.city.trim().toLowerCase();
    const city = RU_CITIES.find((c) => c.nameRu.toLowerCase() === q)
      ?? RU_CITIES.find((c) => c.nameRu.toLowerCase().includes(q) || q.includes(c.nameRu.toLowerCase()));
    if (city) out.citySlug = city.slug;
  }
  // категория → slug (по nameRu)
  if (typeof o.category === 'string' && o.category.trim()) {
    const q = o.category.trim().toLowerCase();
    const cat = CATEGORIES.find((c) => c.nameRu.toLowerCase() === q)
      ?? CATEGORIES.find((c) => c.nameRu.toLowerCase().includes(q) || q.includes(c.nameRu.toLowerCase()));
    if (cat) out.categorySlug = cat.slug;
  }
  // бюджет → минорные единицы, клампинг
  const b = Number(o.budgetRub);
  if (Number.isFinite(b) && b > 0 && b < 100_000_000) out.maxBudgetMinor = Math.round(b) * 100;

  return out;
}

export interface Match {
  card: CatalogCard;
  reason: string;
}

export interface MatchResult {
  matches: Match[];
  relaxed: boolean; // точных под все условия не нашлось — показаны близкие
}

/**
 * Подбор авторов под бриф: структурный матч + обоснование. Если точных нет —
 * умный фолбэк: смягчаем условия (сначала бюджет, потом жанр) и показываем близких.
 */
export async function matchPhotographers(brief: Brief, limit = 6): Promise<MatchResult> {
  const run = (f: Parameters<typeof catalogForCity>[0]) => catalogForCity(f);

  let { cards } = await run({
    citySlug: brief.citySlug, categorySlug: brief.categorySlug,
    availableOn: brief.date, maxPricePerHourMinor: brief.maxBudgetMinor,
  });
  let relaxed = false;

  if (cards.length === 0 && brief.maxBudgetMinor) {
    ({ cards } = await run({ citySlug: brief.citySlug, categorySlug: brief.categorySlug, availableOn: brief.date }));
    if (cards.length > 0) relaxed = true;
  }
  if (cards.length === 0 && (brief.categorySlug || brief.date)) {
    ({ cards } = await run({ citySlug: brief.citySlug }));
    if (cards.length > 0) relaxed = true;
  }

  return {
    matches: cards.slice(0, limit).map((card) => ({ card, reason: buildReason(brief, card) })),
    relaxed,
  };
}

/** Обоснование подбора из фактов карточки (детерминированно, честно). */
export function buildReason(brief: Brief, card: CatalogCard): string {
  const bits: string[] = [];
  const cats = card.categories.map(categoryNameRu);
  if (brief.categorySlug && card.categories.includes(brief.categorySlug)) {
    bits.push(`снимает «${categoryNameRu(brief.categorySlug)}»`);
  } else if (cats.length) {
    bits.push(`снимает «${cats[0]}»`);
  }
  bits.push(`в городе ${cityNameRu(brief.citySlug)}`);
  if (card.recommendCount > 0) bits.push(ru.dashboard.recommendCount(card.recommendCount).toLowerCase());
  if (brief.date) bits.push('свободен на вашу дату');
  if (brief.maxBudgetMinor && card.minPackage && card.minPackage.priceMinor <= brief.maxBudgetMinor) {
    bits.push('в рамках бюджета');
  }
  const s = bits.join(' · ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
