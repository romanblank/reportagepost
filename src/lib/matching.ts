import { catalogForCity, type CatalogCard } from '@/lib/catalog';
import { RU_CITIES } from '@/lib/geo-data';
import { CATEGORIES, categoryNameRu } from '@/lib/category-data';
import { cityNameRu } from '@/lib/geo-data';
import { yandexGpt } from '@/lib/ai-gpt';
import { ru } from '@/i18n/ru';

// Подбор авторов под задачу. AI (YandexGPT) разбирает свободный бриф в структуру,
// затем ДЕТЕРМИНИРОВАННЫЙ матч по каталогу (город/жанр/бюджет/дата/merit). Guard
// после LLM обязателен (правило проекта): вывод модели валидируется против
// известных городов/категорий и не применяется напрямую. Без ключей — работает
// по полям формы (структурный подбор), AI-слой просто выключен.

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

/** Разбор свободного брифа LLM → структура. Guard: валидируем против справочников. */
export async function parseBriefText(text: string): Promise<ParsedBrief> {
  const trimmed = text.trim();
  if (trimmed.length < 4) return {};
  const system =
    'Ты помощник каталога событийных фотографов. Извлеки из запроса JSON строго вида ' +
    '{"city": "<город или null>", "category": "<деловые события|корпоративы|концерты и фестивали|спорт|частные события|город и уличный репортаж|null>", "budgetRub": <число или null>}. ' +
    'Только JSON, без пояснений.';
  const raw = await yandexGpt(system, trimmed);
  if (!raw) return {};
  return guardParsed(raw);
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

/** Подбор авторов под бриф: структурный матч по каталогу + человекочитаемое обоснование. */
export async function matchPhotographers(brief: Brief, limit = 6): Promise<Match[]> {
  const { cards } = await catalogForCity({
    citySlug: brief.citySlug,
    categorySlug: brief.categorySlug,
    availableOn: brief.date,
    maxPricePerHourMinor: brief.maxBudgetMinor,
  });
  return cards.slice(0, limit).map((card) => ({ card, reason: buildReason(brief, card) }));
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
